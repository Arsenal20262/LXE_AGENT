import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Shield, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PendingApproval, PermissionMode } from "@lxe/desktop-protocol";
import { callDashboard } from "../../api/client";
import { useUiText } from "../../shared/i18n";
import { useDialogFocus } from "../../shared/ui/use-dialog-focus";
import "./permissions.css";

const modes = ["read-only", "workspace-write", "danger-full-access"] as const;
const icons = { "read-only": ShieldCheck, "workspace-write": Shield, "danger-full-access": ShieldAlert };
const labels = { "read-only": "Read Only", "workspace-write": "Workspace Write", "danger-full-access": "Full access" };

/** Mount by session id: responses for a previous session only update that session's query. */
export function PermissionPicker({ sessionId, initialMode, ready }: { sessionId: string; initialMode: PermissionMode; ready: boolean }) {
  const t = useUiText().permissions;
  const queryClient = useQueryClient();
  const queryKey = ["sessions", "permission", sessionId] as const;
  const query = useQuery({ queryKey, queryFn: async ({ signal }) => {
    const detail = await callDashboard({ operation: "sessions.detail", input: { session_id: sessionId, message_limit: 1 } });
    signal.throwIfAborted();
    return detail.session.permission_mode;
  }, enabled: ready && Boolean(sessionId), retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: "always", refetchInterval: 5_000 });
  useEffect(() => { if (ready && sessionId) void query.refetch(); }, [ready, sessionId]);
  const current = query.data ?? initialMode;
  const Icon = icons[current];
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const busy = useRef(false), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", pointer); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key); };
  }, [open]);
  const save = async (mode: PermissionMode) => {
    if (!ready || busy.current) return;
    busy.current = true; setSaving(true); setOpen(false); setError("");
    try {
      const result = await callDashboard({ operation: "sessions.permission.set", input: { session_id: sessionId, permission_mode: mode } });
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData(queryKey, result.permission_mode);
      setConfirm(false);
      // Reconcile other windows, including a competing change committed after this response.
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busy.current = false; setSaving(false); }
  };
  const descriptions = { "read-only": t.readOnly, "workspace-write": t.workspaceWrite, "danger-full-access": t.fullAccess };
  return <div className="conversation-model-picker permission-picker" ref={root}>
    <button type="button" ref={trigger} className="conversation-model-trigger" disabled={!ready || saving || !sessionId}
      aria-label={`${t.mode}: ${labels[current]}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon size={15} /><span>{labels[current]}</span><ChevronDown size={12} />
    </button>
    {open ? <div role="menu" aria-label={t.mode} className="conversation-model-menu permission-menu">
      {modes.map(mode => { const ItemIcon = icons[mode]; return <button type="button" key={mode} role="menuitemradio" aria-checked={mode === current}
        className="conversation-model-option" onClick={() => {
          setOpen(false);
          if (mode === current) return;
          if (mode === "danger-full-access") { setError(""); setConfirm(true); } else void save(mode);
        }}>
        <ItemIcon size={18} /><span className="conversation-model-option-copy"><strong>{labels[mode]}</strong><span>{descriptions[mode]}</span></span>
        {mode === current ? <Check size={15} /> : null}
      </button>; })}
    </div> : null}
    {!confirm && (error || query.error) ? <p className="permission-error" role="alert">{error || (query.error instanceof Error ? query.error.message : String(query.error))}</p> : null}
    {confirm ? <FullAccessConfirmation pending={saving} ready={ready} error={error} onCancel={() => { if (!busy.current) setConfirm(false); }} onConfirm={() => void save("danger-full-access")} /> : null}
  </div>;
}

function FullAccessConfirmation({ pending, ready, error, onCancel, onConfirm }: { pending: boolean; ready: boolean; error: string; onCancel(): void; onConfirm(): void }) {
  const t = useUiText().permissions;
  const ref = useDialogFocus<HTMLElement>(true, onCancel);
  return createPortal(<div className="session-delete-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="permission-full-title" className="session-delete-dialog" ref={ref} tabIndex={-1}>
    <h2 id="permission-full-title">{t.confirmTitle}</h2><p>{t.confirmBody}</p>
    {error ? <p role="alert">{error}</p> : null}
    <footer><button type="button" disabled={pending} onClick={onCancel}>{t.cancel}</button><button type="button" className="danger" disabled={pending || !ready} onClick={onConfirm}>{t.confirm}</button></footer>
  </section></div>, document.body);
}

export function ApprovalGate({ requests, ready, onChanged, children }: { requests: PendingApproval[]; ready: boolean; onChanged?(): void; children: React.ReactNode }) {
  const [held, setHeld] = useState<PendingApproval>();
  const shown = held ?? requests[0];
  return shown && ready ? <ApprovalCard key={shown.request_id} request={shown} count={requests.length} onChanged={onChanged}
    onBusy={busy => setHeld(busy ? shown : undefined)} /> : children;
}

export function ApprovalCard({ request, count, onChanged, onBusy }: { request: PendingApproval; count: number; onChanged?(): void; onBusy?(busy: boolean): void }) {
  const t = useUiText().permissions;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  const decide = async (decision: "allow" | "deny") => {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy?.(true); setError("");
    try { await callDashboard({ operation: "sessions.approval.decide", input: { session_id: request.session_id, request_id: request.request_id, decision } }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { lock.current = false; setBusy(false); onBusy?.(false); onChanged?.(); }
  };
  const stop = async () => {
    try { await callDashboard({ operation: "sessions.stop", input: { session_id: request.session_id, turn_id: request.turn_id } }); onChanged?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section className="permission-approval" aria-label={t.waiting} data-request-id={request.request_id}>
    <header><strong>{request.tool} · {labels[request.target_mode]}</strong><span>{count > 1 ? `${count} ${t.pending}` : t.waiting}</span>
      <button type="button" onClick={() => void stop()} aria-label={t.stop} title={t.stop}><X size={16} /></button></header>
    <p>{request.justification}</p>
    <pre className="permission-preview">{JSON.stringify(request.preview, null, 2)}</pre>
    <details><summary>{t.arguments}</summary><pre className="permission-preview">{JSON.stringify(request.arguments, null, 2)}</pre></details>
    {error ? <p role="alert" className="permission-error">{error}</p> : null}
    <footer><button type="button" disabled={busy} onClick={() => void decide("deny")}>{t.deny}</button><button type="button" disabled={busy} onClick={() => void decide("allow")}>{t.allow}</button></footer>
  </section>;
}
