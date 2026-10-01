import { Component, lazy, Suspense, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, RefreshCw, WrapText } from "lucide-react";
import type { PreparedPreview, SessionFileRef, FileMetadata } from "@lxe/desktop-protocol";
import { useUiText } from "../../shared/i18n";
import { markdownComponents, markdownRemarkPlugins, markdownRehypePlugins } from "../../shared/ui/markdown";
import { CodeBlock, languageForPath } from "../../shared/ui/code-block";
import { errorText, filesApi } from "./api";
import { OpenFileButton } from "./OpenFileButton";
import { type ReadingState, type ViewMode } from "./reading-state";
import { useZoom, ZoomBar } from "./Zoom";
const PdfViewer = lazy(() => import("./PdfViewer"));
const ExcelViewer = lazy(() => import("./excel/ExcelViewer"));
class PreviewBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: unknown) { return { error: errorText(error) }; }
  render() { return this.state.error ? <pre className="file-preview-error" role="alert">{this.state.error}</pre> : this.props.children; }
}
export function decodeDocument(bytes: Uint8Array): string {
  return new TextDecoder(bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8", { fatal: true }).decode(bytes);
}
export function viewModes(name: string): ViewMode[] {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["md", "markdown"].includes(ext ?? "")) return ["rendered", "plain"];
  if (ext === "csv") return ["table", "plain", "code"];
  if (ext === "tsv") return ["table", "plain"];
  if (ext === "svg") return ["image", "code"];
  if (["xlsx", "xls"].includes(ext ?? "")) return ["table"];
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"].includes(ext ?? "")) return ["image"];
  if (["pdf", "doc", "docx", "ppt", "pptx"].includes(ext ?? "")) return ["pdf"];
  if (["html", "htm"].includes(ext ?? "")) return ["unsupported"];
  return languageForPath(name) || ["ps1", "rs", "go", "c", "cpp", "h", "java", "rb"].includes(ext ?? "") ? ["code", "plain"] : ["txt", "log", "ini", "env", "gitignore"].includes(ext ?? "") ? ["plain"] : ["unsupported"];
}
function imageType(extension: string) { return extension === ".svg" ? "image/svg+xml" : extension === ".jpg" ? "image/jpeg" : `image/${extension.slice(1)}`; }
function useImageUrl(bytes: Uint8Array | undefined, extension: string) {
  const [url, setUrl] = useState("");
  useEffect(() => { if (!bytes) return; const value = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: imageType(extension) })); setUrl(value); return () => URL.revokeObjectURL(value); }, [bytes, extension]);
  return url;
}
function LocalImage({ handle, src, alt }: { handle: string; src: string; alt?: string }) {
  const [bytes, setBytes] = useState<Uint8Array>(), [error, setError] = useState("");
  useEffect(() => {
    let active = true; setBytes(undefined); setError("");
    try { const path = decodeURIComponent(src.split(/[?#]/)[0] ?? ""); void filesApi().read(handle, path).then(value => { if (active) setBytes(value); }, error => { if (active) setError(errorText(error)); }); }
    catch (error) { setError(errorText(error)); }
    return () => { active = false; };
  }, [handle, src]);
  const url = useImageUrl(bytes, `.${src.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase()}`);
  return url ? <img src={url} alt={alt ?? ""} /> : <span title={error} data-preview-pending-image={!error || undefined}>{alt ?? src}{error ? ` (${error})` : ""}</span>;
}
function ImageViewer({ bytes, extension, name, state }: { bytes: Uint8Array; extension: string; name: string; state: ReadingState }) {
  const url = useImageUrl(bytes, extension), viewport = useRef<HTMLDivElement>(null);
  const [naturalWidth, setNaturalWidth] = useState(0), [width, setWidth] = useState(420), [error, setError] = useState("");
  const fit = naturalWidth ? (width - 32) / naturalWidth * 100 : 100, { zoom, change } = useZoom(state, viewport, fit);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(entry.contentRect.width); }); if (viewport.current) observer.observe(viewport.current); return () => observer.disconnect(); }, []);
  useLayoutEffect(() => { if (naturalWidth && viewport.current) { viewport.current.scrollTop = state.scroll.image?.top ?? 0; viewport.current.scrollLeft = state.scroll.image?.left ?? 0; } }, [naturalWidth]);
  return <div className="file-visual"><div className="file-image" ref={viewport} onScroll={e => { state.scroll.image = { top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft }; }}>
    {error ? <pre role="alert">{error}</pre> : url ? <img alt={name} src={url} onLoad={e => setNaturalWidth(e.currentTarget.naturalWidth)} onError={() => setError(`Image could not be decoded: ${name}`)} style={{ maxWidth: "none", width: naturalWidth ? naturalWidth * (zoom || fit) / 100 : "100%" }} /> : null}
  </div><ZoomBar zoom={zoom} fitPercent={fit} change={change} /></div>;
}
function PagedText({ preview, state, mode, wrap }: { preview: PreparedPreview; state: ReadingState; mode: ViewMode; wrap: boolean }) {
  const t = useUiText().filePreview, viewport = useRef<HTMLDivElement>(null), generation = useRef(0);
  const [text, setText] = useState(""), [eof, setEof] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const next = useRef(1), pending = useRef(false), restoring = useRef(true), saved = useRef<{ top: number; left: number } | null>(state.scroll[mode] ?? { top: 0, left: 0 });
  const load = async (restoreTo = 0) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); const current = generation.current;
    try {
      do {
        const page = await filesApi().readText(preview.handle, { offset: next.current });
        if (current !== generation.current) return;
        if (page.version !== preview.metadata.version) throw new Error("File changed; reload preview");
        setText(value => value + page.text); setCopied(false); next.current = page.next; setEof(page.eof);
        state.loadedLines = Math.max(0, page.next - 1);
        if (page.eof || page.next > restoreTo) break;
      } while (true);
      if (current === generation.current) { setError(""); restoring.current = false; }
    } catch (error) { if (current === generation.current) { setError(errorText(error)); restoring.current = false; } }
    finally { if (current === generation.current) { pending.current = false; setBusy(false); } }
  };
  useEffect(() => { ++generation.current; void load(state.loadedLines); return () => { generation.current++; }; }, [preview.handle]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !saved.current) return;
    const restore = () => {
      if (!saved.current) return;
      element.scrollTop = saved.current.top; element.scrollLeft = saved.current.left;
      const pendingImages = element.querySelector('[data-preview-pending-image]') || [...element.querySelectorAll('img')].some(image => !image.complete);
      if (!restoring.current && !pendingImages) saved.current = null;
    };
    restore();
    const observer = new ResizeObserver(restore);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener('load', restore, true);
    return () => { observer.disconnect(); element.removeEventListener('load', restore, true); };
  }, [text, busy]);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch (error) { setError(errorText(error)); } };
  return <div className="file-paged-text">
    <div className="file-text-actions"><span>{mode === "code" ? languageForPath(preview.metadata.name) || preview.metadata.extension.slice(1) : ""}</span><button onClick={() => void copy()} disabled={busy && !text}>{copied ? t.copied : eof ? t.copy : t.copyLoaded}</button></div>
    <div className="file-text-scroll" ref={viewport} onScroll={e => {
      const el = e.currentTarget;
      if (!saved.current) state.scroll[mode] = { top: el.scrollTop, left: el.scrollLeft };
      if (!restoring.current && !busy && !eof && !error && el.scrollHeight - el.scrollTop - el.clientHeight < 400) void load();
    }}>
      {mode === "rendered" ? <div className="file-markdown message-markdown"><ReactMarkdown remarkPlugins={markdownRemarkPlugins} rehypePlugins={markdownRehypePlugins} components={{ ...markdownComponents,
        img: ({ src, alt }) => typeof src === "string" && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src) ? <LocalImage handle={preview.handle} src={src} alt={alt} /> : <span>{alt}</span>,
      }}>{text}</ReactMarkdown></div> : <div className={`file-text${wrap ? " wrap" : ""}`}><CodeBlock language={mode === "code" ? preview.metadata.extension.slice(1) : ""} code={text} autoDetect={false} lineNumbers={mode === "code"} /></div>}
      {busy ? <p className="file-preview-loading" role="status">{t.loading}</p> : null}
      {error ? <div className="file-preview-error" role="alert"><pre>{error}</pre><button onClick={() => void load()}>{t.retry}</button></div> : !eof && !busy ? <button className="file-load-more" onClick={() => void load()}>{t.more}</button> : null}
    </div>
  </div>;
}
export function DocumentViewer({ file, name, state }: { file: SessionFileRef; name: string; state: ReadingState }) {
  const t = useUiText().filePreview, [metadata, setMetadata] = useState<FileMetadata>();
  const modes = metadata ? metadata.kind === "unsupported" ? ["unsupported" as const] : viewModes("file" + metadata.extension) : viewModes(name);
  const [mode, setMode] = useState<ViewMode>(state.mode && modes.includes(state.mode) ? state.mode : modes[0]!);
  const [wrap, setWrap] = useState(state.wrap), [revision, setRevision] = useState(0), [preview, setPreview] = useState<PreparedPreview>(), [bytes, setBytes] = useState<Uint8Array>(), [error, setError] = useState(""), [fonts, setFonts] = useState(false);
  const generation = useRef(0), key = JSON.stringify(file), textMode = ["rendered", "plain", "code"].includes(mode);
  useEffect(() => {
    const current = ++generation.current, request_id = crypto.randomUUID(); let version: string | undefined, checking = false;
    setPreview(undefined); setBytes(undefined); setError("");
    void (async () => {
      const info = await filesApi().call({ operation: "stat", input: { ref: file } });
      if (generation.current !== current) return;
      setMetadata(info);
      const available: ViewMode[] = info.kind === "unsupported" ? ["unsupported"] : viewModes("file" + info.extension);
      if (!available.includes(mode)) { setMode(available[0]!); return; }
      const result = await filesApi().call({ operation: "prepare", input: { ref: file, request_id, mode: textMode ? "text" : "bytes" } });
      if (generation.current !== current) return;
      const data = textMode ? undefined : await filesApi().read(result.handle);
      if (generation.current !== current) return;
      version = result.metadata.version; state.version = version; setPreview(result); setBytes(data);
    })().catch(error => { if (generation.current === current) setError(errorText(error)); });
    const check = async () => {
      if (checking || !version || generation.current !== current) return; checking = true;
      try { const info = await filesApi().call({ operation: "stat", input: { ref: file } }); if (generation.current === current && version !== info.version) setRevision(n => n + 1); }
      catch (error) { if (generation.current === current) { setError(errorText(error)); setBytes(undefined); } }
      finally { checking = false; }
    };
    const timer = setInterval(() => { if (!document.hidden) void check(); }, 1500); window.addEventListener("focus", check);
    return () => { generation.current++; clearInterval(timer); window.removeEventListener("focus", check); void filesApi().call({ operation: "release", input: { request_id } }).catch(() => {}); };
  }, [key, revision, mode]);
  const labels: Record<ViewMode, string> = { rendered: t.rendered, plain: t.plain, code: t.code, image: t.imageView, table: t.tableView, pdf: "PDF", unsupported: "" };
  const path = preview?.metadata.displayPath ?? name, split = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return <section className="file-document">
    <header className="file-document-toolbar"><span className="file-display-path" title={path}><span>{path.slice(0, split + 1)}</span>{path.slice(split + 1)}</span>
      {modes.length > 1 ? <select aria-label={t.view} value={mode} onChange={e => { const value = e.target.value as ViewMode; state.mode = value; setMode(value); }}>{modes.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select> : null}
      {textMode && mode !== "rendered" ? <button title={t.wrap} aria-label={t.wrap} aria-pressed={wrap} onClick={() => { state.wrap = !wrap; setWrap(!wrap); }}><WrapText size={15} /></button> : null}
      {preview?.missingFonts.length ? <button title={t.fonts} aria-label={t.fonts} aria-expanded={fonts} onClick={() => setFonts(!fonts)}><AlertTriangle size={15} /></button> : null}
      <button type="button" data-preview-refresh title={t.refresh} aria-label={t.refresh} onClick={() => setRevision(n => n + 1)}><RefreshCw size={15} /></button><OpenFileButton file={file} />
    </header>
    {fonts && preview?.missingFonts.length ? <div className="file-preview-note" role="status">{t.fonts}{preview.missingFonts.join(", ")}</div> : null}
    {preview?.metadata.source === "history" ? <div className="file-preview-note">{t.history}</div> : null}
    <div className="file-document-content">
      {error ? <div className="file-preview-error" role="alert"><pre>{error}</pre><button onClick={() => setRevision(n => n + 1)}>{t.retry}</button><OpenFileButton file={file} label /></div> : !preview || !textMode && !bytes ? <p className="file-preview-loading" role="status">{t.loading}</p> : <PreviewBoundary key={`${revision}:${mode}`}><Suspense fallback={<p className="file-preview-loading" role="status">{t.loading}</p>}>
        {preview.metadata.kind === "unsupported" ? <div className="file-preview-empty">{t.unsupported}<OpenFileButton file={file} label /></div>
          : textMode ? <PagedText key={`${preview.handle}:${mode}`} preview={preview} state={state} mode={mode} wrap={wrap} />
          : mode === "image" ? <ImageViewer bytes={bytes!} extension={preview.metadata.extension} name={name} state={state} />
          : mode === "pdf" ? <PdfViewer bytes={bytes!} state={state} />
          : <ExcelViewer bytes={bytes!} name={name} state={state} />}
      </Suspense></PreviewBoundary>}
    </div>
  </section>;
}
