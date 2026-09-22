import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DeviceContextPanel } from "../../src/desktop/device-context-panel";
import { I18nContext, UI_TEXT } from "../../src/shared/i18n";
import type { DesktopCloudState } from "@lxe/desktop-protocol";

const state: DesktopCloudState = {
  configured: false, is_admin: false, device_id: "", device_name: "", vpn_ip: "", connection: "not_configured",
  last_error: "", last_checked_at: 0, dependency_state: "not_required", dependency_error: "",
  permission_status: "verified", permission_profile: "custom", permission_version: 1, profile_revision: 2,
  profile_labels: { "zh-CN": "测试权限", "en-US": "Test profile" }, permission_verified_at: 100,
  desktop_features: ["erp_dashboard"], device_context: { server_url: "http://10.88.0.1:8000",
    device: { id: "A", display_name: "Device A", wireguard_ip: "10.88.0.8", kind: "managed_device", server_url: "http://10.88.0.1:8000" },
    pending_device: null, skill_types: ["replenishment"], server_capabilities: ["mabang_read"], erp_actions: [],
  },
};
test.each(["zh", "en"] as const)("unbound device permissions render in %s independently of credential readiness", language => {
  const html = renderToStaticMarkup(<I18nContext.Provider value={UI_TEXT[language]}><DeviceContextPanel cloud={state} busy={false} onRefresh={() => {}} onConfirm={() => {}} /></I18nContext.Provider>);
  expect(html).toContain("Device A");
  expect(html).toContain("mabang_read");
  expect(html).toContain("replenishment");
  expect(html).toContain(UI_TEXT[language].desktop.cloud.permission.loginMissing);
  expect(html).not.toContain(UI_TEXT[language].desktop.cloud.permission.confirm);
});
test("identity changes render explicit confirmation and clear old grants", () => {
  const cloud: DesktopCloudState = { ...state, permission_status: "denied", desktop_features: [], device_context: {
    ...state.device_context!, pending_device: { ...state.device_context!.device!, id: "B", display_name: "Device B" }, skill_types: [], server_capabilities: null, erp_actions: null,
  } };
  const html = renderToStaticMarkup(<DeviceContextPanel cloud={cloud} busy={false} onRefresh={() => {}} onConfirm={() => {}} />);
  expect(html).toContain("确认使用当前设备");
  expect(html).toContain("Device B");
  expect(html).not.toContain("replenishment");
  expect(html).toContain("待查询");
});
