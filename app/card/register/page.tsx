"use client";

import { useState } from "react";
import { api, errMsg } from "@/components/api";
import { decodeCsvBytes, normalizeDateTime, parseAmount, parseCardCsv } from "@/lib/csv";
import { fmtAmount, nowKst } from "@/lib/format";
import type { CardTxn } from "@/lib/types";

/** (B) ② 내역 등록: CSV 업로드 / 한 건 직접 입력 */
export default function CardRegisterPage() {
  const [preview, setPreview] = useState<{ name: string; rows: CardTxn[]; errors: string[] } | null>(null);
  const [msg, setMsg] = useState<{ type: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    setMsg(null);
    if (!file) return;
    const text = decodeCsvBytes(await file.arrayBuffer());
    setPreview({ name: file.name, ...parseCardCsv(text) });
  };

  const register = async (rows: CardTxn[]) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ added: number; updated: number }>("/api/card/transactions", { method: "POST", json: { rows } });
      setMsg({ type: "info", text: `등록 완료: 새 내역 ${r.added}건, 기존 내역 갱신 ${r.updated}건 (승인번호 기준)` });
      return true;
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  // 한 건 직접 입력
  const now = nowKst();
  const [one, setOne] = useState({
    approvalNo: "",
    date: now.slice(0, 10),
    time: now.slice(11, 16),
    merchant: "",
    category: "식당",
    amount: "",
    currency: "USD",
    cardLast4: "1234",
  });
  const set = (k: keyof typeof one) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setOne({ ...one, [k]: e.target.value });

  const submitOne = async (e: React.FormEvent) => {
    e.preventDefault();
    const approvedAt = normalizeDateTime(`${one.date} ${one.time}`);
    const amount = parseAmount(one.amount);
    if (!one.approvalNo.trim() || !approvedAt || amount === null) {
      setMsg({ type: "error", text: "승인번호, 승인일시, 금액을 확인해 주세요." });
      return;
    }
    const ok = await register([
      {
        approvalNo: one.approvalNo.trim(),
        approvedAt,
        merchant: one.merchant.trim(),
        category: one.category.trim(),
        amount,
        currency: one.currency.trim().toUpperCase(),
        cardLast4: one.cardLast4.trim(),
      },
    ]);
    if (ok) setOne({ ...one, approvalNo: "", merchant: "", amount: "" });
  };

  return (
    <>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="b-panel">
        <h2>CSV 업로드</h2>
        <p className="muted small">
          열 순서: <span className="mono">승인번호,승인일시,가맹점명,업종,금액,통화,카드끝4자리</span> · 승인일시는{" "}
          <span className="mono">YYYY-MM-DD HH:MM</span> · 금액은 숫자만. 같은 승인번호는 덮어씁니다.{" "}
          <a href="/samples/card_transactions_sample.csv" download>
            예시 파일
          </a>
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />

        {preview && (
          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <strong>{preview.name}</strong>
              <span className="muted">· 읽은 내역 {preview.rows.length}건</span>
              {preview.errors.length > 0 && <span className="badge need">오류 {preview.errors.length}건</span>}
              <span className="spacer" />
              <button
                className="btn primary"
                disabled={busy || !preview.rows.length}
                onClick={async () => (await register(preview.rows)) && setPreview(null)}
              >
                {busy ? "등록 중…" : `${preview.rows.length}건 등록`}
              </button>
            </div>
            {preview.errors.length > 0 && (
              <div className="alert error">
                {preview.errors.slice(0, 10).map((er) => (
                  <div key={er}>{er}</div>
                ))}
              </div>
            )}
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>승인번호</th>
                    <th>승인일시</th>
                    <th>가맹점명</th>
                    <th>업종</th>
                    <th className="num">금액</th>
                    <th>카드</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.approvalNo}>
                      <td className="mono">{r.approvalNo}</td>
                      <td className="nowrap">{r.approvedAt}</td>
                      <td>{r.merchant}</td>
                      <td>{r.category}</td>
                      <td className="num">{fmtAmount(r.amount, r.currency)}</td>
                      <td className="mono">{r.cardLast4}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <form className="b-panel" onSubmit={submitOne}>
        <h2>한 건 직접 입력</h2>
        <div className="ocr-grid">
          <label className="field">
            승인번호
            <input value={one.approvalNo} onChange={set("approvalNo")} placeholder="A0011" required />
          </label>
          <label className="field">
            승인일
            <input type="date" value={one.date} onChange={set("date")} required />
          </label>
          <label className="field">
            승인시각
            <input type="time" value={one.time} onChange={set("time")} required />
          </label>
          <label className="field">
            가맹점명
            <input value={one.merchant} onChange={set("merchant")} placeholder="Starbucks Coffee" />
          </label>
          <label className="field">
            업종
            <select value={one.category} onChange={set("category")}>
              {["식당", "카페", "편의점", "숙박", "교통", "기타"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            금액
            <input inputMode="decimal" value={one.amount} onChange={set("amount")} placeholder="18.50" required />
          </label>
          <label className="field">
            통화
            <input value={one.currency} onChange={set("currency")} maxLength={3} />
          </label>
          <label className="field">
            카드끝4자리
            <input value={one.cardLast4} onChange={set("cardLast4")} maxLength={4} inputMode="numeric" />
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="spacer" />
          <button className="btn primary" disabled={busy}>
            등록
          </button>
        </div>
      </form>
    </>
  );
}
