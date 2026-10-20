"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errMsg } from "@/components/api";
import { useRole } from "@/components/AppShell";
import { fmtAmount, fmtDateTime } from "@/lib/format";
import type { Submission } from "@/lib/types";

/** A-③ 결재 상신 목록 */
export default function SubmissionsPage() {
  const role = useRole();
  const [list, setList] = useState<Submission[] | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ submissions: Submission[] }>("/api/submissions")
      .then((r) => setList(r.submissions))
      .catch((e) => setError(errMsg(e)));
  }, []);

  const shown = (list ?? []).filter((s) => filter === "all" || s.status === filter);
  const pending = (list ?? []).filter((s) => s.status === "pending").length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{role === "supervisor" ? "결재할 문서" : "결재 상신 목록"}</h1>
          <p className="muted small">승인 대기 {pending}건</p>
        </div>
        <div className="chips">
          {(["all", "pending", "approved"] as const).map((f) => (
            <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "전체" : f === "pending" ? "승인 대기" : "승인 완료"}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>상신번호</th>
              <th>날짜(시간)</th>
              <th>업체</th>
              <th className="num">금액</th>
              <th>적요</th>
              <th className="hide-sm">상신 일시</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {list === null ? (
              <tr>
                <td colSpan={7} className="empty">
                  불러오는 중…
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  상신된 문서가 없습니다.
                </td>
              </tr>
            ) : (
              shown.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap">
                    <Link href={`/submissions/${s.id}`}>{s.docNo}</Link>
                  </td>
                  <td className="nowrap">{fmtDateTime(s.date, s.time)}</td>
                  <td>{s.merchant}</td>
                  <td className="num">{fmtAmount(s.amount, s.currency)}</td>
                  <td>{s.memo}</td>
                  <td className="nowrap hide-sm">{s.submittedAt.slice(0, 16)}</td>
                  <td>
                    <Link href={`/submissions/${s.id}`}>
                      <span className={`badge ${s.status}`}>{s.status === "approved" ? "승인 완료" : "승인 대기"}</span>
                    </Link>
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
