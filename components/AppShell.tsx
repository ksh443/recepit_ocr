"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { sortOrg } from "@/lib/org";
import { personLabel, type OrgMember } from "@/lib/types";

/** "계정 선택"한 사람 (로그인 대신). 누구든 영수증을 올려 상신하고, 결재선에 있으면 검토·결재한다 */
const ActorCtx = createContext<OrgMember | null>(null);
export const useActor = () => useContext(ActorCtx);

const NAV = [
  { href: "/cards", label: "① 카드 사용내역" },
  { href: "/receipts", label: "② 영수증 처리" },
  { href: "/submissions", label: "③ 결재 현황" },
  { href: "/settings", label: "설정" },
];

interface Env {
  storage: string;
  ai: string | null;
  settings: { orgChart: OrgMember[]; defaultDrafterId: string | null };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [env, setEnv] = useState<Env | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setActorId(localStorage.getItem("actorId"));
    } catch {
      /* 저장소 사용 불가 */
    }
    api<Env>("/api/settings").then(setEnv).catch(() => undefined);
  }, []);

  const org = env ? sortOrg(env.settings.orgChart) : [];
  // 고른 계정이 조직도에 없으면 기본 담당자
  const actor =
    org.find((m) => m.id === actorId) ?? org.find((m) => m.id === env?.settings.defaultDrafterId) ?? org[0] ?? null;
  const chooseActor = (id: string) => {
    setActorId(id);
    try {
      localStorage.setItem("actorId", id);
    } catch {
      /* 무시 */
    }
  };

  return (
    <ActorCtx.Provider value={actor}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/cards" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" />
            <span className="hide-sm">영수증 결재 상신</span>
          </Link>
          <nav className="nav">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={pathname.startsWith(n.href) ? "active" : ""}>
                {n.label}
              </Link>
            ))}
          </nav>
          {org.length > 0 && (
            <label className="account-select">
              <span>계정 선택</span>
              <select value={actor?.id ?? ""} onChange={(e) => chooseActor(e.target.value)}>
                {org.map((m) => (
                  <option key={m.id} value={m.id}>
                    {personLabel(m)}
                    {m.duty ? ` (${m.duty})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </header>
      {env && (env.storage === "local" || !env.ai) && (
        <div className="env-banner">
          {env.storage === "local" && "로컬 개발 모드: 데이터가 .data/ 폴더에 저장됩니다(Supabase 미연결). "}
          {!env.ai && "AI API 키(GEMINI_API_KEY 또는 ANTHROPIC_API_KEY)가 없어 OCR·적요 자동 작성이 동작하지 않습니다."}
        </div>
      )}
      <div className="demo-banner">시연용: 로그인 대신 &quot;계정 선택&quot;으로 사람을 고르며 본인 확인은 하지 않습니다.</div>
      <main className="page">{children}</main>
    </ActorCtx.Provider>
  );
}
