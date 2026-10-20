import { randomUUID } from "crypto";
import { getStore } from "@/lib/store";
import { ocrReceipt } from "@/lib/ai";
import { nowKst } from "@/lib/format";
import { computeMatch, fail, getSettings, ok } from "@/lib/service";
import type { OcrResult, Receipt } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
const MAX_BYTES = 4 * 1024 * 1024; // Vercel 요청 크기 한도(4.5MB) 안쪽

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
    const file = form.get("file");
    if (!(file instanceof File)) return fail(new Error("영수증 파일이 없습니다."), 400);
    const ext = TYPES[file.type];
    if (!ext) return fail(new Error("JPG·PNG 이미지 또는 PDF만 올릴 수 있습니다."), 400);
    if (file.size > MAX_BYTES) return fail(new Error("파일이 너무 큽니다. (4MB 이하)"), 400);
    const fileName = String(form.get("fileName") || file.name);
    const buf = Buffer.from(await file.arrayBuffer());

    const store = getStore();
    const id = randomUUID();
    const imagePath = `${id}.${ext}`;
    await store.saveImage(imagePath, buf, file.type);

    // PDF는 브라우저가 그려 보낸 첫 페이지 이미지를 화면 표시용으로 함께 저장
    let previewPath: string | null = null;
    const preview = form.get("preview");
    if (ext === "pdf" && preview instanceof File && preview.type === "image/jpeg" && preview.size <= MAX_BYTES) {
      previewPath = `${id}.preview.jpg`;
      await store.saveImage(previewPath, Buffer.from(await preview.arrayBuffer()), "image/jpeg");
    }

    let ocr: OcrResult | null = null;
    let ocrError: string | null = null;
    try {
      ocr = await ocrReceipt(buf.toString("base64"), file.type);
    } catch (e) {
      ocrError = e instanceof Error ? e.message : String(e);
    }

    const base = {
      id,
      date: ocr?.date ?? null,
      time: ocr?.time ?? null,
      merchant: ocr?.merchant ?? null,
      amount: ocr?.amount ?? null,
    };
    const m = await computeMatch(base);
    const receipt: Receipt = {
      ...base,
      fileName,
      imagePath,
      contentType: file.type,
      previewPath,
      ocr,
      ocrError,
      currency: ocr?.currency ?? null,
      ...m,
      memo: "",
      memoNote: "",
      memoAlternatives: [],
      submissionId: null,
      uploaderId: String(form.get("uploaderId") || "") || null,
      createdAt: nowKst(),
    };
    await store.insertReceipt(receipt);
    return ok({ receipt });
  } catch (e) {
    return fail(e);
  }
}
