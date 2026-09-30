import { useEffect, useRef, useState } from "react";
import { ChevronRight, File, Folder } from "lucide-react";
import type { DirectoryPage, SessionFileRef } from "@lxe/desktop-protocol";
import { useUiText } from "../../shared/i18n";
import { filesApi, errorText } from "./api";
function Directory({ session, path, open, refresh }: { session: string; path: string; open(file: SessionFileRef, name: string): void; refresh: number }) {
  const t = useUiText().filePreview, generation = useRef(0);
  const [page, setPage] = useState<DirectoryPage>(), [expanded, setExpanded] = useState<Set<string>>(() => new Set()), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { ++generation.current; let active = true; setPage(undefined); setBusy(true); setError(""); void filesApi().call({ operation: "list", input: { session_id: session, path } }).then(value => { if (active) setPage(value); }, error => { if (active) setError(errorText(error)); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; generation.current++; }; }, [session, path, refresh]);
  const more = async () => {
    if (page?.next == null || busy) return; const current = generation.current; setBusy(true);
    try { const next = await filesApi().call({ operation: "list", input: { session_id: session, path, offset: page.next } }); if (current !== generation.current) return; setPage({ entries: [...page.entries, ...next.entries], next: next.next }); setError(""); } catch (error) { if (current === generation.current) setError(errorText(error)); } finally { if (current === generation.current) setBusy(false); }
  };
  return <ul role="group" className="file-tree-level">{page?.entries.map(entry => <li key={entry.path}>
    <button type="button" disabled={entry.kind === "other"} title={entry.path} aria-expanded={entry.kind === "directory" ? expanded.has(entry.path) : undefined} onClick={() => entry.kind === "directory" ? setExpanded(current => { const next = new Set(current); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next; }) : open({ session_id: session, kind: "workspace", path: entry.path }, entry.name)}>
      {entry.kind === "directory" ? <><ChevronRight size={12} style={{ transform: expanded.has(entry.path) ? "rotate(90deg)" : undefined }} /><Folder size={15} /></> : <File size={15} />}<span>{entry.name}</span>
    </button>
    {entry.kind === "directory" && expanded.has(entry.path) ? <Directory session={session} path={entry.path} open={open} refresh={refresh} /> : null}
  </li>)}{busy ? <li role="status">{t.loading}</li> : null}{!busy && page?.entries.length === 0 ? <li>{t.empty}</li> : null}{error ? <li role="alert">{error}</li> : null}{page?.next != null ? <li><button onClick={() => void more()} disabled={busy}>{t.more}</button></li> : null}</ul>;
}
export function FileTree({ session, open }: { session: string; open(file: SessionFileRef, name: string): void }) {
  const [refresh, setRefresh] = useState(0), t = useUiText().filePreview;
  return <section className="file-tree"><header className="file-document-toolbar"><span>{t.files}</span><button title={t.refresh} aria-label={t.refresh} onClick={() => setRefresh(n => n + 1)}>↻</button></header><div className="file-tree-scroll"><Directory session={session} path="" open={open} refresh={refresh} /></div></section>;
}
