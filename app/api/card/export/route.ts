import { getStore } from "@/lib/store";
import { cardsToCsv } from "@/lib/csv";
import { fail } from "@/lib/service";

export const dynamic = "force-dynamic";

/** (B) 조회 기간의 내역을 9-1 양식 CSV 파일로 내려받기 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const rows = await getStore().bList(from || undefined, to || undefined);
    const name = `card_${from.replace(/-/g, "") || "all"}_${to.replace(/-/g, "") || "all"}.csv`;
    // 엑셀에서 한글이 깨지지 않도록 BOM 포함
    return new Response("﻿" + cardsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
