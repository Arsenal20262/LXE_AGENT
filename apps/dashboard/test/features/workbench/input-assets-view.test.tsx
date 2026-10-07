import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { InputAssetsWorkbench, visibleInputAssetSlots } from "../../../src/features/workbench/input-assets-view";
import { I18nContext, UI_TEXT } from "../../../src/shared/i18n";
import type { DesktopInputAssetSlot } from "@lxe/desktop-protocol";

describe("InputAssetsWorkbench", () => {
  test("shows the business name, internal slot id, and affected workflows", () => {
    const markup = renderToStaticMarkup(
      <InputAssetsWorkbench
        error=""
        loading={false}
        onBack={() => undefined}
        refresh={async () => undefined}
        slots={[{
          slot: "export_tax_master",
          management: "command",
          manifest_revision: null,
          display_name: "出口退税总表",
          used_by: ["采购汇总", "备货工作簿"],
          holds: "提供采购和备货所需资料。",
          directory: "/data/inputs/fba/export_tax_master",
          current: null,
          previous: null,
        }]}
      />,
    );

    expect(markup).toContain("<h3>出口退税总表</h3>");
    expect(markup).toContain("<code>export_tax_master</code>");
    expect(markup).toContain("用于：</strong>采购汇总、备货工作簿");
    expect(markup).not.toContain("提供采购和备货所需资料。");
  });
  test("hides the historical Vietnam template and keeps the SKU rollback control", () => {
    const revision = "a".repeat(32);
    const slots: DesktopInputAssetSlot[] = [{
      slot: "export_tax_master", management: "command", manifest_revision: null,
      display_name: "Export tax master", used_by: ["Purchasing"], holds: "tax data",
      directory: "/state/inputs/fba/export_tax_master", current: {
        file_name: "tax.xlsx", path: "/state/inputs/fba/export_tax_master/tax.xlsx",
        size_bytes: 128, updated_at: "2026-10-03",
      }, previous: null,
    }, {
      slot: "vietnam_replenishment_template", management: "desktop", manifest_revision: null,
      display_name: "Vietnam historical template", used_by: ["Historical reference"], holds: "historical",
      directory: "/state/inputs/vietnam/replenishment_template", current: {
        file_name: "old.xlsx", path: "/state/inputs/vietnam/replenishment_template/old.xlsx",
        size_bytes: 128, updated_at: "2026-10-03",
      }, previous: null,
    }, {
      slot: "vietnam_sku_parameter_map", management: "desktop", manifest_revision: revision,
      display_name: "Vietnam SKU map", used_by: ["Vietnam recommendation"], holds: "prices",
      directory: "/state/inputs/vietnam/sku_parameter_map", current: null,
      current_error: "Current version SHA-256 mismatch",
      previous: {
        file_name: "good.xlsx", path: "/state/inputs/vietnam/sku_parameter_map/versions/good.xlsx",
        size_bytes: 128, updated_at: "2026-10-03",
      },
    }];
    const visible = visibleInputAssetSlots(slots);
    expect(visible.map(slot => slot.slot)).toEqual(["export_tax_master", "vietnam_sku_parameter_map"]);
    expect(UI_TEXT.en.inputAssets.slotSummary(visible.filter(slot => slot.current !== null).length, visible.length)).toBe("1 / 2 ready");
    const markup = renderToStaticMarkup(
      <I18nContext.Provider value={UI_TEXT.en}><InputAssetsWorkbench error="" loading={false} onBack={() => undefined} refresh={async () => undefined}
        slots={slots} /></I18nContext.Provider>
    );
    expect(markup).toContain("Export tax master");
    expect(markup).toContain("Vietnam SKU map");
    expect(markup).not.toContain("Vietnam historical template");
    expect(markup).not.toContain("old.xlsx");
    expect(markup).toContain("Current version SHA-256 mismatch");
    expect(markup).toContain("good.xlsx");
    expect(markup).not.toContain("Upload SKU map");
    expect(markup).toContain("Roll back to previous");
  });

  test("directs operators to chat when the Vietnam SKU map has no current version", () => {
    const markup = renderToStaticMarkup(
      <InputAssetsWorkbench error="" loading={false} onBack={() => undefined} refresh={async () => undefined}
        slots={[{
          slot: "vietnam_sku_parameter_map", management: "desktop", manifest_revision: null,
          display_name: "越南 SKU 参数表", used_by: ["越南备货"], holds: "价格",
          directory: "/state/inputs/vietnam/sku_parameter_map", current: null, previous: null,
        }]} />,
    );
    expect(markup).toContain("请在聊天中上传并绑定越南 SKU 参数表");
    expect(markup).not.toContain("上传映射表");
  });
});
