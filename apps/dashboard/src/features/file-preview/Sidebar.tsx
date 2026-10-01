import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FolderOpen, PanelRight, X, Maximize2, Minimize2, FileText, Image, FileSpreadsheet, File } from "lucide-react";
import type { SessionFileRef } from "@lxe/desktop-protocol";
import { useUiText } from "../../shared/i18n";
import { closeTab, emptyLayout, openTab, restoreLayout, type PreviewLayout } from "./layout-state";
import { errorText, filesApi } from "./api";
import { DocumentViewer } from "./DocumentViewer";
import { FileTree } from "./FileTree";
import { readingState, forgetReadingTab } from "./reading-state";
import "./sidebar.css";
function TabIcon({ name }: { name: string }) { const ext = name.split(".").pop()?.toLowerCase(); const Icon = ["xlsx", "xls", "csv", "tsv"].includes(ext ?? "") ? FileSpreadsheet : ["png", "jpg", "jpeg", "svg", "gif", "webp", "bmp"].includes(ext ?? "") ? Image : ["pdf", "md", "txt", "doc", "docx"].includes(ext ?? "") ? FileText : File; return <Icon size={14} />; }
interface Controls { session: string; shown: boolean; open(ref: SessionFileRef, name?: string): Promise<void>; tree(): void; toggle(): void }
const Context = createContext<Controls | null>(null);
export const usePreviewSidebar = () => useContext(Context);
function storage() { try { return window.localStorage; } catch { return undefined; } }
export function PreviewHeaderActions() {
  const panel = usePreviewSidebar(), t = useUiText().filePreview;
  if (!panel?.session) return null;
  return <div className="file-header-actions"><button type="button" title={t.files} aria-label={t.files} onClick={panel.tree}><FolderOpen size={16} /></button><button type="button" title={t.toggle} aria-label={t.toggle} aria-expanded={panel.shown} onClick={panel.toggle}><PanelRight size={16} /></button></div>;
}
export function FilePreviewLayout({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const t = useUiText().filePreview, frame = useRef<HTMLDivElement>(null), sessionNow = useRef(sessionId); sessionNow.current = sessionId;
  const [layouts, setLayouts] = useState<Record<string, PreviewLayout>>({}), [room, setRoom] = useState(1000), [error, setError] = useState("");
  const intent = useRef(0), tabsRef = useRef<HTMLDivElement>(null);
  const saved = useMemo(() => restoreLayout(storage(), sessionId), [sessionId]);
  const layout = layouts[sessionId] ?? saved;
  const update = useCallback((fn: (layout: PreviewLayout) => PreviewLayout) => setLayouts(all => ({ ...all, [sessionId]: fn(all[sessionId] ?? saved) })), [sessionId, saved]);
  useEffect(() => { if (sessionId) try { storage()?.setItem(`lxe.file-preview.v1.${sessionId}`, JSON.stringify(layout)); } catch { /* Optional view preferences. */ } }, [sessionId, layout]);
  useEffect(() => { const observer = new ResizeObserver(entries => setRoom(entries[0]?.contentRect.width ?? 1000)); if (frame.current) observer.observe(frame.current); return () => observer.disconnect(); }, []);
  useEffect(() => { ++intent.current; setError(""); }, [sessionId]);
  useEffect(() => {
    const focus = () => { const focused = !!document.activeElement?.closest(".file-sidebar, .file-open-menu"); void filesApi().call({ operation: "focus-preview", input: { focused } }).catch(() => {}); };
    document.addEventListener("focusin", focus);
    return () => { document.removeEventListener("focusin", focus); void filesApi().call({ operation: "focus-preview", input: { focused: false } }).catch(() => {}); };
  }, [layout.shown, sessionId]);
  const open = useCallback(async (ref: SessionFileRef, name?: string) => {
    const request = ++intent.current;
    try {
      const metadata = await filesApi().call({ operation: "stat", input: { ref } });
      if (sessionNow.current !== ref.session_id || request !== intent.current) return;
      update(current => openTab(current, { key: metadata.key, name: name ?? metadata.name, ref })); setError("");
    } catch (error) { if (sessionNow.current === ref.session_id && request === intent.current) setError(errorText(error)); }
  }, [update]);
  const tree = useCallback(() => { ++intent.current; update(current => openTab(current, { key: "tree", name: t.files })); }, [update, t.files]);
  const controls = useMemo<Controls>(() => ({ session: sessionId, shown: layout.shown, open, tree, toggle: () => { ++intent.current; update(current => current.tabs.length ? { ...current, shown: !current.shown } : openTab(emptyLayout(), { key: "tree", name: t.files })); } }), [sessionId, layout.shown, open, tree, update, t.files]);
  const active = layout.tabs.find(tab => tab.key === layout.active), full = layout.expanded || room < 720;
  const width = Math.min(layout.width, Math.max(320, room - 400));
  useLayoutEffect(() => { tabsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [layout, room, sessionId]);
  const close = (key: string) => {
    ++intent.current; forgetReadingTab(sessionId, key);
    update(l => closeTab(l, key));
    requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
  };
  return <Context.Provider value={controls}><div className={`file-layout${layout.shown && sessionId ? " has-preview" : ""}${full ? " preview-full" : ""}`} ref={frame} style={{ "--preview-width": `${width}px` } as React.CSSProperties}>
    <div className="file-layout-main">{children}</div>
    {error ? <div className="file-layout-error" role="alert">{error}<button aria-label={t.close} onClick={() => setError("")}><X size={14} /></button></div> : null}
    {layout.shown && sessionId ? <>
      {!full ? <div className="file-preview-resizer" role="separator" tabIndex={0} aria-label={t.resize} aria-orientation="vertical" aria-valuenow={Math.round(width)} aria-valuemin={320} aria-valuemax={Math.max(320, room - 400)} onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); update(l => ({ ...l, width: Math.max(320, Math.min(room - 400, width + (e.key === "ArrowLeft" ? 20 : -20))) })); } }} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) update(l => ({ ...l, width: Math.max(320, Math.min(room - 400, (frame.current?.getBoundingClientRect().right ?? 0) - e.clientX)) })); }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} /> : null}
      <aside className="file-sidebar" tabIndex={-1} aria-label={t.toggle} onKeyDown={e => {
        if (document.querySelector('[role="menu"], [role="dialog"]')) return;
        const mac = window.lxe?.desktop?.platform === "darwin" || /Mac/.test(navigator.platform);
        if (!(mac ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return;
        if (e.key.toLowerCase() === "w") { e.preventDefault(); e.stopPropagation(); if (active) close(active.key); }
        if (e.key.toLowerCase() === "r") { e.preventDefault(); e.stopPropagation(); e.currentTarget.querySelector<HTMLButtonElement>('[data-preview-refresh]')?.click(); }
      }}>
        <div className="file-tab-strip"><div className="file-tabs" role="tablist" ref={tabsRef} onKeyDown={e => {
          const direction = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!direction && e.key !== "Home" && e.key !== "End") return;
          e.preventDefault(); ++intent.current;
          const index = layout.tabs.findIndex(tab => tab.key === layout.active);
          const next = layout.tabs[e.key === "Home" ? 0 : e.key === "End" ? layout.tabs.length - 1 : (index + direction + layout.tabs.length) % layout.tabs.length];
          if (next) { update(l => ({ ...l, active: next.key })); requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()); }
        }}>{layout.tabs.map(tab => <div className={`file-tab${layout.active === tab.key ? " active" : ""}`} key={tab.key}><button role="tab" tabIndex={layout.active === tab.key ? 0 : -1} aria-selected={layout.active === tab.key} title={tab.key === "tree" ? t.files : tab.name} onClick={() => { ++intent.current; update(l => ({ ...l, active: tab.key })); }}>{tab.key === "tree" ? <FolderOpen size={14} /> : <TabIcon name={tab.name} />}<span>{tab.key === "tree" ? t.files : tab.name}</span></button><button aria-label={`${t.close} ${tab.name}`} onClick={() => close(tab.key)}><X size={12} /></button></div>)}</div><button aria-label={layout.expanded ? t.collapse : t.expand} title={layout.expanded ? t.collapse : t.expand} onClick={() => update(l => ({ ...l, expanded: !l.expanded }))}>{layout.expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button><button aria-label={t.close} title={t.close} onClick={() => { ++intent.current; update(l => ({ ...l, shown: false })); }}><X size={16} /></button></div>
        {active?.key === "tree" ? <FileTree key={sessionId} session={sessionId} state={readingState(sessionId, "tree")} open={(ref, name) => void open(ref, name)} /> : active?.ref ? <DocumentViewer key={`${sessionId}:${active.key}`} file={active.ref} name={active.name} state={readingState(sessionId, active.key)} /> : null}
      </aside>
    </> : null}
  </div></Context.Provider>;
}
