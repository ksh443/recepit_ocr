import type { OcrResult } from "./types";
import { weekday } from "./format";

/** Claude·Gemini가 함께 쓰는 프롬프트와 응답 형식 */

const nullable = (type: string, description: string) => ({
  anyOf: [{ type }, { type: "null" }],
  description,
});

/* ------------------------------------------------------------------ */
/* 기능 1. 영수증 OCR                                                    */
/* ------------------------------------------------------------------ */

export const OCR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["date", "time", "merchant", "amount", "currency", "note"],
  properties: {
    date: nullable("string", "거래 날짜 YYYY-MM-DD. 읽을 수 없으면 null"),
    time: nullable("string", "거래 시각 24시간제 HH:MM. 없거나 읽을 수 없으면 null"),
    merchant: nullable("string", "가맹점(업체)명. 영수증에 적힌 표기 그대로"),
    amount: nullable("number", "실제 결제된 최종 합계 금액(세금·팁 포함). 숫자만"),
    currency: nullable("string", "ISO 4217 통화 코드(USD, KRW, EUR 등)"),
    note: { type: "string", description: "판단이 애매했던 점을 한국어 한 문장으로. 없으면 빈 문자열" },
  },
};

export const OCR_SYSTEM = `당신은 법인카드 영수증을 판독하는 재정 담당 보조입니다.
영수증 이미지(또는 스캔 PDF)에서 날짜, 시각, 업체명, 결제 금액, 통화를 정확히 읽습니다.
PDF가 여러 페이지면 결제 영수증에 해당하는 페이지를 기준으로 하고, 영수증이 여러 장 섞여 있으면 note에 적으세요.

- 금액은 카드로 실제 결제된 최종 합계(Total / Amount Due / 결제금액)를 씁니다. 소계(Subtotal)나 거스름돈, 받은 돈(Cash/Tendered)과 혼동하지 마세요. 손으로 쓴 팁과 합계가 있으면 손으로 쓴 최종 합계를 우선합니다.
- 날짜의 일/월 순서가 애매하면(예: 03/04/2026) 통화, 주소, 언어, 전화번호 형식으로 나라를 추정해 판단하고 note에 적으세요.
- 연도가 두 자리면 20xx로 봅니다.
- 통화 기호만 있으면 영수증의 나라로 통화를 판단합니다($ + 미국 주소 → USD).
- 흐리거나 잘려서 확신할 수 없는 항목은 추측하지 말고 null로 두세요.`;

export const OCR_USER = "이 영수증의 날짜·시각·업체·금액·통화를 읽어 주세요.";

