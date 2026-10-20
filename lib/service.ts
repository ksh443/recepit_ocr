import { NextResponse } from "next/server";
import { getStore } from "./store";
import { matchReceipt, type MatchResult } from "./match";
import { DEFAULT_DRAFTER_ID, DEFAULT_ORG, validateOrg } from "./org";
import { approvalState, type ApprovalState, type CardStatus, type CardTxn, type OrgMember, type Receipt, type Settings } from "./types";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(e: unknown, status = 500) {
  const message = e instanceof Error ? e.message : String(e);
  console.error("[api]", message);
  return NextResponse.json({ error: message }, { status });
}

/** 영수증 한 건을 현재 카드 내역과 다시 대조 */
export async function computeMatch(r: Pick<Receipt, "id" | "date" | "time" | "merchant" | "amount">): Promise<MatchResult> {
  const store = getStore();
  const [cards, receipts] = await Promise.all([store.aList(), store.listReceipts()]);
  const linked = new Set(
    receipts.filter((x) => x.id !== r.id && x.approvalNo && x.matchStatus !== "no_card").map((x) => x.approvalNo!),
  );
  return matchReceipt(r, cards, linked);
}

/** 카드 내역이 새로 들어온 뒤, 짝이 없던 미상신 영수증을 다시 대조 */
export async function rematchUnlinked(): Promise<number> {
  const store = getStore();
  const receipts = await store.listReceipts();
  let changed = 0;
  for (const r of receipts.reverse()) {
    if (r.submissionId || r.matchStatus !== "no_card") continue;
    const m = await computeMatch(r);
    if (m.matchStatus !== r.matchStatus || m.approvalNo !== r.approvalNo) {
      await store.updateReceipt(r.id, m);
      changed++;
    }
  }
  return changed;
}

/** 상신된 영수증은 잠근다. 단, 마지막 상신 문서가 반려됐으면 고쳐서 재상신할 수 있다 */
export async function receiptLocked(r: Receipt): Promise<boolean> {
  if (!r.submissionId) return false;
  const s = await getStore().getSubmission(r.submissionId);
  return Boolean(s && s.status !== "rejected");
}

/** 카드 내역 + 영수증 연결 상태 (카드 사용내역 화면용) */
export interface CardRow extends CardTxn {
  status: CardStatus;
  receiptId: string | null;
  approval: ApprovalState | null; // 연결된 영수증의 결재 상태 (상신 전이면 null)
  submissionId: string | null;
}

export async function cardsWithStatus(): Promise<CardRow[]> {
  const store = getStore();
  const [cards, receipts, submissions] = await Promise.all([store.aList(), store.listReceipts(), store.listSubmissions()]);
  const byApproval = new Map<string, Receipt>();
  for (const r of receipts) if (r.approvalNo && r.matchStatus !== "no_card") byApproval.set(r.approvalNo, r);
  const subById = new Map(submissions.map((s) => [s.id, s]));
  return cards.map((c) => {
    const r = byApproval.get(c.approvalNo);
    const s = r?.submissionId ? subById.get(r.submissionId) : undefined;
    return {
      ...c,
      status: r ? r.matchStatus : "no_receipt",
      receiptId: r?.id ?? null,
      approval: s ? approvalState(s) : null,
      submissionId: s?.id ?? null,
    };
  });
}

export async function getSettings(): Promise<Settings> {
  const store = getStore();
  const [orgJson, drafterId] = await Promise.all([store.getSetting("org_chart"), store.getSetting("default_drafter_id")]);
  let orgChart: OrgMember[] = DEFAULT_ORG;
  if (orgJson) {
    try {
      const parsed = JSON.parse(orgJson);
      if (!validateOrg(parsed)) orgChart = parsed;
    } catch {
      /* 저장값이 깨졌으면 기본 조직도 */
    }
  }
  const defaultDrafterId = drafterId ?? DEFAULT_DRAFTER_ID;
  return {
    orgChart,
    defaultDrafterId: orgChart.some((m) => m.id === defaultDrafterId) ? defaultDrafterId : null,
  };
}
