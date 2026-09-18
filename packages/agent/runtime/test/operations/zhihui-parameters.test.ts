import { describe, expect, test } from "bun:test";
import { parseZhihuiProductRequest } from "../../src/operations/zhihui-parameters";

describe("Zhihui product request parameters", () => {
  test("accepts the closed product export contract", () => {
    expect(parseZhihuiProductRequest({
      platform: "zhihui_tms", warehouse: "PH", intent: "product_export", fields: ["inventory", "sales"],
    })).toEqual({
      platform: "zhihui_tms", warehouse: "PH", intent: "product_export", fields: ["inventory", "sales"],
    });
  });

  test.each([
    { label: "null", value: null }, { label: "array", value: [] }, { label: "empty object", value: {} },
    { label: "platform", value: { platform: "other", warehouse: "PH", intent: "product_export", fields: ["inventory"] } },
    { label: "warehouse", value: { platform: "zhihui_tms", warehouse: "US", intent: "product_export", fields: ["inventory"] } },
    { label: "intent", value: { platform: "zhihui_tms", warehouse: "PH", intent: "order_export", fields: ["inventory"] } },
    { label: "empty fields", value: { platform: "zhihui_tms", warehouse: "PH", intent: "product_export", fields: [] } },
    { label: "unknown field", value: { platform: "zhihui_tms", warehouse: "PH", intent: "product_export", fields: ["unknown"] } },
    { label: "duplicate field", value: { platform: "zhihui_tms", warehouse: "PH", intent: "product_export", fields: ["inventory", "inventory"] } },
    { label: "extra key", value: { platform: "zhihui_tms", warehouse: "PH", intent: "product_export", fields: ["inventory"], extra: true } },
  ])("rejects unsafe or incomplete value ($label)", ({ value }) => {
    expect(parseZhihuiProductRequest(value)).toBeUndefined();
  });
});
