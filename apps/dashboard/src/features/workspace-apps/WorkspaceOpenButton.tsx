import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ExternalLink, FolderOpen, LoaderCircle } from 'lucide-react';
import { useUiText } from '../../shared/i18n';
import { workspaceApplications as state } from './state';
import './workspace-open.css';
function Icon({ icon }: { icon: string | null }) {
  const [failed, setFailed] = useState(false);
  return icon && !failed ? <img src={icon} alt="" onError={() => setFailed(true)} /> : <ExternalLink size={15} />;
}
export function WorkspaceOpenButton({ directory }: { directory: string }) {
  const t = useUiText(), copy = t.workspaceOpen;
  const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot);
  const [menu, setMenu] = useState(false), [actionError, setActionError] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const anchor = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null), arrow = useRef<HTMLButtonElement>(null), primary = useRef<HTMLButtonElement>(null);
  const current = useRef(directory); current.current = directory;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; void state.load(); return () => { alive.current = false; }; }, []);
  useEffect(() => { setMenu(false); setActionError(''); }, [directory]);
  const platform = window.lxe?.desktop?.platform;
  const system = { id: platform === 'darwin' ? 'finder' : platform === 'win32' ? 'explorer' : 'system', name: platform === 'darwin' ? 'Finder' : platform === 'win32' ? copy.explorer : copy.system, icon: null };
  const apps = snapshot.error || !snapshot.apps.length ? [system] : snapshot.apps;
  const preferred = apps.find(app => app.id === snapshot.choice) ?? apps.find(app => app.id === system.id) ?? apps[0]!;
  const error = actionError || snapshot.error, hasMenu = apps.length > 1 || !!error;
  const name = (app: typeof preferred) => app.id === 'explorer' ? copy.explorer : app.id === 'terminal' ? copy.terminal : app.name;
  const close = (focus = true) => { setMenu(false); if (focus) (arrow.current ?? primary.current)?.focus(); };
  const act = async (id: string, remember: boolean) => {
    const path = directory; close(); setActionError('');
    try { await state.open(path, id, remember); }
    catch (cause) { if (alive.current && current.current === path) { setActionError(cause instanceof Error ? cause.message : String(cause)); setMenu(true); } }
  };
  useLayoutEffect(() => {
    if (!menu) return;
    const place = () => {
      const box = anchor.current?.getBoundingClientRect(), pop = popup.current?.getBoundingClientRect();
      if (!box || !pop) return;
      setPosition({ left: Math.max(8, Math.min(box.right - pop.width, innerWidth - pop.width - 8)), top: box.bottom + pop.height + 8 > innerHeight ? Math.max(8, box.top - pop.height - 5) : box.bottom + 5 });
    };
    place(); window.addEventListener('resize', place); document.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [menu, error, apps.length]);
  useEffect(() => {
    if (!menu) return;
    popup.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const pointer = (e: PointerEvent) => { if (!anchor.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) close(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key, true); };
  }, [menu]);
  return <div ref={anchor} className="workspace-open-control">
    <div className="workspace-open-split">
      <button ref={primary} type="button" disabled={!directory || snapshot.busy} title={`${copy.openIn(name(preferred))}\n${directory}`} aria-label={copy.openIn(name(preferred))} onClick={() => void act(preferred.id, false)}>
        {snapshot.busy ? <LoaderCircle className="conversation-spinner" size={15} /> : preferred.icon ? <Icon key={preferred.icon} icon={preferred.icon} /> : <FolderOpen size={15} />}
      </button>
      {hasMenu ? <button ref={arrow} type="button" disabled={!directory || snapshot.busy} title={copy.more} aria-label={copy.more} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><ChevronDown size={12} /></button> : null}
    </div>
    {menu ? createPortal(<div className="workspace-open-menu" role="menu" aria-label={copy.more} ref={popup} style={{ position: 'fixed', ...position }}
      onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget) && !anchor.current?.contains(e.relatedTarget)) close(false); }}
      onKeyDown={e => {
        if (!['ArrowDown','ArrowUp','Home','End'].includes(e.key)) return;
        e.preventDefault(); const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}>
      {apps.map(app => <button type="button" role="menuitem" disabled={snapshot.busy} key={app.id} title={name(app)} onClick={() => void act(app.id, true)}><Icon key={app.icon} icon={app.icon} /><span>{name(app)}{app.id === preferred.id ? ` (${t.filePreview.defaultApp})` : ''}</span></button>)}
      {error ? <div className="workspace-open-failure" role="alert"><pre>{error}</pre><button type="button" disabled={snapshot.loading || snapshot.busy} onClick={() => { setActionError(''); void state.load(true); }}>{t.filePreview.retry}</button></div> : null}
    </div>, document.body) : null}
  </div>;
}
