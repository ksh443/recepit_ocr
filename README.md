# 영수증 OCR 기반 지출원인행위 결재 상신 웹앱 (PWA)

PRD: `영수증 기반 지출원인행위 결재상신 웹앱 PRD v1.4 (결재기능 미포함).md`

| 주소 | 화면 |
|---|---|
| `/cards` | A-① 카드 사용내역 (조회 기간 · 새로고침 · CSV 대체 업로드 · 상태 필터) |
| `/receipts` | A-② 영수증 업로드 · OCR · 대조 · 적요 · 결재 상신 |
| `/submissions` | A-③ 상신 목록 · 문서 (상급자 보기에서 승인 도장) |
| `/settings` | 상급자 이름 · 상신자 이름 |
| `/card` | B-① 가상 카드사 사용내역 조회 · 내보내기(CSV) |
| `/card/register` | B-② 내역 등록 (CSV 업로드 · 한 건 직접 입력) |

기술: Next.js 15 (App Router) · PWA(manifest + service worker) · Supabase(DB·Storage) · OCR·적요 AI: Google Gemini API(무료 사용량) 또는 Claude API(`claude-opus-5-5`)

## AI 키

`.env.local` 에 둘 중 하나만 넣으면 됩니다. 둘 다 있으면 Claude를 먼저 씁니다(`AI_PROVIDER=gemini` 로 강제 가능).

- **Gemini (무료)**: https://aistudio.google.com/apikey 에서 키 발급 → `GEMINI_API_KEY`. 무료 사용량에는 분당·일일 요청 한도가 있고, Google이 무료 사용 데이터를 서비스 개선에 쓸 수 있으므로 공개 영수증만 사용합니다.
- **Claude**: Console 크레딧이 있을 때 `ANTHROPIC_API_KEY`.

## 로컬 실행

```bash
npm install
copy .env.example .env.local   # 값 채우기
npm run dev                    # http://localhost:3000
```

- `SUPABASE_*` 를 비워 두면 `.data/` 폴더에 저장하는 **로컬 개발 모드**로 동작합니다.
- AI 키가 없으면 OCR·적요 자동 작성만 빠지고 나머지(수동 입력·대조·상신·승인)는 동작합니다.
- 서비스 워커(오프라인·설치)는 `npm run build && npm start` (프로덕션 모드)에서만 등록됩니다.

## Supabase 연결

1. Supabase 프로젝트 생성 → **SQL Editor** 에 `supabase/schema.sql` 붙여 넣고 실행 (표 5개 + 비공개 `receipts` 버킷)
2. Project Settings → API 에서 **Project URL** 과 **Secret key(service_role)** 를 `.env.local` 의 `SUPABASE_URL`, `SUPABASE_SECRET_KEY` 에 입력
   - 모든 표에 RLS를 켜고 공개 정책을 두지 않았으므로, 브라우저(공개 키)로는 데이터에 접근할 수 없고 서버 코드만 접근합니다.

## Vercel 배포

1. GitHub 저장소에 push (`.env.local`, `.data/` 는 `.gitignore` 로 제외됨)
2. Vercel 에서 저장소 Import → Environment Variables 에 `GEMINI_API_KEY`(또는 `ANTHROPIC_API_KEY`), `SUPABASE_URL`, `SUPABASE_SECRET_KEY` 등록
3. 배포 주소에서 휴대폰 브라우저로 열고 "홈 화면에 추가" 하면 앱처럼 설치됩니다.

## 대조 규칙 (금액 + 날짜)

| 상태 | 조건 |
|---|---|
| ✅ 일치 | 같은 날짜·같은 금액 카드 내역 있음 (여러 건이면 후보 선택) |
| ⚠️ 금액 불일치 | 같은 날짜·비슷한 업체인데 금액이 다름 |
| ⚠️ 날짜 불일치 | 같은 금액인데 날짜가 다름 |
| ⚠️ 카드내역 없음 | 짝이 없음 |
| ⏳ 영수증 없음 | 카드 내역에 연결된 영수증이 없음 |

이미 다른 영수증과 연결된 카드 내역은 불일치 후보에서 제외합니다.
