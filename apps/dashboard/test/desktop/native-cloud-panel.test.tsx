import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NativeCloudPanel } from "../../src/desktop/native-cloud-panel";
import { I18nContext, UI_TEXT } from "../../src/shared/i18n";
import { cloudState } from "./settings-fixture-data";
test.each(["zh", "en"] as const)("native access separates directory binding and renders messages as text (%s)", language => {
  const t = UI_TEXT[language];
  const html = renderToStaticMarkup(<I18nContext.Provider value={t}><NativeCloudPanel cloud={cloudState({
    configured: false, connection: "unsupported", native_access: { status: "offline", model_status: "cached",
      is_admin: false, verified_at: 100, last_error: "<script>bad()</script>" },
  })} /></I18nContext.Provider>);
  expect(html).toContain(t.desktop.cloud.nativeAccess.models.cached);
  expect(html).toContain(t.desktop.cloud.nativeAccess.clearCache);
  expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain(t.desktop.cloud.unsupportedHint);
});
