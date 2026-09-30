import pdfCss from "pdfjs-dist/web/pdf_viewer.css?inline";
import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useUiText } from "../../shared/i18n";
import { errorText } from "./api";
GlobalWorkerOptions.workerSrc = workerUrl;
function Page({ document, number, width, zoom }: { document: PDFDocumentProxy; number: number; width: number; zoom: number }) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), text = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false), [error, setError] = useState("");
  useEffect(() => { const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) setVisible(true); }, { rootMargin: "400px" }); if (host.current) observer.observe(host.current); return () => observer.disconnect(); }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false, render: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined, layer: TextLayer | undefined;
    void document.getPage(number).then(async page => {
      if (cancelled || !canvas.current || !text.current) return;
      const base = page.getViewport({ scale: 1 }), scale = zoom || Math.max(0.1, (width - 32) / base.width), viewport = page.getViewport({ scale });
      const c = canvas.current, container = text.current, ratio = window.devicePixelRatio || 1;
      c.width = Math.ceil(viewport.width * ratio); c.height = Math.ceil(viewport.height * ratio);
      c.style.width = `${viewport.width}px`; c.style.height = `${viewport.height}px`;
      container.replaceChildren(); container.style.width = `${viewport.width}px`; container.style.height = `${viewport.height}px`; container.style.setProperty("--scale-factor", String(scale)); container.style.setProperty("--total-scale-factor", String(scale));
      render = page.render({ canvas: c, viewport, transform: [ratio, 0, 0, ratio, 0, 0] }); await render.promise;
      if (cancelled) return;
      layer = new TextLayer({ textContentSource: page.streamTextContent(), container, viewport }); await layer.render();
    }).catch(error => { if (!cancelled) setError(errorText(error)); });
    return () => { cancelled = true; render?.cancel(); layer?.cancel(); };
  }, [document, number, width, zoom, visible]);
  return <div className="file-pdf-page" ref={host} style={{ minHeight: visible ? undefined : width * 1.33 }}><canvas ref={canvas} /><div className="file-pdf-text textLayer" ref={text} />{error ? <pre role="alert">{error}</pre> : null}</div>;
}
export default function PdfViewer({ bytes }: { bytes: Uint8Array }) {
  const t = useUiText().filePreview, ref = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy>(), [error, setError] = useState(""), [width, setWidth] = useState(420), [zoom, setZoom] = useState(0);
  useEffect(() => {
    const task = getDocument({ data: bytes.slice(), cMapUrl: new URL("/preview-pdf/cmaps/", location.href).href, cMapPacked: true, standardFontDataUrl: new URL("/preview-pdf/standard_fonts/", location.href).href, wasmUrl: new URL("/preview-pdf/wasm/", location.href).href, enableXfa: false });
    let active = true; setPdf(undefined); setError("");
    void task.promise.then(doc => { if (active) setPdf(doc); }, error => { if (active) setError(errorText(error)); });
    return () => { active = false; void task.destroy().catch(() => {}); };
  }, [bytes]);
  useEffect(() => { const observer = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width ?? 420)); if (ref.current) observer.observe(ref.current); return () => observer.disconnect(); }, []);
  return <div className="file-pdf" ref={ref}><style>{`@scope (.file-pdf) { ${pdfCss} }`}</style>
    <div className="file-preview-zoom"><select aria-label={t.fit} value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={0}>{t.fit}</option>{[0.25, 0.5, 1, 1.5, 2, 3, 4].map(z => <option value={z} key={z}>{z * 100}%</option>)}</select></div>
    {error ? <pre role="alert">{error}</pre> : !pdf ? <p role="status">{t.loading}</p> : Array.from({ length: pdf.numPages }, (_, i) => <Page key={i} document={pdf} number={i + 1} width={width} zoom={zoom} />)}
  </div>;
}
