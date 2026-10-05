import type { DesktopCloudState } from "@lxe/desktop-protocol";
import { useState } from "react";
import { useUiText } from "../shared/i18n";

export function NativeCloudPanel({ cloud }: { cloud: DesktopCloudState }) {
  const t = useUiText().desktop.cloud.nativeAccess;
  const access = cloud.native_access;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!access) return null;
  return <section className="desktop-device-context native-cloud-access" aria-label={t.title}>
    <h3 className="desktop-cloud-permission-heading">{t.title}</h3>
    <p className="device-permission-note" role="status">{t.states[access.status]} · {t.models[access.model_status]}</p>
    {access.verified_at > 0 ? <p className="device-permission-checked">{t.checked} · {new Date(access.verified_at * 1000).toLocaleString(t.locale)}</p> : null}
    {access.last_error || error ? <p className="desktop-form-error" role="alert">{error || access.last_error}</p> : null}
    <p className="device-permission-note">{t.cacheHint}</p>
    <button className="native-cloud-clear" type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await window.lxe?.desktop.clearCloudModelCache(); }
      catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setBusy(false); }
    }}>{t.clearCache}</button>
  </section>;
}
