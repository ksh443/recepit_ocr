import { randomUUID } from "crypto";
import { getStore } from "@/lib/store";
import { nowKst } from "@/lib/format";
import { fail, getSettings, ok } from "@/lib/service";
import { checkUpload, processUpload } from "@/lib/receiptFile";
import { sessionMember } from "@/lib/auth";
import { authEnabled } from "@/lib/session";
import type { Receipt } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ?uploaderId= 가 있으면 그 계정이 올린 영수증만 (예전 영수증은 기본 담당자 것으로 본다) */
export async function GET(req: Request) {
  try {
    const uploaderId = new URL(req.url).searchParams.get("uploaderId");
    let receipts = await getStore().listReceipts();
    if (uploaderId) {
      const { defaultDrafterId } = await getSettings();
      receipts = receipts.filter((r) => (r.uploaderId ?? defaultDrafterId) === uploaderId);
    }
    return ok({ receipts });
  } catch (e) {
    return fail(e);
  }
}

/** 기능 1: 영수증 업로드(이미지·PDF) → 저장소 보관 → OCR → 카드 내역 대조 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const problem = checkUpload(form);
    if (problem) return fail(new Error(problem), 400);
    const id = randomUUID();
    const receipt: Receipt = {
      id,
      ...(await processUpload(form, id, id)),
      submissionId: null,
      // 로그인 모드에서는 로그인한 사람, 로컬 개발 모드에서는 화면에서 고른 계정
      uploaderId: (authEnabled() ? (await sessionMember())?.id : String(form.get("uploaderId") || "")) || null,
      createdAt: nowKst(),
    };
    await getStore().insertReceipt(receipt);
    return ok({ receipt });
  } catch (e) {
    return fail(e);
  }
}
