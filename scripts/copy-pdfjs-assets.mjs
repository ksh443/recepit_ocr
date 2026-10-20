// pdf.js가 PDF를 그릴 때 필요한 보조 파일(표준 글꼴·문자표·이미지 해독기)을 public/pdfjs/ 로 복사한다.
// npm run dev / build 전에 자동 실행된다 (package.json predev·prebuild).
import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

if (!existsSync(src)) {
  console.warn("[pdfjs] pdfjs-dist 가 설치되어 있지 않아 건너뜁니다.");
  process.exit(0);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const dir of ["standard_fonts", "cmaps", "wasm", "iccs"]) {
  if (existsSync(join(src, dir))) cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log("[pdfjs] 보조 파일을 public/pdfjs/ 로 복사했습니다.");
