import { describe, expect, test } from "bun:test";
import { ZhihuiTmsConfirmationRouter } from "../../src/operations/zhihui-confirmation";
import { parseZhihuiProductRequest } from "../../src/operations/zhihui-parameters";
import type { CliTerminalResult } from "../../src/tooling/one-shot-cli";

const skillNames = ["zhihui-tms-product-export"];
const parameters = parseZhihuiProductRequest({ platform: "zhihui_tms", warehouse: "PH", intent: "product_export", fields: ["sales"] })!;

const result = (action: string, ok = true): CliTerminalResult => ({
  protocol_version: "1", type: "result", command: "tms philippines products-export", ok,
  data: { action, warehouse: "PH", export_kind: "philippines_product_full_export",
    historical_metrics_available: false, date_label: "20260917", page_size: 100,
    max_pages: 100, max_records: 10000, max_requests: 400, max_runtime_seconds: 1200,
    artifacts: [] }, files: [],
});

describe("Zhihui confirmation router", () => {
  test.each(["确认执行导出", "取消", ""])("only an explicit confirmation executes: %s", async selected => {
    const calls: string[][] = [];
    const router = new ZhihuiTmsConfirmationRouter({
      execute: async args => { calls.push(args); return result(args[args.indexOf("--action") + 1]!); },
    });
    const questions: unknown[] = [];
    const response = await router.handle("查询智汇菲律宾销量", parameters, {
      signal: new AbortController().signal,
      skillNames,
      ask: async question => { questions.push(question); return selected; },
    });
    expect(calls.map(args => args[args.indexOf("--action") + 1])).toEqual(selected === "确认执行导出" ? ["preview", "execute"] : ["preview"]);
    expect(questions).toHaveLength(1);
    expect(JSON.stringify(questions)).toContain("确认执行导出");
    expect(JSON.stringify(questions)).toContain("取消");
    expect(response.reply).toContain(selected === "确认执行导出" ? "导出" : "取消");
  });

  test("preview failure has no question or production call", async () => {
    let questions = 0;
    const router = new ZhihuiTmsConfirmationRouter({ execute: async () => ({
      ...result("preview", false), error: { code: "fixture", message: "真实预览错误" },
    }) });
    const response = await router.handle("智汇商品", parameters, {
      signal: new AbortController().signal,
      skillNames,
      ask: async () => { questions++; return "确认执行导出"; },
    });
    expect(questions).toBe(0);
    expect(response.reply).toContain("真实预览错误");
  });

  test("rejects an unexpected preview shape before asking or executing", async () => {
    const calls: string[] = [];
    let questions = 0;
    const router = new ZhihuiTmsConfirmationRouter({ execute: async args => {
      calls.push(args[args.indexOf("--action") + 1]!);
      return { ...result("preview"), data: { ...result("preview").data, warehouse: "OTHER" } };
    } });
    const response = await router.handle("查询智汇商品", parameters, {
      signal: new AbortController().signal,
      skillNames,
      ask: async () => { questions++; return "确认执行导出"; },
    });
    expect(response.status).toBe("error");
    expect(questions).toBe(0);
    expect(calls).toEqual(["preview"]);
  });

  test("execution failure reports observed error once and retains partial files", async () => {
    const calls: string[] = [];
    const router = new ZhihuiTmsConfirmationRouter({ execute: async args => {
      const action = args[args.indexOf("--action") + 1]!;
      calls.push(action);
      return action === "preview" ? result(action) : {
        ...result(action, false), files: ["/artifacts/partial-merged.xlsx"],
        data: { ...result(action, false).data, partial_pages: 1, partial_rows: 42 },
        error: { code: "tms_blocked", message: "HTTP 429; token=secret" },
      };
    } });
    const response = await router.handle("查询智汇商品", parameters, {
      signal: new AbortController().signal,
      skillNames,
      ask: async () => "确认执行导出",
    });
    expect(calls).toEqual(["preview", "execute"]);
    expect(response.status).toBe("error");
    expect(response.reply).toContain("HTTP 429");
    expect(response.reply).toContain("部分合并 XLSX");
    expect(response.reply).not.toContain("secret");
    expect(response.files).toEqual(["/artifacts/partial-merged.xlsx"]);
  });

  test("does not invoke the CLI when the owner Skill is outside the workspace scope", async () => {
    let calls = 0;
    const router = new ZhihuiTmsConfirmationRouter({ execute: async () => {
      calls++;
      return result("preview");
    } });

    const response = await router.handle("查询智汇商品", parameters, {
      signal: new AbortController().signal,
      skillNames: ["replenishment-store-resolve"],
      ask: async () => "确认执行导出",
    });

    expect(response.status).toBe("error");
    expect(response.reply).toContain("未获授权");
    expect(calls).toBe(0);
  });
});
