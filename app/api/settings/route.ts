import { getStore } from "@/lib/store";
import { aiModels, aiProvider } from "@/lib/ai";
import { validateOrg } from "@/lib/org";
import { fail, getSettings, ok } from "@/lib/service";
import type { OrgMember, Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ settings: await getSettings(), storage: getStore().kind, ai: aiProvider(), models: aiModels() });
  } catch (e) {
    return fail(e);
  }
}

/** 조직도·결재선 기본 담당자 저장 */
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<Settings>;
    const store = getStore();
    if (body.orgChart !== undefined) {
      const problem = validateOrg(body.orgChart);
      if (problem) return fail(new Error(problem), 400);
      const clean: OrgMember[] = body.orgChart.map((m) => ({
        id: m.id,
        rank: m.rank.trim(),
        name: m.name.trim(),
        duty: (m.duty ?? "").trim(),
        head: Boolean(m.head),
      }));
      await store.setSetting("org_chart", JSON.stringify(clean));
    }
    if (body.defaultDrafterId !== undefined) await store.setSetting("default_drafter_id", body.defaultDrafterId ?? "");
    return ok({ settings: await getSettings() });
  } catch (e) {
    return fail(e);
  }
}
