import { getStore } from "@/lib/store";
import { fail, ok } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const s = await getStore().getSubmission(id);
    return s ? ok({ submission: s }) : fail(new Error("상신 문서를 찾을 수 없습니다."), 404);
  } catch (e) {
    return fail(e);
  }
}
