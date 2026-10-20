"use client";

import { useState } from "react";
import { api, errMsg } from "@/components/api";
import { useActor, useAuthEnabled } from "@/components/AppShell";
import { loginEmail } from "@/lib/org";
import { personLabel } from "@/lib/types";

type Msg = { type: "info" | "error"; text: string } | null;

/** 마이페이지: 내 정보 보기, 비밀번호 바꾸기 */
export default function MyPage() {
  const actor = useActor()!;
  const auth = useAuthEnabled();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  const savePw = async () => {
    setPwMsg(null);
    if (pw.next !== pw.confirm) return setPwMsg({ type: "error", text: "새 비밀번호 확인이 맞지 않습니다." });
    setBusy(true);
    try {
      await api("/api/me", { method: "PUT", json: { currentPassword: pw.current, newPassword: pw.next } });
      setPw({ current: "", next: "", confirm: "" });
      setPwMsg({ type: "info", text: "비밀번호를 바꿨습니다." });
    } catch (e) {
      setPwMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!auth)
    return <div className="alert info">로컬 개발 모드(로그인 없음)에서는 마이페이지를 쓰지 않습니다. 조직도 관리에서 고치세요.</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>마이페이지</h1>
          <p className="muted small">
            {personLabel(actor)}
            {actor.duty ? ` (${actor.duty})` : ""} · <span className="mono">{loginEmail(actor)}</span>
            {actor.head ? " · 부서장" : ""}
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        <h3>내 정보</h3>
        <dl className="info-list">
          <dt>계급</dt>
          <dd>{actor.rank}</dd>
          <dt>이름</dt>
          <dd>{actor.name}</dd>
          <dt>직책</dt>
          <dd>{actor.duty || "-"}</dd>
        </dl>
        <p className="muted small" style={{ margin: "10px 0 0" }}>
          계급·이름·직책 변경은 부서장이 조직도 관리에서 합니다.
        </p>
      </div>

      <form
        className="card"
        style={{ maxWidth: 520 }}
        onSubmit={(e) => {
          e.preventDefault();
          savePw();
        }}
      >
        <h3>비밀번호 변경</h3>
        <div className="stack" style={{ gap: 10 }}>
          <input type="text" autoComplete="username" value={loginEmail(actor)} readOnly hidden />
          <label className="stack" style={{ gap: 4 }}>
            <span className="small">현재 비밀번호</span>
            <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="small">새 비밀번호 (6자 이상)</span>
            <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" minLength={6} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="small">새 비밀번호 확인</span>
            <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
          </label>
          {pwMsg && <div className={`alert ${pwMsg.type}`} style={{ margin: 0 }}>{pwMsg.text}</div>}
          <div>
            <button className="btn primary" disabled={busy || !pw.current || pw.next.length < 6 || !pw.confirm}>
              비밀번호 변경
            </button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            바꾼 비밀번호는 바로 로그인 계정에 반영됩니다. 시연용 간편 로그인(&quot;이 사람으로 로그인&quot;, 상단 계정 선택)은
            비밀번호와 관계없이 계속 쓸 수 있습니다.
          </p>
        </div>
      </form>
    </>
  );
}
