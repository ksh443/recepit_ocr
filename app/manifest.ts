import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "영수증 결재 상신",
    short_name: "영수증상신",
    description: "법인카드 영수증 OCR → 카드 내역 대조 → 적요 작성 → 지출원인행위 결재 상신",
    start_url: "/cards",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f7fb",
    theme_color: "#1d4ed8",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "영수증 올리기", url: "/receipts", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "결재 현황", url: "/submissions", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
