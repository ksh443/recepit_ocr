import type { CardTxn, MatchStatus } from "./types";

interface ReceiptValues {
  date: string | null;
  time: string | null;
  merchant: string | null;
  amount: number | null;
}

export interface MatchResult {
  matchStatus: MatchStatus;
  approvalNo: string | null;
  candidates: string[];
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;
const cardDate = (c: CardTxn) => c.approvedAt.slice(0, 10);
const cardTime = (c: CardTxn) => c.approvedAt.slice(11, 16);

function tokens(s: string | null): Set<string> {
  return new Set(
    (s ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((t) => t.length > 1),
  );
}

/** 업체명 유사도 0~1 */
function merchantScore(a: string | null, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  ta.forEach((t) => {
    for (const u of tb) if (u.includes(t) || t.includes(u)) return void hit++;
  });
  return hit / Math.max(ta.size, tb.size);
}

function minutes(t: string | null): number | null {
  const m = t?.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function dayDiff(a: string, b: string): number {
  return Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000;
}

/** 후보 중 가장 그럴듯한 카드 내역 순으로 정렬 */
function rank(r: ReceiptValues, list: CardTxn[]): CardTxn[] {
  const rt = minutes(r.time);
  const score = (c: CardTxn) => {
    let s = merchantScore(r.merchant, c.merchant) * 10;
    if (r.date) s -= dayDiff(r.date, cardDate(c));
    const ct = minutes(cardTime(c));
    if (rt !== null && ct !== null) s -= Math.min(Math.abs(rt - ct), 600) / 120;
    if (r.amount !== null) s -= Math.min(Math.abs(r.amount - c.amount) / Math.max(c.amount, 1), 1);
    return s;
  };
  return [...list].sort((a, b) => score(b) - score(a));
}

/** 이 정도 넘게 벌어지면 시간 불일치 (영수증 시각과 카드 승인 시각은 몇 분씩 차이 나는 게 보통) */
const TIME_GAP_MIN = 180;

/**
 * 카드 내역 한 건과 영수증 값을 비교한 상태.
 * 날짜·금액이 기본 기준이고, 둘 다 맞으면 업체(이름에 겹치는 단어가 하나도 없음)·시간(3시간 이상 차이)도 본다
 */
export function statusAgainst(r: ReceiptValues, card: CardTxn | undefined | null): MatchStatus {
  if (!card) return "no_card";
  const dateOk = r.date === cardDate(card);
  const amountOk = r.amount !== null && sameAmount(r.amount, card.amount);
  if (dateOk && amountOk) {
    if (r.merchant && card.merchant && merchantScore(r.merchant, card.merchant) === 0) return "merchant_mismatch";
    const rt = minutes(r.time);
    const ct = minutes(cardTime(card));
    if (rt !== null && ct !== null && Math.abs(rt - ct) >= TIME_GAP_MIN) return "time_mismatch";
    return "matched";
  }
  if (dateOk) return "amount_mismatch";
  if (amountOk) return "date_mismatch";
  return "no_card";
}

/**
 * 대조 기준: 금액 + 날짜.
 * linked: 이미 다른 영수증과 연결된 승인번호 (가능하면 피한다)
 */
export function matchReceipt(r: ReceiptValues, cards: CardTxn[], linked: Set<string>): MatchResult {
  const free = cards.filter((c) => !linked.has(c.approvalNo));
  const pick = (pred: (c: CardTxn) => boolean) => {
    const f = free.filter(pred);
    return f.length ? f : cards.filter(pred);
  };
  const result = (status: MatchStatus, list: CardTxn[]): MatchResult => {
    const ranked = rank(r, list);
    // 날짜·금액이 맞은 짝은 업체·시간까지 확인 (다르면 업체·시간 불일치)
    const final = status === "matched" && ranked[0] ? statusAgainst(r, ranked[0]) : status;
    return { matchStatus: final, approvalNo: ranked[0]?.approvalNo ?? null, candidates: ranked.map((c) => c.approvalNo) };
  };

  // 1) 날짜 + 금액이 모두 같은 내역 (중복 영수증일 수도 있으니 연결된 내역도 허용)
  if (r.date && r.amount !== null) {
    const exact = pick((c) => cardDate(c) === r.date && sameAmount(c.amount, r.amount!));
    if (exact.length) return result("matched", exact);
  }
  // 아래부터는 아직 영수증이 없는 카드 내역만 짝으로 본다
  const sameDay = r.date ? free.filter((c) => cardDate(c) === r.date) : [];
  // 2) 날짜(·업체)는 맞는데 금액이 다름
  const sameDayShop = sameDay.filter((c) => !r.merchant || merchantScore(r.merchant, c.merchant) >= 0.3);
  if (sameDayShop.length) return result("amount_mismatch", sameDayShop);
  // 3) 금액은 같은데 날짜가 다름
  if (r.amount !== null) {
    const sameAmt = free.filter((c) => sameAmount(c.amount, r.amount!));
    if (sameAmt.length) return result("date_mismatch", sameAmt);
  }
  // 4) 짝 없음 — 같은 날 내역은 참고 후보로만 보여 준다
  return { matchStatus: "no_card", approvalNo: null, candidates: rank(r, sameDay).map((c) => c.approvalNo) };
}
