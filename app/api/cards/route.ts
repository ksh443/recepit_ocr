import { getStore } from "@/lib/store";
import { cardsWithStatus, fail, ok } from "@/lib/service";

export const dynamic = "force-dynamic";

/** (A) 불러온 카드 사용내역 + 영수증 대조·결재 상태 + 마지막으로 불러온 일시·방식 */
export async function GET() {
  try {
    const store = getStore();
    const [cards, last] = await Promise.all([cardsWithStatus(), store.aLastImport()]);
    return ok({ cards, lastFetchedAt: last?.at ?? null, lastFetchSource: last?.source ?? null, storage: store.kind });
  } catch (e) {
    return fail(e);
  }
}
