"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api, errMsg } from "./api";
import { LoadStatus, useLoad } from "./useLoad";
import { sortOrg } from "@/lib/org";
import { personLabel, type OrgMember } from "@/lib/types";

/** 로그인한 사람 (로컬 개발 모드는 "계정 선택"한 사람). 누구든 영수증을 올려 상신하고, 결재선에 있으면 검토·결재한다 */
const ActorCtx = createContext<OrgMember | null>(null);
export const useActor = () => useContext(ActorCtx);
/** 로그인을 쓰는지 (Supabase 연결 시 true) */
const AuthCtx = createContext(false);
export const useAuthEnabled = () => useContext(AuthCtx);

const NAV = [
  { href: "/cards", label: "① 카드 사용내역" },
  { href: "/receipts", label: "② 영수증 처리" },
  { href: "/submissions", label: "③ 결재 현황" },
  { href: "/org", label: "조직도 관리", headOnly: true },
  { href: "/me", label: "마이페이지", authOnly: true },
];

interface Env {
  storage: string;
  ai: string | null;
  settings: { orgChart: OrgMember[]; defaultDrafterId: string | null };
}
interface Me {
  authEnabled: boolean;
  member: OrgMember | null;
}

const goLogin = () => location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [actorId, setActorId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const shell = useLoad(() => Promise.all([api<Env>("/api/settings"), api<Me>("/api/auth/me")]), []);
  const [env, me] = shell.data ?? [null, null];
  const auth = Boolean(me?.authEnabled);

  useEffect(() => {
    try {
      setActorId(localStorage.getItem("actorId"));
    } catch {
      /* 저장소 사용 불가 */
    }
  }, []);
  // 로그인이 풀렸거나(만료) 내 계정이 조직도에서 빠졌으면 로그인 화면으로
  useEffect(() => {
    if (me?.authEnabled && !me.member) goLogin();
    if (shell.error.includes("로그인이 필요")) goLogin();
  }, [me, shell.error]);

  const org = env ? sortOrg(env.settings.orgChart) : [];
  // 로그인 모드: 로그인한 사람. 로컬 모드: 고른 계정 (조직도에 없으면 기본 담당자)
  const actor = auth
    ? (me?.member ?? null)
    : (org.find((m) => m.id === actorId) ?? org.find((m) => m.id === env?.settings.defaultDrafterId) ?? org[0] ?? null);

  /** 계정 전환: 로그인 모드에서는 그 사람으로 다시 로그인 (시연용 간편 로그인, 비밀번호 불필요) */
  const chooseActor = async (id: string) => {
    setSwitchError("");
    if (!auth) {
      setActorId(id);
      try {
        localStorage.setItem("actorId", id);
      } catch {
        /* 무시 */
      }
      return;
    }
    setSwitching(true);
    try {
      await api("/api/auth/login", { method: "POST", json: { memberId: id, demo: true } });
      location.reload();
    } catch (e) {
      setSwitchError(`계정 전환 실패: ${errMsg(e)}`);
      setSwitching(false);
    }
  };
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    location.replace("/login");
  };

  return (
    <AuthCtx.Provider value={auth}>
    <ActorCtx.Provider value={actor}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/cards" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" />
            <span className="hide-sm">지출원인행위 상신 자동화</span>
          </Link>
          <nav className="nav">
            {NAV.filter((n) => (!n.headOnly || !auth || actor?.head) && (!n.authOnly || auth)).map((n) => (
              <Link key={n.href} href={n.href} className={pathname.startsWith(n.href) ? "active" : ""}>
                {n.label}
              </Link>
            ))}
          </nav>
          {org.length > 0 && (
            <label className="account-select">
              <span>계정 선택</span>
              <select value={actor?.id ?? ""} onChange={(e) => chooseActor(e.target.value)} disabled={switching}>
                {org.map((m) => (
                  <option key={m.id} value={m.id}>
                    {personLabel(m)}
                    {m.duty ? ` (${m.duty})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {auth && (
            <button className="btn sm ghost" onClick={logout}>
              로그아웃
            </button>
          )}
        </div>
      </header>
      {env && (env.storage === "local" || !env.ai) && (
        <div className="env-banner">
          {env.storage === "local" && "로컬 개발 모드: 데이터가 .data/ 폴더에 저장됩니다(Supabase 미연결). "}
          {!env.ai && "AI API 키(GEMINI_API_KEY 또는 ANTHROPIC_API_KEY)가 없어 OCR·적요 자동 작성이 동작하지 않습니다."}
        </div>
      )}
      {!auth && <div className="demo-banner">로컬 개발 모드: 로그인 없이 &quot;계정 선택&quot;으로 사람을 고르며 본인 확인은 하지 않습니다.</div>}
      {switchError && <div className="alert error page" style={{ marginBottom: 0 }}>{switchError}</div>}
      <main className="page">
        {/* 계정·조직도를 알아야 화면이 동작하므로, 먼저 불러온 뒤 보여 준다 */}
        {shell.data && actor ? (
          children
        ) : (
          <p className="muted">
            <LoadStatus error={shell.error} slow={shell.slow} onRetry={shell.reload} />
          </p>
        )}
      </main>
      {/* 연결 상태 등은 눈에 띄지 않게 맨 아래에 */}
      <footer className="site-footer">
        <Link href="/settings">웹사이트 정보</Link>
      </footer>
    </ActorCtx.Provider>
    </AuthCtx.Provider>
  );
}
