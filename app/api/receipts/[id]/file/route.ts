import { getStore } from "@/lib/store";
import { fail, ok, receiptLocked } from "@/lib/service";
import { checkUpload, processUpload } from "@/lib/receiptFile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 영수증 다시 올리기: 같은 영수증 건에 새 파일을 올려 OCR·대조를 다시 한다 (상신 전·반려 건만) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore();
    const r = await store.getReceipt(id);
    if (!r) return fail(new Error("영수증을 찾을 수 없습니다."), 404);
    if (await receiptLocked(r)) return fail(new Error("결재가 진행 중이거나 끝난 영수증은 다시 올릴 수 없습니다."), 409);
    const form = await req.formData();
    const problem = checkUpload(form);
    if (problem) return fail(new Error(problem), 400);

    const next = await processUpload(form, id, `${id}-${Date.now()}`);
    const saved = await store.updateReceipt(id, next);
    // 예전 파일은 지운다. 단, 반려된 이전 결재서가 예전 파일을 보여 주므로 상신 기록이 있으면 남긴다
    if (!r.submissionId) {
      await store.deleteImage(r.imagePath).catch(() => undefined);
      if (r.previewPath) await store.deleteImage(r.previewPath).catch(() => undefined);
    }
    return ok({ receipt: saved });
  } catch (e) {
    return fail(e);
  }
}
