"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, errMsg } from "@/components/api";
import { LoadStatus, ReloadError, useLoad } from "@/components/useLoad";
import { DateRange, StatusBadge } from "@/components/ui";
import { decodeCsvBytes, parseCardCsv } from "@/lib/csv";
import { fmtAmount, thisMonthRange } from "@/lib/format";
import { APPROVAL_STATE_LABEL, STATUS_LABEL, type ApprovalState, type CardStatus, type CardTxn } from "@/lib/types";

type Row = CardTxn & {
  status: CardStatus;
  receiptId: string | null;
  approval: ApprovalState | null;
  submissionId: string | null;
};
interface CardsRes {
  cards: Row[];
  lastFetchedAt: string | null;
  lastFetchSource: string | null;
}

/** 상태 필터: 금액·날짜·업체·시간 불일치는 "불일치" 하나로 묶는다 (표에는 어떤 불일치인지 그대로 표시) */
type Filter = "all" | "matched" | "mismatch" | "no_receipt";
const FILTERS: Filter[] = ["all", "matched", "mismatch", "no_receipt"];
const FILTER_LABEL: Record<Filter, string> = {
  all: "전체",
  matched: STATUS_LABEL.matched,
  mismatch: "⚠️ 불일치",
  no_receipt: STATUS_LABEL.no_receipt,
};
const filterOf = (st: CardStatus): Filter => (st === "matched" || st === "no_receipt" ? st : "mismatch");

