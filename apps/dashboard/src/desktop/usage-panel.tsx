import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { RefreshCw } from "lucide-react";
import type { DesktopUsageBalance, LxeDesktopBridge } from "@lxe/desktop-protocol";
import { useUiText, type Language } from "../shared/i18n";
import { ProviderBrandMark } from "../shared/ui/provider-brand-mark";
import "./usage-panel.css";

export function UsagePanel({ desktop, headingRef, language }: {
  desktop: Pick<LxeDesktopBridge["desktop"], "getUsageBalance">;
  headingRef: RefObject<HTMLHeadingElement | null>;
  language: Language;
}) {
  const t = useUiText();
  const [balance, setBalance] = useState<DesktopUsageBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const result = await desktop.getUsageBalance();
      if (request === sequence.current) setBalance(result);
    } catch (error) {
      if (request === sequence.current) setBalance({ status: "error", source: null, balances: [], updated_at: null,
        error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [desktop]);
  useEffect(() => {
    void refresh();
    return () => { sequence.current++; };
  }, [refresh]);

  const updated = balance?.updated_at ? t.desktop.usage.updatedAt(
    new Date(balance.updated_at).toLocaleString(language === "zh" ? "zh-CN" : "en-US"),
  ) : undefined;
  const hasBalance = Boolean(balance?.balances.length);
  return (
    <section className="desktop-settings-section desktop-usage-panel">
      <div className="desktop-section-heading">
        <h3 ref={headingRef} tabIndex={-1}>{t.desktop.sectionTitles.usage}</h3>
        <button className="desktop-usage-refresh" disabled={loading} onClick={() => { void refresh(); }} type="button">
          <RefreshCw aria-hidden="true" size={14} />
          {loading ? t.desktop.usage.loading : t.desktop.usage.refresh}
        </button>
      </div>
      <div className="desktop-usage-card" aria-busy={loading}>
        <div className="desktop-usage-account">
          <strong><ProviderBrandMark provider="deepseek" size={22} />DeepSeek</strong>
          {balance?.source ? <span>{t.desktop.usage[balance.source]}</span> : null}
        </div>
        <div className="desktop-usage-value" aria-live="polite" title={updated}>
          {hasBalance ? balance!.balances.map(item => (
            <div className="desktop-usage-amount" key={item.currency}>
              <span>{item.currency === "CNY" ? "¥" : "$"}</span>
              <strong>{item.total_balance}</strong>
              <small>{item.currency}</small>
            </div>
          )) : <strong className="desktop-usage-placeholder">—</strong>}
          <span className="desktop-usage-label">{t.desktop.usage.availableBalance}</span>
        </div>
        {balance?.status === "unconfigured" ? <p className="desktop-usage-hint">{t.desktop.usage.unconfigured}</p> : null}
        {balance?.status === "error" ? (
          <div className="desktop-usage-error" role="status">
            <p>{hasBalance ? t.desktop.usage.stale : t.desktop.usage.failed}</p>
            <details><summary>{t.desktop.usage.details}</summary><pre>{balance.error}</pre></details>
          </div>
        ) : null}
      </div>
    </section>
  );
}
