import { getStore } from "@/lib/store";
import { nowKst } from "@/lib/format";
import { fail, ok } from "@/lib/service";
import { sessionMember } from "@/lib/auth";
import { authEnabled } from "@/lib/session";
import { lineOf, nextStepIndex, personLabel, samePerson, signerLabel, signerOf, type Person } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 로그인한 사람이 결재선의 다음 단계에 승인 또는 반려. 차례가 아닌 사람은 막는다.
 * (로컬 개발 모드는 로그인이 없으므로 화면에서 고른 계정을 그대로 믿는다)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      actor?: Person;
      decision?: "approve" | "reject";
      comment?: string;
    };
    const { decision = "approve", comment } = body;
    const actor: Person | null | undefined = authEnabled() ? await sessionMember() : body.actor;
    if (!actor?.name) return fail(new Error("계정을 선택해 주세요."), 400);
    if (decision === "reject" && !comment?.trim()) return fail(new Error("반려 사유를 입력해 주세요."), 400);

    const store = getStore();
    const s = await store.getSubmission(id);
    if (!s) return fail(new Error("상신 문서를 찾을 수 없습니다."), 404);
    if (s.status !== "pending") return fail(new Error("이미 결재가 끝난 문서입니다."), 409);

    const line = lineOf(s).map((st) => ({ ...st }));
    const i = nextStepIndex(line);
    if (i < 0) return fail(new Error("서명할 단계가 없습니다."), 409);
    if (!samePerson(signerOf(line[i]), actor))
      return fail(new Error(`지금은 ${signerLabel(line[i])}의 차례입니다. (${personLabel(actor)} 계정은 서명할 수 없음)`), 403);

    const at = nowKst();
    line[i] = { ...line[i], signedAt: at, result: decision === "reject" ? "rejected" : "approved", comment: comment?.trim() || null };

    if (decision === "reject") {
      const saved = await store.updateSubmission(id, { approvalLine: line, status: "rejected" });
      return ok({ submission: saved });
    }
    const done = nextStepIndex(line) < 0;
    const final = line[line.length - 1];
    const saved = await store.updateSubmission(id, {
      approvalLine: line,
      ...(done ? { status: "approved" as const, approverName: signerLabel(final), approvedAt: at } : {}),
    });
    return ok({ submission: saved });
  } catch (e) {
    return fail(e);
  }
}
