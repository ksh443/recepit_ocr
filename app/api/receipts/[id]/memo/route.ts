import { getStore } from "@/lib/store";
import { writeMemo } from "@/lib/ai";
import { fail, ok } from "@/lib/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 기능 3: AI 적요 작성 (매번 상황에 맞게) */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore();
    const r = await store.getReceipt(id);
    if (!r) return fail(new Error("영수증을 찾을 수 없습니다."), 404);
    if (r.submissionId) return fail(new Error("이미 상신된 영수증입니다."), 409);

    const [cards, receipts] = await Promise.all([store.aList(), store.listReceipts()]);
    const card = cards.find((c) => c.approvalNo === r.approvalNo);
    const recentMemos = receipts
      .filter((x) => x.id !== r.id && x.memo)
      .slice(0, 12)
      .map((x) => x.memo);

    const m = await writeMemo({
      date: r.date,
      time: r.time,
      merchant: r.merchant,
      amount: r.amount,
      currency: r.currency,
      category: card?.category,
      recentMemos,
    });
    const saved = await store.updateReceipt(id, { memo: m.memo, memoAlternatives: m.alternatives, memoNote: m.note });
    return ok({ receipt: saved });
  } catch (e) {
    return fail(e);
  }
}
