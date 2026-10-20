import { sessionMember } from "@/lib/auth";
import { fail, getSettings, ok } from "@/lib/service";
import { authEnabled } from "@/lib/session";

export const dynamic = "force-dynamic";

/** 로그인 여부 + (로그인 화면용) 조직도 구성원 목록 */
export async function GET() {
  try {
    const { orgChart } = await getSettings();
    return ok({
      authEnabled: authEnabled(),
      member: await sessionMember(),
      members: orgChart.map(({ id, rank, name, duty, head, loginId, email }) => ({ id, rank, name, duty, head, loginId, email })),
    });
  } catch (e) {
    return fail(e);
  }
}
