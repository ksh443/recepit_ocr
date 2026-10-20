import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, verifySession } from "@/lib/session";

/**
 * 결재 웹앱은 로그인 필수 (Supabase 연결 시).
 * 로그인 화면, 로그인 API, 가상 카드사 조회 웹페이지(/card, /api/card — 별도 사이트 역할)는 열어 둔다.
 */
const PUBLIC = [/^\/login/, /^\/api\/auth\//, /^\/card(\/|$)/, /^\/api\/card\//];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!authEnabled() || PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // 정적 파일(아이콘·PWA·pdf.js)은 제외
  matcher: ["/((?!_next/|icons/|pdfjs/|samples/|favicon|manifest|sw\\.js|offline\\.html|.*\\.(?:png|jpg|svg|ico|webmanifest|js|mjs)$).*)"],
};
