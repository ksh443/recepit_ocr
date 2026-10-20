import { getStore } from "@/lib/store";
import { aiModels, aiProvider } from "@/lib/ai";
import { assignLoginIds, validateOrg } from "@/lib/org";
import { sessionMember, syncAccounts } from "@/lib/auth";
import { authEnabled } from "@/lib/session";
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

/** 조직도·결재선 기본 담당자 저장 (로그인 모드에서는 부서장만). 조직도에 사람을 넣고 빼면 로그인 계정도 만들고 지운다 */
export async function PUT(req: Request) {
  try {
    if (authEnabled()) {
      const me = await sessionMember();
      if (!me?.head) return fail(new Error("조직도는 부서장만 편집할 수 있습니다."), 403);
    }
    const body = (await req.json()) as Partial<Settings>;
    const store = getStore();
    let accounts: { created: string[]; deleted: string[] } | null = null;
    if (body.orgChart !== undefined) {
      const problem = validateOrg(body.orgChart);
      if (problem) return fail(new Error(problem), 400);
      const clean: OrgMember[] = assignLoginIds(
        body.orgChart.map((m) => ({
          id: m.id,
          rank: m.rank.trim(),
          name: m.name.trim(),
          duty: (m.duty ?? "").trim(),
          head: Boolean(m.head),
          ...(m.loginId?.trim() ? { loginId: m.loginId.trim().toLowerCase() } : {}),
        })),
      );
      await store.setSetting("org_chart", JSON.stringify(clean));
      accounts = await syncAccounts(clean);
    }
    if (body.defaultDrafterId !== undefined) await store.setSetting("default_drafter_id", body.defaultDrafterId ?? "");
    return ok({ settings: await getSettings(), accounts });
  } catch (e) {
    return fail(e);
  }
}
