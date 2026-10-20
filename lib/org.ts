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

/* ------------------------------------------------------------------ */
/* 로그인 계정 (Supabase Auth)                                           */
/* ------------------------------------------------------------------ */

/** 로그인 아이디 뒤에 붙는 주소 (실제로 메일을 받지 않는 시연용 주소) */
export const LOGIN_DOMAIN = "aflc.test";
/** 시연용 공통 초기 비밀번호 (로그인 화면 "이 사람으로 로그인" 버튼이 자동 입력) */
export const DEMO_PASSWORD = "000000";
export const loginEmail = (m: Pick<OrgMember, "loginId" | "email">) => m.email || `${m.loginId}@${LOGIN_DOMAIN}`;

/** 성 → 로마자 (두 글자 성 먼저) */
const SURNAMES: Record<string, string> = {
  남궁: "namgung", 황보: "hwangbo", 제갈: "jegal", 선우: "sunwoo", 독고: "dokgo", 사공: "sagong", 서문: "seomun",
  김: "kim", 이: "lee", 박: "park", 최: "choi", 정: "jung", 강: "kang", 조: "cho", 윤: "yoon", 장: "jang", 임: "lim",
  한: "han", 오: "oh", 서: "seo", 신: "shin", 권: "kwon", 황: "hwang", 안: "ahn", 송: "song", 류: "ryu", 유: "yoo",
  전: "jeon", 홍: "hong", 고: "ko", 문: "moon", 양: "yang", 손: "son", 배: "bae", 백: "baek", 허: "heo", 남: "nam",
  심: "shim", 노: "noh", 하: "ha", 곽: "kwak", 성: "sung", 차: "cha", 주: "joo", 우: "woo", 구: "koo", 민: "min",
  나: "na", 진: "jin", 지: "ji", 엄: "um", 채: "chae", 원: "won", 천: "chun", 방: "bang", 공: "kong", 현: "hyun",
  함: "ham", 변: "byun", 염: "yeom", 여: "yeo", 추: "choo", 도: "do", 소: "so", 석: "seok", 선: "sun", 설: "seol",
  마: "ma", 길: "gil", 연: "yeon", 위: "wi", 표: "pyo", 명: "myung", 기: "ki", 반: "ban", 왕: "wang", 금: "keum",
  옥: "ok", 육: "yook", 인: "in", 맹: "maeng", 제: "je", 모: "mo", 탁: "tak", 국: "kook", 어: "eo", 은: "eun",
  편: "pyun", 용: "yong", 예: "ye", 경: "kyung", 봉: "bong", 사: "sa", 부: "boo", 가: "ka", 복: "bok", 태: "tae",
  목: "mok", 형: "hyung", 피: "pi", 두: "doo", 감: "kam", 동: "dong", 호: "ho", 범: "bum", 승: "seung", 상: "sang",
};
export function surnameRoman(name: string): string {
  const n = name.trim();
  return SURNAMES[n.slice(0, 2)] ?? SURNAMES[n.slice(0, 1)] ?? "user";
}

/** 아이디가 없는 구성원에게 성 로마자 아이디를 붙인다 (같은 성이 있으면 kwon2, kwon3 …) */
export function assignLoginIds(org: OrgMember[]): OrgMember[] {
  const used = new Set(org.map((m) => m.loginId).filter(Boolean) as string[]);
  return org.map((m) => {
    if (m.loginId) return m;
    const base = surnameRoman(m.name);
    let id = base;
    for (let i = 2; used.has(id); i++) id = `${base}${i}`;
    used.add(id);
    return { ...m, loginId: id };
  });
}

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
  const logins = (org as OrgMember[]).map((m) => m.loginId).filter(Boolean) as string[];
  if (logins.some((l) => !/^[a-z0-9][a-z0-9._-]{0,39}$/.test(l))) return "로그인 아이디는 영문 소문자·숫자(. _ -)만 쓸 수 있습니다.";
  if (new Set(logins).size !== logins.length) return "로그인 아이디가 중복됩니다.";
  const emails = (org as OrgMember[]).map((m) => loginEmail(m).toLowerCase()).filter((e) => !e.startsWith("undefined@"));
  if (new Set(emails).size !== emails.length) return "이메일이 중복됩니다.";
  const heads = (org as OrgMember[]).filter((m) => m.head).length;
  if (heads !== 1) return "부서장은 한 명이어야 합니다.";
  return null;
}
