import type { CardTxn } from "./types";

/** 9-1 카드 사용내역 CSV 열 순서 */
export const CARD_COLUMNS = ["승인번호", "승인일시", "가맹점명", "업종", "금액", "통화", "카드끝4자리"] as const;
export type CardRecord = Record<(typeof CARD_COLUMNS)[number], string>;

/** 따옴표를 지원하는 간단한 CSV 파서 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function escapeCsv(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeCsv).join(",")).join("\r\n") + "\r\n";
}

/** "2026/10/2 9:05" 같은 값도 "2026-10-02 09:05" 로 맞춘다 */
export function normalizeDateTime(v: string): string | null {
  const m = v.trim().match(/^(\d{4})[-/.]\s*(\d{1,2})[-/.]\s*(\d{1,2})\.?(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00"] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")} ${h.padStart(2, "0")}:${mi}`;
}

export function parseAmount(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.replace(/[,\s]/g, "").replace(/[^\d.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 한글 열 이름 레코드 → CardTxn. 문제가 있으면 오류 메시지를 돌려준다. */
export function recordToCard(rec: Partial<CardRecord>, line?: number): CardTxn | string {
  const where = line ? `${line}행: ` : "";
  const approvalNo = (rec["승인번호"] ?? "").trim();
  if (!approvalNo) return `${where}승인번호가 비어 있습니다.`;
  const approvedAt = normalizeDateTime(rec["승인일시"] ?? "");
  if (!approvedAt) return `${where}승인일시 형식이 올바르지 않습니다. (YYYY-MM-DD HH:MM)`;
  const amount = parseAmount(rec["금액"] ?? "");
  if (amount === null) return `${where}금액이 숫자가 아닙니다.`;
  return {
    approvalNo,
    approvedAt,
    merchant: (rec["가맹점명"] ?? "").trim(),
    category: (rec["업종"] ?? "").trim(),
    amount,
    currency: (rec["통화"] ?? "").trim().toUpperCase(),
    cardLast4: (rec["카드끝4자리"] ?? "").trim(),
  };
}

export function cardToRecord(c: CardTxn): CardRecord {
  return {
    승인번호: c.approvalNo,
    승인일시: c.approvedAt,
    가맹점명: c.merchant,
    업종: c.category,
    금액: String(c.amount),
    통화: c.currency,
    카드끝4자리: c.cardLast4,
  };
}

/** 카드 사용내역 CSV 텍스트를 읽는다 */
export function parseCardCsv(text: string): { rows: CardTxn[]; errors: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], errors: ["빈 파일입니다."] };
  const header = table[0].map((h) => h.trim());
  const missing = CARD_COLUMNS.filter((c) => c !== "업종" && c !== "카드끝4자리" && !header.includes(c));
  if (missing.length) return { rows: [], errors: [`필수 열이 없습니다: ${missing.join(", ")}`] };
  const rows: CardTxn[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, i) => {
    const rec: Partial<CardRecord> = {};
    header.forEach((h, j) => {
      if ((CARD_COLUMNS as readonly string[]).includes(h)) rec[h as keyof CardRecord] = cells[j] ?? "";
    });
    const r = recordToCard(rec, i + 2);
    if (typeof r === "string") errors.push(r);
    else if (seen.has(r.approvalNo)) errors.push(`${i + 2}행: 승인번호 ${r.approvalNo} 가 파일 안에서 중복됩니다.`);
    else {
      seen.add(r.approvalNo);
      rows.push(r);
    }
  });
  return { rows, errors };
}

export function cardsToCsv(cards: CardTxn[]): string {
  return toCsv([[...CARD_COLUMNS], ...cards.map((c) => CARD_COLUMNS.map((k) => cardToRecord(c)[k]))]);
}

/** 브라우저: UTF-8 이 아니면 EUC-KR(엑셀 기본)로 다시 읽는다 */
export function decodeCsvBytes(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("euc-kr").decode(buf);
  }
}
