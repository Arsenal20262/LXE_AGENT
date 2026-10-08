import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, FileSpreadsheet, Upload, Save, LoaderCircle } from "lucide-react";
import type { DesktopVietnamParameters, DesktopVietnamSettingsState } from "@lxe/desktop-protocol";
import { useUiText } from "../../shared/i18n";
import "./vietnam-settings.css";

const days = [7, 15, 30] as const;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

// Shift decimal text without rounding valid stored weights through a JS number.
function shiftDecimal(value: string, places: number): string {
  const match = /^\+?(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(value.trim());
  if (!match) throw new Error("销量权重必须是非负数字 / Sales weights must be non-negative numbers");
  const [integer = "", fraction = ""] = match[1]!.split(".");
  const digits = integer + fraction;
  const position = integer.length + Number(match[2] || 0) + places;
  if (!Number.isSafeInteger(position) || Math.abs(position) > 400) throw new Error("销量权重超出数值范围 / Sales weight is out of range");
  const shifted = position <= 0 ? "0." + "0".repeat(-position) + digits
    : position >= digits.length ? digits + "0".repeat(position - digits.length)
      : digits.slice(0, position) + "." + digits.slice(position);
  return shifted.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function vietnamParameterForm(parameters: DesktopVietnamParameters): DesktopVietnamParameters {
  const form = { ...parameters };
  for (const day of days) form[`sales_weight_${day}d`] = shiftDecimal(parameters[`sales_weight_${day}d`], 2);
  return form;
}

export function vietnamParameterInput(form: DesktopVietnamParameters): DesktopVietnamParameters {
  const result = { ...form };
  for (const day of days) result[`sales_weight_${day}d`] = shiftDecimal(form[`sales_weight_${day}d`], -2);
  const total = days.reduce((sum, day) => sum + Number(result[`sales_weight_${day}d`]), 0);
  if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-12) {
    throw new Error("销量权重合计必须为 100% / Sales weights must total 100%");
  }
  return result;
}

export function VietnamSettingsWorkbench({ onBack }: { onBack: () => void }) {
  const t = useUiText();
  const copy = t.vietnamSettings;
  const [state, setState] = useState<DesktopVietnamSettingsState | null>(null);
  const [form, setForm] = useState<DesktopVietnamParameters | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const desktop = window.lxe?.desktop;
      if (!desktop) throw new Error(copy.unavailable);
      const next = await desktop.getVietnamSettings();
      setState(next);
      setForm(next.parameters ? vietnamParameterForm(next.parameters) : {
        sales_weight_7d: "", sales_weight_15d: "", sales_weight_30d: "",
        day_adjustment_7d: "", day_adjustment_15d: "", day_adjustment_30d: "", exchange_rate: "",
      });
    } catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  }, [copy.unavailable]);
  useEffect(() => { void load(); }, [load]);

  const update = (key: keyof DesktopVietnamParameters, value: string) => setForm(current => current ? { ...current, [key]: value } : null);
  const upload = async () => {
    const desktop = window.lxe?.desktop;
    if (!desktop || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const next = await desktop.uploadVietnamSkuMap();
      if (next) { setState(next); setNotice(copy.uploaded); }
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    const desktop = window.lxe?.desktop;
    if (!desktop || !form || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const next = await desktop.saveVietnamParameters(vietnamParameterInput(form));
      setState(next);
      if (next.parameters) setForm(vietnamParameterForm(next.parameters));
      setNotice(copy.saved);
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
    {!loading && !state ? <button className="workbench-refresh" type="button" onClick={() => void load()}>{copy.retry}</button> : null}
    {state ? <>
      <article className="vietnam-settings-card vietnam-map-card">
        <header className="asset-slot-header"><h3>{copy.skuMap}</h3>
          <button type="button" disabled={busy} onClick={() => void upload()}><Upload size={14} />{state.sku_map ? copy.replace : copy.upload}</button>
        </header>
        <p>{copy.skuHint}</p>
        {state.sku_map_error ? <p className="workbench-error" role="alert">{state.sku_map_error}</p> : null}
        {state.sku_map ? <div className="vietnam-file-status"><FileSpreadsheet size={16} aria-hidden />
          <span>{state.sku_map.file_name}</span><span className="vietnam-file-updated">{copy.updated} {new Date(state.sku_map.updated_at).toLocaleString()}</span>
        </div> : <p className="vietnam-file-status">{copy.noMap}</p>}
      </article>
      {state.parameters_error ? <p className="workbench-error" role="alert">{state.parameters_error}</p> : null}
      {form ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy}>
          <div className="vietnam-settings-card vietnam-parameters-card">
            <section className="vietnam-setting-row">
              <div className="vietnam-setting-copy"><h3>{copy.weights}</h3><p>{copy.weightsHint}</p></div>
              <div className="vietnam-parameter-grid">{days.map(day => <label key={day}>{copy.days(day)} (%)
                <input required inputMode="decimal" value={form[`sales_weight_${day}d`]} onChange={event => update(`sales_weight_${day}d`, event.target.value)} />
              </label>)}</div>
            </section>
            <section className="vietnam-setting-row">
              <div className="vietnam-setting-copy"><h3>{copy.exchange}</h3></div>
              <label className="vietnam-exchange">{copy.cny}<input required inputMode="decimal" aria-label={copy.exchange} value={form.exchange_rate} onChange={event => update("exchange_rate", event.target.value)} />{copy.vnd}</label>
            </section>
            <details className="vietnam-advanced" open={state.parameters_error ? true : undefined}>
              <summary><ChevronRight size={14} aria-hidden />{copy.advanced}</summary>
              <div className="vietnam-setting-row">
                <p>{copy.adjustmentHint}</p>
                <div className="vietnam-parameter-grid">{days.map(day => <label key={day}>{copy.adjustment(day)}
                  <input required inputMode="decimal" value={form[`day_adjustment_${day}d`]} onChange={event => update(`day_adjustment_${day}d`, event.target.value)} />
                </label>)}</div>
              </div>
            </details>
          </div>
          <div className="vietnam-save"><button className="desktop-primary-button" type="submit">{busy ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{busy ? copy.saving : copy.save}</button><span>{copy.appliesNextRun}</span></div>
        </fieldset>
      </form> : null}
    </> : null}
  </section>;
}
