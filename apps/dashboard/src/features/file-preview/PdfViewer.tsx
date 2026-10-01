import pdfCss from "pdfjs-dist/web/pdf_viewer.css?inline";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { RotateCw } from "lucide-react";
import { useUiText } from "../../shared/i18n";
import type { ReadingState } from "./reading-state";
import { useZoom, ZoomBar } from "./Zoom";
GlobalWorkerOptions.workerSrc = workerUrl;
export const MAX_CANVAS_PIXELS = 16_777_216;
export function bitmapRatio(width: number, height: number, deviceRatio: number) {
  return Math.min(deviceRatio, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, Math.ceil(width * deviceRatio) * Math.ceil(height * deviceRatio))) * deviceRatio);
}
interface PageSize { width: number; height: number; rotation: number }
function Page({ document: pdf, number, size, scale, rotation, root, failed }: { failed(error: unknown): void; document: PDFDocumentProxy; number: number; size: PageSize; scale: number; rotation: number; root: HTMLDivElement | null }) {
  const host = useRef<HTMLDivElement>(null), painted = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const dimensions = rotation % 180 ? { width: size.height, height: size.width } : size;
  const width = dimensions.width * scale, height = dimensions.height * scale;
  useEffect(() => { const observer = new IntersectionObserver(entries => setVisible(entries.some(e => e.isIntersecting)), { root, rootMargin: "600px" }); if (host.current) observer.observe(host.current); return () => observer.disconnect(); }, [root]);
  useLayoutEffect(() => { const content = painted.current?.firstElementChild as HTMLElement | null; if (content) content.style.transform = `scale(${width / Number(content.dataset.width)}, ${height / Number(content.dataset.height)})`; }, [width, height]);
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => { painted.current?.replaceChildren(); }, 1000);
      return () => clearTimeout(timer);
    }
    let cancelled = false, render: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined, layer: TextLayer | undefined;
    // Keep the previous bitmap and text layer in place while resizing settles.
    const timer = setTimeout(() => { void pdf.getPage(number).then(async page => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale, rotation: (size.rotation + rotation) % 360 });
      const content = window.document.createElement("div"), canvas = window.document.createElement("canvas"), text = window.document.createElement("div");
      const ratio = bitmapRatio(viewport.width, viewport.height, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(viewport.width * ratio)); canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      text.className = "file-pdf-text textLayer";
      text.style.width = `${viewport.width}px`; text.style.height = `${viewport.height}px`;
      text.style.setProperty("--scale-factor", String(scale)); text.style.setProperty("--total-scale-factor", String(scale));
      content.dataset.width = String(viewport.width); content.dataset.height = String(viewport.height); content.style.transformOrigin = "0 0";
      content.append(canvas, text);
      render = page.render({ canvas, viewport, transform: [canvas.width / viewport.width, 0, 0, canvas.height / viewport.height, 0, 0] }); await render.promise;
      if (cancelled) return;
      layer = new TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport }); await layer.render();
      if (!cancelled && painted.current) { painted.current.replaceChildren(content); }
    }).catch(error => { if (!cancelled) failed(error); }); }, 140);
    return () => { cancelled = true; clearTimeout(timer); render?.cancel(); layer?.cancel(); };
  }, [pdf, number, scale, rotation, visible, size.rotation]);
  return <div className="file-pdf-page" data-page={number} ref={host} style={{ width, height, minHeight: height }}><div ref={painted} /></div>;
}
export default function PdfViewer({ bytes, state, failed }: { bytes: Uint8Array; state: ReadingState; failed(error: unknown): void }) {
  const t = useUiText().filePreview, ref = useRef<HTMLDivElement>(null), restoring = useRef(true);
  const [pdf, setPdf] = useState<PDFDocumentProxy>(), [sizes, setSizes] = useState<PageSize[]>([]), [width, setWidth] = useState(420), [rotation, setRotation] = useState(state.pdf.rotation), [page, setPage] = useState(state.pdf.page);
  const base = sizes[0], baseWidth = base ? rotation % 180 ? base.height : base.width : 612;
  const fit = (width - 32) / (baseWidth * 4 / 3) * 100, { zoom, change } = useZoom(state, ref, fit), scale = (zoom || fit) / 100 * 4 / 3;
  useEffect(() => {
    const task = getDocument({ data: bytes.slice(), cMapUrl: new URL("/preview-pdf/cmaps/", location.href).href, cMapPacked: true, standardFontDataUrl: new URL("/preview-pdf/standard_fonts/", location.href).href, wasmUrl: new URL("/preview-pdf/wasm/", location.href).href, enableXfa: false });
    let active = true;
    void task.promise.then(async doc => {
      const values: PageSize[] = [];
      for (let i = 1; i <= doc.numPages; i++) { if (!active) return; const page = await doc.getPage(i), viewport = page.getViewport({ scale: 1 }); values.push({ width: viewport.width, height: viewport.height, rotation: page.rotate }); }
      if (active) { state.pdf.page = Math.max(1, Math.min(state.pdf.page, doc.numPages)); setPage(state.pdf.page); setSizes(values); setPdf(doc); }
    }).catch(error => { if (active) failed(error); });
    return () => { active = false; void task.destroy().catch(() => {}); };
  }, [bytes]);
  useEffect(() => { const observer = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width ?? 420)); if (ref.current) observer.observe(ref.current); return () => observer.disconnect(); }, []);
  useLayoutEffect(() => {
    if (!pdf || !ref.current || !restoring.current && zoom !== 0) return;
    const target = ref.current.querySelector<HTMLElement>(`[data-page="${state.pdf.page}"]`);
    if (target) { ref.current.scrollTop = target.offsetTop + Math.min(state.pdf.offset, target.offsetHeight); ref.current.scrollLeft = state.scroll.pdf?.left ?? 0; restoring.current = false; }
  }, [pdf, width]);
  const jump = (value: number) => {
    if (!pdf || !Number.isFinite(value)) return;
    const next = Math.max(1, Math.min(pdf.numPages, value)); ref.current?.querySelector(`[data-page="${next}"]`)?.scrollIntoView({ block: "start" });
  };
  return <div className="file-visual"><style>{`@scope (.file-pdf) { ${pdfCss} }`}</style>
    <div className="file-pdf-navigation"><label>{t.page} <input aria-label={t.page} type="number" min={1} max={pdf?.numPages ?? 1} value={page} onChange={e => jump(Number(e.target.value))} /> / {pdf?.numPages ?? "…"}</label><button title={t.rotate} aria-label={t.rotate} onClick={() => { state.pdf.rotation = (rotation + 90) % 360; setRotation(state.pdf.rotation); }}><RotateCw size={15} /></button></div>
    <div className="file-pdf" ref={ref} onScroll={e => {
      if (restoring.current) return;
      const element = e.currentTarget, pages = [...element.querySelectorAll<HTMLElement>("[data-page]")];
      const current = pages.find(p => p.offsetTop + p.offsetHeight > element.scrollTop) ?? pages.at(-1);
      if (current) { state.pdf.page = Number(current.dataset.page); state.pdf.offset = Math.max(0, element.scrollTop - current.offsetTop); setPage(state.pdf.page); state.scroll.pdf = { top: element.scrollTop, left: element.scrollLeft }; }
    }}>
      {!pdf ? <p className="file-preview-loading" role="status">{t.loading}</p> : sizes.map((size, i) => <Page key={i} document={pdf} number={i + 1} size={size} scale={scale} rotation={rotation} root={ref.current} failed={failed} />)}
    </div><ZoomBar zoom={zoom} fitPercent={fit} change={change} />
  </div>;
}
