"use client";

import { useEffect, useState } from "react";
import { api, errMsg } from "@/components/api";
import { sortOrg } from "@/lib/org";
import { RANKS, personLabel, type OrgMember, type Settings } from "@/lib/types";

interface SettingsRes {
  settings: Settings;
  storage: "supabase" | "local";
  ai: "claude" | "gemini" | null;
  models: { ocr: string; memo: string } | null;
}

const AI_LABEL = { claude: "Claude API", gemini: "Google Gemini API (무료 등급)" };
const newId = () => "m" + Math.random().toString(36).slice(2, 8);

export default function SettingsPage() {
  const [data, setData] = useState<SettingsRes | null>(null);
  const [org, setOrg] = useState<OrgMember[]>([]);
  const [drafterId, setDrafterId] = useState<string>("");
  const [msg, setMsg] = useState<{ type: "info" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  const apply = (r: SettingsRes) => {
    setData(r);
    setOrg(sortOrg(r.settings.orgChart));
    setDrafterId(r.settings.defaultDrafterId ?? "");
    setDirty(false);
  };

  useEffect(() => {
    api<SettingsRes>("/api/settings")
      .then(apply)
      .catch((e) => setMsg({ type: "error", text: errMsg(e) }));
  }, []);

  const update = (id: string, patch: Partial<OrgMember>) => {
    setOrg((list) =>
      list.map((m) => (m.id === id ? { ...m, ...patch } : patch.head ? { ...m, head: false } : m)),
    );
    setDirty(true);
  };
  const add = () => {
    setOrg((list) => [...list, { id: newId(), rank: "하사", name: "", duty: "", head: false }]);
    setDirty(true);
  };
  const remove = (m: OrgMember) => {
    if (m.head) return setMsg({ type: "error", text: "부서장은 삭제할 수 없습니다. 다른 사람을 부서장으로 바꾼 뒤 삭제하세요." });
    if (!confirm(`${personLabel(m)}을(를) 조직도에서 뺄까요? (이미 상신한 문서에는 영향 없음)`)) return;
    setOrg((list) => list.filter((x) => x.id !== m.id));
    if (drafterId === m.id) setDrafterId("");
    setDirty(true);
  };

  const save = async () => {
    setMsg(null);
    try {
      const r = await api<{ settings: Settings }>("/api/settings", {
        method: "PUT",
        json: { orgChart: org, defaultDrafterId: drafterId || null },
      });
      apply({ ...data!, settings: r.settings });
      setMsg({ type: "info", text: "저장했습니다. 이후 결재 상신부터 적용됩니다." });
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    }
  };

  const reset = () => data && apply(data);
  // 고치는 도중에 줄 순서가 바뀌지 않도록, 정렬은 불러올 때·저장할 때만
  const sorted = org;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>설정</h1>
          <p className="muted small">조직도는 결재 상신 때 결재선(담당·검토·결재·대결)을 고르는 데 쓰입니다.</p>
        </div>
        <div className="row">
          {dirty && (
            <button className="btn" onClick={reset}>
              되돌리기
            </button>
          )}
          <button className="btn primary" onClick={save} disabled={!dirty}>
            저장
          </button>
        </div>
      </div>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>조직도</h2>
          <span className="muted small">{org.length}명</span>
          <span className="spacer" />
          <button className="btn sm" onClick={add}>
            + 구성원 추가
          </button>
        </div>
        <div className="table-wrap">
          <table className="tbl org-table">
            <thead>
              <tr>
                <th>직급</th>
                <th>이름</th>
                <th>직책</th>
                <th title="결재선의 결재 기본값">부서장</th>
                <th title="결재선의 담당 기본값">기본 담당</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.id}>
                  <td>
                    <select value={m.rank} onChange={(e) => update(m.id, { rank: e.target.value })}>
                      {(RANKS.includes(m.rank) ? RANKS : [m.rank, ...RANKS]).map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input value={m.name} onChange={(e) => update(m.id, { name: e.target.value })} placeholder="이름" style={{ width: 110 }} />
                  </td>
                  <td>
                    <input value={m.duty} onChange={(e) => update(m.id, { duty: e.target.value })} placeholder="직책" style={{ width: 130 }} />
                  </td>
                  <td>
                    <input type="radio" name="head" checked={m.head} onChange={() => update(m.id, { head: true })} aria-label="부서장" />
                  </td>
                  <td>
                    <input
                      type="radio"
                      name="drafter"
                      checked={drafterId === m.id}
                      onChange={() => {
                        setDrafterId(m.id);
                        setDirty(true);
                      }}
                      aria-label="기본 담당"
                    />
                  </td>
                  <td>
                    <button className="btn sm ghost danger" onClick={() => remove(m)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ margin: "10px 0 0" }}>
          결재 상신 창에서 <strong>담당</strong>은 &quot;기본 담당&quot;, <strong>결재</strong>는 &quot;부서장&quot;이 먼저 선택되어 있습니다.
          서명란에는 &quot;직급 이름&quot;(예: 대위 권성혜)으로 표시되고, 이미 상신한 문서는 상신 당시 이름 그대로 남습니다.
        </p>
      </div>

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
