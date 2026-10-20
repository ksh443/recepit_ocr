import { getStore } from "@/lib/store";
import { nowKst } from "@/lib/format";
import { fail, ok, rematchUnlinked } from "@/lib/service";
import type { CardTxn } from "@/lib/types";

export const dynamic = "force-dynamic";

/** (A) 대체 수단: B에서 내보낸 CSV를 직접 업로드 (브라우저에서 읽은 행) */
export async function POST(req: Request) {
  try {
    const { rows } = (await req.json()) as { rows: CardTxn[] };
    if (!Array.isArray(rows) || !rows.length) return fail(new Error("불러올 내역이 없습니다."), 400);
    const at = nowKst();
    const store = getStore();
    const res = await store.aUpsert(rows.map((r) => ({ ...r, fetchedAt: at, importSource: "CSV 업로드" })));
    const rematched = await rematchUnlinked();
    return ok({ ...res, total: rows.length, rematched, lastFetchedAt: at });
  } catch (e) {
    return fail(e);
  }
}
