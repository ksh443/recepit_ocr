"use client";

import { useEffect, useState } from "react";
import { api, errMsg } from "@/components/api";
import type { Settings } from "@/lib/types";

interface SettingsRes {
  settings: Settings;
  storage: "supabase" | "local";
  ai: "claude" | "gemini" | null;
  models: { ocr: string; memo: string } | null;
}

const AI_LABEL = { claude: "Claude API", gemini: "Google Gemini API (무료 등급)" };

export default function SettingsPage() {
  const [data, setData] = useState<SettingsRes | null>(null);
  const [form, setForm] = useState<Settings>({ approverName: "", submitterName: "", submitterRank: "" });
  const [msg, setMsg] = useState<{ type: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<SettingsRes>("/api/settings")
      .then((r) => {
        setData(r);
        setForm(r.settings);
      })
      .catch((e) => setMsg({ type: "error", text: errMsg(e) }));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ settings: Settings }>("/api/settings", { method: "PUT", json: form });
      setForm(r.settings);
      setMsg({ type: "info", text: "저장했습니다." });
    } catch (er) {
      setMsg({ type: "error", text: errMsg(er) });
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>설정</h1>
      </div>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <form className="card" onSubmit={save} style={{ maxWidth: 520 }}>
        <div className="stack" style={{ gap: 12 }}>
          <label className="field">
            상급자 이름 (승인 도장에 표시)
            <input value={form.approverName} onChange={(e) => setForm({ ...form, approverName: e.target.value })} placeholder="○○○ 팀장" />
          </label>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ width: 120 }}>
              상신자 직급
              <input value={form.submitterRank} onChange={(e) => setForm({ ...form, submitterRank: e.target.value })} placeholder="대위" />
            </label>
            <label className="field" style={{ flex: 1 }}>
              상신자 이름 (서명란에 표시)
              <input value={form.submitterName} onChange={(e) => setForm({ ...form, submitterName: e.target.value })} />
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            결재서에는 &quot;상신자: {[form.submitterRank, form.submitterName].filter(Boolean).join(" ")}&quot;, 서명란에는 &quot;
            {form.submitterName}&quot;으로 표시됩니다. 바꾼 내용은 이후 상신하는 문서부터 적용됩니다.
          </p>
          <div className="row">
            <span className="spacer" />
            <button className="btn primary">저장</button>
          </div>
        </div>
      </form>
      {data && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3>연결 상태</h3>
          <p className="small">
            데이터 저장소: <strong>{data.storage === "supabase" ? "Supabase" : "로컬 파일 (.data/) — 개발용"}</strong>
          </p>
          <p className="small" style={{ margin: 0 }}>
            OCR·적요 AI: <strong>{data.ai ? AI_LABEL[data.ai] : "API 키 없음"}</strong>
          </p>
          {data.models && (
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              OCR 모델 <span className="mono">{data.models.ocr}</span> · 적요 모델 <span className="mono">{data.models.memo}</span>
            </p>
          )}
        </div>
      )}
    </>
  );
}
