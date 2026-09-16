import { useState } from "react";
import { ArrowLeft, Play, ShieldAlert, TestTube2 } from "lucide-react";
import type { DesktopYacangPreview } from "@lxe/desktop-protocol";

const examples = [
  "我想看看最近一个月各仓卖得怎么样",
  "导出 MY8801 的月度销量",
  "月底各仓还剩多少库存",
  "这些产品什么时候入库和上架",
];
const asText = (value: unknown): string => typeof value === "string" ? value : "";
const asRecords = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
  : [];

type YacangPresentation = {
  kind: "success" | "partial" | "clarification" | "error";
  message: string;
};

type YacangFailurePresentation = YacangPresentation & {
  kind: "error";
  technicalDetails: string;
};

const UNKNOWN_ERROR_MESSAGE = "当前暂时无法获取雅仓数据，请稍后重试；如持续出现请联系管理员。";
const SENSITIVE_KEY = /password|token|cookie|authorization|secret/iu;

const redactDiagnosticValue = (value: unknown): unknown => {
  if (value instanceof Error) return { name: value.name, message: redactDiagnosticValue(value.message) };
  if (Array.isArray(value)) return value.map(redactDiagnosticValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[已脱敏]" : redactDiagnosticValue(item),
    ]));
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/\bBearer\s+\S+/giu, "Bearer [已脱敏]")
    .replace(/((?:password|token|cookie|authorization|secret)["']?\s*[:=]\s*)(?:["'][^"'\r\n]*["']|[^\s,}\r\n]+)/giu, "$1[已脱敏]");
};

export const stringifyYacangTechnicalDetails = (value: unknown): string => {
  const safe = redactDiagnosticValue(value);
  return typeof safe === "string" ? safe : JSON.stringify(safe, null, 2);
};

const searchableDiagnostic = (value: unknown): string => stringifyYacangTechnicalDetails(value).toLowerCase();

export function presentYacangFailure(value: unknown): YacangFailurePresentation {
  const technicalDetails = stringifyYacangTechnicalDetails(value);
  const diagnostic = searchableDiagnostic(value);
  let message = UNKNOWN_ERROR_MESSAGE;
  if (diagnostic.includes("skill_not_in_scope")) {
    message = "当前暂无该业务功能访问权限，请联系管理员开通后重试。";
  } else if (diagnostic.includes("yacang_credentials_missing")) {
    message = "雅仓账号尚未配置，请联系管理员完成配置。";
  } else if (diagnostic.includes("yacang_forbidden") || /\b403\b/u.test(diagnostic)) {
    message = "当前雅仓账号暂无该数据访问权限。";
  } else if (diagnostic.includes("yacang_rate_limited") || /\b429\b/u.test(diagnostic)) {
    message = "当前请求较多，请稍后重试。";
  } else if (
    diagnostic.includes("yacang_auth_expired")
    || diagnostic.includes("authentication failure")
    || diagnostic.includes("认证失败")
    || diagnostic.includes("登录失败")
    || /\b401\b/u.test(diagnostic)
  ) {
    message = "雅仓登录状态已失效，请联系管理员重新认证。";
  } else if (
    diagnostic.includes("timeout")
    || diagnostic.includes("network")
    || diagnostic.includes("econn")
    || diagnostic.includes("enotfound")
    || diagnostic.includes("etimedout")
  ) {
    message = "雅仓服务暂时无法访问，请稍后重试。";
  }
  return { kind: "error", message, technicalDetails };
}

export function presentYacangResult(result: Record<string, unknown>): YacangPresentation {
  const status = asText(result.overall_status);
  if (status === "needs_clarification") {
    const question = asRecords(result.questions).map((item) => asText(item.message)).filter(Boolean).join("；");
    return { kind: "clarification", message: question || "请补充所需的数据范围后重试。" };
  }
  if (status === "success") return { kind: "success", message: "雅仓数据已成功生成。" };
  if (status === "partial_success") return { kind: "partial", message: "部分雅仓数据已生成，请查看结果和失败项。" };
  return presentYacangFailure(result);
}

function TechnicalDetails({ value }: { value: unknown }) {
  return <details className="yacang-test-details">
    <summary>技术详情</summary>
    <pre className="yacang-test-json">{stringifyYacangTechnicalDetails(value)}</pre>
  </details>;
}

export function YacangNaturalLanguageTestView({ onBack }: { onBack: () => void }) {
  const [requestText, setRequestText] = useState("");
  const [preview, setPreview] = useState<DesktopYacangPreview | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<YacangFailurePresentation | null>(null);
  const plan = preview?.plan as Record<string, unknown> | undefined;
  const needsClarification = plan?.requires_clarification === true;
  const resultPresentation = result ? presentYacangResult(result) : null;

  async function previewRequest() {
    if (!requestText.trim() || !window.lxe?.desktop) return;
    setBusy(true);
    setFailure(null);
    setResult(null);
    setConfirmed(false);
    try {
      setPreview(await window.lxe.desktop.previewYacangExport({ request_text: requestText }));
    } catch (cause) {
      setPreview(null);
      setFailure(presentYacangFailure(cause));
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!preview || !confirmed || !window.lxe?.desktop) return;
    setBusy(true);
    setFailure(null);
    try {
      setResult((await window.lxe.desktop.executeYacangExport({
        preview_id: asText(preview.preview_id),
        confirmed: true,
      })).result);
    } catch (cause) {
      setFailure(presentYacangFailure(cause));
    } finally {
      setBusy(false);
    }
  }

  return <section className="workbench-page yacang-test-page" aria-labelledby="yacang-test-title">
    <header className="workbench-header">
      <div>
        <button className="workbench-back" onClick={onBack} type="button"><ArrowLeft size={14}/>返回工作台</button>
        <span>雅仓测试</span>
        <h2 id="yacang-test-title">雅仓自然语言测试</h2>
        <p>输入一句业务需求，查看确定性意图和执行计划。</p>
      </div>
      <div className="workbench-keyword"><TestTube2 size={15}/><code>preview-first</code></div>
    </header>
    {failure ? <>
      <div className="dashboard-query-notice" role="alert">{failure.message}</div>
      <TechnicalDetails value={failure.technicalDetails}/>
    </> : null}
    <section className="workbench-card">
      <label className="yacang-test-label" htmlFor="yacang-request">雅仓自然语言请求</label>
      <textarea id="yacang-request" value={requestText} onChange={event => setRequestText(event.target.value)} placeholder="例如：我想看看最近一个月各仓卖得怎么样" rows={5}/>
      <div className="yacang-test-examples">{examples.map(example => <button key={example} onClick={() => setRequestText(example)} type="button">{example}</button>)}</div>
      <button className="workbench-primary-button" disabled={!requestText.trim() || busy} onClick={previewRequest} type="button"><TestTube2 size={17}/>{busy ? "解析中…" : "解析并预览"}</button>
    </section>
    {plan ? <section className="workbench-card">
      <h3>流程预览</h3>
      <p>执行日期：{asText(plan.execution_date)} · 逻辑任务：{asRecords(plan.logical_tasks).length} · 物理获取：{asRecords(plan.source_fetches).length}</p>
      <TechnicalDetails value={plan}/>
      {needsClarification ? <div className="workbench-platform-notice">
        <ShieldAlert size={20}/><div><strong>需要补充信息</strong><p>{asRecords(plan.questions).map(question => asText(question.message)).join("；")}</p></div>
      </div> : <>
        <label className="workbench-checkbox"><input checked={confirmed} onChange={event => setConfirmed(event.target.checked)} type="checkbox"/><span>我已核对以上范围，并确认执行真实雅仓导出。</span></label>
        <button className="workbench-primary-button" disabled={!confirmed || busy} onClick={execute} type="button"><Play size={17}/>{busy ? "执行中…" : "确认并执行导出"}</button>
      </>}
    </section> : null}
    {result && resultPresentation ? <section className="workbench-card">
      <h3>执行结果</h3>
      {resultPresentation.kind === "error"
        ? <div className="dashboard-query-notice" role="alert">{resultPresentation.message}</div>
        : <div className="workbench-platform-notice"><div><strong>{resultPresentation.kind === "clarification" ? "需要补充信息" : "处理完成"}</strong><p>{resultPresentation.message}</p></div></div>}
      <TechnicalDetails value={result}/>
    </section> : null}
  </section>;
}
