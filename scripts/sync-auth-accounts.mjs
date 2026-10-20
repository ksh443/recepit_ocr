// 조직도 구성원마다 Supabase Auth 로그인 계정(아이디@aflc.test 또는 등록한 이메일)을 만들고,
// 계정 정보(계급·이름·직책·부서장, Display name)를 넣고, 비밀번호를 초기 비밀번호로 맞춘다.
// 조직도·아이디는 실행 중인 웹앱에서 읽는다 (아이디 규칙을 한 곳에서만 관리).
//   node scripts/sync-auth-accounts.mjs                       → http://localhost:3000
//   node scripts/sync-auth-accounts.mjs https://recepit-ocr.vercel.app
// .env.local 의 SUPABASE_URL, SUPABASE_SECRET_KEY 를 쓴다. 조직도에 없는 @aflc.test 계정은 지운다.
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const PASSWORD = "000000";
const DOMAIN = "aflc.test";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error(".env.local 에 SUPABASE_URL, SUPABASE_SECRET_KEY 가 필요합니다.");

const base = process.argv[2] || "http://localhost:3000";
const res = await fetch(`${base}/api/auth/me`);
if (!res.ok) throw new Error(`${base}/api/auth/me 응답 ${res.status} — 웹앱이 켜져 있는지 확인하세요.`);
const { members } = await res.json();

const admin = createClient(url, key, { auth: { persistSession: false } }).auth.admin;
const { data, error } = await admin.listUsers({ perPage: 1000 });
if (error) throw error;
const users = data.users.filter((u) => u.email?.endsWith(`@${DOMAIN}`));

const wanted = new Set();
for (const m of members) {
  const email = (m.email || `${m.loginId}@${DOMAIN}`).toLowerCase();
  wanted.add(email);
  // lib/auth.ts memberMeta 와 같은 모양
  const meta = {
    memberId: m.id,
    rank: m.rank,
    name: m.name,
    duty: m.duty,
    head: m.head,
    display_name: `${m.rank} ${m.name}${m.duty ? ` (${m.duty})` : ""}`,
  };
  const u = data.users.find((x) => x.email === email);
  const r = u
    ? await admin.updateUserById(u.id, { password: PASSWORD, user_metadata: meta })
    : await admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: meta });
  if (r.error) throw new Error(`${email}: ${r.error.message}`);
  console.log(`${u ? "정보·비밀번호 재설정" : "생성"}  ${email}  ${meta.display_name}`);
}
for (const u of users) {
  if (wanted.has(u.email)) continue;
  const r = await admin.deleteUser(u.id);
  if (r.error) throw new Error(`${u.email}: ${r.error.message}`);
  console.log(`삭제  ${u.email}`);
}
console.log(`완료: ${members.length}명, 비밀번호 ${PASSWORD}`);
