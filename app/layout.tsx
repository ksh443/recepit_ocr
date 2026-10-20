import type { Metadata, Viewport } from "next";
import SwRegister from "@/components/SwRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "영수증 결재 상신", template: "%s · 영수증 결재 상신" },
  description: "법인카드 영수증 OCR 기반 지출원인행위 결재 상신 웹앱",
  applicationName: "영수증 결재 상신",
  appleWebApp: { capable: true, title: "영수증상신", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
