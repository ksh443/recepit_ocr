-- 영수증 OCR 결재 상신 웹앱 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행하세요.
-- 서버는 Secret key(service_role)로만 접근하므로, 모든 표에 RLS를 켜고 공개(anon) 정책은 만들지 않습니다.

-- (B) 카드사 원장: 카드 사용내역 조회 웹페이지
create table if not exists card_transactions_b (
  approval_no   text primary key,          -- 승인번호
  approved_at   text not null,             -- 승인일시 'YYYY-MM-DD HH:MM'
  merchant      text not null default '',  -- 가맹점명
  category      text not null default '',  -- 업종
  amount        numeric not null,          -- 금액
  currency      text not null default '',  -- 통화
  card_last4    text not null default '',  -- 카드끝4자리
  registered_at text,                      -- 등록 일시
  fetched_at    text
);

-- (A) 결재 상신 웹앱이 새로고침으로 불러온 내역 (승인번호 기준 중복 없음)
create table if not exists card_transactions_a (
  approval_no   text primary key,
  approved_at   text not null,
  merchant      text not null default '',
  category      text not null default '',
  amount        numeric not null,
  currency      text not null default '',
  card_last4    text not null default '',
  registered_at text,
  fetched_at    text                       -- 불러온 일시
);

-- 설정값 (상급자 이름, 상신자 이름, 마지막 불러온 일시)
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
  status        text not null default 'pending',  -- pending / approved
  approver_name text,
  approved_at   text
);

-- 이전 버전 스키마를 이미 실행한 경우를 위한 보강
alter table receipts add column if not exists preview_path text;
alter table submissions add column if not exists submitter_rank text;

alter table card_transactions_b enable row level security;
alter table card_transactions_a enable row level security;
alter table settings            enable row level security;
alter table receipts            enable row level security;
alter table submissions         enable row level security;

-- 영수증 이미지 비공개 저장소
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

insert into settings (key, value) values
  ('approver_name', '○○○ 팀장'),
  ('submitter_name', '재정부서 담당자')
on conflict (key) do nothing;
