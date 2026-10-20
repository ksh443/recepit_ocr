"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function CardNav() {
  const p = usePathname();
  return (
    <nav className="b-nav">
      <Link href="/card" className={p === "/card" ? "active" : ""}>
        사용내역 조회
      </Link>
      <Link href="/card/register" className={p === "/card/register" ? "active" : ""}>
        내역 등록
      </Link>
    </nav>
  );
}
