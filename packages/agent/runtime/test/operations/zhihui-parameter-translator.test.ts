import { describe, expect, test } from "bun:test";
import type { RuntimeProvider } from "../../src/engine/types";
import { ProviderZhihuiParameterTranslator } from "../../src/operations/zhihui-parameter-translator";

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
  test("accepts valid JSON only after schema validation", async () => {
    await expect(translatorFor('{"platform":"zhihui_tms","warehouse":"PH","intent":"product_export","fields":["inventory"]}').translate("查询菲律宾库存", new AbortController().signal)).resolves.toEqual({
      platform: "zhihui_tms", warehouse: "PH", intent: "product_export", fields: ["inventory"],
    });
  });

  test.each(["null", "not json", "```json\n{\"platform\":\"zhihui_tms\"}\n```", "{\"platform\":\"other\"}"])("rejects unsafe response %s", async text => {
    await expect(translatorFor(text).translate("查询菲律宾库存", new AbortController().signal)).resolves.toBeUndefined();
  });

  test("rejects incomplete provider responses", async () => {
    await expect(translatorFor('{"platform":"zhihui_tms","warehouse":"PH","intent":"product_export","fields":[]}').translate("查询菲律宾库存", new AbortController().signal)).resolves.toBeUndefined();
  });

  test("does not accept truncated responses", async () => {
    await expect(translatorFor("{}", "length").translate("查询菲律宾库存", new AbortController().signal)).resolves.toBeUndefined();
  });

  test("falls back when the translation provider fails", async () => {
    const translator = new ProviderZhihuiParameterTranslator({ turn: async () => { throw new Error("provider unavailable"); } });
    await expect(translator.translate("查询菲律宾库存", new AbortController().signal)).resolves.toBeUndefined();
  });
});
