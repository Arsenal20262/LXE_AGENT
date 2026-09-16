import { describe, expect, test } from "bun:test";
import {
  presentYacangFailure,
  presentYacangResult,
  stringifyYacangTechnicalDetails,
} from "../../../src/features/workbench/yacang-test-view";

describe("Yacang test-page presentation", () => {
  test.each([
    ["skill_not_in_scope", "当前暂无该业务功能访问权限，请联系管理员开通后重试。"],
    ["YACANG_CREDENTIALS_MISSING", "雅仓账号尚未配置，请联系管理员完成配置。"],
    ["YACANG_AUTH_EXPIRED 401", "雅仓登录状态已失效，请联系管理员重新认证。"],
    ["YACANG_FORBIDDEN 403", "当前雅仓账号暂无该数据访问权限。"],
    ["YACANG_RATE_LIMITED 429", "当前请求较多，请稍后重试。"],
    ["YACANG_NETWORK_ERROR timeout", "雅仓服务暂时无法访问，请稍后重试。"],
  ])("maps %s to a business-facing message", (technical, expected) => {
    const presentation = presentYacangFailure(new Error(technical));
    expect(presentation.message).toBe(expected);
    expect(presentation.technicalDetails).toContain(technical.split(" ")[0]!);
  });

  test("keeps clarification as a normal question instead of a system error", () => {
    expect(presentYacangResult({
      overall_status: "needs_clarification",
      questions: [{ message: "请确认需要最近一个月销量，还是近三个月每天销量？" }],
    })).toEqual({
      kind: "clarification",
      message: "请确认需要最近一个月销量，还是近三个月每天销量？",
    });
  });

  test("maps a failed canonical result without exposing its credential error code", () => {
    expect(presentYacangResult({
      overall_status: "failed",
      diagnostics: [{ code: "YACANG_CREDENTIALS_MISSING", message: "missing" }],
    }).message).toBe("雅仓账号尚未配置，请联系管理员完成配置。");
  });

  test("uses a safe fallback while retaining redacted technical diagnostics", () => {
    const presentation = presentYacangFailure(new Error(
      "unknown failure password=secret token=abc cookie=session Authorization: Bearer xyz",
    ));
    expect(presentation.message).toBe("当前暂时无法获取雅仓数据，请稍后重试；如持续出现请联系管理员。");
    expect(presentation.technicalDetails).toContain("unknown failure");
    expect(presentation.technicalDetails).not.toContain("secret");
    expect(presentation.technicalDetails).not.toContain("token=abc");
    expect(presentation.technicalDetails).not.toContain("cookie=session");
    expect(presentation.technicalDetails).not.toContain("Bearer xyz");
  });

  test("redacts sensitive keys from structured Planner or Result details", () => {
    const details = stringifyYacangTechnicalDetails({
      code: "YACANG_CREDENTIALS_MISSING",
      password: "secret",
      nested: { token: "abc", warehouse: "MY8801" },
    });
    expect(details).toContain("YACANG_CREDENTIALS_MISSING");
    expect(details).toContain("MY8801");
    expect(details).not.toContain("secret");
    expect(details).not.toContain("abc");
  });
});
