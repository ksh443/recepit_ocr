/** 'YYYY-MM-DD HH:MM:SS' (한국 시간) */
export function nowKst(): string {
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return f.format(new Date()).replace("T", " ");
}

export function todayKst(): string {
  return nowKst().slice(0, 10);
}

/** 이번 달 1일 ~ 오늘 */
export function thisMonthRange(): { from: string; to: string } {
  const today = todayKst();
  return { from: today.slice(0, 8) + "01", to: today };
}

/** 서명란 날짜: "2026-10-20 ..." → "'26. 10. 20." */
export function signDate(dt: string | null | undefined): string {
  const m = dt?.match(/^\d{2}(\d{2})-(\d{2})-(\d{2})/);
  return m ? `'${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : "";
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
export function weekday(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function fmtAmount(amount: number | null | undefined, currency?: string | null): string {
  if (amount === null || amount === undefined) return "-";
  const cur = (currency || "").toUpperCase();
  const num = new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: cur === "KRW" || cur === "JPY" ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return cur ? `${num} ${cur}` : num;
}

export function fmtDateTime(date: string | null, time: string | null): string {
  if (!date) return "-";
  const w = weekday(date);
  return `${date}${w ? ` (${w})` : ""}${time ? ` ${time}` : ""}`;
}
