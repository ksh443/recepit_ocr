import { NextResponse } from "next/server";
import { checkPassword, syncAccounts } from "@/lib/auth";
import { fail, getSettings } from "@/lib/service";
import { SESSION_COOKIE, SESSION_DAYS, authEnabled, signSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** 로그인 (계정 전환도 같은 요청). 아이디 또는 조직도 구성원 id + 비밀번호 */
export async function POST(req: Request) {
  try {
    if (!authEnabled()) return fail(new Error("로그인을 쓰지 않는 모드입니다(Supabase 미연결)."), 400);
    const { loginId, memberId, password } = (await req.json().catch(() => ({}))) as {
      loginId?: string;
      memberId?: string;
      password?: string;
    };
    const id = (loginId ?? "").trim().toLowerCase().replace(/@.*$/, "");
    const { orgChart } = await getSettings();
    const m = orgChart.find((x) => (memberId ? x.id === memberId : x.loginId === id));
    if (!m || !password) return fail(new Error("아이디 또는 비밀번호가 맞지 않습니다."), 401);

    let problem = await checkPassword(m, password);
    if (problem) {
      // 처음 배포했거나 조직도를 바꾼 직후라 계정이 아직 없을 수 있다 → 계정을 맞추고 한 번 더
      const { created } = await syncAccounts(orgChart);
      if (created.length) problem = await checkPassword(m, password);
    }
    if (problem) return fail(new Error("아이디 또는 비밀번호가 맞지 않습니다."), 401);

    const res = NextResponse.json({ member: m });
    res.cookies.set(SESSION_COOKIE, await signSession(m.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && !!process.env.VERCEL,
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
    return res;
  } catch (e) {
    return fail(e);
  }
}
