"use client";

import { useState } from "react";
import { STATUS_LABEL, type CardStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: CardStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function DateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (v: { from: string; to: string }) => void;
}) {
  return (
    <div className="row">
      <input type="date" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to })} aria-label="시작일" />
      <span className="muted">~</span>
      <input type="date" value={to} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} aria-label="종료일" />
    </div>
  );
}

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="영수증 크게 보기">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="영수증 원본" />
    </div>
  );
}

/**
 * 영수증 스캔본. 이미지는 그대로, PDF는 미리보기 이미지를 보여 준다.
 * 미리보기가 없거나 깨지면 브라우저 PDF 뷰어로 대신 띄운다.
 */
export function ReceiptScan({
  receiptId,
  isPdf,
  className,
  onZoom,
}: {
  receiptId: string;
  isPdf: boolean;
  className?: string;
  onZoom?: (src: string) => void;
}) {
  const src = `/api/receipts/${receiptId}/image`;
  const original = `${src}?original=1`;
  const [broken, setBroken] = useState(false);
  return (
    <div className="scan">
      {broken && isPdf ? (
        <object data={original} type="application/pdf" className={`scan-pdf ${className ?? ""}`}>
          <a href={original} target="_blank" rel="noreferrer">
            PDF 열기
          </a>
        </object>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={className}
          src={src}
          alt="영수증 스캔본"
          loading="lazy"
          onError={() => setBroken(true)}
          onClick={onZoom ? () => onZoom(src) : undefined}
          style={onZoom ? { cursor: "zoom-in" } : undefined}
        />
      )}
      {isPdf && (
        <a className="small" href={original} target="_blank" rel="noreferrer">
          📄 원본 PDF 열기
        </a>
      )}
    </div>
  );
}

export function useLightbox() {
  const [src, setSrc] = useState<string | null>(null);
  return {
    open: setSrc,
    node: src ? <Lightbox src={src} onClose={() => setSrc(null)} /> : null,
  };
}
