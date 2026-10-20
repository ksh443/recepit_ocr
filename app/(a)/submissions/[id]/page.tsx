"use client";

import Link from "next/link";
import { use, useState } from "react";
import { api, errMsg } from "@/components/api";
import { LoadStatus, useLoad } from "@/components/useLoad";
import { useActor } from "@/components/AppShell";
import { ReceiptScan, useLightbox } from "@/components/ui";
import { fmtAmount, fmtDateTime, signDate } from "@/lib/format";
import {
  ROLE_LABEL,
  isMyTurn,
  lineOf,
  nextStepIndex,
  personLabel,
  progressLabel,
  signerLabel,
  signerOf,
  submitterLabel,
  type Submission,
} from "@/lib/types";

/** A-③ 결재 상신 문서 상세 */
export default function SubmissionDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const actor = useActor();
  const { data, setData, error, slow, reload } = useLoad(() => api<{ submission: Submission }>(`/api/submissions/${id}`), [id]);
  const s = data?.submission ?? null;
  const setS = (x: Submission) => setData({ submission: x });
  const [busy, setBusy] = useState(false);
  const lightbox = useLightbox();


  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const sign = async (decision: "approve" | "reject") => {
    if (!actor) return;
    setBusy(true);
    setActionError("");
    try {
      const r = await api<{ submission: Submission }>(`/api/submissions/${id}/approve`, {
        method: "POST",
        json: { actor: { rank: actor.rank, name: actor.name }, decision, comment: decision === "reject" ? reason : undefined },
      });
      setS(r.submission);
      setRejecting(false);
    } catch (e) {
      setActionError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const [actionError, setActionError] = useState("");

  if (!s)
    return (
      <p className="muted">
        <LoadStatus error={error} slow={slow} onRetry={reload} />
      </p>
    );

  const line = lineOf(s);
  const next = nextStepIndex(line);
  const nextStep = next >= 0 ? line[next] : null;
  const myTurn = Boolean(actor && isMyTurn(s, actor));
  const rejected = line.find((st) => st.result === "rejected");

  return (
    <>
      <div className="row" style={{ marginBottom: 16, maxWidth: 760, marginInline: "auto" }}>
        <Link href="/submissions" className="btn sm">
          ← 결재 현황
        </Link>
        <span className="spacer" />
        <span className={`badge ${s.status}`}>{progressLabel(s)}</span>
        {myTurn && !rejecting && (
          <>
            <button className="btn" onClick={() => setRejecting(true)} disabled={busy}>
              반려
            </button>
            <button className="btn stamp" onClick={() => sign("approve")} disabled={busy}>
              {busy ? "처리 중…" : nextStep?.proxy ? "대결 승인" : "승인"}
            </button>
          </>
        )}
        {actor && nextStep && !myTurn && (
          <span className="muted small">지금은 {signerLabel(nextStep)}의 차례입니다.</span>
        )}
      </div>

      {rejecting && (
        <div className="card" style={{ maxWidth: 760, margin: "0 auto 16px" }}>
          <label className="field">
            반려 사유
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 적요에 행사명을 구체적으로 적어 주세요." autoFocus />
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="spacer" />
            <button className="btn" onClick={() => setRejecting(false)} disabled={busy}>
              취소
            </button>
            <button className="btn primary" onClick={() => sign("reject")} disabled={busy || !reason.trim()}>
              반려하기
            </button>
          </div>
        </div>
      )}
      {actionError && (
        <div className="alert error" style={{ maxWidth: 760, margin: "0 auto 16px" }}>
          {actionError}
        </div>
      )}

      <article className="doc">
        <div className="doc-title">지출원인행위 결재</div>
        <div className="doc-head">
          <div className="small">
            <div>
              상신번호: <strong>{s.docNo}</strong>
            </div>
            <div>상신자: {submitterLabel(s)}</div>
            <div>상신 일시: {s.submittedAt.slice(0, 16)}</div>
            {s.previousDocNo && (
              <div>
                재상신 (이전:{" "}
                {s.previousSubmissionId ? <Link href={`/submissions/${s.previousSubmissionId}`}>{s.previousDocNo}</Link> : s.previousDocNo})
              </div>
            )}
          </div>
          {/* 6. 서명란: 결재선대로 담당 / 검토 / 결재 */}
          <table className="sign-table" aria-label="서명란">
            <thead>
              <tr>
                {line.map((st, i) => (
                  <th key={i}>{ROLE_LABEL[st.role]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {line.map((st, i) => (
                  <td key={i} className="sign-cell">
                    {/* 대결이면 "代"는 도장 밖, 칸 왼쪽 위 */}
                    {st.proxy && st.signedAt && <span className="proxy-mark">代</span>}
                    {st.role === "drafter" ? (
                      <>
                        <div className="sign-person">{personLabel(st)}</div>
                        <div className="sign-name">{signDate(st.signedAt)}</div>
                      </>
                    ) : st.signedAt ? (
                      <span
                        className={`stamp ${st.result === "rejected" ? "reject" : ""}`}
                        title={`${signerLabel(st)} ${st.signedAt}${st.proxy ? ` (원결재자 ${personLabel(st)})` : ""}`}
                      >
                        <span className="stamp-mark">{st.result === "rejected" ? "반려" : "승인"}</span>
                        <span className="stamp-person">{personLabel(signerOf(st))}</span>
                        <span className="stamp-date">{signDate(st.signedAt)}</span>
                      </span>
                    ) : (
                      <span className="sign-name">&nbsp;</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {rejected && (
          <div className="alert info" style={{ marginBottom: 12 }}>
            <strong>반려</strong> · {signerLabel(rejected)} · {signDate(rejected.signedAt)}
            <div>사유: {rejected.comment}</div>
          </div>
        )}

        <table className="doc-table">
          <tbody>
            <tr>
              <th>1. 날짜(시간)</th>
              <td>{fmtDateTime(s.date, s.time)}</td>
            </tr>
            <tr>
              <th>2. 업체</th>
              <td>{s.merchant}</td>
            </tr>
            <tr>
              <th>3. 금액</th>
              <td>
                <strong>{fmtAmount(s.amount, s.currency)}</strong>
              </td>
            </tr>
            <tr>
              <th>4. 적요</th>
              <td>{s.memo}</td>
            </tr>
          </tbody>
        </table>

        <div className="doc-scan">
          <div className="small muted" style={{ textAlign: "left", marginBottom: 8 }}>
            5. 영수증 스캔본
          </div>
          <ReceiptScan receiptId={s.receiptId} isPdf={/\.pdf$/i.test(s.imagePath)} onZoom={lightbox.open} />
        </div>
      </article>
      {lightbox.node}
    </>
  );
}
