import { Component, lazy, Suspense, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { PreparedPreview, SessionFileRef } from "@lxe/desktop-protocol";
import { useUiText } from "../../shared/i18n";
import { markdownComponents, markdownRemarkPlugins, markdownRehypePlugins } from "../../shared/ui/markdown";
import { CodeBlock } from "../../shared/ui/code-block";
import { errorText, filesApi } from "./api";
import { OpenFileButton } from "./OpenFileButton";
const PdfViewer = lazy(() => import("./PdfViewer"));
const ExcelViewer = lazy(() => import("./excel/ExcelViewer"));
class PreviewBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: unknown) { return { error: errorText(error) }; }
  render() { return this.state.error ? <pre className="file-preview-error" role="alert">{this.state.error}</pre> : this.props.children; }
}
export function decodeDocument(bytes: Uint8Array): string {
  const encoding = bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}
function imageType(extension: string) { return extension === ".svg" ? "image/svg+xml" : extension === ".jpg" ? "image/jpeg" : `image/${extension.slice(1)}`; }
function useImageUrl(bytes: Uint8Array | undefined, extension: string) {
  const [url, setUrl] = useState("");
  useEffect(() => { if (!bytes) return; const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: imageType(extension) })); setUrl(url); return () => URL.revokeObjectURL(url); }, [bytes, extension]);
  return url;
}
function LocalImage({ handle, src, alt }: { handle: string; src: string; alt?: string }) {
  const [bytes, setBytes] = useState<Uint8Array>(), [error, setError] = useState("");
  useEffect(() => {
    let active = true; setBytes(undefined); setError("");
    try {
      const path = decodeURIComponent(src.split(/[?#]/)[0] ?? "");
      void filesApi().read(handle, path).then(bytes => { if (active) setBytes(bytes); }, error => { if (active) setError(errorText(error)); });
    } catch (error) { setError(errorText(error)); }
    return () => { active = false; };
  }, [handle, src]);
  const url = useImageUrl(bytes, `.${src.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase()}`);
  return url ? <img src={url} alt={alt ?? ""} /> : <span title={error}>{alt ?? src}{error ? ` (${error})` : ""}</span>;
}
function ImageViewer({ bytes, extension, name }: { bytes: Uint8Array; extension: string; name: string }) {
  const t = useUiText().filePreview, url = useImageUrl(bytes, extension), [zoom, setZoom] = useState(0), [naturalWidth, setNaturalWidth] = useState(0), [error, setError] = useState("");
  return <div className="file-image"><div className="file-preview-zoom"><select aria-label={t.fit} value={zoom} onChange={e => setZoom(Number(e.target.value))}><option value={0}>{t.fit}</option>{[25, 50, 100, 150, 200, 300, 400].map(z => <option key={z} value={z}>{z}%</option>)}</select></div>{error ? <pre role="alert">{error}</pre> : url ? <img alt={name} src={url} onLoad={e => setNaturalWidth(e.currentTarget.naturalWidth)} onError={() => setError(`Image could not be decoded: ${name}`)} style={zoom ? { maxWidth: "none", width: naturalWidth * zoom / 100 } : { maxWidth: "100%" }} /> : null}</div>;
}
function TextViewer({ bytes, preview }: { bytes: Uint8Array; preview: PreparedPreview }) {
  const t = useUiText().filePreview, [wrap, setWrap] = useState(true);
  const decoded = useMemo(() => { try { return { text: decodeDocument(bytes) }; } catch (error) { return { error: errorText(error) }; } }, [bytes]);
  if (decoded.error) return <pre role="alert">{decoded.error}</pre>;
  const text = decoded.text ?? "";
  if (preview.metadata.kind === "markdown") return <div className="file-markdown message-markdown"><ReactMarkdown remarkPlugins={markdownRemarkPlugins} rehypePlugins={markdownRehypePlugins} components={{ ...markdownComponents,
    img: ({ src, alt }) => typeof src === "string" && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src) ? <LocalImage handle={preview.handle} src={src} alt={alt} /> : <span>{alt}</span>,
  }}>{text}</ReactMarkdown></div>;
  return <div className={`file-text${wrap ? " wrap" : ""}`}><label><input type="checkbox" checked={wrap} onChange={e => setWrap(e.target.checked)} />{t.wrap}</label><CodeBlock language={preview.metadata.extension.slice(1)} code={text} autoDetect={false} /></div>;
}
export function DocumentViewer({ file, name }: { file: SessionFileRef; name: string }) {
  const t = useUiText().filePreview, [revision, setRevision] = useState(0), [preview, setPreview] = useState<PreparedPreview>(), [bytes, setBytes] = useState<Uint8Array>(), [error, setError] = useState("");
  const generation = useRef(0), key = JSON.stringify(file);
  useEffect(() => {
    const current = ++generation.current, request_id = crypto.randomUUID(); let version: string | undefined, checking = false;
    setPreview(undefined); setBytes(undefined); setError("");
    void filesApi().call({ operation: "prepare", input: { ref: file, request_id } }).then(async result => {
      if (generation.current !== current) return;
      const data = await filesApi().read(result.handle);
      if (generation.current !== current) return;
      version = result.metadata.version; setPreview(result); setBytes(data);
    }).catch(error => { if (generation.current === current) setError(errorText(error)); });
    const check = async () => {
      if (checking || !version || generation.current !== current) return; checking = true;
      try {
        const info = await filesApi().call({ operation: "stat", input: { ref: file } });
        if (generation.current === current && version !== info.version) setRevision(n => n + 1);
      } catch (error) { if (generation.current === current) { setError(errorText(error)); setBytes(undefined); } }
      finally { checking = false; }
    };
    const timer = setInterval(() => { if (!document.hidden) void check(); }, 1500);
    window.addEventListener("focus", check);
    return () => { generation.current++; clearInterval(timer); window.removeEventListener("focus", check); void filesApi().call({ operation: "release", input: { request_id } }).catch(() => {}); };
  }, [key, revision]);
  return <section className="file-document">
    <header className="file-document-toolbar"><span title={name}>{name}</span><button type="button" title={t.refresh} aria-label={t.refresh} onClick={() => setRevision(n => n + 1)}>↻</button><OpenFileButton file={file} /></header>
    {preview?.metadata.source === "history" ? <div className="file-preview-note">{t.history}</div> : null}
    {preview?.missingFonts.length ? <div className="file-preview-note">{t.fonts}{preview.missingFonts.join(", ")}</div> : null}
    <div className="file-document-content">
      {error ? <div className="file-preview-error" role="alert"><pre>{error}</pre><button onClick={() => setRevision(n => n + 1)}>{t.retry}</button></div> : !preview || !bytes ? <p className="file-preview-loading" role="status">{t.loading}</p> : <PreviewBoundary key={revision}><Suspense fallback={<p role="status">{t.loading}</p>}>
        {preview.metadata.kind === "unsupported" ? <p className="file-preview-empty">{t.unsupported}</p>
          : preview.metadata.kind === "image" ? <ImageViewer bytes={bytes} extension={preview.metadata.extension} name={name} />
          : ["pdf", "office"].includes(preview.metadata.kind) ? <PdfViewer bytes={bytes} />
          : preview.metadata.kind === "excel" ? <ExcelViewer bytes={bytes} name={name} />
          : <TextViewer bytes={bytes} preview={preview} />}
      </Suspense></PreviewBoundary>}
    </div>
  </section>;
}
