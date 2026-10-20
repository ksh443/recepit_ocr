import { getStore } from "./store";
import { ocrReceipt } from "./ai";
import { computeMatch } from "./service";
import type { OcrResult, Receipt } from "./types";

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
const MAX_BYTES = 4 * 1024 * 1024; // Vercel 요청 크기 한도(4.5MB) 안쪽

/** 업로드 폼(file, preview, fileName)을 검사한다. 문제가 있으면 메시지 */
export function checkUpload(form: FormData): string | null {
  const file = form.get("file");
  if (!(file instanceof File)) return "영수증 파일이 없습니다.";
  if (!TYPES[file.type]) return "JPG·PNG 이미지 또는 PDF만 올릴 수 있습니다.";
  if (file.size > MAX_BYTES) return "파일이 너무 큽니다. (4MB 이하)";
  return null;
}

/**
 * 영수증 파일 저장 → OCR → 카드 내역 대조. 새 업로드와 재업로드가 함께 쓴다.
 * key: 저장 파일 이름 (재업로드는 새 이름으로 저장해 예전 파일과 겹치지 않게)
 */
export async function processUpload(form: FormData, receiptId: string, key: string) {
  const file = form.get("file") as File;
  const ext = TYPES[file.type];
  const buf = Buffer.from(await file.arrayBuffer());
  const store = getStore();
  const imagePath = `${key}.${ext}`;
  await store.saveImage(imagePath, buf, file.type);

  // PDF는 브라우저가 그려 보낸 첫 페이지 이미지를 화면 표시용으로 함께 저장
  let previewPath: string | null = null;
  const preview = form.get("preview");
  if (ext === "pdf" && preview instanceof File && preview.type === "image/jpeg" && preview.size <= MAX_BYTES) {
    previewPath = `${key}.preview.jpg`;
    await store.saveImage(previewPath, Buffer.from(await preview.arrayBuffer()), "image/jpeg");
  }

  let ocr: OcrResult | null = null;
  let ocrError: string | null = null;
  try {
    ocr = await ocrReceipt(buf.toString("base64"), file.type);
  } catch (e) {
    ocrError = e instanceof Error ? e.message : String(e);
  }

  const values = {
    date: ocr?.date ?? null,
    time: ocr?.time ?? null,
    merchant: ocr?.merchant ?? null,
    amount: ocr?.amount ?? null,
  };
  const m = await computeMatch({ id: receiptId, ...values });
  return {
    ...values,
    fileName: String(form.get("fileName") || file.name),
    imagePath,
    contentType: file.type,
    previewPath,
    ocr,
    ocrError,
    currency: ocr?.currency ?? null,
    ...m,
    // 새 파일이므로 적요는 다시 쓴다
    memo: "",
    memoNote: "",
    memoAlternatives: [],
  } satisfies Partial<Receipt>;
}