/** AI 응답을 화면에서 쓰는 형식으로 정리 */
export function normalizeOcr(r: Partial<OcrResult>): OcrResult {
  const amount = typeof r.amount === "string" ? Number(String(r.amount).replace(/[^\d.\-]/g, "")) : r.amount;
  return {
    date: r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
    time: r.time && /^\d{1,2}:\d{2}$/.test(r.time) ? r.time.padStart(5, "0") : null,
    merchant: r.merchant?.trim() || null,
    amount: typeof amount === "number" && Number.isFinite(amount) ? amount : null,
    currency: r.currency?.trim().toUpperCase() || null,
    note: r.note ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* 기능 3. 적요 작성                                                      */
/* ------------------------------------------------------------------ */

export interface MemoInput {
  date: string | null;
  time: string | null;
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  category?: string | null; // 카드 내역의 업종 (참고용)
  recentMemos: string[];
}

export interface MemoResult {
  memo: string;
  alternatives: string[];
  note: string;
}

export const MEMO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["memo", "alternatives", "note"],
  properties: {
    memo: { type: "string", description: "추천 적요 한 줄" },
    alternatives: { type: "array", items: { type: "string" }, description: "다른 방향의 적요 후보 2개" },
    note: { type: "string", description: "담당자가 확인할 점(해외 결제·환율 관련 제외). 없으면 빈 문자열" },
  },
};

export const MEMO_SYSTEM = `당신은 공공기관 재정부서에서 법인카드 지출원인행위 결재 문서의 "적요"를 쓰는 담당자를 돕습니다.
적요는 언제, 어떤 목적으로 예산을 썼는지를 보여 주는 짧은 한 줄(15~30자 내외, 명사형 종결)입니다.

작성 원칙
- 업종별 고정 문구를 쓰지 말고, 시간대·요일·업체 성격·금액 규모를 함께 보고 상황에 맞게 판단합니다.
- 최근에 쓴 적요와 같은 문장을 반복하지 말고 표현에 자연스러운 변화를 줍니다.
- 사무실 인원은 12명입니다. 통화가 원화가 아닐 수 있으므로 금액 기준을 숫자로 고정하지 말고 인원 대비 금액 규모로 판단합니다.
- 먼저 업체가 실제로 무엇을 파는 곳인지(업체명·카드사 업종 분류로) 판단하고, 적요의 목적은 반드시 그 지출 내용과 맞아야 합니다. 실제 지출과 다른 목적(예: 입장권을 "회의 다과"로)을 쓰는 것은 허위 기재이므로 절대 하지 않습니다.
- 식당·카페(식음료) 참고 방향(고정 규칙 아님):
  · 낮 시간 카페 → 업무 회의 다과 지원
  · 평일 점심 식당 → 업무 협의 워킹런치
  · 늦은 저녁 + 큰 금액 식당 → 업무추진 회의 식사, 관련 간담회
  · 이른 저녁 + 소액 식당 → "시간외 근무자 석식" 후보. 단 야근 식대 한도(인당 9,000원 수준)와 시간외근무 상신 여부를 확인해야 하므로 memo는 업무추진 쪽으로 두고 석식안은 alternatives에 넣은 뒤 note에 확인 필요를 적습니다.
  · 식음료 안에서 판단이 애매하면 업무추진 회의 쪽을 기본값으로 둡니다. (이 기본값은 식당·카페에만 적용)
- 식음료가 아닌 업종은 업종에 맞는 목적으로 씁니다. 회의·다과·식사 표현을 쓰지 않습니다.
  · 교통(철도·택시·주유 등) → "○○ 출장 현지 교통비", 숙박 → "○○ 출장 숙박비"
  · 편의점·마트·약국 → 구입 물품 성격에 맞게 (예: "○○ 행사 소모품 구입")
  · 관광·레저·오락(전망대, 공연, 레저시설 등) → "○○ 출장 중 현지 시설 견학 입장료"처럼 쓰되, 업무 관련성이 약해 감사에서 지적될 수 있는 업종이므로 note에 "업무 관련성 소명이 필요할 수 있는 업종입니다. 실제 목적(출장 일정·행사 등)을 확인하세요."를 반드시 적습니다.
  · 의류·잡화 등 개인 용도로 보이는 업종도 같은 방식으로 note에 확인 필요를 적습니다.
- 구체적인 사업명을 모르면 "○○ 업무"처럼 담당자가 채울 자리를 남겨도 됩니다.
- 참석 인원, 소명 목적, 업종명은 쓰지 않습니다.
- note에는 해외 결제·외화·환율·해외 사용과 관련된 내용은 쓰지 않습니다. (해외 영수증은 이 업무에서 정상이므로 확인 사항이 아님)
- alternatives에는 memo와 방향이 다른 후보 2개를 넣습니다.`;

export function memoUserText(input: MemoInput): string {
  const lines = [
    `날짜: ${input.date ?? "알 수 없음"}${input.date ? ` (${weekday(input.date)}요일)` : ""}`,
    `시각: ${input.time ?? "알 수 없음"}`,
    `업체: ${input.merchant ?? "알 수 없음"}`,
    `금액: ${input.amount ?? "알 수 없음"} ${input.currency ?? ""}`,
    input.category ? `카드사 업종 분류(참고): ${input.category}` : "",
    input.recentMemos.length
      ? `\n최근에 쓴 적요(반복 금지):\n${input.recentMemos.map((m) => `- ${m}`).join("\n")}`
      : "",
  ].filter(Boolean);
  return `다음 법인카드 사용 건의 적요를 작성해 주세요.\n\n${lines.join("\n")}`;
}

export function normalizeMemo(r: Partial<MemoResult>): MemoResult {
  return {
    memo: (r.memo ?? "").trim(),
    alternatives: (r.alternatives ?? []).map((a) => a.trim()).filter(Boolean).slice(0, 3),
    note: r.note ?? "",
  };
}
