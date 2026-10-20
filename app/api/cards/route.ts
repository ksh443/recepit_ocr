import { getStore } from "@/lib/store";
import { cardsWithStatus, fail, ok } from "@/lib/service";

export const dynamic = "force-dynamic";

/** (A) 불러온 카드 사용내역 + 영수증 대조 상태 */
export async function GET() {
  try {
    const store = getStore();
    const [cards, lastFetchedAt, lastFetchSource] = await Promise.all([
      cardsWithStatus(),
      store.getSetting("last_fetched_at"),
      store.getSetting("last_fetch_source"),
    ]);
    return ok({ cards, lastFetchedAt, lastFetchSource, storage: store.kind });
  } catch (e) {
    return fail(e);
  }
}
