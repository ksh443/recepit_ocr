/** 화면 → 서버 API 호출 (오류 메시지를 그대로 보여 주기 위해 한 곳에서 처리) */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    cache: "no-store",
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* 본문 없음 */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    throw new Error(msg || `요청 실패 (HTTP ${res.status})`);
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
