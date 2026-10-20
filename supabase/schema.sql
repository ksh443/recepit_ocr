-- 영수증 OCR 결재 상신 웹앱 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요.
-- 서버는 Secret key(service_role)로만 접근하므로, 모든 표에 RLS를 켜고 공개(anon) 정책은 만들지 않습니다.

-- 이 파일은 여러 번 실행해도 됩니다. 예전 이름의 카드 표가 있으면 데이터는 그대로 두고 이름만 바꿉니다.
do $$
begin
  if to_regclass('public.card_transactions_b') is not null and to_regclass('public.card_issuer_transactions') is null then
    alter table card_transactions_b rename to card_issuer_transactions;
  end if;
  if to_regclass('public.card_transactions_a') is not null and to_regclass('public.imported_card_transactions') is null then
    alter table card_transactions_a rename to imported_card_transactions;
  end if;
end $$;

-- 카드사(B)가 가진 원본 사용내역: 카드 사용내역 조회 웹페이지
create table if not exists card_issuer_transactions (
  approval_no   text primary key,          -- 승인번호
  approved_at   text not null,             -- 승인일시 'YYYY-MM-DD HH:MM'
  merchant      text not null default '',  -- 가맹점명
  category      text not null default '',  -- 업종
  amount        numeric not null,          -- 금액
  currency      text not null default '',  -- 통화
  card_last4    text not null default '',  -- 카드끝4자리
  registered_at text                       -- 등록 일시
);

-- 결재 웹앱(A)이 카드사에서 불러온 사용내역 (승인번호 기준 중복 없음)
create table if not exists imported_card_transactions (
  approval_no   text primary key,
  approved_at   text not null,
  merchant      text not null default '',
  category      text not null default '',
  amount        numeric not null,
  currency      text not null default '',
  card_last4    text not null default '',
  fetched_at    text,                      -- 불러온 일시
  import_source text                       -- 불러온 방식: 새로고침 / CSV 업로드
);
alter table imported_card_transactions add column if not exists import_source text;

-- 앱 설정 (조직도 org_chart, 기본 담당 default_drafter_id)
create table if not exists settings (
  key   text primary key,
  value text not null
);

-- 영수증
create table if not exists receipts (
  id                uuid primary key,
  file_name         text not null,
  image_path        text not null,          -- Storage 경로
  content_type      text not null,          -- image/jpeg, image/png, application/pdf
  preview_path      text,                   -- PDF 화면 표시용 JPEG 경로
  ocr               jsonb,                  -- OCR 원본 결과
  ocr_error         text,
  date              text,                   -- 담당자 확인값
  time              text,
  merchant          text,
  amount            numeric,
  currency          text,
  match_status      text not null,          -- matched / amount_mismatch / date_mismatch / no_card
  approval_no       text,                   -- 연결된 승인번호
  candidates        jsonb not null default '[]'::jsonb,
  memo              text not null default '',
  memo_note         text not null default '',
  memo_alternatives jsonb not null default '[]'::jsonb,
  submission_id     uuid,
  created_at        text not null
);

-- 상신 문서
create table if not exists submissions (
  id            uuid primary key,
  doc_no        text not null unique,       -- 상신번호
  receipt_id    uuid not null references receipts(id),
  date          text,
  time          text,
  merchant      text,
  amount        numeric,
  currency      text,
  memo          text not null,              -- 적요
  image_path    text not null,
  submitter     text not null,              -- 상신자 이름 (서명란)
  submitter_rank text,                      -- 상신자 직급
  submitted_at  text not null,              -- 상신 일시
  status        text not null default 'pending',  -- pending / approved (결재선 마지막 서명 후)
  approver_name text,                       -- 최종 결재 서명 표기 (대결이면 '代 소령 ○○○')
  approved_at   text,
  approval_line jsonb                       -- 결재선 [{role: drafter/review/final, rank, name, proxy, signedAt}]
);

-- 이전 버전 스키마를 이미 실행한 경우를 위한 보강
alter table receipts add column if not exists preview_path text;
alter table submissions add column if not exists submitter_rank text;
alter table submissions add column if not exists approval_line jsonb;
alter table submissions add column if not exists previous_submission_id uuid;
alter table submissions add column if not exists previous_doc_no text;
alter table receipts add column if not exists uploader_id text;

alter table card_issuer_transactions   enable row level security;
alter table imported_card_transactions enable row level security;
alter table settings            enable row level security;
alter table receipts            enable row level security;
alter table submissions         enable row level security;

-- 영수증 이미지 비공개 저장소
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- 설정(조직도 org_chart, 결재선 기본 담당자 default_drafter_id)은 비어 있으면 앱의 기본 조직도를 쓰고,
-- 웹앱 설정 화면에서 저장하면 이 표에 들어간다.
-- 예전 버전이 설정 표에 넣던 값(설정이 아닌 기록·쓰지 않는 값)은 지운다. 불러온 일시·방식은 imported_card_transactions 에 있다.
delete from settings where key in ('last_fetched_at', 'last_fetch_source', 'approver_name', 'submitter_name', 'submitter_rank');
