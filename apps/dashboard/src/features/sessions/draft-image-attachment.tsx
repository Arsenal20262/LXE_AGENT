import { useState } from "react";
import { Image as ImageIcon, LoaderCircle, X } from "lucide-react";
import type { DesktopDraftAttachmentPayload } from "@lxe/desktop-protocol";
import { queryError, useDraftImagePreviewQuery } from "../../api/queries";
import { useUiText } from "../../shared/i18n";
import { DraftImagePreview } from "./sent-attachments";

export function DraftImageAttachment({ attachment, onRemove }: {
  attachment: DesktopDraftAttachmentPayload; onRemove?: (id: string) => void;
}) {
  const t = useUiText();
  const [expanded, setExpanded] = useState(false);
  const preview = useDraftImagePreviewQuery(attachment.attachment_id, "thumbnail", !attachment.preview_data_url);
  const url = attachment.preview_data_url || preview.data?.data_url;
  const error = queryError(preview.error);
  return <>
    <span className="input-attachment-chip input-attachment-image">
      <button className="turn-file-chip" type="button" title={attachment.name} aria-label={attachment.name}
        aria-busy={preview.isFetching} onClick={() => setExpanded(true)}>
        {url ? <img className="input-attachment-preview" src={url} alt={attachment.name} />
          : preview.isFetching ? <LoaderCircle className="conversation-spinner" size={18} /> : <ImageIcon size={18} />}
      </button>
      {onRemove ? <button type="button" className="input-attachment-remove" aria-label={t.conversation.removeAttachment(attachment.name)}
        onClick={() => onRemove(attachment.attachment_id)}><X size={12} /></button> : null}
    </span>
    {error ? <span className="turn-file-error" role="alert">{attachment.name}: {error}</span> : null}
    {expanded ? <DraftImagePreview attachment={attachment} onClose={() => setExpanded(false)} /> : null}
  </>;
}
