import { promises as fs } from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CardTxn, Receipt, Submission } from "./types";

/**
 * 데이터 저장소.
 * - SUPABASE_URL + SUPABASE_SECRET_KEY 가 있으면 Supabase(DB·Storage)를 쓴다.
 * - 없으면 로컬 개발용으로 .data/ 폴더에 JSON·이미지 파일로 저장한다.
 */
export interface Store {
  readonly kind: "supabase" | "local";
  // (B) 카드사 원장
  bList(from?: string, to?: string): Promise<CardTxn[]>;
  bUpsert(rows: CardTxn[]): Promise<{ added: number; updated: number }>;
  bDelete(approvalNo: string): Promise<void>;
  // (A) 불러온 카드 내역
  aList(): Promise<CardTxn[]>;
  aUpsert(rows: CardTxn[]): Promise<{ added: number; updated: number }>;
  // 설정
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  // 영수증
  listReceipts(): Promise<Receipt[]>;
  getReceipt(id: string): Promise<Receipt | null>;
  insertReceipt(r: Receipt): Promise<void>;
  updateReceipt(id: string, patch: Partial<Receipt>): Promise<Receipt>;
  deleteReceipt(id: string): Promise<void>;
  saveImage(p: string, data: Buffer, contentType: string): Promise<void>;
  readImage(p: string): Promise<Buffer>;
  deleteImage(p: string): Promise<void>;
  // 상신 문서
  listSubmissions(): Promise<Submission[]>;
  getSubmission(id: string): Promise<Submission | null>;
  insertSubmission(s: Submission): Promise<void>;
  updateSubmission(id: string, patch: Partial<Submission>): Promise<Submission>;
}

const inRange = (c: CardTxn, from?: string, to?: string) =>
  (!from || c.approvedAt >= `${from} 00:00`) && (!to || c.approvedAt <= `${to} 23:59`);
const byApprovedAt = (a: CardTxn, b: CardTxn) => a.approvedAt.localeCompare(b.approvedAt);
const byCreatedDesc = <T extends { createdAt?: string; submittedAt?: string }>(a: T, b: T) =>
  (b.createdAt ?? b.submittedAt ?? "").localeCompare(a.createdAt ?? a.submittedAt ?? "");

/* ------------------------------------------------------------------ */
/* Supabase                                                            */
/* ------------------------------------------------------------------ */

const toSnake = (o: object) =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()), v]),
  );
const toCamel = <T>(o: Record<string, unknown>): T =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()), v])) as T;

const NUMERIC = ["amount"];
function rowTo<T>(row: Record<string, unknown>): T {
  const o = toCamel<Record<string, unknown>>(row);
  for (const k of NUMERIC) if (o[k] !== null && o[k] !== undefined) o[k] = Number(o[k]);
  return o as T;
}

const BUCKET = "receipts";

