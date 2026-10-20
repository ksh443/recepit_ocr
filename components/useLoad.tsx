"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errMsg } from "./api";

/** 이 시간이 지나도 응답이 없으면 "응답이 늦어지고 있습니다" + 다시 시도 */
const SLOW_MS = 10_000;

/**
 * 화면 데이터 불러오기. "불러오는 중"에 멈추지 않도록 실패·지연 상태를 함께 돌려준다.
 * reload()는 이전 데이터를 그대로 보여 주면서 다시 불러온다.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const done = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    setError("");
    setSlow(false);
    const timer = setTimeout(() => alive && setSlow(true), SLOW_MS);
    fnRef
      .current()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errMsg(e)))
      .finally(() => {
        clearTimeout(timer);
        if (!alive) return;
        setSlow(false);
        setLoading(false);
        done.current();
      });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  /** 다시 불러오고, 끝나면 resolve */
  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        done.current = () => {
          done.current = () => undefined;
          resolve();
        };
        setTick((t) => t + 1);
      }),
    [],
  );

  return { data, setData, error, slow, loading, reload };
}

/** 데이터가 아직 없을 때 자리 표시: 불러오는 중 / 늦어짐 / 실패 + 다시 시도 */
export function LoadStatus({ error, slow, onRetry }: { error: string; slow: boolean; onRetry: () => void }) {
  if (error)
    return (
      <span className="load-status error">
        불러오지 못했습니다: {error}{" "}
        <button className="btn sm" onClick={onRetry}>
          다시 시도
        </button>
      </span>
    );
  if (slow)
    return (
      <span className="load-status">
        응답이 늦어지고 있습니다. 잠시 기다리거나{" "}
        <button className="btn sm" onClick={onRetry}>
          다시 시도
        </button>
      </span>
    );
  return <span className="load-status">불러오는 중…</span>;
}

/** 이미 데이터가 있는 상태에서 다시 불러오기가 실패했을 때 */
export function ReloadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (!error) return null;
  return (
    <div className="alert error row">
      <span>최신 내용을 불러오지 못했습니다: {error}</span>
      <button className="btn sm" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}
