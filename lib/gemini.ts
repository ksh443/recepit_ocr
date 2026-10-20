import { GoogleGenAI } from "@google/genai";
import type { OcrResult } from "./types";
import {
  MEMO_SCHEMA,
  MEMO_SYSTEM,
  OCR_SCHEMA,
  OCR_SYSTEM,
  OCR_USER,
  memoUserText,
  normalizeMemo,
  normalizeOcr,
  type MemoInput,
  type MemoResult,
} from "./prompts";

/** 무료 사용량이 있는 최신 Flash 모델 별칭. 바꾸려면 GEMINI_MODEL 환경변수 */
const MODEL = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

/** Gemini 오류를 담당자가 이해할 수 있는 말로 바꾼다 */
function explain(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg))
    return new Error("Gemini 무료 사용량 한도를 넘었습니다. 1분쯤 뒤에 다시 시도해 주세요. (하루 한도는 태평양 시간 자정에 초기화)");
  if (/API key not valid|API_KEY_INVALID|401|403|PERMISSION_DENIED/i.test(msg))
    return new Error("Gemini API 키가 올바르지 않습니다. .env.local 의 GEMINI_API_KEY 를 확인해 주세요.");
  if (/404|not found/i.test(msg))
    return new Error(`Gemini 모델(${MODEL()})을 찾을 수 없습니다. GEMINI_MODEL 환경변수를 확인해 주세요.`);
  return new Error(`Gemini 호출 실패: ${msg.slice(0, 200)}`);
}

async function structured<T>(opts: {
  system: string;
  parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[];
  schema: Record<string, unknown>;
}): Promise<T> {
  let text: string | undefined;
  try {
    const res = await getClient().models.generateContent({
      model: MODEL(),
      contents: [{ role: "user", parts: opts.parts }],
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
        temperature: 0.4,
      },
    });
    text = res.text;
  } catch (e) {
    throw explain(e);
  }
  if (!text) throw new Error("Gemini가 빈 응답을 보냈습니다. (안전 필터로 막혔을 수 있습니다)");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("AI 응답을 해석하지 못했습니다.");
  }
}

export async function geminiOcr(base64: string, mediaType: string): Promise<OcrResult> {
  const r = await structured<OcrResult>({
    system: OCR_SYSTEM,
    schema: OCR_SCHEMA,
    parts: [{ inlineData: { mimeType: mediaType, data: base64 } }, { text: OCR_USER }],
  });
  return normalizeOcr(r);
}

export async function geminiMemo(input: MemoInput): Promise<MemoResult> {
  const r = await structured<MemoResult>({
    system: MEMO_SYSTEM,
    schema: MEMO_SCHEMA,
    parts: [{ text: memoUserText(input) }],
  });
  return normalizeMemo(r);
}
