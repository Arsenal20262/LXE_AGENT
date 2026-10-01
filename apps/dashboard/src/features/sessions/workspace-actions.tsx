import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import { queryError } from "../../api/queries";
import { useUiText } from "../../shared/i18n";
import { useDialogFocus } from "../../shared/ui/use-dialog-focus";
import type { SessionWorkspace } from "./workspace-state";

export function WorkspaceActionsMenu({ anchor, onClose, onRename }: {
  anchor: HTMLElement; onClose: (restoreFocus?: boolean) => void; onRename: () => void;
}) {
  const t = useUiText();
  const ref = useRef<HTMLDivElement>(null);
  const rect = anchor.getBoundingClientRect();
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && !anchor.contains(event.target)) onClose(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchor, onClose]);
  return createPortal(<div className="session-actions-menu" ref={ref} role="menu" aria-label={t.workspaces.actions}
    style={{ width: 150, left: Math.max(8, Math.min(innerWidth - 158, rect.right - 150)), top: Math.max(8, Math.min(innerHeight - 50, rect.bottom + 5)) }}
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) { event.preventDefault(); ref.current?.querySelector("button")?.focus(); }
      if (event.key === "Tab") onClose(false);
    }}>
    <button role="menuitem" type="button" onClick={onRename}><Pencil size={13} />{t.workspaces.rename}</button>
  </div>, document.body);
}

export function WorkspaceRenameDialog({ workspace, onClose, onRename }: {
  workspace: SessionWorkspace; onClose: () => void; onRename: (directory: string, name: string) => Promise<void>;
}) {
  const t = useUiText();
  const [name, setName] = useState(workspace.display_name ?? "");
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const close = () => { if (!saving.current) onClose(); };
  const ref = useDialogFocus<HTMLFormElement>(true, close);
  return createPortal(<div className="session-delete-backdrop">
    <form className="session-delete-dialog workspace-rename-dialog" ref={ref} role="dialog" aria-modal="true"
      aria-labelledby="workspace-rename-title" tabIndex={-1} onSubmit={event => {
        event.preventDefault();
        if (saving.current) return;
        saving.current = true; setPending(true); setError("");
        void onRename(workspace.directory, name).then(onClose).catch(cause => setError(queryError(cause)))
          .finally(() => { saving.current = false; setPending(false); });
      }}>
      <h2 id="workspace-rename-title">{t.workspaces.rename}</h2>
      <p className="workspace-rename-path">{workspace.directory}</p>
      <label htmlFor="workspace-display-name">{t.workspaces.name}</label>
      <input id="workspace-display-name" value={name} disabled={pending} autoComplete="off"
        aria-describedby="workspace-name-help" onChange={event => setName(event.target.value)} />
      <p id="workspace-name-help">{t.workspaces.nameHelp}</p>
      {error ? <p className="session-delete-error" role="alert">{error}</p> : null}
      <footer>
        <button type="button" disabled={pending} onClick={close}>{t.workspaces.cancel}</button>
        <button type="submit" disabled={pending}>{pending ? t.workspaces.saving : t.workspaces.save}</button>
      </footer>
    </form>
  </div>, document.body);
}
