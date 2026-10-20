import { getStore } from "@/lib/store";
import { recordToCard, type CardRecord } from "@/lib/csv";
import { nowKst } from "@/lib/format";
import { fail, ok, rematchUnlinked } from "@/lib/service";
import type { CardTxn } from "@/lib/types";

export const dynamic = "force-dynamic";

/** (A) 새로고침: 카드 조회 웹페이지(B)의 내보내기 데이터를 받아 승인번호 기준으로 합친다 */
export async function POST(req: Request) {
  try {
    const { from, to } = (await req.json()) as { from?: string; to?: string };
    const base = (process.env.CARD_SOURCE_URL || new URL(req.url).origin).replace(/\/$/, "");
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const src = `${base}/api/card/transactions?${qs}`;

    let records: Partial<CardRecord>[];
    try {
      const res = await fetch(src, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`카드 조회 웹페이지 응답 오류 (HTTP ${res.status})`);
      records = await res.json();
      if (!Array.isArray(records)) throw new Error("카드 조회 웹페이지의 응답 형식이 올바르지 않습니다.");
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      return fail(new Error(`카드 내역을 불러오지 못했습니다: ${why}. B에서 CSV를 내려받아 직접 업로드해 주세요.`), 502);
    }

    const rows: CardTxn[] = [];
    const errors: string[] = [];
    records.forEach((rec, i) => {
      const r = recordToCard(rec, i + 1);
      if (typeof r === "string") errors.push(r);
      else rows.push(r);
    });

    const at = nowKst();
    const store = getStore();
    const res = await store.aUpsert(rows.map((r) => ({ ...r, fetchedAt: at })));
    await store.setSetting("last_fetched_at", at);
    await store.setSetting("last_fetch_source", "새로고침");
    const rematched = await rematchUnlinked();
    return ok({ ...res, total: rows.length, errors, rematched, lastFetchedAt: at });
  } catch (e) {
    return fail(e);
  }
}
