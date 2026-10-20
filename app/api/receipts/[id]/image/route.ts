import { getStore } from "@/lib/store";
import { fail } from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * 비공개 저장소의 영수증을 서버를 거쳐 보여 준다.
 * - 기본: 화면 표시용 (PDF는 미리보기 JPEG가 있으면 그것을)
 * - ?original=1: 업로드한 원본 (PDF 그대로)
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const store = getStore();
    const r = await store.getReceipt(id);
    if (!r) return fail(new Error("영수증을 찾을 수 없습니다."), 404);
    const original = new URL(req.url).searchParams.has("original");
    const usePreview = !original && Boolean(r.previewPath);
    const data = await store.readImage(usePreview ? r.previewPath! : r.imagePath);
    const type = usePreview ? "image/jpeg" : r.contentType;
    const headers: Record<string, string> = { "Content-Type": type, "Cache-Control": "private, max-age=3600" };
    if (type === "application/pdf")
      headers["Content-Disposition"] = `inline; filename*=UTF-8''${encodeURIComponent(r.fileName)}`;
    return new Response(new Uint8Array(data), { headers });
  } catch (e) {
    return fail(e);
  }
}
