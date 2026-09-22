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
  expect(html).toContain(UI_TEXT[language].desktop.cloud.permission.labels.services.mabang_read);
  expect(html).toContain(UI_TEXT[language].skillTypes.replenishment);
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

const render = (patch: Partial<DesktopCloudState> = {}) => renderToStaticMarkup(<DeviceContextPanel cloud={{ ...state, ...patch }} busy={false} onRefresh={() => {}} onConfirm={() => {}} />);

test("summary omits the server address and keeps details closed without mutating permissions", () => {
  const before = JSON.stringify(state);
  const html = render();
  expect(html).not.toContain("10.88.0.1:8000");
  expect(html).not.toContain("公司服务器");
  expect(html).toContain('<details class="device-permission-details">');
  expect(html).not.toContain(" open=");
  expect(html).toContain("权限分配版本");
  expect(html).toContain("模板发布版本");
  expect(JSON.stringify(state)).toBe(before);
});
test.each(["verified", "cached", "pending_verification", "error", "denied", "unassigned"] as const)("renders distinct %s state without inventing a cause", status => {
  const html = render({ permission_status: status, permission_verified_at: ["denied", "error", "pending_verification"].includes(status) ? 0 : 100 });
  expect(html).toContain(UI_TEXT.zh.desktop.cloud.permission.status[status]);
  if (status === "cached") {
    expect(html).toContain("本次未更新"); expect(html).not.toContain("网络故障");
  }
  if (status === "denied") expect(html).toContain("已清空本地授权");
});
test("errors retain actual escaped content inside a separate closed disclosure", () => {
  const html = render({ permission_status: "cached", permission_error: '<upstream> actual failure [truncated]' });
  expect(html).toContain('<details class="device-permission-error">');
  expect(html).toContain("&lt;upstream&gt; actual failure [truncated]");
  expect(html).not.toContain('<upstream>');
});
test("empty verified grants, unknown grants and scoped wildcards remain distinct", () => {
  const empty = { ...state.device_context!, skill_types: [], server_capabilities: [], erp_actions: [] };
  expect(render({ device_context: empty })).toContain("未授权");
  expect(render({ permission_verified_at: 0, device_context: empty })).not.toContain("未授权");
  const wildcard = { ...empty, skill_types: ["*"], server_capabilities: ["*"], erp_actions: ["*"] };
  const html = render({ desktop_features: ["*"], device_context: wildcard });
  for (const name of ["全部技能", "全部桌面功能", "全部业务服务", "全部操作"]) expect(html).toContain(name);
  const unknown = render({ device_context: { ...empty, skill_types: ["future_skill", "mabang_read"], server_capabilities: ["future_service"], erp_actions: ["future_action"] } });
  for (const name of ["future_skill", "mabang_read", "future_service", "future_action"]) expect(unknown).toContain(name);
});
