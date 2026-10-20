"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errMsg } from "@/components/api";
import { DateRange, StatusBadge } from "@/components/ui";
import { decodeCsvBytes, parseCardCsv } from "@/lib/csv";
import { fmtAmount, thisMonthRange } from "@/lib/format";
import { STATUS_LABEL, type CardStatus, type CardTxn } from "@/lib/types";

type Row = CardTxn & { status: CardStatus; receiptId: string | null };
interface CardsRes {
  cards: Row[];
  lastFetchedAt: string | null;
  lastFetchSource: string | null;
}

const FILTERS: ("all" | CardStatus)[] = ["all", "matched", "amount_mismatch", "date_mismatch", "no_receipt"];

/** A-① 카드 사용내역 */
export default function CardsPage() {
  const [range, setRange] = useState(thisMonthRange);
  const [data, setData] = useState<CardsRes | null>(null);
  const [filter, setFilter] = useState<"all" | CardStatus>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "info" | "error" | "warn"; text: string } | null>(null);
  const [showCsv, setShowCsv] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<CardsRes>("/api/cards"));
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    for (const c of inRange) m[c.status] = (m[c.status] ?? 0) + 1;
    return m;
  }, [inRange]);
  const shown = filter === "all" ? inRange : inRange.filter((c) => c.status === filter);

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

      {msg && (
        <div className={`alert ${msg.type}`} style={{ marginTop: 16 }}>
          {msg.text}
        </div>
      )}

      <div className="row" style={{ margin: "16px 0 10px" }}>
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "전체" : STATUS_LABEL[f]} {counts[f] ?? 0}
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
                  불러오는 중…
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  {inRange.length === 0 ? "조회 기간에 불러온 내역이 없습니다. 새로고침을 눌러 주세요." : "해당 상태의 내역이 없습니다."}
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
                    {c.receiptId ? (
                      <Link href={`/receipts#r-${c.receiptId}`}>
                        <StatusBadge status={c.status} />
                      </Link>
                    ) : (
                      <StatusBadge status={c.status} />
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
