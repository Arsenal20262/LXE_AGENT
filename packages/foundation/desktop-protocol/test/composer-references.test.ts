import { expect, test } from "bun:test";
import { activeAtToken, formatFileMention, rankSkills } from "../src/composer-references";
import { parseDashboardRpcCall } from "../src/dashboard-rpc";
test("file references quote spaces and preserve editable directory descent", () => {
  expect(activeAtToken('分析 @"报表/销售 ', 11)?.query).toBe("报表/销售 ");
  expect(activeAtToken("mail a@b.test", 13)).toBeUndefined();
  expect(formatFileMention({ path: "报表/销售 统计.xlsx", kind: "file" }, false)).toBe('@"报表/销售 统计.xlsx"');
  expect(formatFileMention({ path: "销售 报表", kind: "directory" }, false)).toBe('@"销售 报表/');
  expect(formatFileMention({ path: 'bad"file', kind: "file" }, false)).toBeUndefined();
  expect(rankSkills([{ name: "office-xlsx" }, { name: "xlsx-tools" }], "xls").map(s => s.name)).toEqual(["xlsx-tools", "office-xlsx"]);
});
test("new discovery validates its session and query while preserving old skill calls", () => {
  for (const call of [{ operation: "sessions.files.candidates", input: { session_id: "s", query: "" } }, { operation: "skills.list", input: {} }, { operation: "skills.list", input: { session_id: "s" } }, { operation: "skills.content", input: { session_id: "s", name: "office-xlsx" } }] as const) expect(parseDashboardRpcCall(call)).toEqual(call);
  expect(() => parseDashboardRpcCall({ operation: "sessions.files.candidates", input: { session_id: "s", query: 5 } })).toThrow();
});
