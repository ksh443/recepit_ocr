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
  importSource?: string | null; // (A) 불러온 방식: 새로고침 / CSV 업로드
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
  imagePath: string; // 원본 (이미지 또는 PDF)
  contentType: string;
  previewPath: string | null; // PDF일 때 화면 표시용 JPEG
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
  submissionId: string | null; // 마지막으로 상신한 문서 (반려되면 재상신 가능)
  uploaderId?: string | null; // 올린 사람 (조직도 구성원 id). 예전 영수증은 없음 → 기본 담당자 것으로 본다
  createdAt: string;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

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
  submitter: string; // 담당(상신자) 이름
  submitterRank: string | null; // 담당(상신자) 직급
  submittedAt: string;
  status: SubmissionStatus; // 결재선 마지막(결재) 승인 → approved, 누구든 반려 → rejected
  approverName: string | null; // 최종 결재 서명 표기 (대결이면 "代 소령 ○○○")
  approvedAt: string | null;
  approvalLine: ApprovalStep[] | null; // 결재선 (v1.6 이전 문서는 null)
  previousSubmissionId?: string | null; // 재상신이면 반려된 이전 문서
  previousDocNo?: string | null;
}

/** 카드 사용내역에 함께 보이는 결재 상태 */
export type ApprovalState = "requested" | "reviewing" | "done" | "rejected";
export const APPROVAL_STATE_LABEL: Record<ApprovalState, string> = {
  requested: "결재의뢰",
  reviewing: "검토중",
  done: "완료",
  rejected: "반려",
};
export function approvalState(s: Submission): ApprovalState {
  if (s.status === "rejected") return "rejected";
  if (s.status === "approved") return "done";
  // 상신 후 아무도 서명하지 않았으면 결재의뢰, 누군가 서명했으면 검토중
  return lineOf(s).some((st) => st.role !== "drafter" && st.signedAt) ? "reviewing" : "requested";
}

/* ------------------------------------------------------------------ */
/* 조직도·결재선                                                         */
/* ------------------------------------------------------------------ */

/** 직급 (낮은 순) */
export const RANKS = ["하사", "중사", "상사", "원사", "준위", "소위", "중위", "대위", "소령", "중령", "대령", "준장", "소장", "중장", "대장"];
export const rankOrder = (rank: string) => {
  const i = RANKS.indexOf(rank);
  return i < 0 ? -1 : i;
};

export interface OrgMember {
  id: string;
  rank: string;
  name: string;
  duty: string; // 직책 (예: 부서장, 재정담당)
  head: boolean; // 부서장 여부 (결재 기본값)
  loginId?: string; // 로그인 아이디 (성 로마자, 예: kwon → kwon@aflc.test). 없으면 저장할 때 붙인다
}

export interface Person {
  rank: string;
  name: string;
}
export const personLabel = (p: Person) => [p.rank, p.name].filter(Boolean).join(" ");

export type StepRole = "drafter" | "review" | "final";
export const ROLE_LABEL: Record<StepRole, string> = { drafter: "담당", review: "검토", final: "결재" };

export interface ApprovalStep extends Person {
  role: StepRole;
  proxy: Person | null; // 대결(대리결재)자. 있으면 이 사람이 대신 서명
  signedAt: string | null;
  result?: "approved" | "rejected" | null; // 서명 결과 (없으면 승인으로 본다)
  comment?: string | null; // 반려 사유
}

/** 서명란에 찍히는 사람 표기: 대결이면 "代 소령 ○○○" */
export const signerLabel = (s: ApprovalStep) => (s.proxy ? `代 ${personLabel(s.proxy)}` : personLabel(s));

/** 그 단계에서 실제로 서명하는 사람 (대결이면 대결자) */
export const signerOf = (s: ApprovalStep): Person => s.proxy ?? s;
export const samePerson = (a: Person | null | undefined, b: Person | null | undefined) =>
  Boolean(a && b && a.rank === b.rank && a.name === b.name);

/** 결재선 (v1.6 이전 문서는 저장된 상신자·승인자로 담당/결재 2칸을 만든다) */
export function lineOf(s: Submission): ApprovalStep[] {
  if (s.approvalLine?.length) return s.approvalLine;
  return [
    { role: "drafter", rank: s.submitterRank ?? "", name: s.submitter, proxy: null, signedAt: s.submittedAt },
    { role: "final", rank: "", name: s.approverName ?? "상급자", proxy: null, signedAt: s.approvedAt },
  ];
}

/** 다음에 서명할 단계 (반려됐거나 모두 서명했으면 -1) */
export const nextStepIndex = (line: ApprovalStep[]) =>
  line.some((st) => st.result === "rejected") ? -1 : line.findIndex((st) => st.role !== "drafter" && !st.signedAt);

/** 목록에 보이는 진행 상태 */
export function progressLabel(s: Submission): string {
  if (s.status === "rejected") return "반려";
  if (s.status === "approved") return "결재 완료";
  const line = lineOf(s);
  const i = nextStepIndex(line);
  return i < 0 ? "결재 완료" : `${ROLE_LABEL[line[i].role]} 대기`;
}

/** 결재 현황 탭 (상급자 보기는 선택한 계정이 결재선에 든 문서만) */
export type DocTab = "all" | "todo" | "progress" | "done";
export const DOC_TAB_LABEL: Record<DocTab, string> = { all: "전체", todo: "처리할 문서", progress: "진행 중", done: "결재 완료" };

/** 이 사람이 결재선(담당·검토·결재·대결자)에 들어 있나 */
export const inLine = (s: Submission, who: Person) =>
  lineOf(s).some((st) => samePerson(st, who) || samePerson(st.proxy, who));

/** 지금 이 사람이 서명할 차례인가 */
export function isMyTurn(s: Submission, who: Person): boolean {
  if (s.status !== "pending") return false;
  const line = lineOf(s);
  const i = nextStepIndex(line);
  return i >= 0 && samePerson(signerOf(line[i]), who);
}

export function matchesTab(s: Submission, tab: DocTab, who: Person | null): boolean {
  if (who && !inLine(s, who)) return false;
  if (tab === "all") return true;
  if (tab === "done") return s.status !== "pending";
  if (tab === "progress") return s.status === "pending";
  return who ? isMyTurn(s, who) : s.status === "pending";
}

export const submitterLabel = (s: Submission) => personLabel(lineOf(s)[0]);

export interface Settings {
  orgChart: OrgMember[];
  defaultDrafterId: string | null; // 결재선 담당 기본값
}

/** 결재 상신 때 고른 결재선 (조직도 구성원 id) */
export interface LineSelection {
  drafterId: string;
  reviewerIds: string[];
  approverId: string;
  proxyId: string | null; // 대결자 (없으면 원결재자가 결재)
}
