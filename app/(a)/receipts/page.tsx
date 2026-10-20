"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/components/api";
import { StatusBadge, useLightbox } from "@/components/ui";
import { fmtAmount, fmtDateTime } from "@/lib/format";
import type { CardTxn, Receipt } from "@/lib/types";

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

/** A-② 영수증 업로드·OCR·대조 */
export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [cards, setCards] = useState<CardTxn[]>([]);
  const [queue, setQueue] = useState<{ done: number; total: number; current: string } | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const lightbox = useLightbox();

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        api<{ receipts: Receipt[] }>("/api/receipts"),
        api<{ cards: CardTxn[] }>("/api/cards"),
      ]);
      setReceipts(r.receipts);
      setCards(c.cards);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 카드 사용내역 화면에서 상태 배지를 눌러 들어온 경우 해당 영수증으로 스크롤
  useEffect(() => {
    if (!receipts || !location.hash) return;
    const el = document.querySelector(location.hash);
    if (el) {
      setShowAll(true);
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [receipts]);

  const replace = (r: Receipt) => setReceipts((list) => (list ?? []).map((x) => (x.id === r.id ? r : x)));
  const remove = (id: string) => setReceipts((list) => (list ?? []).filter((x) => x.id !== id));

  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setError("");
    for (let i = 0; i < imgs.length; i++) {
      const f = imgs[i];
      setQueue({ done: i, total: imgs.length, current: f.name });
      try {
        const body = new FormData();
        body.append("file", await prepareImage(f), f.name);
        body.append("fileName", f.name);
        const { receipt } = await api<{ receipt: Receipt }>("/api/receipts", { method: "POST", body });
        setReceipts((list) => [receipt, ...(list ?? [])]);
        // 확인이 끝난(✅) 건은 적요를 바로 작성
        if (receipt.matchStatus === "matched") {
          api<{ receipt: Receipt }>(`/api/receipts/${receipt.id}/memo`, { method: "POST" })
            .then(({ receipt: r }) => replace(r))
            .catch(() => undefined);
        }
      } catch (e) {
        setError(`${f.name}: ${errMsg(e)}`);
      }
    }
    setQueue(null);
  };

  const cardMap = useMemo(() => new Map(cards.map((c) => [c.approvalNo, c])), [cards]);
  const list = (receipts ?? []).filter((r) => showAll || !r.submissionId);
  const pendingCount = (receipts ?? []).filter((r) => !r.submissionId).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>영수증 처리</h1>
          <p className="muted small">영수증을 올리면 AI가 날짜·시간·업체·금액을 읽고 카드 사용내역과 대조합니다.</p>
        </div>
        <label className="row small muted" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 상신 완료 건도 보기
        </label>
      </div>

      {cards.length === 0 && receipts !== null && (
        <div className="alert warn">
          불러온 카드 사용내역이 없습니다. 먼저 <Link href="/cards">카드 사용내역</Link>에서 새로고침을 눌러 주세요. (대조 없이 OCR만
          진행됩니다)
        </div>
      )}

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
            <div className="muted small">
              {queue.current} — AI가 영수증을 읽고 있습니다… (한 장에 10~30초)
            </div>
          </div>
        ) : (
          <div>
            <strong>영수증 이미지를 끌어다 놓거나 눌러서 선택</strong>
            <div className="muted small">JPG·PNG, 여러 장 한 번에 가능</div>
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
          accept="image/jpeg,image/png"
          multiple
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

      {error && (
        <div className="alert error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      <div className="row" style={{ margin: "20px 0 10px" }}>
        <h2 style={{ margin: 0 }}>처리할 영수증 {pendingCount}건</h2>
      </div>

      <div className="stack">
        {receipts === null ? (
          <div className="card muted">불러오는 중…</div>
        ) : list.length === 0 ? (
          <div className="card muted" style={{ textAlign: "center" }}>
            아직 올린 영수증이 없습니다.
          </div>
        ) : (
          list.map((r) => (
            <ReceiptCard
              key={r.id}
              receipt={r}
              cards={cards}
              cardMap={cardMap}
              onChange={replace}
              onDelete={remove}
              onZoom={lightbox.open}
            />
          ))
        )}
      </div>
      {lightbox.node}
    </>
  );
}

/* ------------------------------------------------------------------ */

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
  cards,
  cardMap,
  onChange,
  onDelete,
  onZoom,
}: {
  receipt: Receipt;
  cards: CardTxn[];
  cardMap: Map<string, CardTxn>;
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

  const locked = Boolean(r.submissionId);
  const dirty = JSON.stringify(f) !== JSON.stringify(toFields(r));
  const card = r.approvalNo ? cardMap.get(r.approvalNo) : undefined;
  const pickCard = pick ? cardMap.get(pick) : undefined;
  const img = `/api/receipts/${r.id}/image`;

  const run = async (label: string, fn: () => Promise<Receipt | void>) => {
    setBusy(label);
    setError("");
    try {
      const out = await fn();
      if (out) {
        onChange(out);
        // 대조가 확인되면(✅) 적요가 비어 있을 때 자동 작성
        if (out.matchStatus === "matched" && !out.memo && !out.submissionId) {
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

  const saveFields = () => run("저장", () => patch({ fields: f }));
  const link = () => run("연결", () => patch({ approvalNo: pick || null }));
  const applyCard = () =>
    run("카드값 적용", async () => (pick !== r.approvalNo ? patch({ approvalNo: pick, applyCard: true }) : patch({ applyCard: true })));
  const writeMemo = () =>
    run("적요 작성", () => api<{ receipt: Receipt }>(`/api/receipts/${r.id}/memo`, { method: "POST" }).then((x) => x.receipt));
  const saveMemo = (v: string) => (v !== r.memo ? run("적요 저장", () => patch({ memo: v })) : undefined);

  const submit = () =>
    run("상신", async () => {
      if (r.matchStatus !== "matched" && !confirm("카드 내역과 대조가 확인되지 않은 건입니다. 그래도 결재 상신할까요?")) return;
      if (memo !== r.memo) await patch({ memo });
      const { submission } = await api<{ submission: { id: string } }>("/api/submissions", {
        method: "POST",
        json: { receiptId: r.id },
      });
      router.push(`/submissions/${submission.id}`);
    });

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

  // 다른 카드 내역을 고를 수 있도록: 후보 먼저, 나머지는 뒤에
  const options = [...r.candidates.map((n) => cardMap.get(n)).filter(Boolean), ...cards.filter((c) => !r.candidates.includes(c.approvalNo))] as CardTxn[];
  const diffDate = pickCard && f.date !== pickCard.approvedAt.slice(0, 10);
  const diffAmt = pickCard && Number(f.amount) !== pickCard.amount;

  return (
    <section className="card" id={`r-${r.id}`}>
      <div className="row" style={{ marginBottom: 12 }}>
        <StatusBadge status={r.matchStatus} />
        <strong>{r.fileName}</strong>
        {locked && (
          <Link href={`/submissions/${r.submissionId}`} className="badge done">
            상신 완료 →
          </Link>
        )}
        <span className="spacer" />
        {busy && <span className="muted small">{busy} 중…</span>}
        {!locked && (
          <button className="btn sm ghost danger" onClick={del} disabled={!!busy}>
            삭제
          </button>
        )}
      </div>

      <div className="rc">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rc-img" src={img} alt={`${r.fileName} 영수증`} onClick={() => onZoom(img)} loading="lazy" />
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
                      <dd className={diffDate ? "diff" : ""}>{fmtDateTime(r.date, r.time)}</dd>
                      <dt>업체</dt>
                      <dd>{r.merchant ?? "-"}</dd>
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
                          {r.candidates.includes(c.approvalNo) ? "★ " : ""}
                          {c.approvalNo} · {c.approvedAt.slice(5)} · {c.merchant} · {fmtAmount(c.amount, c.currency)}
                        </option>
                      ))}
                    </select>
                    {pickCard ? (
                      <dl>
                        <dt>일시</dt>
                        <dd className={diffDate ? "diff" : ""}>{pickCard.approvedAt}</dd>
                        <dt>업체</dt>
                        <dd>{pickCard.merchant}</dd>
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
                  <button className="btn primary sm" onClick={applyCard} disabled={!pickCard || !!busy}>
                    카드 내역 값으로 수정
                  </button>
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
              placeholder={r.matchStatus === "matched" ? "적요를 작성하는 중이거나 비어 있습니다." : "대조를 확인하면 적요가 자동으로 작성됩니다."}
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
              <button className="btn primary" onClick={submit} disabled={!!busy || !memo.trim() || dirty}>
                결재 상신
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
