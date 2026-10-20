import { getStore } from "@/lib/store";
import { statusAgainst } from "@/lib/match";
import { normalizeDateTime, parseAmount } from "@/lib/csv";
import { computeMatch, fail, ok } from "@/lib/service";
import type { Receipt } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

interface PatchBody {
  /** 직접 입력으로 고친 값 → 다시 자동 대조 */
  fields?: { date?: string | null; time?: string | null; merchant?: string | null; amount?: number | string | null; currency?: string | null };
  /** 담당자가 고른 카드 내역 연결 (null = 연결 해제) */
  approvalNo?: string | null;
  /** 연결된 카드 내역 값으로 날짜·시간·금액·통화를 수정 */
  applyCard?: boolean;
  memo?: string;
}

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = await getStore().getReceipt(id);
  return r ? ok({ receipt: r }) : fail(new Error("영수증을 찾을 수 없습니다."), 404);
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as PatchBody;
    const store = getStore();
    const r = await store.getReceipt(id);
    if (!r) return fail(new Error("영수증을 찾을 수 없습니다."), 404);
    if (r.submissionId && (body.fields || body.approvalNo !== undefined || body.applyCard))
      return fail(new Error("이미 상신된 영수증은 수정할 수 없습니다."), 409);

    const next: Receipt = { ...r };
    if (body.fields) {
      const f = body.fields;
      if (f.date !== undefined) {
        const dt = f.date ? normalizeDateTime(f.date) : null;
        if (f.date && !dt) return fail(new Error("날짜 형식은 YYYY-MM-DD 입니다."), 400);
        next.date = dt ? dt.slice(0, 10) : null;
      }
      if (f.time !== undefined) {
        const t = clean(f.time);
        if (t && !/^\d{1,2}:\d{2}$/.test(t)) return fail(new Error("시간 형식은 HH:MM 입니다."), 400);
        next.time = t ? t.padStart(5, "0") : null;
      }
      if (f.merchant !== undefined) next.merchant = clean(f.merchant);
      if (f.amount !== undefined) next.amount = parseAmount(f.amount);
      if (f.currency !== undefined) next.currency = clean(f.currency)?.toUpperCase() ?? null;
    }

    const cards = await store.aList();
    if (body.approvalNo !== undefined) {
      const card = cards.find((c) => c.approvalNo === body.approvalNo);
      next.approvalNo = card?.approvalNo ?? null;
      if (card && !next.candidates.includes(card.approvalNo)) next.candidates = [card.approvalNo, ...next.candidates];
    }
    if (body.applyCard) {
      const card = cards.find((c) => c.approvalNo === next.approvalNo);
      if (!card) return fail(new Error("연결된 카드 내역이 없습니다."), 400);
      next.date = card.approvedAt.slice(0, 10);
      next.time = card.approvedAt.slice(11, 16);
      next.amount = card.amount;
      next.currency = card.currency || next.currency;
      next.merchant = next.merchant || card.merchant;
    }

    if (body.approvalNo !== undefined || body.applyCard) {
      // 담당자가 직접 연결한 카드 내역 기준으로 상태 판정
      const card = cards.find((c) => c.approvalNo === next.approvalNo);
      next.matchStatus = statusAgainst(next, card);
      if (next.matchStatus === "no_card" && card) next.matchStatus = "amount_mismatch";
    } else if (body.fields) {
      Object.assign(next, await computeMatch(next));
    }
    if (body.memo !== undefined) next.memo = body.memo.trim();

    const { id: _omit, ...patch } = next;
    const saved = await store.updateReceipt(id, patch);
    return ok({ receipt: saved });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const store = getStore();
    const r = await store.getReceipt(id);
    if (!r) return ok({ ok: true });
    if (r.submissionId) return fail(new Error("상신된 영수증은 삭제할 수 없습니다."), 409);
    await store.deleteReceipt(id);
    await store.deleteImage(r.imagePath).catch(() => undefined);
    if (r.previewPath) await store.deleteImage(r.previewPath).catch(() => undefined);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
