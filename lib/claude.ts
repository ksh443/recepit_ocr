import Anthropic from "@anthropic-ai/sdk";
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

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  return (client ??= new Anthropic());
}

type Content = Anthropic.Beta.Messages.BetaContentBlockParam[];

/** JSON 스키마로 형식이 고정된 응답을 받는다 */
async function structured<T>(opts: {
  system: string;
  content: Content;
  schema: Record<string, unknown>;
  effort: "low" | "medium" | "high";
}): Promise<T> {
  const res = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // 안전 분류기가 거절하면 서버에서 다른 모델로 이어서 처리
    output_config: { effort: opts.effort, format: { type: "json_schema", schema: opts.schema } },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });
  if (res.stop_reason === "refusal") throw new Error("AI가 이 요청을 처리하지 않았습니다.");
  if (res.stop_reason === "max_tokens") throw new Error("AI 응답이 너무 길어 중단되었습니다.");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("AI 응답을 해석하지 못했습니다.");
  }
}

export async function claudeOcr(base64: string, mediaType: string): Promise<OcrResult> {
  const r = await structured<OcrResult>({
    system: OCR_SYSTEM,
    schema: OCR_SCHEMA,
    effort: "medium",
    content: [
      { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: base64 } },
      { type: "text", text: OCR_USER },
    ],
  });
  return normalizeOcr(r);
}

export async function claudeMemo(input: MemoInput): Promise<MemoResult> {
  const r = await structured<MemoResult>({
    system: MEMO_SYSTEM,
    schema: MEMO_SCHEMA,
    effort: "low",
    content: [{ type: "text", text: memoUserText(input) }],
  });
  return normalizeMemo(r);
}
