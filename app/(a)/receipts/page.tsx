"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/components/api";
import { LoadStatus, ReloadError, useLoad } from "@/components/useLoad";
import { ReceiptScan, StatusBadge, useLightbox } from "@/components/ui";
import { renderPdfPreview } from "@/components/pdf";
import ApprovalLinePicker from "@/components/ApprovalLinePicker";
import { fmtAmount, fmtDateTime, signDate } from "@/lib/format";
import {
  APPROVAL_STATE_LABEL,
  approvalState,
  lineOf,
  signerLabel,
  type CardTxn,
  type LineSelection,
  type OrgMember,
  personLabel,
  type Receipt,
  type Settings,
  type Submission,
} from "@/lib/types";
import { useActor } from "@/components/AppShell";

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const ACCEPTED = (f: File) => f.type.startsWith("image/") || isPdf(f);

/** 업로드할 파일 준비: 사진은 줄이고, PDF는 원본 + 화면 표시용 미리보기 */
async function prepareUpload(file: File): Promise<{ file: Blob; preview: Blob | null }> {
  if (isPdf(file)) {
    if (file.size > 4 * 1024 * 1024) throw new Error("PDF가 너무 큽니다. (4MB 이하)");
    const pdf = file.type === "application/pdf" ? file : new Blob([file], { type: "application/pdf" });
    // 미리보기를 못 만들어도 업로드는 진행 (화면에서는 PDF 뷰어로 대신 표시)
    const preview = await renderPdfPreview(pdf).catch((e) => (console.warn("PDF 미리보기 실패", e), null));
    return { file: pdf, preview };
  }
  return { file: await prepareImage(file), preview: null };
}

/** 큰 사진(휴대폰 카메라 등)은 브라우저에서 줄여서 올린다 */
async function prepareImage(file: File): Promise<Blob> {
  const ok = file.type === "image/jpeg" || file.type === "image/png";
  if (ok && file.size <= 3 * 1024 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("이미지 변환 실패"))), "image/jpeg", 0.9));
}

/** 업로드 폼 만들기 (새 업로드·다시 올리기 공용) */
async function uploadBody(f: File, uploaderId?: string) {
  const prepared = await prepareUpload(f);
  const body = new FormData();
  body.append("file", prepared.file, f.name);
  if (prepared.preview) body.append("preview", prepared.preview, "preview.jpg");
  body.append("fileName", f.name);
  if (uploaderId) body.append("uploaderId", uploaderId);
  return body;
}

/** 카드 사용내역에서 눌러 들어온 경우: 그 영수증만(?receipt=) 또는 그 카드 내역의 영수증 올리기(?card=) */
type Focus = { receiptId: string } | { approvalNo: string } | null;
function readFocus(): Focus {
  const q = new URLSearchParams(location.search);
  const receiptId = q.get("receipt");
  const approvalNo = q.get("card");
  return receiptId ? { receiptId } : approvalNo ? { approvalNo } : null;
}

