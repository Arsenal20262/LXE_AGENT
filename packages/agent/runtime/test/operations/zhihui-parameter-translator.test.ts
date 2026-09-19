import { describe, expect, test } from "bun:test";
import type { RuntimeProvider } from "../../src/engine/types";
import { isExplicitZhihuiRequest, ProviderZhihuiParameterTranslator } from "../../src/operations/zhihui-parameter-translator";

const response = (text: string, stopReason: "stop" | "length" = "stop") => ({
  id: "translation", role: "assistant" as const, timestamp: 0, api: "openai_completions" as const,
  provider: "fixture", model: "fixture", content: [{ type: "text" as const, text }], usage: {
    input_tokens: 1, output_tokens: 1, status: "complete" as const,
  }, stopReason,
});

const translatorFor = (text: string, stopReason: "stop" | "length" = "stop") => new ProviderZhihuiParameterTranslator({
  turn: async request => {
    expect(request.tools).toEqual([]);
    expect(request.toolChoice).toBe("none");
    expect(request.system).toContain("Return only JSON or null");
    return response(text, stopReason);
  },
} satisfies Pick<RuntimeProvider, "turn">);

describe("Zhihui AI parameter translator", () => {
  test.each([
    ["查询智汇菲律宾销量", true],
    ["导出 TMS 菲律宾商品", true],
    ["export Zhihui Philippines products", true],
    ["查询菲律宾库存", false],
    ["雅仓菲律宾仓库存", false],
    ["智慧印尼商品", false],
    ["马帮巴西海外仓库存", false],
    ["同时导出智汇和雅仓的菲律宾库存", false],
    ["智汇 TMS 与马帮巴西仓数据", false],
  ] as const)("only fast-routes explicit single-platform Zhihui request %s", (request, expected) => {
    expect(isExplicitZhihuiRequest(request)).toBe(expected);
  });

  test("accepts valid JSON only after schema validation", async () => {
    await expect(translatorFor('{"platform":"zhihui_tms","warehouse":"PH","intent":"product_export","fields":["inventory"]}').translate("查询智汇菲律宾库存", new AbortController().signal)).resolves.toEqual({
      platform: "zhihui_tms", warehouse: "PH", intent: "product_export", fields: ["inventory"],
    });
  });

  test.each(["null", "not json", "```json\n{\"platform\":\"zhihui_tms\"}\n```", "{\"platform\":\"other\"}"])("rejects unsafe response %s", async text => {
    await expect(translatorFor(text).translate("查询智汇菲律宾库存", new AbortController().signal)).resolves.toBeUndefined();
  });

  test("rejects incomplete provider responses", async () => {
    await expect(translatorFor('{"platform":"zhihui_tms","warehouse":"PH","intent":"product_export","fields":[]}').translate("查询智汇菲律宾库存", new AbortController().signal)).resolves.toBeUndefined();
  });

  test("does not accept truncated responses", async () => {
    await expect(translatorFor("{}", "length").translate("查询智汇菲律宾库存", new AbortController().signal)).resolves.toBeUndefined();
  });

  test("falls back when the translation provider fails", async () => {
    const translator = new ProviderZhihuiParameterTranslator({ turn: async () => { throw new Error("provider unavailable"); } });
    await expect(translator.translate("查询智汇菲律宾库存", new AbortController().signal)).resolves.toBeUndefined();
  });

  test.each(["查询菲律宾库存", "雅仓菲律宾仓库存", "智慧印尼商品", "智汇和马帮巴西海外仓库存"])(
    "does not call provider for another or ambiguous platform: %s", async request => {
      let providerCalls = 0;
      const translator = new ProviderZhihuiParameterTranslator({ turn: async () => {
        providerCalls++;
        return response('{"platform":"zhihui_tms","warehouse":"PH","intent":"product_export","fields":["inventory"]}');
      } });
      expect(await translator.translate(request, new AbortController().signal)).toBeUndefined();
      expect(providerCalls).toBe(0);
    },
  );
});
