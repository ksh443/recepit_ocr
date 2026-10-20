/**
 * 로그인 세션 쿠키 (서버·미들웨어 공용, Web Crypto만 사용).
 * 비밀번호 확인은 Supabase Auth가 하고, 확인되면 "조직도 구성원 id + 만료"에 서명한 쿠키를 준다.
 */
export const SESSION_COOKIE = "session";
export const SESSION_DAYS = 7;

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** 서명 키: Supabase Secret key (서버에만 있음) */
function secret(): string | null {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

async function hmac(data: string, key: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

/** Supabase가 연결돼 있으면 로그인 필수. 로컬 개발(.data/)은 로그인 없이 "계정 선택"만 */
export const authEnabled = () => Boolean(secret() && (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL));

export async function signSession(memberId: string): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = `${memberId}.${exp}`;
  return `${payload}.${await hmac(payload, secret()!)}`;
}

/** 쿠키가 유효하면 구성원 id, 아니면 null */
export async function verifySession(token: string | undefined | null): Promise<string | null> {
  const key = secret();
  if (!token || !key) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [memberId, exp, sig] = parts;
  if (!memberId || !(Number(exp) > Date.now())) return null;
  return (await hmac(`${memberId}.${exp}`, key)) === sig ? memberId : null;
}
