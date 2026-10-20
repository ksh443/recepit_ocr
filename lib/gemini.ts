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

/**
 * 사용할 모델. 무료 등급 한도(2026-10 기준): 3.x Flash 하루 20회·분당 5회, 3.5 Flash-Lite 하루 500회·분당 15회.
 * 영수증 40장이면 OCR+적요로 100회 가까이 필요해 기본값은 Flash-Lite.
 * OCR만 Flash로 바꿔 보려면 GEMINI_OCR_MODEL=gemini-3.5-flash
 */
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const geminiModels = () => ({
  ocr: process.env.GEMINI_OCR_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL,
  memo: process.env.GEMINI_MEMO_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL,
});

const CALL_TIMEOUT_MS = 25_000; // 한 번 호출의 최대 대기
const TOTAL_BUDGET_MS = 55_000; // 재시도 포함 전체 (Vercel 함수 60초 안쪽)
const MAX_RETRY_WAIT_MS = 20_000; // 분당 한도에 걸렸을 때 최대 대기

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isRateLimit = (msg: string) => /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
const isDailyLimit = (msg: string) => /PerDay|per day|daily/i.test(msg);
const isTimeout = (e: unknown) =>
  (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) || /aborted|timeout/i.test(msgOf(e));

/** 오류 메시지에 들어 있는 "retry in 23.4s" / "retryDelay": "23s" 를 읽는다 */
function retryDelayMs(msg: string): number {
  const m = msg.match(/retry in ([\d.]+)\s*s/i) ?? msg.match(/retryDelay"?\s*:\s*"?([\d.]+)s/i);
  return m ? Math.ceil(Number(m[1]) * 1000) + 500 : 10_000;
}

/** Gemini 오류를 담당자가 이해할 수 있는 말로 바꾼다 */
function explain(e: unknown, model: string): Error {
  const msg = msgOf(e);
  if (isTimeout(e)) return new Error(`Gemini(${model}) 응답이 늦어 중단했습니다. 잠시 뒤 다시 시도해 주세요.`);
  if (isRateLimit(msg))
    return isDailyLimit(msg)
      ? new Error(`Gemini(${model}) 오늘 무료 사용량을 모두 썼습니다. 태평양 시간 자정(한국 시간 오후 4~5시)에 초기화됩니다.`)
      : new Error(`Gemini(${model}) 분당 사용량 한도에 걸렸습니다. 1분쯤 뒤에 다시 시도해 주세요.`);
  if (/API key not valid|API_KEY_INVALID|401|403|PERMISSION_DENIED/i.test(msg))
    return new Error("Gemini API 키가 올바르지 않습니다. .env.local 의 GEMINI_API_KEY 를 확인해 주세요.");
  if (/404|not found|no longer available/i.test(msg))
    return new Error(`Gemini 모델(${model})을 쓸 수 없습니다. .env.local 의 모델 이름을 확인해 주세요.`);
  return new Error(`Gemini 호출 실패: ${msg.slice(0, 200)}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function structured<T>(opts: {
  model: string;
  system: string;
  parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[];
  schema: Record<string, unknown>;
}): Promise<T> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let text: string | undefined;
  for (let attempt = 0; ; attempt++) {
    const left = deadline - Date.now();
    try {
      const res = await getClient().models.generateContent({
        model: opts.model,
        contents: [{ role: "user", parts: opts.parts }],
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: opts.schema,
          temperature: 0.4,
          abortSignal: AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, left)),
        },
      });
      text = res.text;
      break;
    } catch (e) {
      const msg = msgOf(e);
      // 분당 한도는 잠시 기다렸다 다시 시도 (하루 한도는 기다려도 소용없음)
      const wait = Math.min(retryDelayMs(msg), MAX_RETRY_WAIT_MS);
      const canRetry = isRateLimit(msg) && !isDailyLimit(msg) && attempt < 2;
      if (canRetry && deadline - Date.now() > wait + 5_000) {
        console.warn(`[gemini] ${opts.model} 분당 한도 → ${Math.round(wait / 1000)}초 뒤 재시도`);
        await sleep(wait);
        continue;
      }
      throw explain(e, opts.model);
    }
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
    model: geminiModels().ocr,
    system: OCR_SYSTEM,
    schema: OCR_SCHEMA,
    parts: [{ inlineData: { mimeType: mediaType, data: base64 } }, { text: OCR_USER }],
  });
  return normalizeOcr(r);
}

export async function geminiMemo(input: MemoInput): Promise<MemoResult> {
  const r = await structured<MemoResult>({
    model: geminiModels().memo,
    system: MEMO_SYSTEM,
    schema: MEMO_SCHEMA,
    parts: [{ text: memoUserText(input) }],
  });
  return normalizeMemo(r);
}
