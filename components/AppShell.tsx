"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

export type Role = "staff" | "supervisor";

const RoleCtx = createContext<Role>("staff");
export const useRole = () => useContext(RoleCtx);

const STAFF_NAV = [
  { href: "/cards", label: "① 카드 사용내역" },
  { href: "/receipts", label: "② 영수증 처리" },
  { href: "/submissions", label: "③ 상신 목록" },
  { href: "/settings", label: "설정" },
];
const SUP_NAV = [{ href: "/submissions", label: "상신 목록" }];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<Role>("staff");
  const [env, setEnv] = useState<{ storage: string; ai: string | null } | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem("role") === "supervisor") setRole("supervisor");
    } catch {
      /* 저장소 사용 불가 */
    }
    api<{ storage: string; ai: string | null }>("/api/settings").then(setEnv).catch(() => undefined);
  }, []);

  // 상급자 보기에서는 상신 목록·문서만 보인다
  useEffect(() => {
    if (role === "supervisor" && !pathname.startsWith("/submissions")) router.replace("/submissions");
  }, [role, pathname, router]);

  const switchRole = (r: Role) => {
    setRole(r);
    try {
      localStorage.setItem("role", r);
    } catch {
      /* 무시 */
    }
  };

  const nav = role === "supervisor" ? SUP_NAV : STAFF_NAV;

  return (
    <RoleCtx.Provider value={role}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href={role === "supervisor" ? "/submissions" : "/cards"} className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" />
            <span className="hide-sm">영수증 결재 상신</span>
          </Link>
          <nav className="nav">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={pathname.startsWith(n.href) ? "active" : ""}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="role-switch" role="group" aria-label="보기 전환">
            <button className={role === "staff" ? "on" : ""} onClick={() => switchRole("staff")}>
              담당자 보기
            </button>
            <button className={role === "supervisor" ? "on sup" : ""} onClick={() => switchRole("supervisor")}>
              상급자 보기
            </button>
          </div>
        </div>
      </header>
      {role === "supervisor" && (
        <div className="demo-banner">
          시연 기능: 로그인이 없어 본인 확인 없이 승인됩니다. 실제 결재 권한 확인은 결재기능 포함 버전에서 다룹니다.
        </div>
      )}
      {env && role === "staff" && (env.storage === "local" || !env.ai) && (
        <div className="env-banner">
          {env.storage === "local" && "로컬 개발 모드: 데이터가 .data/ 폴더에 저장됩니다(Supabase 미연결). "}
          {!env.ai && "AI API 키(GEMINI_API_KEY 또는 ANTHROPIC_API_KEY)가 없어 OCR·적요 자동 작성이 동작하지 않습니다."}
        </div>
      )}
      <main className="page">{children}</main>
    </RoleCtx.Provider>
  );
}
