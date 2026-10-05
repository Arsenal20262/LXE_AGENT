// Adapted from dsh ui-input-trigger/MenuView and ui-reference (MIT).
// Source and license: THIRD_PARTY_NOTICES.md, public/legal/composer/DeepSeek-MIT.txt.
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, File as FileIcon, Folder } from "lucide-react";
import { useUiText } from "../../shared/i18n";

export type ComposerCandidate = { name: string; description?: string; path?: string; kind: "file" | "directory" | "skill" };

export function ComposerCandidateMenu(props: {
  trigger: "@" | "/"; query: string; drilled: boolean; items: ComposerCandidate[];
  busy: boolean; selected: number; onSelect(index: number): void;
  onChoose(item: ComposerCandidate, drill?: boolean): void;
}) {
  const t = useUiText().composerReferences;
  const shell = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState(400), [overflowBelow, setOverflowBelow] = useState(false);
  const hasCrumbs = props.trigger === "@" && props.drilled && props.query.includes("/");
  const parts = hasCrumbs ? props.query.slice(0, props.query.lastIndexOf("/")).split("/").filter(Boolean) : [];
  const overflow = () => {
    const el = viewport.current;
    setOverflowBelow(!!el && el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  };
  useLayoutEffect(() => {
    const fit = () => setMaxHeight(Math.min(400, Math.max(0, (shell.current?.getBoundingClientRect().bottom ?? 84) - 84)));
    fit();
    const observer = new ResizeObserver(fit);
    if (shell.current?.parentElement) observer.observe(shell.current.parentElement);
    window.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); window.removeEventListener("scroll", fit, true); };
  }, []);
  useLayoutEffect(() => {
    const list = viewport.current, active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && active) {
      // Scroll only this menu; opening a menu must not move the chat viewport.
      const row = active.getBoundingClientRect(), bounds = list.getBoundingClientRect();
      if (row.top < bounds.top) list.scrollTop += row.top - bounds.top;
      else if (row.bottom > bounds.bottom) list.scrollTop += row.bottom - bounds.bottom;
    }
    overflow();
  }, [props.selected, props.items, props.busy, maxHeight, hasCrumbs]);
  return <div className="composer-candidates" ref={shell} style={{ maxHeight }} data-overflow-below={overflowBelow || undefined} onMouseDown={e => e.preventDefault()}>
    {hasCrumbs ? <nav className="composer-crumbs" aria-label={t.navigation}>
      {["", ...parts].map((name, i) => <Fragment key={i}>
        {i > 0 ? <ChevronRight size={12} aria-hidden /> : null}
        <button type="button" disabled={i === parts.length} aria-current={i === parts.length ? "location" : undefined} title={name || t.workspace}
          onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); props.onChoose({ kind: "directory", name, path: parts.slice(0, i).join("/") }, true); }}>{name || t.workspace}</button>
      </Fragment>)}
    </nav> : null}
    <div className="composer-candidate-viewport" ref={viewport} id="composer-candidates" role="listbox" aria-label={props.trigger === "@" ? t.files : t.skills} aria-busy={props.busy} onScroll={overflow}>
      {props.items.length || props.busy ? <div className="composer-candidate-heading" role="presentation">{props.trigger === "@" ? t.files : t.skills}</div> : null}
      {props.busy && !props.items.length ? <div role="status" aria-label={t.loading} className="composer-candidate-status composer-candidate-loading"><span /><span /></div> : null}
      {props.items.map((item, i) => {
        const Icon = item.kind === "directory" ? Folder : FileIcon;
        const parent = item.path?.slice(0, Math.max(0, item.path.lastIndexOf("/")));
        const description = item.kind === "skill" ? item.description : hasCrumbs ? undefined : parent;
        const name = item.name + (item.kind === "directory" ? "/" : "");
        return <div id={"composer-candidate-" + i} key={item.path ?? item.name} role="option" aria-selected={i === props.selected} className="composer-candidate"
          onMouseMove={() => { if (i !== props.selected) props.onSelect(i); }}
          onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); if (!props.busy) props.onChoose(item); }}>
          {item.kind !== "skill" ? <Icon size={14} aria-hidden /> : null}
          <span className="composer-candidate-name" title={name}>{name}</span>
          {description ? <span className="composer-candidate-description" title={description}>{description}</span> : null}
          {item.kind === "directory" ? <span className="composer-candidate-trailing">
            <span className="composer-drill-hint" aria-hidden>{t.browse}</span><kbd aria-hidden>Tab</kbd>
            <button type="button" tabIndex={-1} aria-label={t.enter(item.name)} onMouseDown={e => { e.stopPropagation(); if (e.button !== 0) return; e.preventDefault(); if (!props.busy) props.onChoose(item, true); }}><ChevronRight size={12} /></button>
          </span> : null}
        </div>;
      })}
      {!props.busy && !props.items.length ? <div className="composer-candidate-status">{t.empty}</div> : null}
    </div>
  </div>;
}
