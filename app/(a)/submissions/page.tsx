"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/components/api";
import { LoadStatus, ReloadError, useLoad } from "@/components/useLoad";
import { useActor } from "@/components/AppShell";
import { fmtAmount, fmtDateTime } from "@/lib/format";
import { DOC_TAB_LABEL, isMyTurn, matchesTab, personLabel, progressLabel, type DocTab, type Submission } from "@/lib/types";

const TABS: DocTab[] = ["all", "todo", "progress", "done"];

/** A-③ 결재 현황 */
export default function SubmissionsPage() {
  const actor = useActor();
  const [tab, setTab] = useState<DocTab>("all");
  const { data, error, slow, reload } = useLoad(() => api<{ submissions: Submission[] }>("/api/submissions"), []);
  const list = data?.submissions ?? null;

  // 선택한 계정이 결재선(담당·검토·결재·대결)에 든 문서만
  const who = actor;
  const tabs = TABS;
  const count = (t: DocTab) => (list ?? []).filter((s) => matchesTab(s, t, who)).length;
  const shown = (list ?? []).filter((s) => matchesTab(s, tab, who));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>결재 현황</h1>
          <p className="muted small">
            {who ? `${personLabel(who)} 계정 · 처리할 문서 ${count("todo")}건` : `결재 진행 중 ${count("progress")}건`}
          </p>
        </div>
        <div className="chips">
          {tabs.map((t) => (
            <button key={t} className={`chip ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
              {DOC_TAB_LABEL[t]} {list ? count(t) : ""}
            </button>
          ))}
        </div>
      </div>
      {list && <ReloadError error={error} onRetry={reload} />}
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
                  <LoadStatus error={error} slow={slow} onRetry={reload} />
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  {tab === "todo"
                    ? "지금 처리할 문서가 없습니다."
                    : list.length === 0
                      ? "아직 상신한 문서가 없습니다. 영수증 처리 화면에서 결재 상신을 하면 여기에 보입니다."
                      : "해당하는 문서가 없습니다."}
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
                  <td className="nowrap">
                    <Link href={`/submissions/${s.id}`}>
                      <span className={`badge ${s.status}`}>{progressLabel(s)}</span>
                    </Link>
                    {who && isMyTurn(s, who) && <span className="badge need" style={{ marginLeft: 4 }}>내 차례</span>}
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
