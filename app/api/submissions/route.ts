import { randomUUID } from "crypto";
import { getStore } from "@/lib/store";
import { nowKst } from "@/lib/format";
import { fail, getSettings, ok } from "@/lib/service";
import type { ApprovalStep, LineSelection, OrgMember, Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ submissions: await getStore().listSubmissions() });
  } catch (e) {
    return fail(e);
  }
}

/** 조직도에서 고른 결재선을 서명란 단계로 만든다 (상신 시점의 직급·이름을 그대로 남김) */
function buildLine(sel: LineSelection | undefined, org: OrgMember[], at: string): ApprovalStep[] | string {
  if (!sel?.drafterId || !sel.approverId) return "결재선(담당·결재)을 지정해 주세요.";
  const find = (id: string) => org.find((m) => m.id === id);
  const drafter = find(sel.drafterId);
  const approver = find(sel.approverId);
  const reviewers = (sel.reviewerIds ?? []).map(find);
  const proxy = sel.proxyId ? find(sel.proxyId) : null;
  if (!drafter || !approver || reviewers.some((m) => !m) || (sel.proxyId && !proxy))
    return "결재선에 조직도에 없는 사람이 있습니다. 조직도를 확인해 주세요.";
  const people = [drafter, ...(reviewers as OrgMember[]), approver];
  if (new Set(people.map((m) => m.id)).size !== people.length) return "결재선에 같은 사람이 두 번 들어가 있습니다.";
  if (proxy && proxy.id === approver.id) return "대결자는 원결재자와 다른 사람이어야 합니다.";
  const step = (role: ApprovalStep["role"], m: OrgMember): ApprovalStep => ({
    role,
    rank: m.rank,
    name: m.name,
    proxy: null,
    signedAt: role === "drafter" ? at : null,
  });
  return [
    step("drafter", drafter),
    ...(reviewers as OrgMember[]).map((m) => step("review", m)),
    { ...step("final", approver), proxy: proxy ? { rank: proxy.rank, name: proxy.name } : null },
  ];
}

/** 결재 상신(재상신 포함): 영수증 한 건으로 상신 문서를 만들어 결재 현황에 게시 */
export async function POST(req: Request) {
  try {
    const { receiptId, line: selection } = (await req.json()) as { receiptId: string; line?: LineSelection };
    const store = getStore();
    const r = await store.getReceipt(receiptId);
    if (!r) return fail(new Error("영수증을 찾을 수 없습니다."), 404);
    // 이미 상신했어도 그 문서가 반려됐으면 재상신 (새 문서번호, 이전 문서는 기록으로 남김)
    const previous = r.submissionId ? await store.getSubmission(r.submissionId) : null;
    if (previous && previous.status !== "rejected") return fail(new Error("이미 상신된 영수증입니다."), 409);
    if (!r.memo.trim()) return fail(new Error("적요를 먼저 작성해 주세요."), 400);
    if (!r.date || r.amount === null) return fail(new Error("날짜와 금액을 먼저 확인해 주세요."), 400);

    const [settings, all] = await Promise.all([getSettings(), store.listSubmissions()]);
    const line = buildLine(selection, settings.orgChart, nowKst());
    if (typeof line === "string") return fail(new Error(line), 400);
    const at = nowKst();
    const year = at.slice(0, 4);
    const seq =
      Math.max(0, ...all.filter((s) => s.docNo.includes(`-${year}-`)).map((s) => Number(s.docNo.split("-").pop()) || 0)) + 1;
    const s: Submission = {
      id: randomUUID(),
      docNo: `지출-${year}-${String(seq).padStart(4, "0")}`,
      receiptId: r.id,
      date: r.date,
      time: r.time,
      merchant: r.merchant,
      amount: r.amount,
      currency: r.currency,
      memo: r.memo.trim(),
      imagePath: r.imagePath,
      submitter: line[0].name,
      submitterRank: line[0].rank,
      submittedAt: at,
      status: "pending",
      approverName: null,
      approvedAt: null,
      approvalLine: line,
      previousSubmissionId: previous?.id ?? null,
      previousDocNo: previous?.docNo ?? null,
    };
    await store.insertSubmission(s);
    await store.updateReceipt(r.id, { submissionId: s.id });
    return ok({ submission: s });
  } catch (e) {
    return fail(e);
  }
}
