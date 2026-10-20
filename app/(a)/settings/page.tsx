"use client";

import { api } from "@/components/api";
import { LoadStatus, useLoad } from "@/components/useLoad";

interface SettingsRes {
  storage: "supabase" | "local";
  ai: "claude" | "gemini" | null;
  models: { ocr: string; memo: string } | null;
}

const AI_LABEL = { claude: "Claude API", gemini: "Google Gemini API (무료 등급)" };

/** 웹사이트 정보: 연결 상태 (조직도는 조직도 관리, 내 정보는 마이페이지) */
export default function SettingsPage() {
  const { data, error, slow, reload } = useLoad(() => api<SettingsRes>("/api/settings"), []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>웹사이트 정보</h1>
          <p className="muted small">조직도는 &quot;조직도 관리&quot;(부서장), 내 계급·직책·비밀번호는 &quot;마이페이지&quot;에서 바꿉니다.</p>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 520 }}>
        <h3>연결 상태</h3>
        {!data ? (
          <p className="muted small">
            <LoadStatus error={error} slow={slow} onRetry={reload} />
          </p>
        ) : (
          <>
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
          </>
        )}
      </div>
    </>
  );
}
