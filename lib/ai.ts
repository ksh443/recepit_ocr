import type { OcrResult } from "./types";
import type { MemoInput, MemoResult } from "./prompts";
import { claudeMemo, claudeOcr } from "./claude";
import { geminiMemo, geminiModels, geminiOcr } from "./gemini";

export type AiProvider = "claude" | "gemini" | null;

/** 키가 있는 쪽을 쓴다. 둘 다 있으면 Claude 우선 (AI_PROVIDER 로 강제 가능) */
export function aiProvider(): AiProvider {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  if (forced === "gemini" && hasGemini) return "gemini";
  if (forced === "claude" && hasClaude) return "claude";
  if (hasClaude) return "claude";
  if (hasGemini) return "gemini";
  return null;
}

/** 설정 화면 표시용: 기능별로 쓰는 모델 */
export function aiModels(): { ocr: string; memo: string } | null {
  const p = aiProvider();
  if (p === "claude") return { ocr: "claude-opus-5-5", memo: "claude-opus-5-5" };
  if (p === "gemini") return geminiModels();
  return null;
}

function noKey(): never {
  throw new Error("AI API 키가 없습니다. .env.local 에 GEMINI_API_KEY(무료) 또는 ANTHROPIC_API_KEY 를 넣어 주세요.");
}

export function ocrReceipt(base64: string, mediaType: string): Promise<OcrResult> {
  const p = aiProvider();
  if (p === "claude") return claudeOcr(base64, mediaType);
  if (p === "gemini") return geminiOcr(base64, mediaType);
  return noKey();
}

export function writeMemo(input: MemoInput): Promise<MemoResult> {
  const p = aiProvider();
  if (p === "claude") return claudeMemo(input);
  if (p === "gemini") return geminiMemo(input);
  return noKey();
}
