// 로컬 개발 데이터(.data/db.json, .data/uploads/)를 Supabase(DB·Storage)로 옮긴다.
// 사용법: .env.local 에 SUPABASE_URL, SUPABASE_SECRET_KEY 를 넣은 뒤
//   node scripts/migrate-local-to-supabase.mjs
// 이미 있는 행은 덮어쓴다(upsert). 여러 번 실행해도 된다.
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// .env.local 읽기 (값은 출력하지 않음)
const env = {};
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}
const url = process.env.SUPABASE_URL || env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL, SUPABASE_SECRET_KEY 가 .env.local 에 없습니다.");
  process.exit(1);
}

const dbFile = join(root, ".data", "db.json");
if (!existsSync(dbFile)) {
  console.error("옮길 로컬 데이터(.data/db.json)가 없습니다.");
  process.exit(1);
}
const db = JSON.parse(readFileSync(dbFile, "utf8"));
const sb = createClient(url, key, { auth: { persistSession: false } });

const toSnake = (o) =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()), v]),
  );

async function upsert(table, rows, onConflict) {
  if (!rows?.length) return console.log(`- ${table}: 0건`);
  const { error } = await sb.from(table).upsert(rows.map(toSnake), { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`- ${table}: ${rows.length}건`);
}

// 1) 영수증 파일 (원본·미리보기)
const uploads = join(root, ".data", "uploads");
const files = (db.receipts ?? []).flatMap((r) => [
  { path: r.imagePath, type: r.contentType },
  ...(r.previewPath ? [{ path: r.previewPath, type: "image/jpeg" }] : []),
]);
let uploaded = 0;
for (const f of files) {
  const local = join(uploads, f.path);
  if (!existsSync(local)) continue;
  const { error } = await sb.storage.from("receipts").upload(f.path, readFileSync(local), { contentType: f.type, upsert: true });
  if (error) throw new Error(`파일 ${f.path}: ${error.message}`);
  uploaded++;
}
console.log(`- 영수증 파일: ${uploaded}개`);

// 2) 표 (영수증을 상신 문서보다 먼저: 상신 문서가 영수증을 참조)
await upsert("card_issuer_transactions", (db.cardsB ?? []).map(({ fetchedAt, importSource, ...c }) => c), "approval_no");
await upsert("imported_card_transactions", (db.cardsA ?? []).map(({ registeredAt, ...c }) => c), "approval_no");
// 진짜 설정(조직도·기본 담당)만 옮긴다
const SETTING_KEYS = ["org_chart", "default_drafter_id"];
await upsert(
  "settings",
  Object.entries(db.settings ?? {})
    .filter(([k]) => SETTING_KEYS.includes(k))
    .map(([k, value]) => ({ key: k, value })),
  "key",
);
await upsert("receipts", db.receipts, "id");
await upsert("submissions", db.submissions, "id");
console.log("완료: 로컬 데이터를 Supabase로 옮겼습니다.");
