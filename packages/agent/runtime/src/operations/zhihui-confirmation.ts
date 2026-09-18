import type { UserQuestion } from "@lxe/protocol/user-questions";
import { safeToolFailureObservation } from "../tooling/registry";
import type { CliTerminalResult, OneShotCliRunnerPort } from "../tooling/one-shot-cli";
import type { ZhihuiProductRequest } from "./zhihui-parameters";

const CONFIRM = "确认执行导出";
const CANCEL = "取消";
const COMMAND = ["tms", "philippines", "products-export"] as const;
const OWNER_SKILL = "zhihui-tms-product-export";

export interface ZhihuiConfirmationContext {
  signal: AbortSignal;
  skillNames: readonly string[];
  ask(question: UserQuestion): Promise<string>;
  onPreview?: (text: string) => void | Promise<void>;
  onProgress?: (record: Record<string, unknown>) => void | Promise<void>;
}

export interface ZhihuiRouteResult {
  status: "completed" | "error";
  reply: string;
  files: string[];
}

const observedError = (result: CliTerminalResult): string => {
  const source = result.error?.message || String(result.data.exception ?? "");
  // Keep the observed failure while masking signed download URL parameters.
  return safeToolFailureObservation(source.replace(/([?&](?:[^=&#]*?(?:signature|token|key|credential)[^=&#]*)=)[^&#\s]+/giu, "$1[redacted]"));
};

export class ZhihuiTmsConfirmationRouter {
  constructor(private readonly runner: Pick<OneShotCliRunnerPort, "execute">) {}

  async handle(request: string, _parameters: ZhihuiProductRequest, context: ZhihuiConfirmationContext): Promise<ZhihuiRouteResult> {
    const args = (action: "preview" | "execute") => [...COMMAND, "--action", action, "--request", request];
    if (!context.skillNames.includes(OWNER_SKILL)) {
      return { status: "error", reply: "智汇 TMS Skill 当前未获授权，无法执行导出。", files: [] };
    }
    const environment = { LXESKILL_SKILL_SCOPE: context.skillNames.join(",") };
    context.signal.throwIfAborted();
    const preview = await this.runner.execute(args("preview"), context.signal, 30_000, undefined, environment);
    context.signal.throwIfAborted();
    if (!preview.ok) return { status: "error", reply: `智汇 TMS 预览失败：${observedError(preview)}`, files: [] };
    if (preview.command !== "tms philippines products-export" || preview.data.action !== "preview"
      || preview.data.warehouse !== "PH" || preview.data.export_kind !== "philippines_product_full_export"
      || preview.data.historical_metrics_available !== false
      || typeof preview.data.date_label !== "string" || !/^\d{8}$/u.test(preview.data.date_label)
      || preview.files.length > 0) {
      return { status: "error", reply: "智汇 TMS 预览结果格式不符合预期", files: [] };
    }
    const previewText = `智汇 TMS 计划：导出菲律宾商品全量 XLSX（日期 ${preview.data.date_label}）。销量等字段以文件实际内容为准，并非独立历史销量报表。请在下方确认是否执行。`;
    await context.onPreview?.(previewText);
    context.signal.throwIfAborted();
    const question: UserQuestion = {
      id: "zhihui_export_confirmation", header: "智汇 TMS",
      question: `${previewText} 确认执行吗？`,
      options: [
        { label: CONFIRM, description: "将登录真实智汇 TMS，查询商品并下载 XLSX。" },
        { label: CANCEL, description: "结束本次查询，不访问智汇接口。" },
      ],
    };
    const selected = await context.ask(question);
    context.signal.throwIfAborted();
    if (selected !== CONFIRM) return { status: "completed", reply: "已取消智汇 TMS 商品导出。", files: [] };
    const execution = await this.runner.execute(args("execute"), context.signal, 1_200_000, context.onProgress, environment);
    context.signal.throwIfAborted();
    if (execution.command !== "tms philippines products-export") {
      return { status: "error", reply: "智汇 TMS 执行结果格式不符合预期", files: [] };
    }
    if (!execution.ok) {
      const partialPages = execution.data.partial_pages;
      const partialRows = execution.data.partial_rows;
      const hasPartialMerge = execution.files.length === 1
        && typeof partialPages === "number" && Number.isSafeInteger(partialPages) && partialPages > 0
        && typeof partialRows === "number" && Number.isSafeInteger(partialRows) && partialRows >= 0;
      return {
        status: "error",
        reply: hasPartialMerge
          ? `智汇 TMS 商品导出未完整完成，已交付部分合并 XLSX（${partialPages} 页、${partialRows} 行）：${observedError(execution)}`
          : `智汇 TMS 商品导出失败：${observedError(execution)}`,
        files: execution.files,
      };
    }
    if (execution.data.action !== "execute" || execution.data.warehouse !== "PH"
      || execution.data.export_kind !== "philippines_product_full_export") {
      return { status: "error", reply: "智汇 TMS 执行结果格式不符合预期", files: [] };
    }
    return {
      status: "completed",
      reply: "智汇 TMS 菲律宾商品导出完成，已生成合并 XLSX 文件。文件仅包含接口实际提供的字段。",
      files: execution.files,
    };
  }
}
