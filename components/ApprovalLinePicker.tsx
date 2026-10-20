"use client";

import { useEffect, useState } from "react";
import { api, errMsg } from "./api";
import { sortOrg } from "@/lib/org";
import { personLabel, type LineSelection, type OrgMember, type Settings } from "@/lib/types";

const LAST_KEY = "lastApprovalLine";

/** 결재 상신 전 결재선(검토·결재·대결)을 조직도에서 고르는 창. 담당은 지금 계정으로 고정 */
export default function ApprovalLinePicker({
  drafter: me,
  onSubmit,
  onClose,
}: {
  drafter: OrgMember;
  onSubmit: (line: LineSelection) => Promise<void>;
  onClose: () => void;
}) {
  const [org, setOrg] = useState<OrgMember[] | null>(null);
  const drafterId = me.id;
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [approverId, setApproverId] = useState("");
  const [useProxy, setUseProxy] = useState(false);
  const [proxyId, setProxyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ settings: Settings }>("/api/settings")
      .then(({ settings }) => {
        const members = sortOrg(settings.orgChart);
        const has = (id?: string | null) => Boolean(id && members.some((m) => m.id === id));
        setOrg(members);
        // 지난번 결재선이 지금 조직도에 그대로 있으면 다시 쓰고, 아니면 기본값(기본 담당·부서장)
        let last: Partial<LineSelection> = {};
        try {
          last = JSON.parse(localStorage.getItem(LAST_KEY) || "{}");
        } catch {
          /* 무시 */
        }
        setReviewerIds((last.reviewerIds ?? []).filter((id) => has(id) && id !== me.id));
        const head = members.find((m) => m.head && m.id !== me.id) ?? members.find((m) => m.id !== me.id);
        setApproverId(has(last.approverId) && last.approverId !== me.id ? last.approverId! : (head?.id ?? ""));
      })
      .catch((e) => setError(errMsg(e)));
  }, [me.id]);

  // 대결자 기본값: 원결재자를 뺀 가장 높은 직급
  useEffect(() => {
    if (!org || !useProxy || (proxyId && proxyId !== approverId)) return;
    const candidate = org.find((m) => m.id !== approverId && m.id !== drafterId && !reviewerIds.includes(m.id));
    setProxyId(candidate?.id ?? "");
  }, [org, useProxy, approverId, drafterId, reviewerIds, proxyId]);

  if (!org) {
    return (
      <Modal onClose={onClose}>
        <p className="muted">{error || "조직도를 불러오는 중…"}</p>
      </Modal>
    );
  }

  const byId = (id: string) => org.find((m) => m.id === id);
  const label = (m: OrgMember) => `${personLabel(m)}${m.duty ? ` (${m.duty})` : ""}`;
  const used = new Set([drafterId, approverId, ...reviewerIds]);
  const options = (current: string, exclude: string[] = []) =>
    org
      .filter((m) => m.id === current || !exclude.includes(m.id))
      .map((m) => (
        <option key={m.id} value={m.id}>
          {label(m)}
        </option>
      ));

  const drafter = byId(drafterId);
  const approver = byId(approverId);
  const proxy = useProxy ? byId(proxyId) : undefined;
  const reviewers = reviewerIds.map(byId).filter(Boolean) as OrgMember[];

  const problem = (() => {
    if (!drafter || !approver) return "담당과 결재를 지정해 주세요.";
    if (used.size !== 2 + reviewerIds.length) return "같은 사람을 두 번 넣을 수 없습니다.";
    if (useProxy && (!proxy || proxy.id === approverId)) return "대결자를 원결재자와 다른 사람으로 지정해 주세요.";
    return null;
  })();

  const submit = async () => {
    if (problem) return setError(problem);
    const line: LineSelection = { drafterId, reviewerIds, approverId, proxyId: useProxy ? proxyId : null };
    setBusy(true);
    setError("");
    try {
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify(line));
      } catch {
        /* 무시 */
      }
      await onSubmit(line);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2>결재선 지정</h2>
      <div className="line-grid">
        <div className="field">
          담당
          <div className="line-fixed">{label(me)}</div>
        </div>

        <div className="field">
          <span>검토 {reviewerIds.length === 0 && <span className="muted">(없음)</span>}</span>
          {reviewerIds.map((id, i) => (
            <div className="row" key={i} style={{ flexWrap: "nowrap" }}>
              <select
                value={id}
                style={{ flex: 1 }}
                onChange={(e) => setReviewerIds(reviewerIds.map((x, j) => (j === i ? e.target.value : x)))}
              >
                {options(id, [drafterId, approverId, ...reviewerIds.filter((_, j) => j !== i)])}
              </select>
              <button className="btn sm ghost danger" onClick={() => setReviewerIds(reviewerIds.filter((_, j) => j !== i))} aria-label="검토자 빼기">
                ✕
              </button>
            </div>
          ))}
          <button
            className="btn sm"
            style={{ alignSelf: "flex-start" }}
            onClick={() => {
              const next = org.find((m) => !used.has(m.id));
              if (next) setReviewerIds([...reviewerIds, next.id]);
            }}
            disabled={used.size >= org.length}
          >
            + 검토자 추가
          </button>
        </div>

        <label className="field">
          결재
          <select value={approverId} onChange={(e) => setApproverId(e.target.value)}>
            {options(approverId, [drafterId, ...reviewerIds])}
          </select>
        </label>

        <div className="field">
          <label className="row" style={{ cursor: "pointer", color: "var(--text)" }}>
            <input type="checkbox" checked={useProxy} onChange={(e) => setUseProxy(e.target.checked)} /> 대결(대리결재)
          </label>
          {useProxy && (
            <select value={proxyId} onChange={(e) => setProxyId(e.target.value)}>
              {options(proxyId, [approverId])}
            </select>
          )}
        </div>
      </div>

      <div className="sign-preview">
        <span className="muted small">서명란 미리보기</span>
        <table className="sign-table compact" style={{ marginLeft: 0 }}>
          <thead>
            <tr>
              <th>담당</th>
              {reviewers.map((m) => (
                <th key={m.id}>검토</th>
              ))}
              <th>결재</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="small">{drafter ? personLabel(drafter) : "-"}</td>
              {reviewers.map((m) => (
                <td key={m.id} className="small">
                  {personLabel(m)}
                </td>
              ))}
              <td className="small">{proxy ? `代 ${personLabel(proxy)}` : approver ? personLabel(approver) : "-"}</td>
            </tr>
          </tbody>
        </table>
        {proxy && approver && <span className="muted small">원결재자 {personLabel(approver)} 대신 {personLabel(proxy)}이(가) 결재합니다.</span>}
      </div>

      {(error || problem) && (
        <div className="alert error" style={{ margin: "12px 0 0" }}>
          {error || problem}
        </div>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        <span className="spacer" />
        <button className="btn" onClick={onClose} disabled={busy}>
          취소
        </button>
        <button className="btn primary" onClick={submit} disabled={busy || Boolean(problem)}>
          {busy ? "상신 중…" : "결재 상신"}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
