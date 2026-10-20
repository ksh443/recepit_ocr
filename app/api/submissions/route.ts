import { randomUUID } from "crypto";
import { getStore } from "@/lib/store";
import { nowKst } from "@/lib/format";
import { fail, getSettings, ok } from "@/lib/service";
import type { Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ submissions: await getStore().listSubmissions() });
  } catch (e) {
    return fail(e);
  }
}

/** 결재 상신: 영수증 한 건으로 상신 문서를 만들어 상신 목록에 게시 */
export async function POST(req: Request) {
  try {
    const { receiptId } = (await req.json()) as { receiptId: string };
    const store = getStore();
    const r = await store.getReceipt(receiptId);
    if (!r) return fail(new Error("영수증을 찾을 수 없습니다."), 404);
    if (r.submissionId) return fail(new Error("이미 상신된 영수증입니다."), 409);
    if (!r.memo.trim()) return fail(new Error("적요를 먼저 작성해 주세요."), 400);
    if (!r.date || r.amount === null) return fail(new Error("날짜와 금액을 먼저 확인해 주세요."), 400);

    const [settings, all] = await Promise.all([getSettings(), store.listSubmissions()]);
    const at = nowKst();
    const year = at.slice(0, 4);
    const seq = all.filter((s) => s.docNo.includes(`-${year}-`)).length + 1;
    const s: Submission = {
      id: randomUUID(),
      docNo: `지출-${year}-${String(seq).padStart(4, "0")}`,
      receiptId: r.id,
      date: r.date,
      time: r.time,
      merchant: r.merchant,
      amount: r.amount,
      currency: r.currency,
      memo: r.memo.trim(),
      imagePath: r.imagePath,
      submitter: settings.submitterName,
      submittedAt: at,
      status: "pending",
      approverName: null,
      approvedAt: null,
    };
    await store.insertSubmission(s);
    await store.updateReceipt(r.id, { submissionId: s.id });
    return ok({ submission: s });
  } catch (e) {
    return fail(e);
  }
}
