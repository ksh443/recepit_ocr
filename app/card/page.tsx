"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, errMsg } from "@/components/api";
import { LoadStatus, ReloadError, useLoad } from "@/components/useLoad";
import { DateRange } from "@/components/ui";
import { fmtAmount, thisMonthRange } from "@/lib/format";
import type { CardTxn } from "@/lib/types";

/** (B) ① 사용내역 조회 */
export default function CardHistoryPage() {
  const [range, setRange] = useState(thisMonthRange);
  const [error, setError] = useState("");
  const loader = useLoad(
    () => api<{ rows: CardTxn[] }>(`/api/card/transactions?${new URLSearchParams({ ...range, format: "json" })}`),
    [range.from, range.to],
  );
  const rows = loader.data?.rows ?? null;
  const load = () => {
    setError("");
    return loader.reload();
  };

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.currency, (m.get(r.currency) ?? 0) + r.amount);
    return [...m.entries()];
  }, [rows]);

  const remove = async (no: string) => {
    if (!confirm(`승인번호 ${no} 내역을 삭제할까요?`)) return;
    try {
      await api(`/api/card/transactions?approvalNo=${encodeURIComponent(no)}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const exportUrl = `/api/card/export?${new URLSearchParams(range)}`;

  return (
    <>
      <div className="b-panel">
        <div className="row">
          <strong>조회 기간</strong>
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <button className="btn" onClick={load}>
            조회
          </button>
          <span className="spacer" />
          <a className="btn primary" href={exportUrl} download>
            내보내기(CSV)
          </a>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {rows && <ReloadError error={loader.error} onRetry={load} />}

      <div className="b-panel b-sum">
        <span>
          이용 건수 <strong>{rows?.length ?? "-"}</strong> 건
        </span>
        {totals.map(([cur, sum]) => (
          <span key={cur}>
            합계 <strong>{fmtAmount(sum, cur)}</strong>
          </span>
        ))}
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>승인번호</th>
              <th>승인일시</th>
              <th>가맹점명</th>
              <th>업종</th>
              <th className="num">금액</th>
              <th>통화</th>
              <th>카드</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr>
                <td colSpan={8} className="empty">
                  <LoadStatus error={loader.error} slow={loader.slow} onRetry={load} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty">
                  조회 기간({range.from || "처음"} ~ {range.to || "오늘"})에 사용내역이 없습니다. <Link href="/card/register">내역 등록</Link>에서 CSV를 올려 주세요.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.approvalNo}>
                  <td className="mono">{r.approvalNo}</td>
                  <td className="nowrap">{r.approvedAt}</td>
                  <td>{r.merchant}</td>
                  <td>{r.category}</td>
                  <td className="num">{fmtAmount(r.amount, r.currency).replace(` ${r.currency}`, "")}</td>
                  <td>{r.currency}</td>
                  <td className="mono">****{r.cardLast4}</td>
                  <td>
                    <button className="btn sm ghost danger" onClick={() => remove(r.approvalNo)} aria-label="삭제">
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        내보내기 데이터는 9-1 양식(승인번호,승인일시,가맹점명,업종,금액,통화,카드끝4자리)과 같은 열로 제공되며, 결재 상신
        웹앱의 새로고침이 이 데이터를 가져갑니다.
      </p>
    </>
  );
}
