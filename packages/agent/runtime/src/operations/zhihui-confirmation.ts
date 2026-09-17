import type { UserQuestion } from "@lxe/protocol/user-questions";
import { safeToolFailureObservation } from "../tooling/registry";
import type { CliTerminalResult, OneShotCliRunnerPort } from "../tooling/one-shot-cli";

const CONFIRM = "确认执行导出";
const CANCEL = "取消";
const COMMAND = ["tms", "philippines", "products-export"] as const;
const OWNER_SKILL = "zhihui-tms-product-export";

/** Narrow route: only the supported Zhihui product export enters this workflow. */
export function matchZhihuiProductRequest(request: string, previousUserText = ""): string | undefined {
  const text = request.trim();
  if (!text || text.length > 2_000) return undefined;
  if (/(雅仓|马帮|紫鸟|订单|物流|发货|采购|财务)/u.test(text)) return undefined;
  if (/(历史.{0,8}(销量|库存|报表)|(销量|库存).{0,8}历史)/u.test(text)) return undefined;
  if (!/(商品|sku|销量|库存|入库|上架)/iu.test(text)) return undefined;
  const explicit = /(智汇|tms)/iu.test(text);
  const contextual = !/(菲律宾|ph)/iu.test(text)
    && /(智汇|tms)/iu.test(previousUserText)
    && /(商品|sku|销量|库存|入库|上架)/iu.test(previousUserText)
    && !/(雅仓|马帮|紫鸟|订单|物流|发货|采购|财务)/u.test(previousUserText)
    && !/(历史.{0,8}(销量|库存|报表)|(销量|库存).{0,8}历史)/u.test(previousUserText);
  return explicit || contextual ? text : undefined;
}

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

  async handle(request: string, context: ZhihuiConfirmationContext): Promise<ZhihuiRouteResult> {
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
    if (!execution.ok) return {
      status: "error", reply: `智汇 TMS 商品导出失败：${observedError(execution)}`,
      files: execution.files,
    };
    if (execution.data.action !== "execute" || execution.data.warehouse !== "PH"
      || execution.data.export_kind !== "philippines_product_full_export") {
      return { status: "error", reply: "智汇 TMS 执行结果格式不符合预期", files: [] };
    }
    return {
      status: "completed",
      reply: `智汇 TMS 菲律宾商品导出完成，已生成 ${execution.files.length} 个 XLSX 文件。文件仅包含接口实际提供的字段。`,
      files: execution.files,
    };
  }
}
