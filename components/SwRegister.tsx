"use client";

import { useEffect } from "react";

/** 서비스 워커 등록 (개발 모드에서는 화면 갱신과 충돌하므로 등록하지 않음) */
export default function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("SW 등록 실패", e));
  }, []);
  return null;
}
