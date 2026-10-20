import { getStore } from "@/lib/store";
import { fail } from "@/lib/service";

export const dynamic = "force-dynamic";

/** 비공개 저장소의 영수증 이미지를 서버를 거쳐 보여 준다 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore();
    const r = await store.getReceipt(id);
    if (!r) return fail(new Error("영수증을 찾을 수 없습니다."), 404);
    const data = await store.readImage(r.imagePath);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": r.contentType, "Cache-Control": "private, max-age=3600" },
    });
  } catch (e) {
    return fail(e);
  }
}