class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  constructor(private sb: SupabaseClient) {}

  private async q<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(`DB 오류: ${error.message}`);
    return data as T;
  }

  private async listCards(table: string, from?: string, to?: string) {
    let query = this.sb.from(table).select("*").order("approved_at");
    if (from) query = query.gte("approved_at", `${from} 00:00`);
    if (to) query = query.lte("approved_at", `${to} 23:59`);
    const rows = await this.q<Record<string, unknown>[]>(query);
    return rows.map((r) => rowTo<CardTxn>(r));
  }

  private async upsertCards(table: string, rows: CardTxn[]) {
    if (!rows.length) return { added: 0, updated: 0 };
    const keys = rows.map((r) => r.approvalNo);
    const existing = await this.q<{ approval_no: string }[]>(
      this.sb.from(table).select("approval_no").in("approval_no", keys),
    );
    await this.q(this.sb.from(table).upsert(rows.map(toSnake), { onConflict: "approval_no" }));
    return { added: rows.length - existing.length, updated: existing.length };
  }

  bList(from?: string, to?: string) {
    return this.listCards("card_transactions_b", from, to);
  }
  bUpsert(rows: CardTxn[]) {
    return this.upsertCards("card_transactions_b", rows);
  }
  async bDelete(approvalNo: string) {
    await this.q(this.sb.from("card_transactions_b").delete().eq("approval_no", approvalNo));
  }
  aList() {
    return this.listCards("card_transactions_a");
  }
  aUpsert(rows: CardTxn[]) {
    return this.upsertCards("card_transactions_a", rows);
  }

  async getSetting(key: string) {
    const rows = await this.q<{ value: string }[]>(this.sb.from("settings").select("value").eq("key", key));
    return rows[0]?.value ?? null;
  }
  async setSetting(key: string, value: string) {
    await this.q(this.sb.from("settings").upsert({ key, value }, { onConflict: "key" }));
  }

  async listReceipts() {
    const rows = await this.q<Record<string, unknown>[]>(
      this.sb.from("receipts").select("*").order("created_at", { ascending: false }),
    );
    return rows.map((r) => rowTo<Receipt>(r));
  }
  async getReceipt(id: string) {
    const rows = await this.q<Record<string, unknown>[]>(this.sb.from("receipts").select("*").eq("id", id));
    return rows[0] ? rowTo<Receipt>(rows[0]) : null;
  }
  async insertReceipt(r: Receipt) {
    await this.q(this.sb.from("receipts").insert(toSnake(r)));
  }
  async updateReceipt(id: string, patch: Partial<Receipt>) {
    const rows = await this.q<Record<string, unknown>[]>(
      this.sb.from("receipts").update(toSnake(patch)).eq("id", id).select("*"),
    );
    if (!rows[0]) throw new Error("영수증을 찾을 수 없습니다.");
    return rowTo<Receipt>(rows[0]);
  }
  async deleteReceipt(id: string) {
    await this.q(this.sb.from("receipts").delete().eq("id", id));
  }

  async saveImage(p: string, data: Buffer, contentType: string) {
    const { error } = await this.sb.storage.from(BUCKET).upload(p, data, { contentType, upsert: true });
    if (error) throw new Error(`이미지 저장 실패: ${error.message}`);
  }
  async readImage(p: string) {
    const { data, error } = await this.sb.storage.from(BUCKET).download(p);
    if (error || !data) throw new Error(`이미지를 불러오지 못했습니다: ${error?.message ?? ""}`);
    return Buffer.from(await data.arrayBuffer());
  }
  async deleteImage(p: string) {
    await this.sb.storage.from(BUCKET).remove([p]);
  }

  async listSubmissions() {
    const rows = await this.q<Record<string, unknown>[]>(
      this.sb.from("submissions").select("*").order("submitted_at", { ascending: false }),
    );
    return rows.map((r) => rowTo<Submission>(r));
  }
  async getSubmission(id: string) {
    const rows = await this.q<Record<string, unknown>[]>(this.sb.from("submissions").select("*").eq("id", id));
    return rows[0] ? rowTo<Submission>(rows[0]) : null;
  }
  async insertSubmission(s: Submission) {
    await this.q(this.sb.from("submissions").insert(toSnake(s)));
  }
  async updateSubmission(id: string, patch: Partial<Submission>) {
    const rows = await this.q<Record<string, unknown>[]>(
      this.sb.from("submissions").update(toSnake(patch)).eq("id", id).select("*"),
    );
    if (!rows[0]) throw new Error("상신 문서를 찾을 수 없습니다.");
    return rowTo<Submission>(rows[0]);
  }
}

/* ------------------------------------------------------------------ */
/* 로컬 파일 (개발용)                                                    */
/* ------------------------------------------------------------------ */

