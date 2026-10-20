import { randomUUID } from "crypto";
import { getStore } from "@/lib/store";
import { ocrReceipt } from "@/lib/ai";
import { nowKst } from "@/lib/format";
import { computeMatch, fail, ok } from "@/lib/service";
import type { OcrResult, Receipt } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export async function GET() {
  try {
    return ok({ receipts: await getStore().listReceipts() });
  } catch (e) {
    return fail(e);
  }
}

/** 기능 1: 영수증 업로드 → 저장소 보관 → OCR → 카드 내역 대조 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(new Error("이미지 파일이 없습니다."), 400);
    const ext = TYPES[file.type];
    if (!ext) return fail(new Error("JPG·PNG 이미지만 올릴 수 있습니다."), 400);
    const fileName = String(form.get("fileName") || file.name);
    const buf = Buffer.from(await file.arrayBuffer());

    const store = getStore();
    const id = randomUUID();
    const imagePath = `${id}.${ext}`;
    await store.saveImage(imagePath, buf, file.type);

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
      ocr,
      ocrError,
      currency: ocr?.currency ?? null,
      ...m,
      memo: "",
      memoNote: "",
      memoAlternatives: [],
      submissionId: null,
      createdAt: nowKst(),
    };
    await store.insertReceipt(receipt);
    return ok({ receipt });
  } catch (e) {
    return fail(e);
  }
}
