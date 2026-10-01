import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen, RefreshCw } from "lucide-react";
import type { DirectoryPage, SessionFileRef } from "@lxe/desktop-protocol";
import { useUiText } from "../../shared/i18n";
import { filesApi, errorText } from "./api";
import type { ReadingState } from "./reading-state";
function Directory({ session, path, open, refresh, state, rootChanged }: { session: string; path: string; open(file: SessionFileRef, name: string): void; refresh: number; state: ReadingState; rootChanged(root: string): void }) {
  const t = useUiText().filePreview, generation = useRef(0), pending = useRef(false);
  const [page, setPage] = useState<DirectoryPage>(() => state.tree.pages.get(path)!), [error, setError] = useState(""), [busy, setBusy] = useState(false), [, rerender] = useState(0);
  const pageNow = useRef(page); pageNow.current = page;
  const apply = (value: DirectoryPage) => {
    const children = new Set(value.entries.map(e => e.path));
    for (const key of [...state.tree.expanded]) {
      const child = key.slice(path ? path.length + 1 : 0).split("/")[0], full = path ? `${path}/${child}` : child;
      if ((!path || key.startsWith(path + "/")) && !children.has(full!)) { state.tree.expanded.delete(key); state.tree.pages.delete(key); }
    }
    state.tree.pages.set(path, value); pageNow.current = value; setPage(value);
    if (value.rootPath) { state.tree.root = value.rootPath; rootChanged(value.rootPath); }
  };
  const reload = async (append = false) => {
    if (pending.current) return; pending.current = true; setBusy(true);
    const current = generation.current;
    try {
      const existing = pageNow.current, count = append ? 1 : Math.max(1, Math.ceil((existing?.entries.length ?? 0) / 200));
      let combined: DirectoryPage | undefined = append ? existing : undefined;
      for (let i = 0; i < count; i++) {
        const next = await filesApi().call({ operation: "list", input: { session_id: session, path, offset: combined?.next ?? 0 } });
        if (current !== generation.current) return;
        if (combined?.version && next.version && combined.version !== next.version) throw new Error("Directory changed while reading pages; refresh again");
        combined = { ...next, entries: [...(combined?.entries ?? []), ...next.entries] };
        if (next.next == null) break;
      }
      if (combined) apply(combined); setError("");
    } catch (error) { if (current === generation.current) setError(errorText(error)); }
    finally { if (current === generation.current) { pending.current = false; setBusy(false); } }
  };
  useEffect(() => {
    ++generation.current; let active = true, version = "", checking = false;
    const request_id = crypto.randomUUID();
    void reload();
    void filesApi().call({ operation: "watch-directory", input: { session_id: session, path, request_id } }).then(value => { if (active) version = value.version; else void filesApi().call({ operation: "release", input: { request_id } }); }, error => { if (active) setError(errorText(error)); });
    const check = async () => {
      if (!active || checking || !version) return; checking = true;
      try { const next = await filesApi().call({ operation: "directory-version", input: { request_id } }); if (active && version !== next.version && !pending.current) { version = next.version; await reload(); } }
      catch (error) { if (active) setError(errorText(error)); } finally { checking = false; }
    };
    const focus = () => { void reload(); }, timer = setInterval(() => { if (!document.hidden) void check(); }, 1500);
    window.addEventListener("focus", focus);
    return () => { active = false; generation.current++; pending.current = false; clearInterval(timer); window.removeEventListener("focus", focus); void filesApi().call({ operation: "release", input: { request_id } }).catch(() => {}); };
  }, [session, path, refresh]);
  return <ul role="group" className="file-tree-level">{page?.entries.map(entry => <li key={entry.path}>
    <button type="button" disabled={entry.kind === "other"} title={entry.path} aria-expanded={entry.kind === "directory" ? state.tree.expanded.has(entry.path) : undefined} onClick={() => {
      if (entry.kind !== "directory") { open({ session_id: session, kind: "workspace", path: entry.path }, entry.name); return; }
      if (state.tree.expanded.has(entry.path)) state.tree.expanded.delete(entry.path); else state.tree.expanded.add(entry.path); rerender(n => n + 1);
    }}>{entry.kind === "directory" ? <><ChevronRight size={12} style={{ transform: state.tree.expanded.has(entry.path) ? "rotate(90deg)" : undefined }} /><Folder size={15} /></> : <File size={15} />}<span>{entry.name}</span></button>
    {entry.kind === "directory" && state.tree.expanded.has(entry.path) ? <Directory session={session} path={entry.path} open={open} refresh={refresh} state={state} rootChanged={rootChanged} /> : null}
  </li>)}{busy ? <li className={!page ? "file-preview-loading" : undefined} role="status">{t.loading}</li> : null}{!busy && page?.entries.length === 0 ? <li>{t.empty}</li> : null}{error ? <li role="alert">{error}<button onClick={() => void reload()}>{t.retry}</button></li> : null}{page?.next != null ? <li><button onClick={() => void reload(true)} disabled={busy}>{t.more}</button></li> : null}</ul>;
}
export function FileTree({ session, open, state }: { session: string; open(file: SessionFileRef, name: string): void; state: ReadingState }) {
  const [refresh, setRefresh] = useState(0), [root, setRoot] = useState(state.tree.root), [error, setError] = useState(""), t = useUiText().filePreview;
  const scroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (scroll.current) scroll.current.scrollTop = state.scroll.tree?.top ?? 0; }, []);
  return <section className="file-tree"><header className="file-document-toolbar"><span className="file-display-path" title={root}>{root || t.files}</span><button title={t.workspaceOpen} aria-label={t.workspaceOpen} onClick={() => { void filesApi().call({ operation: "open-workspace", input: { session_id: session } }).then(() => setError(""), error => setError(errorText(error))); }}><FolderOpen size={15} /></button><button data-preview-refresh title={t.refresh} aria-label={t.refresh} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={15} /></button></header>{error ? <pre className="file-preview-error" role="alert">{error}</pre> : null}<div className="file-tree-scroll" ref={scroll} onScroll={e => { state.scroll.tree = { top: e.currentTarget.scrollTop, left: 0 }; }}><Directory session={session} path="" open={open} refresh={refresh} state={state} rootChanged={setRoot} /></div></section>;
}
