import { NextResponse } from "next/server";
import { getStore } from "./store";
import { matchReceipt, type MatchResult } from "./match";
import { DEFAULT_SETTINGS, type CardStatus, type CardTxn, type Receipt, type Settings } from "./types";

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

/** 카드 내역 + 영수증 연결 상태 (카드 사용내역 화면용) */
export async function cardsWithStatus(): Promise<(CardTxn & { status: CardStatus; receiptId: string | null })[]> {
  const store = getStore();
  const [cards, receipts] = await Promise.all([store.aList(), store.listReceipts()]);
  const byApproval = new Map<string, Receipt>();
  for (const r of receipts) if (r.approvalNo && r.matchStatus !== "no_card") byApproval.set(r.approvalNo, r);
  return cards.map((c) => {
    const r = byApproval.get(c.approvalNo);
    return { ...c, status: r ? r.matchStatus : "no_receipt", receiptId: r?.id ?? null };
  });
}

export async function getSettings(): Promise<Settings> {
  const store = getStore();
  const [approverName, submitterName, submitterRank] = await Promise.all([
    store.getSetting("approver_name"),
    store.getSetting("submitter_name"),
    store.getSetting("submitter_rank"),
  ]);
  return {
    approverName: approverName || DEFAULT_SETTINGS.approverName,
    submitterName: submitterName || DEFAULT_SETTINGS.submitterName,
    submitterRank: submitterRank ?? DEFAULT_SETTINGS.submitterRank,
  };
}
