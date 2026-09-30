import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ExternalLink, FolderOpen, LoaderCircle } from "lucide-react";
import type { FileApplication, SessionFileRef } from "@lxe/desktop-protocol";
import { useUiText } from "../../shared/i18n";
import { errorText, filesApi } from "./api";
export function OpenFileButton({ file }: { file: SessionFileRef }) {
  const t = useUiText().filePreview;
  const [apps, setApps] = useState<FileApplication[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false), [menu, setMenu] = useState(false), [loaded, setLoaded] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const anchor = useRef<HTMLDivElement>(null), generation = useRef(0), locked = useRef(false);
  const key = JSON.stringify(file);
  const load = async () => {
    const id = ++generation.current;
    try { const value = await filesApi().call({ operation: "applications", input: { ref: file } }); if (generation.current === id) { setApps(value); setError(""); } }
    catch (error) { if (generation.current === id) setError(errorText(error)); }
    finally { if (generation.current === id) setLoaded(true); }
  };
  useEffect(() => {
    setApps([]); setLoaded(false); setMenu(false);
    if (typeof IntersectionObserver === "undefined") { void load(); return () => { generation.current++; }; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); } }, { rootMargin: "160px" });
    if (anchor.current) observer.observe(anchor.current);
    return () => { observer.disconnect(); generation.current++; };
  }, [key]);
  useLayoutEffect(() => {
    if (!menu) return;
    const place = () => {
      const box = anchor.current?.getBoundingClientRect(), panel = menuRef.current?.getBoundingClientRect();
      if (box && panel) setPosition({ left: Math.max(8, Math.min(innerWidth - panel.width - 8, box.right - panel.width)), top: box.bottom + panel.height + 8 > innerHeight ? Math.max(8, box.top - panel.height - 5) : box.bottom + 5 });
    };
    place(); window.addEventListener("resize", place); document.addEventListener("scroll", place, true);
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { window.removeEventListener("resize", place); document.removeEventListener("scroll", place, true); };
  }, [menu, apps, error]);
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => { if (!anchor.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(false); toggle.current?.focus(); } };
    document.addEventListener("pointerdown", down); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const preferred = apps.find(app => app.default);
  const act = async (application?: string, reveal = false) => {
    if (locked.current) return; locked.current = true; setBusy(true); setError(""); setMenu(false);
    try { await filesApi().call({ operation: "open", input: { ref: file, ...(application ? { application } : {}), ...(reveal ? { reveal } : {}) } }); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); locked.current = false; }
  };
  return <div className="file-open-control" ref={anchor}>
    <div className="file-open-split">
      <button type="button" disabled={busy || !loaded} title={preferred ? `${t.open} · ${preferred.name}` : loaded && !error ? t.reveal : t.open} aria-label={preferred || error ? t.open : t.reveal} onClick={() => void act(preferred?.default ? undefined : preferred?.id, !preferred && loaded && !error)}>
        {busy ? <LoaderCircle className="conversation-spinner" size={15} /> : preferred?.icon ? <img src={preferred.icon} alt={preferred.name} /> : !preferred && loaded && !error ? <FolderOpen size={15} /> : <ExternalLink size={15} />}
      </button>
      <button ref={toggle} type="button" disabled={busy} aria-label={t.apps} aria-haspopup="menu" aria-expanded={menu} onClick={() => { setMenu(!menu); if (!menu) void load(); }}><ChevronDown size={12} /></button>
    </div>
    {menu ? createPortal(<div className="file-open-menu" role="menu" ref={menuRef} style={{ position: "fixed", ...position }} onKeyDown={e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
        const index = items.indexOf(document.activeElement as HTMLButtonElement); items[(index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      } else if (e.key === "Tab") setMenu(false);
    }}>
      {apps.map(app => <button type="button" role="menuitem" key={app.id} onClick={() => void act(app.id)}>{app.icon ? <img src={app.icon} alt="" /> : <ExternalLink size={15} />}<span>{app.name}{app.default ? ` · ${t.defaultApp}` : ""}</span></button>)}
      {error ? <div role="alert">{error}</div> : null}
      <button type="button" role="menuitem" onClick={() => void act(undefined, true)}><FolderOpen size={15} />{t.reveal}</button>
    </div>, document.body) : null}
    {error && !menu ? <span className="file-open-error" role="alert" title={error}>{error}</span> : null}
  </div>;
}
