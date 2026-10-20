/** 카드 사용내역 한 건 (9-1 양식) */
export interface CardTxn {
  approvalNo: string; // 승인번호 (고유)
  approvedAt: string; // 승인일시 "YYYY-MM-DD HH:MM"
  merchant: string; // 가맹점명
  category: string; // 업종
  amount: number; // 금액
  currency: string; // 통화
  cardLast4: string; // 카드끝4자리
  registeredAt?: string | null; // (B) 등록 일시
  fetchedAt?: string | null; // (A) 불러온 일시
}

export type MatchStatus = "matched" | "amount_mismatch" | "date_mismatch" | "no_card";
export type CardStatus = MatchStatus | "no_receipt";

export const STATUS_LABEL: Record<CardStatus, string> = {
  matched: "✅ 일치",
  amount_mismatch: "⚠️ 금액 불일치",
  date_mismatch: "⚠️ 날짜 불일치",
  no_card: "⚠️ 카드내역 없음",
  no_receipt: "⏳ 영수증 없음",
};

export interface OcrResult {
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  note: string;
}

export interface Receipt {
  id: string;
  fileName: string;
  imagePath: string;
  contentType: string;
  ocr: OcrResult | null;
  ocrError: string | null;
  date: string | null;
  time: string | null;
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  matchStatus: MatchStatus;
  approvalNo: string | null; // 연결된 카드 승인번호
  candidates: string[]; // 후보 승인번호
  memo: string; // 적요
  memoNote: string;
  memoAlternatives: string[];
  submissionId: string | null;
  createdAt: string;
}

export type SubmissionStatus = "pending" | "approved";

export interface Submission {
  id: string;
  docNo: string;
  receiptId: string;
  date: string | null;
  time: string | null;
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  memo: string;
  imagePath: string;
  submitter: string;
  submittedAt: string;
  status: SubmissionStatus;
  approverName: string | null;
  approvedAt: string | null;
}

export interface Settings {
  approverName: string;
  submitterName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  approverName: "○○○ 팀장",
  submitterName: "재정부서 담당자",
};
