import type { Metadata } from "next";
import CardNav from "./CardNav";

export const metadata: Metadata = { title: "가상카드 사용내역 조회" };

/** (B) 카드 사용내역 조회 웹페이지 — 가상 카드사. 가짜 데이터만 사용 */
export default function CardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="b-body">
      <header className="b-top">
        <div className="b-top-inner">
          <span className="b-logo">
            <span className="dot" /> 가상카드
          </span>
          <CardNav />
          <span className="b-tag">법인카드 사용내역 조회 · 실습용 가짜 데이터</span>
        </div>
      </header>
      <main className="b-main">{children}</main>
    </div>
  );
}
