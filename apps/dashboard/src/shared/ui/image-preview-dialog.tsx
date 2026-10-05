import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, X } from "lucide-react";
import type { DesktopInputAttachmentPayload } from "@lxe/desktop-protocol";
import { useUiText } from "../i18n";
import { useDialogFocus } from "./use-dialog-focus";

export function ImagePreviewDialog({ attachment, url = "", error = "", loading = false, note, children, onClose }: {
  attachment: Pick<DesktopInputAttachmentPayload, "name">; url?: string; error?: string; children?: ReactNode; loading?: boolean; note?: string; onClose(): void;
}) {
  const t = useUiText();
  const ref = useDialogFocus<HTMLDivElement>(true, () => { if (!document.querySelector('[role="menu"]')) onClose(); });
  return createPortal(<div className="sent-image-backdrop" onClick={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div className={`sent-image-dialog${children ? " file-image-dialog" : ""}`} role="dialog" aria-modal="true" aria-label={attachment.name} ref={ref} tabIndex={-1}>
      <header><span>{attachment.name}</span><button type="button" aria-label={t.detailModal.close} onClick={onClose}><X size={20} /></button></header>
      {children}
      {note ? <p className="image-view-note">{note}</p> : null}
      {url ? <img src={url} alt={attachment.name} aria-busy={loading} /> : null}
      {loading ? <LoaderCircle className="conversation-spinner" aria-label={t.sessionDetail.loading} size={20} /> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </div>, document.body);
}

