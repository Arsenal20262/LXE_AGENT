import "./windows-titlebar.css";
import { useEffect, useRef, useState } from "react";
import type { DesktopTitlebarAction, DesktopTitlebarMenuRequest } from "@lxe/desktop-protocol";
import type { Language } from "../shared/i18n";

/** Caption buttons share the current editor's focus with a native menu. */
export function WindowsTitlebar({ language, onAction }: {
  language: Language;
  onAction: (action: DesktopTitlebarAction) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const restore = useRef<() => void>(() => {});
  const pending = useRef(false);
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.closest(".windows-titlebar-menu")) return;
      const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
      if (!input && !target.isContentEditable) return;
      const start = input?.selectionStart, end = input?.selectionEnd, direction = input?.selectionDirection;
      const selection = document.getSelection();
      const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
      restore.current = () => {
        if (!target.isConnected) return;
        target.focus({ preventScroll: true });
        if (input && start != null && end != null) input.setSelectionRange(start, end, direction ?? undefined);
        else if (selection && ranges.length) {
          selection.removeAllRanges();
          for (const range of ranges) selection.addRange(range);
        }
      };
    };
    document.addEventListener("blur", remember, true);
    return () => document.removeEventListener("blur", remember, true);
  }, []);
  const show = async (menu: DesktopTitlebarMenuRequest["menu"], index: number) => {
    const api = window.lxe?.desktop.showTitlebarMenu;
    const button = buttons.current[index];
    if (!api || !button || pending.current) return;
    pending.current = true;
    setOpen(menu); setError("");
    const keyboard = document.activeElement === button;
    if (keyboard) restore.current();
    const rect = button.getBoundingClientRect();
    try {
      const action = await api({ menu, language, x: rect.left, y: rect.bottom });
      // A dismissed keyboard menu returns to the menubar; an edit keeps the editor active.
      if (!action && keyboard && menu === "application") button.focus();
      onAction(action);
    } catch (cause) { setError(String(cause)); }
    finally { pending.current = false; setOpen(null); }
  };
  return <div className="windows-titlebar-menu">
    <div role="menubar" aria-label={language === "zh" ? "应用菜单" : "Application menu"}>
      {(["application", "edit"] as const).map((menu, index) => <button
        key={menu} ref={element => { buttons.current[index] = element; }}
        type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open === menu}
        tabIndex={index === 0 ? 0 : -1}
        onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()}
        onClick={() => void show(menu, index)}
        onKeyDown={event => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const next = buttons.current[index === 0 ? 1 : 0];
            event.currentTarget.tabIndex = -1;
            if (next) { next.tabIndex = 0; next.focus(); }
          } else if (event.key === "ArrowDown") { event.preventDefault(); void show(menu, index); }
          else if (event.key === "Escape") { event.preventDefault(); restore.current(); }
        }}
      >{language === "zh" ? (index === 0 ? "应用" : "编辑") : (index === 0 ? "Application" : "Edit")}</button>)}
    </div>
    {error ? <div className="windows-titlebar-error" role="alert" onClick={() => setError("")}>{error}</div> : null}
  </div>;
}