/** A-② 영수증 업로드·OCR·대조 */
export default function ReceiptsPage() {
  const actor = useActor();
  const router = useRouter();
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [cards, setCards] = useState<CardTxn[]>([]);
  const [subs, setSubs] = useState<Map<string, Submission>>(new Map());
  const [settings, setSettings] = useState<Settings | null>(null);
  /** 올린 사람 표시 (예전 영수증은 올린 사람 기록이 없어 기본 담당자로 본다) */
  const uploaderOf = (r: Receipt) => {
    const id = r.uploaderId ?? settings?.defaultDrafterId;
    const m = settings?.orgChart.find((x) => x.id === id);
    return m ? personLabel(m) : null;
  };
  const [queue, setQueue] = useState<{ done: number; total: number; current: string } | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [drag, setDrag] = useState(false);
  const [focus, setFocus] = useState<Focus>(null);
  /** 방금 올린(다시 올린) 영수증: 적요를 자동으로 쓴다 */
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const lightbox = useLightbox();

  useEffect(() => setFocus(readFocus()), []);
  const focusOn = (f: Focus) => {
    setFocus(f);
    router.replace(
      f ? ("receiptId" in f ? `/receipts?receipt=${f.receiptId}` : `/receipts?card=${encodeURIComponent(f.approvalNo)}`) : "/receipts",
    );
  };

  // 영수증은 누가 올렸든 모든 계정에 보인다 (카드에 올린 사람 표시)
  const loader = useLoad(
    () =>
      Promise.all([
        api<{ receipts: Receipt[] }>("/api/receipts"),
        api<{ cards: CardTxn[] }>("/api/cards"),
        api<{ submissions: Submission[] }>("/api/submissions"),
        api<{ settings: Settings }>("/api/settings"),
      ]),
    [actor?.id],
    Boolean(actor),
  );
  useEffect(() => {
    if (!loader.data) return;
    const [r, c, s, st] = loader.data;
    setReceipts(r.receipts);
    setSettings(st.settings);
    setCards(c.cards);
    setSubs(new Map(s.submissions.map((x) => [x.id, x])));
  }, [loader.data]);

  const replace = (r: Receipt) => setReceipts((list) => (list ?? []).map((x) => (x.id === r.id ? r : x)));
  const remove = (id: string) => {
    setReceipts((list) => (list ?? []).filter((x) => x.id !== id));
    if (focus && "receiptId" in focus && focus.receiptId === id) focusOn(null);
  };
  const markFresh = (id: string) => setFresh((s) => new Set(s).add(id));

  const cardMap = useMemo(() => new Map(cards.map((c) => [c.approvalNo, c])), [cards]);
  const focusCard = focus && "approvalNo" in focus ? cardMap.get(focus.approvalNo) : undefined;

  const upload = async (files: File[]) => {
    const imgs = files.filter(ACCEPTED);
    if (!imgs.length) {
      if (files.length) setError("JPG·PNG 이미지 또는 PDF만 올릴 수 있습니다.");
      return;
    }
    setError("");
    for (let i = 0; i < imgs.length; i++) {
      const f = imgs[i];
      setQueue({ done: i, total: imgs.length, current: f.name });
      try {
        let { receipt } = await api<{ receipt: Receipt }>("/api/receipts", { method: "POST", body: await uploadBody(f, actor?.id) });
        // 카드 내역에서 "미등록"을 눌러 올린 경우: 그 카드 내역과 짝지어 대조
        if (focusCard && receipt.approvalNo !== focusCard.approvalNo) {
          receipt = (
            await api<{ receipt: Receipt }>(`/api/receipts/${receipt.id}`, {
              method: "PATCH",
              json: { approvalNo: focusCard.approvalNo },
            })
          ).receipt;
        }
        setReceipts((list) => [receipt, ...(list ?? [])]);
        markFresh(receipt.id);
        if (focusCard) focusOn({ receiptId: receipt.id });
      } catch (e) {
        setError(`${f.name}: ${errMsg(e)}`);
      }
    }
    setQueue(null);
  };

  // 처리할 영수증 = 아직 상신 안 했거나, 상신했는데 반려된 것 (재상신 대상)
  const isOpen = (r: Receipt) => !r.submissionId || subs.get(r.submissionId)?.status === "rejected";
  const focusReceipt = focus && "receiptId" in focus ? focus.receiptId : null;
  const list = (receipts ?? []).filter((r) => (focusReceipt ? r.id === focusReceipt : showAll || isOpen(r)));
  const pendingCount = (receipts ?? []).filter(isOpen).length;
  const linkedCard = focusReceipt ? cardMap.get(receipts?.find((r) => r.id === focusReceipt)?.approvalNo ?? "") : undefined;
  const cardLine = (c: CardTxn) => `${c.approvedAt} · ${c.merchant} · ${fmtAmount(c.amount, c.currency)} (승인번호 ${c.approvalNo})`;

  const dropzone = (
    <div
      className={`dropzone ${drag ? "drag" : ""}`}
      onClick={() => !queue && fileRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!queue) upload([...e.dataTransfer.files]);
      }}
    >
      {queue ? (
        <div>
          <strong>
            처리 중 {queue.done + 1}/{queue.total}
          </strong>
          <div className="muted small">{queue.current} — AI가 영수증을 읽고 있습니다… (한 장에 10~30초)</div>
        </div>
      ) : (
        <div>
          <strong>영수증 파일을 끌어다 놓거나 눌러서 선택</strong>
          <div className="muted small">JPG·PNG·PDF{focusCard ? "" : ", 여러 장 한 번에 가능"}</div>
          <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
            <button
              type="button"
              className="btn sm"
              onClick={(e) => {
                e.stopPropagation();
                camRef.current?.click();
              }}
            >
              📷 카메라로 찍기
            </button>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf,.pdf"
        multiple={!focusCard}
        hidden
        onChange={(e) => {
          upload([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          upload([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>영수증 처리</h1>
          <p className="muted small">영수증을 올리면 AI가 날짜·시간·업체·금액을 읽고 카드 사용내역과 대조한 뒤 적요를 씁니다.</p>
        </div>
        {focus ? (
          <button className="btn" onClick={() => focusOn(null)}>
            ← 전체 영수증 보기
          </button>
        ) : (
          <label className="row small muted" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 상신 완료 건도 보기
          </label>
        )}
      </div>

      {cards.length === 0 && receipts !== null && (
        <div className="alert warn">
          불러온 카드 사용내역이 없습니다. 먼저 <Link href="/cards">카드 사용내역</Link>에서 새로고침을 눌러 주세요. (대조 없이 OCR만
          진행됩니다)
        </div>
      )}

      {focus && "approvalNo" in focus && (
        <div className="alert info">
          <strong>⏳ 미등록</strong> · 카드 내역 {focusCard ? cardLine(focusCard) : focus.approvalNo}
          <div className="small">이 카드 내역의 영수증을 올려 주세요. 올리면 이 내역과 대조합니다.</div>
        </div>
      )}
      {focusReceipt && linkedCard && (
        <div className="alert info">
          카드 내역 {cardLine(linkedCard)}의 영수증입니다.
          {receipts?.some((r) => r.id === focusReceipt && isOpen(r)) && (
            <>
              {" "}
              다른 영수증이면 아래 <strong>영수증 다시 올리기</strong>를 누르세요.
            </>
          )}
        </div>
      )}

      {!focusReceipt && dropzone}

      {receipts && <ReloadError error={loader.error} onRetry={loader.reload} />}
      {error && (
        <div className="alert error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {!focus && (
        <div className="row" style={{ margin: "20px 0 10px" }}>
          <h2 style={{ margin: 0 }}>처리할 영수증 {pendingCount}건</h2>
        </div>
      )}

      {!(focus && "approvalNo" in focus) && (
        <div className="stack" style={focus ? { marginTop: 16 } : undefined}>
          {receipts === null ? (
            <div className="card muted">
              {actor ? (
                <LoadStatus error={loader.error} slow={loader.slow} onRetry={loader.reload} />
              ) : (
                "계정 정보가 없어 영수증을 불러올 수 없습니다. 다시 로그인해 주세요."
              )}
            </div>
          ) : list.length === 0 ? (
            <div className="card muted" style={{ textAlign: "center" }}>
              {focusReceipt
                ? "영수증을 찾을 수 없습니다. 삭제되었을 수 있습니다."
                : receipts.length === 0
                  ? "아직 올린 영수증이 없습니다. 위에서 영수증 파일을 올려 주세요."
                  : "처리할 영수증이 없습니다. 상신한 영수증은 \"상신 완료 건도 보기\"를 켜면 보입니다."}
            </div>
          ) : (
            list.map((r) => (
              <ReceiptCard
                key={r.id}
                receipt={r}
                submission={r.submissionId ? subs.get(r.submissionId) : undefined}
                drafter={actor}
                uploader={uploaderOf(r)}
                cards={cards}
                cardMap={cardMap}
                autoMemo={fresh.has(r.id)}
                onReupload={markFresh}
                onChange={replace}
                onDelete={remove}
                onZoom={lightbox.open}
              />
            ))
          )}
        </div>
      )}
      {lightbox.node}
    </>
  );
}

/* ------------------------------------------------------------------ */

const sameAmt = (a: number, b: number) => Math.abs(a - b) < 0.005;
const shopWords = (s: string | null) => (s ?? "").toLowerCase().split(/[^a-z0-9가-힣]+/).filter((w) => w.length > 1);
/** 업체명이 비슷한가 (겹치는 단어가 하나라도 있으면) */
const shopLike = (a: string | null, b: string | null) => {
  const bw = shopWords(b);
  return shopWords(a).some((w) => bw.some((x) => x.includes(w) || w.includes(x)));
};
const minsOf = (t: string | null) => (t && /^\d{1,2}:\d{2}/.test(t) ? Number(t.split(":")[0]) * 60 + Number(t.split(":")[1].slice(0, 2)) : null);

type Fields = { date: string; time: string; merchant: string; amount: string; currency: string };
const toFields = (r: Receipt): Fields => ({
  date: r.date ?? "",
  time: r.time ?? "",
  merchant: r.merchant ?? "",
  amount: r.amount === null ? "" : String(r.amount),
  currency: r.currency ?? "",
});

function ReceiptCard({
  receipt: r,
  submission,
  drafter,
  uploader,
  cards,
  cardMap,
  autoMemo,
  onReupload,
  onChange,
  onDelete,
  onZoom,
}: {
  receipt: Receipt;
  submission: Submission | undefined;
  drafter: OrgMember | null;
  uploader: string | null;
  cards: CardTxn[];
  cardMap: Map<string, CardTxn>;
  autoMemo: boolean;
  onReupload: (id: string) => void;
  onChange: (r: Receipt) => void;
  onDelete: (id: string) => void;
  onZoom: (src: string) => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<Fields>(() => toFields(r));
  const [memo, setMemo] = useState(r.memo);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const firstField = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState(r.approvalNo ?? r.candidates[0] ?? "");

  useEffect(() => {
    setF(toFields(r));
    setMemo(r.memo);
    setPick(r.approvalNo ?? r.candidates[0] ?? "");
  }, [r]);

  // 반려된 영수증은 다시 고쳐서 재상신할 수 있다
  const rejected = submission?.status === "rejected";
  const locked = Boolean(r.submissionId) && !rejected;
  const rejectStep = rejected ? lineOf(submission!).find((st) => st.result === "rejected") : undefined;
  const dirty = JSON.stringify(f) !== JSON.stringify(toFields(r));
  const card = r.approvalNo ? cardMap.get(r.approvalNo) : undefined;
  const pickCard = pick ? cardMap.get(pick) : undefined;

  const run = async (label: string, fn: () => Promise<Receipt | void>) => {
    setBusy(label);
    setError("");
    try {
      const out = await fn();
      if (out) {
        onChange(out);
        // 대조가 확인되면(✅) 적요가 비어 있을 때 자동 작성
        if (out.matchStatus === "matched" && !out.memo && !locked) {
          setBusy("적요 작성");
          const m = await api<{ receipt: Receipt }>(`/api/receipts/${r.id}/memo`, { method: "POST" });
          onChange(m.receipt);
        }
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const patch = (body: unknown) =>
    api<{ receipt: Receipt }>(`/api/receipts/${r.id}`, { method: "PATCH", json: body }).then((x) => x.receipt);

  // 방금 올린(다시 올린) 영수증은 대조 결과와 상관없이 적요를 자동으로 쓴다 (실패하면 오류 표시, 버튼으로 다시 시도)
  const memoTried = useRef<string | null>(null);
  useEffect(() => {
    if (!autoMemo || locked || r.memo || r.ocrError || memoTried.current === r.imagePath) return;
    memoTried.current = r.imagePath;
    run("적요 작성", () => api<{ receipt: Receipt }>(`/api/receipts/${r.id}/memo`, { method: "POST" }).then((x) => x.receipt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMemo, r.imagePath, r.memo]);

  // 영수증 다시 올리기: 같은 건에 새 파일 → OCR·대조 다시 → 적요 자동 작성
  const reRef = useRef<HTMLInputElement>(null);
  const reupload = (file: File | undefined) =>
    file &&
    run("다시 올리기", async () => {
      if (!ACCEPTED(file)) throw new Error("JPG·PNG 이미지 또는 PDF만 올릴 수 있습니다.");
      const { receipt } = await api<{ receipt: Receipt }>(`/api/receipts/${r.id}/file`, { method: "POST", body: await uploadBody(file) });
      onReupload(r.id);
      return receipt;
    });

  // 추천 결제건(★): 금액·날짜·업체 중 두 가지 이상이 영수증과 맞고, 다른 영수증과 짝지어지지 않은 카드 내역.
  // 날짜가 같고, 업체가 비슷하고, 시간이 가까운 순으로 정렬
  const [dismissed, setDismissed] = useState<string | null>(null);
  const recommended = useMemo(() => {
    const hits = (c: CardTxn) =>
      Number(r.amount !== null && sameAmt(c.amount, r.amount)) +
      Number(c.approvedAt.slice(0, 10) === r.date) +
      Number(shopLike(r.merchant, c.merchant));
    const score = (c: CardTxn) => {
      const rt = minsOf(r.time);
      const ct = minsOf(c.approvedAt.slice(11, 16));
      return hits(c) * 1000 + (c.approvedAt.slice(0, 10) === r.date ? 300 : 0) - (rt !== null && ct !== null ? Math.min(Math.abs(rt - ct), 600) : 300);
    };
    return cards
      .filter((c) => hits(c) >= 2 && [undefined, null, r.id].includes((c as CardTxn & { receiptId?: string | null }).receiptId))
      .sort((a, b) => score(b) - score(a));
  }, [cards, r]);
  // 영수증을 잘못 올린 것 같은 경우: 연결된 카드 내역과 안 맞는데, 금액이 같은 추천 결제건이 따로 있으면 바꿀지 묻는다
  const otherCard =
    locked || r.matchStatus === "matched" || r.amount === null
      ? undefined
      : recommended.find((c) => c.approvalNo !== r.approvalNo && sameAmt(c.amount, r.amount!));
  const allDiffer =
    !locked && card && r.date !== card.approvedAt.slice(0, 10) && (r.amount === null || !sameAmt(r.amount, card.amount));

  const saveFields = () => run("저장", () => patch({ fields: f }));
  const link = () => run("연결", () => patch({ approvalNo: pick || null }));
  const writeMemo = () =>
    run("적요 작성", () => api<{ receipt: Receipt }>(`/api/receipts/${r.id}/memo`, { method: "POST" }).then((x) => x.receipt));
  const saveMemo = (v: string) => (v !== r.memo ? run("적요 저장", () => patch({ memo: v })) : undefined);

  // 결재 상신: 확인 → 적요 저장 → 결재선 지정 창 → 상신
  const [picking, setPicking] = useState(false);
  const submit = () =>
    run("상신 준비", async () => {
      if (r.matchStatus !== "matched" && !confirm("카드 내역과 대조가 확인되지 않은 건입니다. 그래도 결재 상신할까요?")) return;
      if (memo !== r.memo) onChange(await patch({ memo }));
      setPicking(true);
    });
  const submitWithLine = async (line: LineSelection) => {
    const { submission } = await api<{ submission: { id: string } }>("/api/submissions", {
      method: "POST",
      json: { receiptId: r.id, line },
    });
    router.push(`/submissions/${submission.id}`);
  };

  const del = () =>
    run("삭제", async () => {
      if (!confirm(`${r.fileName} 영수증을 삭제할까요?`)) return;
      await api(`/api/receipts/${r.id}`, { method: "DELETE" });
      onDelete(r.id);
    });

  const field = (k: keyof Fields, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={`field ${!f[k] ? "need-check" : ""}`}>
      <span>
        {label} {!f[k] && <span className="badge need">확인 필요</span>}
      </span>
      <input
        value={f[k]}
        disabled={locked}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        ref={k === "date" ? firstField : undefined}
        {...props}
      />
    </label>
  );

  // 다른 카드 내역을 고를 수 있도록: 추천(★) 먼저, 나머지는 뒤에
  const starred = new Set(recommended.map((c) => c.approvalNo));
  const options = [...recommended, ...cards.filter((c) => !starred.has(c.approvalNo))];
  const diffDate = pickCard && f.date !== pickCard.approvedAt.slice(0, 10);
  const diffAmt = pickCard && Number(f.amount) !== pickCard.amount;
  // 업체: 이름에 겹치는 단어가 없으면, 시간: 3시간 이상 차이 나면 빨간색
  const diffShop = Boolean(pickCard && r.merchant && !shopLike(r.merchant, pickCard.merchant));
  const rt = minsOf(r.time);
  const ct = pickCard ? minsOf(pickCard.approvedAt.slice(11, 16)) : null;
  const diffTime = rt !== null && ct !== null && Math.abs(rt - ct) >= 180;

  return (
    <section className="card" id={`r-${r.id}`}>
      <div className="row" style={{ marginBottom: 12 }}>
        <StatusBadge status={r.matchStatus} />
        <strong>{r.fileName}</strong>
        {uploader && <span className="muted small">올린 사람: {uploader}</span>}
        {submission && (
          <Link href={`/submissions/${submission.id}`} className={`badge ${rejected ? "rejected" : "done"}`}>
            {submission.docNo} {APPROVAL_STATE_LABEL[approvalState(submission)]} →
          </Link>
        )}
        <span className="spacer" />
        {busy && <span className="muted small">{busy} 중…</span>}
        {!locked && (
          <>
            <button className="btn sm" onClick={() => reRef.current?.click()} disabled={!!busy}>
              ↻ 영수증 다시 올리기
            </button>
            <input
              ref={reRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf,.pdf"
              hidden
              onChange={(e) => {
                reupload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </>
        )}
        {!r.submissionId && (
          <button className="btn sm ghost danger" onClick={del} disabled={!!busy}>
            삭제
          </button>
        )}
      </div>
      {otherCard && dismissed !== otherCard.approvalNo ? (
        <div className="alert info">
          💡 영수증과 금액·시간·업체가 맞는 결제건을 찾았습니다:{" "}
          <strong>
            {otherCard.approvedAt} · {otherCard.merchant} · {fmtAmount(otherCard.amount, otherCard.currency)}
          </strong>
          {card ? " (지금 연결: " + card.approvedAt + " · " + card.merchant + " · " + fmtAmount(card.amount, card.currency) + ")" : ""}
          <div>이 결제건으로 바꿀까요?</div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn primary sm" onClick={() => run("연결", () => patch({ approvalNo: otherCard.approvalNo }))} disabled={!!busy}>
              이 결제건으로 바꾸기
            </button>
            <button className="btn sm" onClick={() => setDismissed(otherCard.approvalNo)} disabled={!!busy}>
              그대로 두기
            </button>
          </div>
        </div>
      ) : (
        allDiffer && (
          <div className="alert warn">
            연결된 카드 내역과 날짜·금액이 모두 다릅니다. 다른 결제의 영수증이면{" "}
            <button className="btn sm" onClick={() => reRef.current?.click()} disabled={!!busy}>
              ↻ 맞는 영수증 다시 올리기
            </button>
          </div>
        )
      )}
      {rejectStep && (
        <div className="alert info">
          <strong>반려됨</strong> · {signerLabel(rejectStep)} · {signDate(rejectStep.signedAt)}
          <div>사유: {rejectStep.comment}</div>
          <div className="small">사유를 확인해 내용을 고친 뒤 아래 <strong>재상신</strong>을 누르세요. 새 상신번호로 올라갑니다.</div>
        </div>
      )}

      <div className="rc">
        <div>
          <ReceiptScan receiptId={r.id} isPdf={r.contentType === "application/pdf"} className="rc-img" onZoom={onZoom} />
        </div>

        <div className="stack" style={{ gap: 12 }}>
          {r.ocrError && <div className="alert error" style={{ margin: 0 }}>OCR 실패: {r.ocrError} — 값을 직접 입력해 주세요.</div>}

          <div>
            <h3>
              OCR 결과 <span className="muted small">(직접 수정 가능)</span>
            </h3>
            <div className="ocr-grid">
              {field("date", "날짜", { type: "date" })}
              {field("time", "시간", { type: "time" })}
              {field("merchant", "업체")}
              {field("amount", "금액", { inputMode: "decimal" })}
              {field("currency", "통화", { maxLength: 3, style: { textTransform: "uppercase" } })}
            </div>
            {r.ocr?.note && <p className="muted small" style={{ margin: "6px 0 0" }}>AI 메모: {r.ocr.note}</p>}
            {dirty && !locked && (
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary sm" onClick={saveFields} disabled={!!busy}>
                  저장하고 다시 대조
                </button>
                <button className="btn sm" onClick={() => setF(toFields(r))} disabled={!!busy}>
                  되돌리기
                </button>
              </div>
            )}
          </div>

          {/* 대조 결과 */}
          {r.matchStatus === "matched" && card ? (
            <div className="alert info" style={{ margin: 0 }}>
              ✅ 카드 내역 <span className="mono">{card.approvalNo}</span> · {card.approvedAt} · {card.merchant} ·{" "}
              {fmtAmount(card.amount, card.currency)}
              {r.candidates.length > 1 && !locked && (
                <div className="small" style={{ marginTop: 4 }}>
                  같은 날 같은 금액 후보가 {r.candidates.length}건 있습니다. 맞는 내역을 고르세요:{" "}
                  <select value={pick} onChange={(e) => setPick(e.target.value)}>
                    {r.candidates.map((n) => (
                      <option key={n} value={n}>
                        {n} · {cardMap.get(n)?.approvedAt} · {cardMap.get(n)?.merchant}
                      </option>
                    ))}
                  </select>{" "}
                  {pick !== r.approvalNo && (
                    <button className="btn sm" onClick={link} disabled={!!busy}>
                      이 내역으로 연결
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            !locked && (
              <div>
                <h3>카드 내역과 나란히 보기</h3>
                <div className="compare">
                  <div>
                    <strong>영수증</strong>
                    <dl>
                      <dt>일시</dt>
                      <dd className={diffDate || diffTime ? "diff" : ""}>{fmtDateTime(r.date, r.time)}</dd>
                      <dt>업체</dt>
                      <dd className={diffShop ? "diff" : ""}>{r.merchant ?? "-"}</dd>
                      <dt>금액</dt>
                      <dd className={diffAmt ? "diff" : ""}>{fmtAmount(r.amount, r.currency)}</dd>
                    </dl>
                  </div>
                  <div>
                    <strong>카드 내역</strong>{" "}
                    <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ maxWidth: "100%", fontSize: 13, padding: "2px 6px" }}>
                      <option value="">— 선택 —</option>
                      {options.map((c) => (
                        <option key={c.approvalNo} value={c.approvalNo}>
                          {starred.has(c.approvalNo) ? "★ " : ""}
                          {c.approvalNo} · {c.approvedAt.slice(5)} · {c.merchant} · {fmtAmount(c.amount, c.currency)}
                        </option>
                      ))}
                    </select>
                    {pickCard ? (
                      <dl>
                        <dt>일시</dt>
                        <dd className={diffDate || diffTime ? "diff" : ""}>{pickCard.approvedAt}</dd>
                        <dt>업체</dt>
                        <dd className={diffShop ? "diff" : ""}>{pickCard.merchant}</dd>
                        <dt>금액</dt>
                        <dd className={diffAmt ? "diff" : ""}>{fmtAmount(pickCard.amount, pickCard.currency)}</dd>
                      </dl>
                    ) : (
                      <p className="muted small" style={{ marginTop: 6 }}>
                        짝이 되는 카드 내역이 없습니다.
                      </p>
                    )}
                  </div>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="btn sm"
                    onClick={() => {
                      firstField.current?.focus();
                      firstField.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    직접 입력
                  </button>
                  {pickCard && pick !== r.approvalNo && (
                    <button className="btn sm ghost" onClick={link} disabled={!!busy}>
                      값은 그대로 두고 이 내역과 연결
                    </button>
                  )}
                </div>
              </div>
            )
          )}

          {/* 적요 */}
          <div>
            <div className="row" style={{ marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>적요</h3>
              <span className="spacer" />
              {!locked && (
                <button className="btn sm" onClick={writeMemo} disabled={!!busy}>
                  ✨ {r.memo ? "AI로 다시 쓰기" : "AI 적요 작성"}
                </button>
              )}
            </div>
            <textarea
              rows={2}
              value={memo}
              disabled={locked}
              placeholder={busy === "적요 작성" ? "AI가 적요를 작성하는 중입니다…" : "적요가 비어 있습니다. 직접 쓰거나 \"AI 적요 작성\"을 누르세요."}
              onChange={(e) => setMemo(e.target.value)}
              onBlur={() => saveMemo(memo)}
            />
            {!locked && r.memoAlternatives.length > 0 && (
              <div className="memo-alts">
                <span className="muted small">다른 안:</span>
                {r.memoAlternatives.map((a) => (
                  <button key={a} className="chip" onClick={() => (setMemo(a), saveMemo(a))}>
                    {a}
                  </button>
                ))}
              </div>
            )}
            {r.memoNote && !locked && (
              <div className="alert warn small" style={{ margin: "8px 0 0" }}>
                확인할 점: {r.memoNote}
              </div>
            )}
          </div>

          {error && <div className="alert error" style={{ margin: 0 }}>{error}</div>}

          {!locked && (
            <div className="row">
              <span className="spacer" />
              {/* 결재 상신을 누를 수 없는 이유 */}
              {!busy && (!memo.trim() || dirty) && (
                <span className="muted small">{dirty ? "OCR 결과 수정을 먼저 저장해 주세요." : "적요를 작성하면 결재 상신할 수 있습니다."}</span>
              )}
              <button className="btn primary" onClick={submit} disabled={!!busy || !memo.trim() || dirty || !drafter}>
                {rejected ? "재상신" : "결재 상신"}
              </button>
            </div>
          )}
          {picking && drafter && (
            <ApprovalLinePicker drafter={drafter} onSubmit={submitWithLine} onClose={() => setPicking(false)} />
          )}
        </div>
      </div>
    </section>
  );
}
