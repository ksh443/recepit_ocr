"use client";

import { useState } from "react";
import { api, errMsg } from "@/components/api";
import { LoadStatus, useLoad } from "@/components/useLoad";
import { LOGIN_DOMAIN, sortOrg } from "@/lib/org";
import { personLabel, type OrgMember } from "@/lib/types";

interface Me {
  authEnabled: boolean;
  member: OrgMember | null;
  members: OrgMember[];
}

/** 로그인 뒤 돌아갈 주소 (같은 사이트 안쪽만) */
function nextUrl() {
  const n = new URLSearchParams(location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/cards";
}

/** 로그인 (Supabase Auth). 시연용으로 "이 사람으로 로그인"(사람 고르기 → 초기 비밀번호로 로그인)을 함께 보여 준다 */
export default function LoginPage() {
  const me = useLoad(() => api<Me>("/api/auth/me"), []);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [demoId, setDemoId] = useState("");

  const login = async (body: { loginId?: string; memberId?: string; password?: string; demo?: boolean }) => {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", json: body });
      location.replace(nextUrl());
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  const members = sortOrg(me.data?.members ?? []);

  return (
    <main className="page login-page">
      <div className="card login-card">
        <div className="row" style={{ marginBottom: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={32} height={32} />
          <h1 style={{ margin: 0 }}>지출원인행위 상신 자동화</h1>
        </div>

        {!me.data ? (
          <p className="muted">
            <LoadStatus error={me.error} slow={me.slow} onRetry={me.reload} />
          </p>
        ) : !me.data.authEnabled ? (
          <div className="alert info">
            로컬 개발 모드라 로그인 없이 쓸 수 있습니다. <a href="/cards">시작하기 →</a>
          </div>
        ) : (
          <>
            {me.data.member && (
              <div className="alert info">
                {personLabel(me.data.member)}(으)로 로그인되어 있습니다. <a href={nextUrl()}>계속하기 →</a>
              </div>
            )}
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                login({ loginId, password });
              }}
            >
              <label className="stack" style={{ gap: 4 }}>
                <span className="small">아이디 또는 이메일</span>
                <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  <input
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="예: kwon"
                    autoComplete="username"
                    autoCapitalize="none"
                    style={{ flex: 1 }}
                  />
                  <span className="muted small nowrap">@{LOGIN_DOMAIN}</span>
                </span>
              </label>
              <label className="stack" style={{ gap: 4 }}>
                <span className="small">비밀번호</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </label>
              {error && <div className="alert error" style={{ margin: 0 }}>{error}</div>}
              <button className="btn primary" disabled={busy || !loginId || !password}>
                {busy ? "로그인 중…" : "로그인"}
              </button>
            </form>

            <h3 style={{ margin: "24px 0 4px" }}>시연용: 이 사람으로 로그인</h3>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <select value={demoId} onChange={(e) => setDemoId(e.target.value)} aria-label="로그인할 사람" style={{ flex: 1, minWidth: 0 }}>
                <option value="">사람 선택</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {personLabel(m)}
                    {m.duty ? ` (${m.duty})` : ""}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                disabled={busy || !demoId}
                onClick={() => login({ memberId: demoId, demo: true })}
              >
                로그인
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
