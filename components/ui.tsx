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

export function useLightbox() {
  const [src, setSrc] = useState<string | null>(null);
  return {
    open: setSrc,
    node: src ? <Lightbox src={src} onClose={() => setSrc(null)} /> : null,
  };
}
