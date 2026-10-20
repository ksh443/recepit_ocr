"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, errMsg } from "@/components/api";
import { useRole } from "@/components/AppShell";
import { ReceiptScan, useLightbox } from "@/components/ui";
import { fmtAmount, fmtDateTime } from "@/lib/format";
import { submitterLabel, type Submission } from "@/lib/types";

/** A-③ 결재 상신 문서 상세 */
export default function SubmissionDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const role = useRole();
  const [s, setS] = useState<Submission | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lightbox = useLightbox();

  useEffect(() => {
    api<{ submission: Submission }>(`/api/submissions/${id}`)
      .then((r) => setS(r.submission))
      .catch((e) => setError(errMsg(e)));
  }, [id]);

  const approve = async () => {
    setBusy(true);
    try {
      const r = await api<{ submission: Submission }>(`/api/submissions/${id}/approve`, { method: "POST" });
      setS(r.submission);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="alert error">{error}</div>;
  if (!s) return <p className="muted">불러오는 중…</p>;

  return (
    <>
      <div className="row" style={{ marginBottom: 16, maxWidth: 760, marginInline: "auto" }}>
        <Link href="/submissions" className="btn sm">
          ← 목록
        </Link>
        <span className="spacer" />
        <span className={`badge ${s.status}`}>{s.status === "approved" ? "승인 완료" : "승인 대기"}</span>
        {role === "supervisor" && s.status === "pending" && (
          <button className="btn stamp" onClick={approve} disabled={busy}>
            {busy ? "승인 중…" : "승인"}
          </button>
        )}
      </div>

      <article className="doc">
        <div className="doc-title">지출원인행위 결재</div>
        <div className="doc-head">
          <div className="small">
            <div>
              상신번호: <strong>{s.docNo}</strong>
            </div>
            <div>상신자: {submitterLabel(s)}</div>
            <div>상신 일시: {s.submittedAt.slice(0, 16)}</div>
          </div>
          {/* 6. 서명란 */}
          <table className="sign-table" aria-label="서명란">
            <thead>
              <tr>
                <th>담당</th>
                <th>상급자</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div style={{ fontWeight: 700 }}>{s.submitter}</div>
                  <div className="sign-name">{s.submittedAt.slice(5, 10).replace("-", ".")} 상신</div>
                </td>
                <td>
                  {s.status === "approved" ? (
                    <span className="stamp" title={`${s.approverName} ${s.approvedAt}`}>
                      <span className="stamp-mark">승인</span>
                      <span>{s.approverName}</span>
                      <span className="stamp-date">{s.approvedAt?.slice(0, 10).replace(/-/g, ".")}</span>
                    </span>
                  ) : (
                    <span className="sign-name">&nbsp;</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

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
