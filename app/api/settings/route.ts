import { getStore } from "@/lib/store";
import { aiModels, aiProvider } from "@/lib/ai";
import { fail, getSettings, ok } from "@/lib/service";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ settings: await getSettings(), storage: getStore().kind, ai: aiProvider(), models: aiModels() });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<Settings>;
    const store = getStore();
    if (body.approverName?.trim()) await store.setSetting("approver_name", body.approverName.trim());
    if (body.submitterName?.trim()) await store.setSetting("submitter_name", body.submitterName.trim());
    // 직급은 비워 둘 수도 있다
    if (body.submitterRank !== undefined) await store.setSetting("submitter_rank", body.submitterRank.trim());
    return ok({ settings: await getSettings() });
  } catch (e) {
    return fail(e);
  }
}
