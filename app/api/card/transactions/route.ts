import { getStore } from "@/lib/store";
import { cardToRecord } from "@/lib/csv";
import { nowKst } from "@/lib/format";
import { fail, ok } from "@/lib/service";
import type { CardTxn } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * (B) 카드 사용내역 내보내기 데이터.
 * format=records(기본): 9-1 양식과 같은 한글 열 이름 — 결재 상신 웹앱(A)의 새로고침이 이 데이터를 가져간다.
 * format=json: 화면 표시용
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    const rows = await getStore().bList(from, to);
    if (url.searchParams.get("format") === "json") return ok({ rows });
    return ok(rows.map(cardToRecord), { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return fail(e);
  }
}

/** (B) 내역 등록: CSV 여러 건 또는 한 건 직접 입력 */
export async function POST(req: Request) {
  try {
    const { rows } = (await req.json()) as { rows: CardTxn[] };
    if (!Array.isArray(rows) || !rows.length) return fail(new Error("등록할 내역이 없습니다."), 400);
    const at = nowKst();
    const res = await getStore().bUpsert(rows.map((r) => ({ ...r, registeredAt: at })));
    return ok(res);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const approvalNo = new URL(req.url).searchParams.get("approvalNo");
    if (!approvalNo) return fail(new Error("승인번호가 필요합니다."), 400);
    await getStore().bDelete(approvalNo);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
