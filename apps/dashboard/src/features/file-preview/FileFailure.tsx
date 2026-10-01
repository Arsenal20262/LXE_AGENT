import { useState } from "react";
import { File, FileText, FileSpreadsheet, Image } from "lucide-react";
import type { FileFailure, SessionFileRef } from "@lxe/desktop-protocol";
import { useUiText } from "../../shared/i18n";
import { useFileApplications } from "./application-state";
export function FileTypeIcon({ name, size = 36 }: { name: string; size?: number }) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const Icon = /^(xlsx?|csv|tsv)$/.test(extension) ? FileSpreadsheet : /^(png|jpg|jpeg|gif|svg|bmp|webp)$/.test(extension) ? Image : /^(docx?|pdf|txt|md)$/.test(extension) ? FileText : File;
  return <Icon size={size} aria-hidden="true" />;
}
export function ErrorDetails({ failure }: { failure: FileFailure }) {
  const t = useUiText().filePreview, [copied, setCopied] = useState(false), [copyError, setCopyError] = useState("");
  return <details className="file-error-details"><summary>{t.errorDetails}</summary><pre>{failure.operation}: {failure.diagnostic}</pre><button type="button" onClick={() => { void navigator.clipboard.writeText(`${failure.operation}: ${failure.diagnostic}`).then(() => { setCopied(true); setCopyError(""); }, error => setCopyError(String(error))); }}>{copied ? t.copied : t.copyError}</button>{copyError ? <pre>{copyError}</pre> : null}</details>;
}
export function useFailureSummary(failure: FileFailure) {
  const t = useUiText().filePreview;
  return failure.kind === "not_found" ? t.missingDescription : failure.kind === "permission_denied" ? t.denied : failure.kind === "invalid_reference" ? t.invalidFile : failure.operation === "applications" ? t.appsFailed : failure.operation === "open" ? t.openFailed : failure.operation === "reveal" ? t.revealFailed : ["stat", "read", "read_text"].includes(failure.operation) ? t.readFailed : t.previewFailed;
}
export function FileFailurePanel({ failure, name, retry }: { failure: FileFailure; name: string; retry(): void }) {
  const t = useUiText().filePreview, summary = useFailureSummary(failure);
  return <div className="file-failure-panel" role="status"><FileTypeIcon name={name} /><p>{summary}</p><button type="button" onClick={retry}>{failure.kind === "not_found" ? t.recheck : t.retry}</button><ErrorDetails failure={failure} /></div>;
}
export function FileAvailabilityBadge({ file, history = false }: { file: SessionFileRef; history?: boolean }) {
  const value = useFileApplications(file), t = useUiText().filePreview;
  return value.sourceError?.kind === "not_found" ? <span className="file-availability-badge">{history || value.metadata?.source === "history" ? t.missingSource : t.fileMissing}</span> : null;
}
