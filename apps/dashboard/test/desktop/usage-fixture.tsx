// Native UI acceptance fixture. All data and bridge methods are mocked.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DesktopUsageBalance } from "@lxe/desktop-protocol";
import { DesktopShell } from "../../src/desktop/shell";
import { I18nContext, UI_TEXT, type Language } from "../../src/shared/i18n";
import { setupState, cloudState } from "./settings-fixture-data";
import "../../src/styles.css";

const fixture = { calls: 0, delay: 0, value: {
  status: "ready", source: "cloud", balances: [{ currency: "CNY", total_balance: "5.72" }],
  updated_at: 1790721120000, error: null,
} as DesktopUsageBalance };
Object.assign(window, { usageFixture: fixture, lxe: { desktop: {
  platform: "darwin",
  getSetupState: async () => setupState({ complete: true }),
  getHealth: async () => ({ version: "0.1.0", gateway: "ready", agent_cli: "ready", lxeskill: "ready", message: "", logging: {} }),
  getCloudState: async () => cloudState(),
  onStatusChanged: () => () => {}, onCloudStateChanged: () => () => {},
  getUsageBalance: async () => {
    fixture.calls++;
    const value = structuredClone(fixture.value);
    await new Promise(resolve => setTimeout(resolve, fixture.delay));
    return value;
  },
} } });

function Fixture() {
  const [language, setLanguage] = useState<Language>("zh");
  Object.assign(window, { fixtureLanguage: setLanguage });
  return <I18nContext.Provider value={UI_TEXT[language]}>
    <DesktopShell language={language} onLanguageChange={setLanguage} theme="light" fontSize="large"
      onThemeChange={() => {}} onFontSizeChange={() => {}}>
      {({ openSettings }) => <button id="open-settings" onClick={() => openSettings("usage")}>Open usage</button>}
    </DesktopShell>
  </I18nContext.Provider>;
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}><Fixture /></QueryClientProvider>,
);