interface LocalDb {
  cardsB: CardTxn[];
  cardsA: CardTxn[];
  settings: Record<string, string>;
  receipts: Receipt[];
  submissions: Submission[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const IMG_DIR = path.join(DATA_DIR, "uploads");

class LocalStore implements Store {
  readonly kind = "local" as const;
  private chain: Promise<unknown> = Promise.resolve();

  private async load(): Promise<LocalDb> {
    try {
      return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
    } catch {
      return { cardsB: [], cardsA: [], settings: {}, receipts: [], submissions: [] };
    }
  }
  /** 쓰기는 한 번에 하나씩 */
  private mutate<T>(fn: (db: LocalDb) => T): Promise<T> {
    const run = this.chain.then(async () => {
      const db = await this.load();
      const out = fn(db);
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
      return out;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
  private upsert(list: CardTxn[], rows: CardTxn[]) {
    let added = 0;
    let updated = 0;
    for (const r of rows) {
      const i = list.findIndex((c) => c.approvalNo === r.approvalNo);
      if (i >= 0) {
        list[i] = { ...list[i], ...r };
        updated++;
      } else {
        list.push(r);
        added++;
      }
    }
    return { added, updated };
  }

  async bList(from?: string, to?: string) {
    return (await this.load()).cardsB.filter((c) => inRange(c, from, to)).sort(byApprovedAt);
  }
  bUpsert(rows: CardTxn[]) {
    return this.mutate((db) => this.upsert(db.cardsB, rows));
  }
  async bDelete(approvalNo: string) {
    await this.mutate((db) => void (db.cardsB = db.cardsB.filter((c) => c.approvalNo !== approvalNo)));
  }
  async aList() {
    return (await this.load()).cardsA.sort(byApprovedAt);
  }
  aUpsert(rows: CardTxn[]) {
    return this.mutate((db) => this.upsert(db.cardsA, rows));
  }

  async getSetting(key: string) {
    return (await this.load()).settings[key] ?? null;
  }
  async setSetting(key: string, value: string) {
    await this.mutate((db) => void (db.settings[key] = value));
  }

  async listReceipts() {
    return (await this.load()).receipts.sort(byCreatedDesc);
  }
  async getReceipt(id: string) {
    return (await this.load()).receipts.find((r) => r.id === id) ?? null;
  }
  async insertReceipt(r: Receipt) {
    await this.mutate((db) => void db.receipts.push(r));
  }
  updateReceipt(id: string, patch: Partial<Receipt>) {
    return this.mutate((db) => {
      const i = db.receipts.findIndex((r) => r.id === id);
      if (i < 0) throw new Error("영수증을 찾을 수 없습니다.");
      db.receipts[i] = { ...db.receipts[i], ...patch };
      return db.receipts[i];
    });
  }
  async deleteReceipt(id: string) {
    await this.mutate((db) => void (db.receipts = db.receipts.filter((r) => r.id !== id)));
  }

  async saveImage(p: string, data: Buffer) {
    await fs.mkdir(IMG_DIR, { recursive: true });
    await fs.writeFile(path.join(IMG_DIR, path.basename(p)), data);
  }
  readImage(p: string) {
    return fs.readFile(path.join(IMG_DIR, path.basename(p)));
  }
  async deleteImage(p: string) {
    await fs.rm(path.join(IMG_DIR, path.basename(p)), { force: true });
  }

  async listSubmissions() {
    return (await this.load()).submissions.sort(byCreatedDesc);
  }
  async getSubmission(id: string) {
    return (await this.load()).submissions.find((s) => s.id === id) ?? null;
  }
  async insertSubmission(s: Submission) {
    await this.mutate((db) => void db.submissions.push(s));
  }
  updateSubmission(id: string, patch: Partial<Submission>) {
    return this.mutate((db) => {
      const i = db.submissions.findIndex((s) => s.id === id);
      if (i < 0) throw new Error("상신 문서를 찾을 수 없습니다.");
      db.submissions[i] = { ...db.submissions[i], ...patch };
      return db.submissions[i];
    });
  }
}

/* ------------------------------------------------------------------ */

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    store = new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  } else if (process.env.VERCEL) {
    throw new Error("Supabase 환경변수(SUPABASE_URL, SUPABASE_SECRET_KEY)가 설정되지 않았습니다.");
  } else {
    store = new LocalStore();
  }
  return store;
}
