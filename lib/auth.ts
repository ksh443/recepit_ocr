import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { DEMO_PASSWORD, LOGIN_DOMAIN, loginEmail } from "./org";
import { getSettings } from "./service";
import { SESSION_COOKIE, authEnabled, verifySession } from "./session";
import type { OrgMember } from "./types";

/**
 * 로그인 계정 = Supabase Auth 사용자. 조직도 구성원 한 명당 하나 (아이디@aflc.test).
 * 계정 생성·삭제는 서버 Secret key(관리자 API)로만 한다.
 */
function client() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase가 연결되지 않아 로그인을 쓸 수 없습니다.");
  // 로그인할 때마다 새로 만든다 (로그인한 사용자 토큰이 관리자 요청에 섞이지 않게)
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Authentication 사용자 정보에 넣는 구성원 정보 (Supabase 대시보드 Users의 Display name·User metadata에 보임) */
export const memberMeta = (m: OrgMember) => ({
  memberId: m.id,
  rank: m.rank,
  name: m.name,
  duty: m.duty,
  head: m.head,
  display_name: `${m.rank} ${m.name}${m.duty ? ` (${m.duty})` : ""}`,
});
const sameMeta = (a: Record<string, unknown> | undefined, b: Record<string, unknown>) =>
  Object.entries(b).every(([k, v]) => a?.[k] === v);

/**
 * 조직도와 계정을 맞춘다: 없는 계정은 초기 비밀번호로 만들고, 계급·이름·직책이 바뀌었으면 계정 정보도 고치고,
 * 조직도에서 빠진 사람의 계정은 지운다
 */
export async function syncAccounts(org: OrgMember[]): Promise<{ created: string[]; deleted: string[] }> {
  if (!authEnabled()) return { created: [], deleted: [] };
  const admin = client().auth.admin;
  const { data, error } = await admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`계정 목록을 불러오지 못했습니다: ${error.message}`);
  const wanted = new Map(org.filter((m) => m.loginId || m.email).map((m) => [loginEmail(m).toLowerCase(), m]));
  // 이 웹앱이 만든 계정 = 시연용 주소이거나 조직도 구성원 표시가 있는 계정
  const users = data.users.filter(
    (u) => u.email?.endsWith(`@${LOGIN_DOMAIN}`) || wanted.has(u.email ?? "") || u.user_metadata?.memberId,
  );
  const created: string[] = [];
  const deleted: string[] = [];
  for (const [email, m] of wanted) {
    const u = users.find((x) => x.email === email);
    if (u) {
      if (!sameMeta(u.user_metadata, memberMeta(m))) {
        const r = await admin.updateUserById(u.id, { user_metadata: memberMeta(m) });
        if (r.error) throw new Error(`${m.name} 계정 정보를 고치지 못했습니다: ${r.error.message}`);
      }
      continue;
    }
    const r = await admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: memberMeta(m),
    });
    if (r.error) throw new Error(`${m.name} 계정을 만들지 못했습니다: ${r.error.message}`);
    created.push(email);
  }
  for (const u of users) {
    if (wanted.has(u.email!)) continue;
    const r = await admin.deleteUser(u.id);
    if (r.error) throw new Error(`${u.email} 계정을 지우지 못했습니다: ${r.error.message}`);
    deleted.push(u.email!);
  }
  return { created, deleted };
}

/** 아이디·비밀번호 확인 (Supabase Auth) */
export async function checkPassword(m: OrgMember, password: string): Promise<string | null> {
  const { error } = await client().auth.signInWithPassword({ email: loginEmail(m), password });
  return error ? error.message : null;
}

/** 지금 로그인한 구성원 (로그인을 쓰지 않으면 null) */
export async function sessionMember(): Promise<OrgMember | null> {
  if (!authEnabled()) return null;
  const id = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  return (await getSettings()).orgChart.find((m) => m.id === id) ?? null;
}

/** 비밀번호 바꾸기 (마이페이지) */
export async function setPassword(m: OrgMember, password: string) {
  const admin = client().auth.admin;
  const { data, error } = await admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`계정을 찾지 못했습니다: ${error.message}`);
  const u = data.users.find((x) => x.email === loginEmail(m).toLowerCase());
  if (!u) throw new Error("로그인 계정이 없습니다. 부서장에게 문의하세요.");
  const r = await admin.updateUserById(u.id, { password });
  if (r.error) throw new Error(`비밀번호를 바꾸지 못했습니다: ${r.error.message}`);
}
