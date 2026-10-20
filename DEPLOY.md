# Supabase · Vercel 연동 안내

로그인과 키 발급은 계정 주인이 직접 해야 해서, 아래 순서대로 진행하면 됩니다. (약 15분)
키 값은 채팅에 붙여 넣지 말고 `.env.local`과 Vercel 화면에만 넣으세요.

---

## 1. Supabase (DB · 영수증 파일 저장소)

1. https://supabase.com/dashboard 에서 **New project**
   - 이름: 예) `receipt-ocr`, 지역: **Northeast Asia (Seoul)** 권장, DB 비밀번호는 아무거나(따로 보관)
2. 프로젝트가 만들어지면 왼쪽 메뉴 **SQL Editor → New query**
   - 이 저장소의 `supabase/schema.sql` 내용을 **전부 붙여 넣고 Run**
   - 표 5개(card_transactions_b/a, settings, receipts, submissions)와 비공개 저장소 `receipts`가 만들어집니다.
3. **Project Settings → API Keys**
   - **Secret key** (`sb_secret_...`, 예전 화면은 `service_role`) 복사
4. **Project Settings → Data API** (또는 위쪽 **Connect** 버튼)
   - **Project URL** (`https://xxxx.supabase.co`) 복사
5. 내 PC `.env.local`에 넣기
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   ```
6. (선택) 지금까지 로컬에서 만든 데이터(카드 내역·영수증·상신 문서·조직도)를 그대로 옮기려면
   ```bash
   node scripts/migrate-local-to-supabase.mjs
   ```
7. 서버를 다시 켜고 **설정 → 연결 상태**가 `Supabase`로 바뀌었는지 확인

> 키를 넣으면 그때부터 로컬 `.data/` 대신 Supabase를 씁니다. `.data/` 폴더는 지우지 않으므로, 키를 빼면 다시 로컬 데이터로 돌아갑니다.

---

## 2. Vercel (인터넷 주소로 배포)

1. https://vercel.com/new 에서 **GitHub로 로그인** → 저장소 **`ksh443/recepit_ocr`** 를 **Import**
   - 목록에 안 보이면 "Adjust GitHub App Permissions"에서 이 저장소 접근을 허용
2. **Framework Preset**: Next.js (자동 인식). Build/Install 명령은 그대로 둠
3. **Environment Variables** 에 추가 (Production·Preview 모두)

   | 이름 | 값 |
   |---|---|
   | `GEMINI_API_KEY` | `.env.local`의 값 |
   | `SUPABASE_URL` | 1-4에서 복사한 값 |
   | `SUPABASE_SECRET_KEY` | 1-3에서 복사한 값 |
   | (선택) `GEMINI_OCR_MODEL` | OCR만 Flash로 바꿀 때 `gemini-3.5-flash` |

4. **Deploy** → 1~2분 뒤 `https://recepit-ocr-xxxx.vercel.app` 같은 주소가 생깁니다.
5. 확인할 것
   - `/settings` 연결 상태: Supabase · Google Gemini
   - `/card/register`에 카드 CSV 등록 → `/cards`에서 조회 기간 맞추고 **새로고침**
     - 새로고침이 "HTTP 401"로 실패하면 Vercel **Settings → Deployment Protection**이 켜진 것입니다. 실습 주소면 끄거나, 대신 B에서 CSV를 내려받아 **CSV 직접 업로드**를 쓰세요.
   - 휴대폰으로 주소를 열고 "홈 화면에 추가" → 앱처럼 설치(PWA)
6. 이후에는 코드를 **GitHub에 푸시하면 Vercel이 자동으로 다시 배포**합니다.

---

## 참고

- Vercel에는 영수증 데이터셋(`archive/`)과 정답 CSV가 올라가지 않습니다(`.vercelignore`).
- 로그인이 없으므로 주소를 아는 사람은 누구나 볼 수 있습니다. 공개 영수증·가짜 카드 내역만 사용하세요.
- Gemini 무료 한도는 Google 프로젝트 단위라, 로컬과 Vercel이 같은 키를 쓰면 한도를 함께 씁니다.
