import { getStore } from "@/lib/store";
import { nowKst } from "@/lib/format";
import { fail, getSettings, ok } from "@/lib/service";

export const dynamic = "force-dynamic";

/** (시연) 상급자 보기에서 승인 → 설정된 상급자 이름·승인 날짜 도장. 본인 확인은 하지 않는다. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore();
    const s = await store.getSubmission(id);
    if (!s) return fail(new Error("상신 문서를 찾을 수 없습니다."), 404);
    if (s.status === "approved") return ok({ submission: s });
    const { approverName } = await getSettings();
    const saved = await store.updateSubmission(id, { status: "approved", approverName, approvedAt: nowKst() });
    return ok({ submission: saved });
  } catch (e) {
    return fail(e);
  }
}
