import { BrowserPanel, StartPanel, TerminalPanel, toolBridge } from "./ToolPanels";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus, Compass, Globe, TerminalSquare, FolderOpen, PanelRight, X, Maximize2, Minimize2, FileText, Image, FileSpreadsheet, File } from "lucide-react";
import type { FileMetadata, SessionFileRef } from "@lxe/desktop-protocol";
import { useUiText } from "../../shared/i18n";
import { closeTab, openToolTab, openTab, restoreLayout, type PreviewLayout, type PreviewTab } from "./layout-state";
import { filesApi } from "./api";
import { DocumentViewer } from "./DocumentViewer";
import { FileTree } from "./FileTree";
import { readingState, forgetReadingTab, moveReadingTab } from "./reading-state";
import { checkFile, fileRefKey } from "./application-state";
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
  const t = useUiText().filePreview, toolsText = useUiText().manualTools, frame = useRef<HTMLDivElement>(null), sessionNow = useRef(sessionId); sessionNow.current = sessionId;
  const [layouts, setLayouts] = useState<Record<string, PreviewLayout>>({}), [room, setRoom] = useState(1000);
  const [toolErrors, setToolErrors] = useState<Record<string, string>>({});
  const toolError = toolErrors[sessionId] ?? "";
  const setToolError = (error: string) => setToolErrors(all => ({ ...all, [sessionId]: error }));
  const intent = useRef(0), tabsRef = useRef<HTMLDivElement>(null);
  const saved = useMemo(() => restoreLayout(storage(), sessionId), [sessionId]);
  const layout = layouts[sessionId] ?? saved;
  const update = useCallback((fn: (layout: PreviewLayout) => PreviewLayout) => setLayouts(all => ({ ...all, [sessionId]: fn(all[sessionId] ?? saved) })), [sessionId, saved]);
  useEffect(() => { if (sessionId) try { storage()?.setItem(`lxe.file-preview.v1.${sessionId}`, JSON.stringify(layout)); } catch { /* Optional view preferences. */ } }, [sessionId, layout]);
  useEffect(() => { const observer = new ResizeObserver(entries => setRoom(entries[0]?.contentRect.width ?? 1000)); if (frame.current) observer.observe(frame.current); return () => observer.disconnect(); }, []);
  useEffect(() => { ++intent.current; }, [sessionId]);
  useEffect(() => {
    const focus = () => { const focused = !!document.activeElement?.closest(".file-sidebar, .file-open-menu"); void filesApi().call({ operation: "focus-preview", input: { focused } }).catch(() => {}); };
    document.addEventListener("focusin", focus);
    return () => { document.removeEventListener("focusin", focus); void filesApi().call({ operation: "focus-preview", input: { focused: false } }).catch(() => {}); };
  }, [layout.shown, sessionId]);
  const canonicalize = useCallback((ref: SessionFileRef, info: FileMetadata) => {
    if (sessionNow.current !== ref.session_id) return;
    update(current => {
      const previous = current.tabs.find(tab => tab.ref && fileRefKey(tab.ref) === fileRefKey(ref));
      if (!previous || previous.key === info.key) return current;
      moveReadingTab(ref.session_id, previous.key, info.key);
      const tabs = current.tabs.filter(tab => tab.key !== info.key).map(tab => tab.key === previous.key ? { ...tab, key: info.key } : tab);
      return { ...current, tabs, active: current.active === previous.key ? info.key : current.active };
    });
  }, [update]);
  const open = useCallback(async (ref: SessionFileRef, name?: string) => {
    const request = ++intent.current;
    let metadata: FileMetadata | undefined;
    try { metadata = await checkFile(ref, true); } catch { /* The viewer renders the structured failure and keeps checking. */ }
    if (sessionNow.current !== ref.session_id || request !== intent.current) return;
    update(current => {
      const existing = current.tabs.find(tab => tab.ref && fileRefKey(tab.ref) === fileRefKey(ref));
      const key = metadata?.key ?? existing?.key ?? `ref:${fileRefKey(ref)}`;
      if (existing && existing.key !== key) moveReadingTab(ref.session_id, existing.key, key);
      return openTab({ ...current, tabs: current.tabs.filter(tab => !existing || tab.key !== existing.key || existing.key === key) }, { key, name: name ?? existing?.name ?? metadata?.name ?? (ref.kind === "workspace" ? ref.path.split(/[\\/]/).pop()! : ref.id), ref });
    });
  }, [update]);
  const tree = useCallback(() => { ++intent.current; update(current => openTab(current, { key: "tree", name: t.files })); }, [update, t.files]);
  const controls = useMemo<Controls>(() => ({ session: sessionId, shown: layout.shown, open, tree, toggle: () => { ++intent.current; update(current => current.tabs.length ? { ...current, shown: !current.shown } : openTab(current, { key: "start", name: toolsText.start, kind: "start" })); } }), [sessionId, layout.shown, open, tree, update, toolsText.start]);
  const active = layout.tabs.find(tab => tab.key === layout.active), full = layout.expanded || room < 720;
  const width = Math.min(layout.width, Math.max(320, room - 400));
  useLayoutEffect(() => { tabsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [layout, room, sessionId]);
  const close = async (key: string) => {
    ++intent.current; setToolError("");
    const tab = layout.tabs.find(item => item.key === key);
    try {
      if (tab?.kind === "terminal" || tab?.kind === "browser") await toolBridge().call({ operation: tab.kind === "terminal" ? "terminal.close" : "browser.close", input: { sessionId, id: key } });
    } catch (error) { setToolError(String(error)); return false; }
    forgetReadingTab(sessionId, key);
    update(l => closeTab(l, key));
    requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
  };
  const start = () => update(current => openTab(current, { key: "start", name: toolsText.start, kind: "start" }));
  const createTool = (kind: "tree" | "terminal" | "browser") => {
    setToolError(""); ++intent.current;
    const tab: PreviewTab = kind === "tree" ? { key: "tree", name: t.files } : { key: `${kind}:${crypto.randomUUID()}`, name: kind === "terminal" ? toolsText.terminal : toolsText.browser, kind };
    if (kind === "terminal") {
      try { void toolBridge().call({ operation: "terminal.create", input: { sessionId, id: tab.key, cols: 80, rows: 24 } }).catch(error => setToolError(String(error))); }
      catch (error) { setToolError(String(error)); return; }
    }
    update(current => openToolTab(current, tab));
  };
  useEffect(() => window.lxe?.tools?.subscribe(event => {
    if (event.kind === "browser.state") {
      const { sessionId: owner, id, url, title } = event.snapshot;
      setLayouts(all => {
        const current = all[owner] ?? restoreLayout(storage(), owner);
        if (!current.tabs.some(tab => tab.key === id)) return all;
        const next = { ...current, tabs: current.tabs.map(tab => tab.key === id ? { ...tab, url, name: title || toolsText.browser } : tab) };
        try { storage()?.setItem(`lxe.file-preview.v1.${owner}`, JSON.stringify(next)); } catch { /* Optional layout. */ }
        return { ...all, [owner]: next };
      });
    } else if (event.kind === "browser.open") {
      setLayouts(all => ({ ...all, [event.sessionId]: openToolTab(all[event.sessionId] ?? restoreLayout(storage(), event.sessionId), { key: `browser:${crypto.randomUUID()}`, name: toolsText.browser, kind: "browser", url: event.url }) }));
    }
  }), [toolsText.browser]);
  const label = (tab: PreviewTab) => tab.key === "tree" ? t.files : tab.key === "start" ? toolsText.start : tab.name;
  return <Context.Provider value={controls}><div className={`file-layout${layout.shown && sessionId ? " has-preview" : ""}${full ? " preview-full" : ""}`} ref={frame} style={{ "--preview-width": `${width}px` } as React.CSSProperties}>
    <div className="file-layout-main">{children}</div>
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
        }}>{layout.tabs.map(tab => <div className={`file-tab${layout.active === tab.key ? " active" : ""}`} key={tab.key}><button role="tab" tabIndex={layout.active === tab.key ? 0 : -1} aria-selected={layout.active === tab.key} title={label(tab)} onClick={() => { ++intent.current; update(l => ({ ...l, active: tab.key })); }}>{tab.key === "tree" ? <FolderOpen size={14} /> : tab.kind === "start" ? <Compass size={14} /> : tab.kind === "terminal" ? <TerminalSquare size={14} /> : tab.kind === "browser" ? <Globe size={14} /> : <TabIcon name={tab.name} />}<span>{label(tab)}</span></button><button aria-label={`${t.close} ${tab.name}`} onClick={() => close(tab.key)}><X size={12} /></button></div>)}</div><button aria-label={toolsText.newTab} title={toolsText.newTab} onClick={start}><Plus size={16} /></button><button aria-label={layout.expanded ? t.collapse : t.expand} title={layout.expanded ? t.collapse : t.expand} onClick={() => update(l => ({ ...l, expanded: !l.expanded }))}>{layout.expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button><button aria-label={t.close} title={t.close} onClick={() => { ++intent.current; update(l => ({ ...l, shown: false })); }}><X size={16} /></button></div>
        {toolError ? <div className="tool-error" role="alert">{toolError}</div> : null}
        {active?.key === "start" ? <StartPanel open={createTool} /> : active?.kind === "terminal" ? <TerminalPanel key={`${sessionId}:${active.key}`} sessionId={sessionId} tab={active} restart={() => { void close(active.key).then(closed => { if (closed !== false) createTool("terminal"); }); }} /> : active?.kind === "browser" ? <BrowserPanel key={`${sessionId}:${active.key}`} sessionId={sessionId} tab={active} /> : active?.key === "tree" ? <FileTree key={sessionId} session={sessionId} state={readingState(sessionId, "tree")} open={(ref, name) => void open(ref, name)} /> : active?.ref ? <DocumentViewer key={`${sessionId}:${active.key}`} file={active.ref} name={active.name} state={readingState(sessionId, active.key)} resolved={info => canonicalize(active.ref!, info)} /> : null}
      </aside>
    </> : null}
  </div></Context.Provider>;
}
