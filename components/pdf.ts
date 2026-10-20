"use client";

/**
 * PDF 영수증의 앞쪽 페이지를 이미지(JPEG)로 그린다.
 * 화면·상신 문서에서는 이 미리보기 이미지를 보여 주고, OCR은 원본 PDF로 한다.
 * (휴대폰 브라우저는 PDF를 화면 안에 바로 띄우지 못하는 경우가 많기 때문)
 *
 * 일부 스캔 PDF(JBIG2·JPEG2000 압축)는 그리기가 오래 걸리거나 하얗게 나올 수 있어,
 * 시간 제한을 넘기거나 빈 화면이면 실패로 보고 업로드는 미리보기 없이 진행한다.
 */
const RENDER_TIMEOUT_MS = 10_000;

export async function renderPdfPreview(file: Blob, maxPages = 3): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // 글꼴이 내장되지 않은 PDF·스캔 이미지 PDF를 그리려면 필요 (scripts/copy-pdfjs-assets.mjs)
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("PDF 미리보기 시간 초과")), RENDER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([draw(task, maxPages), timeout]);
  } finally {
    clearTimeout(timer);
    await task.destroy().catch(() => undefined);
  }
}

type LoadingTask = ReturnType<typeof import("pdfjs-dist").getDocument>;

async function draw(task: LoadingTask, maxPages: number): Promise<Blob> {
  const doc = await task.promise;
  const pages = Math.min(doc.numPages, maxPages);
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    // 긴 변이 1600px 정도가 되도록
    const viewport = page.getViewport({ scale: Math.min(3, 1600 / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    // intent "print": requestAnimationFrame 을 쓰지 않아, 탭이 가려져 있어도 그리기가 멈추지 않는다
    await page.render({ canvas, viewport, intent: "print" }).promise;
    canvases.push(canvas);
  }
  if (canvases.every(isBlank)) throw new Error("PDF 미리보기가 빈 화면으로 그려졌습니다.");

  // 여러 페이지면 세로로 이어 붙인다
  const out = document.createElement("canvas");
  out.width = Math.max(...canvases.map((c) => c.width));
  out.height = canvases.reduce((h, c) => h + c.height, 0);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const c of canvases) {
    ctx.drawImage(c, 0, y);
    y += c.height;
  }
  return new Promise((res, rej) =>
    out.toBlob((b) => (b ? res(b) : rej(new Error("PDF 미리보기 변환 실패"))), "image/jpeg", 0.88),
  );
}

/** 거의 모든 픽셀이 흰색(또는 투명)이면 빈 화면으로 본다 */
function isBlank(canvas: HTMLCanvasElement): boolean {
  const small = document.createElement("canvas");
  small.width = 64;
  small.height = Math.max(1, Math.round((64 * canvas.height) / canvas.width));
  const ctx = small.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  const px = ctx.getImageData(0, 0, small.width, small.height).data;
  let dark = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 0 && (px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200)) dark++;
  }
  return dark < (px.length / 4) * 0.002;
}
