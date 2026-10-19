import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, LoaderCircle } from "lucide-react";
import type { DesktopAmazonFinalRestockSettings } from "@lxe/desktop-protocol";
import { useUiText } from "../../shared/i18n";
import "./vietnam-settings.css";

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function AmazonFinalRestockSettingsWorkbench({ onBack }: { onBack: () => void }) {
  const t = useUiText();
  const copy = t.amazonFinalRestockSettings;
  const [settings, setSettings] = useState<DesktopAmazonFinalRestockSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const desktop = window.lxe?.desktop;
      if (!desktop) throw new Error(copy.unavailable);
      setSettings(await desktop.getAmazonFinalRestockSettings());
    } catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  }, [copy]);
  useEffect(() => { void load(); }, [load]);

  const save = async (peak_boost_enabled: boolean) => {
    const desktop = window.lxe?.desktop;
    if (!desktop || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const next = await desktop.saveAmazonFinalRestockSettings({ peak_boost_enabled });
      setSettings(next); setNotice(copy.saved);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  return <section className="workbench-tool-view vietnam-settings-view">
    <header className="workbench-tool-header">
      <button className="workbench-back" onClick={onBack} type="button"><ArrowLeft size={14} />{t.workbenchIndex.back}</button>
      <h2>{copy.title}</h2><p className="workbench-index-subtitle">{copy.subtitle}</p>
    </header>
    {error ? <p className="workbench-error" role="alert">{error}</p> : null}
    {notice ? <p className="workbench-tool-status" role="status">{notice}</p> : null}
    {loading ? <p role="status"><LoaderCircle className="spin" size={16} />{copy.loading}</p> : null}
    {!loading && !settings ? <button className="workbench-refresh" type="button" onClick={() => void load()}>{copy.retry}</button> : null}
    {settings ? <article className="vietnam-settings-card">
      <label className="amazon-peak-toggle">
        <span className="amazon-peak-toggle-copy"><CalendarDays size={18} aria-hidden /><span><strong>{copy.toggle}</strong><small>{copy.toggleHint}</small></span></span>
        <input type="checkbox" checked={settings.peak_boost_enabled} disabled={busy}
          onChange={event => void save(event.currentTarget.checked)} aria-label={copy.toggle} />
      </label>
      {busy ? <p role="status"><LoaderCircle className="spin" size={14} />{copy.saving}</p> : null}
      <p>{copy.appliesNextRun}</p>
    </article> : null}
  </section>;
}
