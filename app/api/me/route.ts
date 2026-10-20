import { checkPassword, sessionMember, setPassword } from "@/lib/auth";
import { fail, ok } from "@/lib/service";

export const dynamic = "force-dynamic";

/** 마이페이지: 비밀번호 바꾸기 (로그인한 본인만). 계급·이름·직책은 조직도 관리(부서장)에서 */
export async function PUT(req: Request) {
  try {
    const me = await sessionMember();
    if (!me) return fail(new Error("로그인이 필요합니다."), 401);
    const b = (await req.json().catch(() => ({}))) as {
      currentPassword?: string;
      newPassword?: string;
    };

    const { currentPassword = "", newPassword = "" } = b;
    if (newPassword.length < 6) return fail(new Error("새 비밀번호는 6자 이상이어야 합니다."), 400);
    if (await checkPassword(me, currentPassword)) return fail(new Error("현재 비밀번호가 맞지 않습니다."), 400);
    await setPassword(me, newPassword);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