/** A-① 카드 사용내역 */
export default function CardsPage() {
  const [range, setRange] = useState(thisMonthRange);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "info" | "error" | "warn"; text: string } | null>(null);
  const [showCsv, setShowCsv] = useState(false);

  const { data, error, slow, reload: load } = useLoad(() => api<CardsRes>("/api/cards"), []);

  const refresh = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ added: number; updated: number; total: number; errors: string[]; rematched: number }>(
        "/api/cards/refresh",
        { method: "POST", json: range },
      );
      setMsg({
        type: r.errors.length ? "warn" : "info",
        text:
          `카드 조회 웹페이지에서 ${r.total}건을 불러왔습니다 (새 내역 ${r.added}건, 기존 ${r.updated}건).` +
          (r.rematched ? ` 영수증 ${r.rematched}건을 다시 대조했습니다.` : "") +
          (r.errors.length ? ` 형식 오류 ${r.errors.length}건 제외: ${r.errors.slice(0, 3).join(" / ")}` : ""),
      });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
      setShowCsv(true);
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    const { rows, errors } = parseCardCsv(decodeCsvBytes(await file.arrayBuffer()));
    if (!rows.length) {
      setMsg({ type: "error", text: errors.join(" / ") || "읽을 수 있는 내역이 없습니다." });
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ added: number; updated: number; rematched: number }>("/api/cards/import", {
        method: "POST",
        json: { rows },
      });
      setMsg({
        type: errors.length ? "warn" : "info",
        text:
          `CSV에서 ${rows.length}건을 불러왔습니다 (새 내역 ${r.added}건, 기존 ${r.updated}건).` +
          (errors.length ? ` 오류 ${errors.length}건 제외: ${errors.slice(0, 3).join(" / ")}` : ""),
      });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const inRange = useMemo(
    () =>
      (data?.cards ?? []).filter(
        (c) => (!range.from || c.approvedAt >= `${range.from} 00:00`) && (!range.to || c.approvedAt <= `${range.to} 23:59`),
      ),
    [data, range],
  );
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: inRange.length };
    for (const c of inRange) m[filterOf(c.status)] = (m[filterOf(c.status)] ?? 0) + 1;
    return m;
  }, [inRange]);
  const shown = filter === "all" ? inRange : inRange.filter((c) => filterOf(c.status) === filter);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>카드 사용내역</h1>
          <p className="muted small">
            마지막 불러온 일시: <strong>{data?.lastFetchedAt ?? "아직 없음"}</strong>
            {data?.lastFetchSource ? ` (${data.lastFetchSource})` : ""}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <strong className="nowrap">조회 기간</strong>
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <button className="btn primary" onClick={refresh} disabled={busy}>
            {busy ? "불러오는 중…" : "⟳ 새로고침"}
          </button>
          <span className="spacer" />
          <button className="btn sm ghost" onClick={() => setShowCsv((v) => !v)}>
            CSV 직접 업로드
          </button>
        </div>
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          새로고침을 누르면 <Link href="/card">카드 사용내역 조회 웹페이지</Link>에서 조회 기간의 내역을 불러와 승인번호 기준으로
          중복 없이 합칩니다. (자동 갱신 없음)
        </p>
        {showCsv && (
          <div className="alert warn" style={{ marginTop: 12, marginBottom: 0 }}>
            <div style={{ marginBottom: 6 }}>
              대체 수단: 카드 조회 웹페이지에서 <strong>내보내기(CSV)</strong>로 받은 파일을 올리세요.
            </div>
            <input type="file" accept=".csv,text/csv" onChange={(e) => importCsv(e.target.files?.[0])} disabled={busy} />
          </div>
        )}
      </div>

      {data && <ReloadError error={error} onRetry={load} />}
      {msg && (
        <div className={`alert ${msg.type}`} style={{ marginTop: 16 }}>
          {msg.text}
        </div>
      )}

      <div className="row" style={{ margin: "16px 0 10px" }}>
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]} {counts[f] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>승인번호</th>
              <th>승인일시</th>
              <th>가맹점</th>
              <th className="hide-sm">업종</th>
              <th className="num">금액</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {data === null ? (
              <tr>
                <td colSpan={6} className="empty">
                  <LoadStatus error={error} slow={slow} onRetry={load} />
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  {inRange.length === 0 ? (
                    <>
                      조회 기간({range.from || "처음"} ~ {range.to || "오늘"})에 카드 사용내역이 없습니다.
                      <br />
                      새로고침을 눌러 카드사에서 불러오거나 조회 기간을 바꿔 보세요.
                    </>
                  ) : (
                    "해당 상태의 내역이 없습니다."
                  )}
                </td>
              </tr>
            ) : (
              shown.map((c) => (
                <tr key={c.approvalNo}>
                  <td className="mono">{c.approvalNo}</td>
                  <td className="nowrap">{c.approvedAt}</td>
                  <td>{c.merchant}</td>
                  <td className="hide-sm">{c.category}</td>
                  <td className="num">{fmtAmount(c.amount, c.currency)}</td>
                  <td>
                    {/* 상태를 누르면 영수증 처리로: 연결된 영수증만 보거나(일치·불일치), 이 내역의 영수증을 올린다(미등록) */}
                    <Link
                      href={c.receiptId ? `/receipts?receipt=${c.receiptId}` : `/receipts?card=${encodeURIComponent(c.approvalNo)}`}
                      className="status-link"
                      title={c.receiptId ? "영수증 보기" : "이 내역의 영수증 올리기"}
                    >
                      <StatusBadge status={c.status} />
                    </Link>
                    {/* 영수증이 상신됐으면 결재 상태도 함께. 반려는 영수증 처리로 가서 재상신 */}
                    {c.approval && (
                      <Link
                        href={c.approval === "rejected" ? `/receipts?receipt=${c.receiptId}` : `/submissions/${c.submissionId}`}
                        className={`badge approval-${c.approval}`}
                        style={{ marginLeft: 4 }}
                        title={c.approval === "rejected" ? "눌러서 반려 사유 확인 후 재상신" : "결재서 보기"}
                      >
                        {APPROVAL_STATE_LABEL[c.approval]}
                        {c.approval === "rejected" ? " · 재상신 →" : ""}
                      </Link>
                    )}
                    {/* 영수증이 일치하는데 아직 결재 상신 전이면 결재의뢰 */}
                    {!c.approval && c.receiptId && c.status === "matched" && (
                      <Link
                        href={`/receipts?receipt=${c.receiptId}`}
                        className="badge approval-todo"
                        style={{ marginLeft: 4 }}
                        title="눌러서 결재 상신"
                      >
                        결재의뢰 →
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
