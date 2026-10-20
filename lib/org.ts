import { rankOrder, type OrgMember } from "./types";

/** 기본 조직도 (실습용 가상 인물, 이름은 임의) — 설정 화면에서 고칠 수 있다 */
export const DEFAULT_ORG: OrgMember[] = [
  { id: "m01", rank: "대령", name: "박정훈", duty: "부서장", head: true },
  { id: "m02", rank: "소령", name: "이재원", duty: "재정과장", head: false },
  { id: "m03", rank: "대위", name: "권성혜", duty: "재정담당", head: false },
  { id: "m04", rank: "대위", name: "최민석", duty: "계약담당", head: false },
  { id: "m05", rank: "중위", name: "정다은", duty: "예산담당", head: false },
  { id: "m06", rank: "중위", name: "한승우", duty: "회계담당", head: false },
  { id: "m07", rank: "소위", name: "윤서진", duty: "회계보좌", head: false },
  { id: "m08", rank: "상사", name: "강동현", duty: "행정보급관", head: false },
  { id: "m09", rank: "중사", name: "임하늘", duty: "회계계원", head: false },
  { id: "m10", rank: "중사", name: "오지훈", duty: "예산계원", head: false },
  { id: "m11", rank: "하사", name: "신예린", duty: "행정계원", head: false },
  { id: "m12", rank: "하사", name: "조현우", duty: "행정계원", head: false },
];
export const DEFAULT_DRAFTER_ID = "m03";

/** 높은 직급부터 */
export const sortOrg = (org: OrgMember[]) => [...org].sort((a, b) => rankOrder(b.rank) - rankOrder(a.rank) || a.name.localeCompare(b.name, "ko"));

/** 조직도 검사: 문제가 있으면 메시지 */
export function validateOrg(org: unknown): string | null {
  if (!Array.isArray(org) || !org.length) return "조직도에 한 명 이상 있어야 합니다.";
  const ids = new Set<string>();
  for (const m of org as Partial<OrgMember>[]) {
    if (!m || typeof m.id !== "string" || !m.id) return "구성원 정보가 올바르지 않습니다.";
    if (ids.has(m.id)) return "구성원 id가 중복됩니다.";
    ids.add(m.id);
    if (!m.name?.trim()) return "이름이 비어 있는 구성원이 있습니다.";
    if (!m.rank?.trim()) return `${m.name}의 직급이 비어 있습니다.`;
  }
  const heads = (org as OrgMember[]).filter((m) => m.head).length;
  if (heads !== 1) return "부서장은 한 명이어야 합니다.";
  return null;
}
