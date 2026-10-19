import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DesktopVietnamSettingsService } from "../src/main/vietnam-settings";
import type { DesktopInputAssetsOptions } from "../src/main/input-assets";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const state = { directory: "/app/skill-data/vietnam-stock-recommendation", parameters: null, parameters_error: null, sku_map: null, sku_map_error: null };
function service(execute?: DesktopInputAssetsOptions["execute"]) {
  const root = mkdtempSync(join(tmpdir(), "vietnam-settings-")); roots.push(root);
  return new DesktopVietnamSettingsService({ dataRoot: root, pythonPath: join(process.cwd(), process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python"), managedPath: "", platform: process.platform, execute });
}
test("settings use the lxeskill entrypoint and pass parameters and selections as single arguments", async () => {
  const calls: string[][] = [];
  const store = service(async (args, options) => {
    calls.push(args);
    expect(options.env?.LXE_DATA_ROOT).toContain("vietnam-settings-");
    expect(options.env?.LXE_SQLITE_DB_PATH).toEndWith("lxeskill.sqlite3");
    return { stdout: JSON.stringify({ type: "result", ok: true, data: { success: true, data: args[10] === "export" ? { path: args[14] } : state } }), stderr: "", error: null };
  });
  await store.read();
  await store.save({ exchange_rate: "4200" });
  await store.upload("/selected/中文 map.xlsx");
  expect(await store.exportMap("current", "D:\\中文 map\\导出.xlsx")).toEqual({ path: "D:\\中文 map\\导出.xlsx" });
  expect(calls).toEqual([
    ["-I", "-B", "-X", "utf8", "-m", "lxeskill", "vietnam", "replenishment", "settings", "--action", "read"],
    ["-I", "-B", "-X", "utf8", "-m", "lxeskill", "vietnam", "replenishment", "settings", "--action", "save", "--parameters", '{"exchange_rate":"4200"}'],
    ["-I", "-B", "-X", "utf8", "-m", "lxeskill", "vietnam", "replenishment", "settings", "--action", "upload", "--path", "/selected/中文 map.xlsx"],
    ["-I", "-B", "-X", "utf8", "-m", "lxeskill", "vietnam", "replenishment", "settings", "--action", "export", "--kind", "current", "--path", "D:\\中文 map\\导出.xlsx"],
  ]);
});
test("actual Python template export needs no saved settings and empty templates cannot be uploaded", async () => {
  const root = mkdtempSync(join(tmpdir(), "vietnam-export-")); roots.push(root);
  const options = { dataRoot: join(root, "app"), pythonPath: join(process.cwd(), process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python"), managedPath: "", platform: process.platform };
  const store = new DesktopVietnamSettingsService(options);
  const path = join(root, "中文 空白模板.xlsx");
  expect(await store.exportMap("template", path)).toEqual({ path });
  expect(statSync(path).size).toBeGreaterThan(0);
  expect(existsSync(join(options.dataRoot, "skill-data"))).toBe(false);
  await expect(store.upload(path)).rejects.toThrow("没有 SKU");
  await expect(store.exportMap("current", join(root, "missing.xlsx"))).rejects.toThrow("缺失");
});
test("actual Python settings survive new service instances without changing ERP configuration", async () => {
  const root = mkdtempSync(join(tmpdir(), "vietnam-settings-")); roots.push(root);
  const options = { dataRoot: root, pythonPath: join(process.cwd(), process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python"), managedPath: "", platform: process.platform };
  const first = new DesktopVietnamSettingsService(options);
  const initial = await first.read();
  expect(initial.parameters?.sales_weight_7d).toBe("0.6");
  await first.save({ ...initial.parameters, exchange_rate: "4200" });
  expect((await new DesktopVietnamSettingsService(options).read()).parameters?.exchange_rate).toBe("4200");
  await expect(first.save({ ...initial.parameters, exchange_rate: "0" })).rejects.toThrow();
  expect((await first.read()).parameters?.exchange_rate).toBe("4200");
});
test("native settings preserve real structured errors and observed process failures", async () => {
  await expect(service(async () => ({ stdout: JSON.stringify({ type: "result", ok: false, error: { message: "BadZipFile: synthetic map failure" } }), stderr: "", error: new Error("exit 4") })).read()).rejects.toThrow("BadZipFile: synthetic map failure");
  await expect(service(async () => ({ stdout: "", stderr: "PermissionError: /app/parameters.json", error: new Error("exit 1") })).read()).rejects.toThrow("PermissionError: /app/parameters.json");
});

test("settings require a successful CLI result and tolerate preceding progress events", async () => {
  const result = { type: "result", ok: true, data: { success: true, data: state } };
  expect(await service(async () => ({ stdout: JSON.stringify({ type: "progress" }) + "\n" + JSON.stringify(result), stderr: "", error: null })).read()).toEqual(state);
  for (const record of [{ success: true, data: state }, { ...result, ok: false }, { ...result, type: "progress" }]) {
    await expect(service(async () => ({ stdout: JSON.stringify(record), stderr: "", error: null })).read()).rejects.toThrow("Invalid lxeskill settings result");
  }
});

test("native upload preserves aggregate findings and the complete report beyond message limits", async () => {
  const root = mkdtempSync(join(tmpdir(), "vietnam-map-errors-")); roots.push(root);
  const pythonPath = join(process.cwd(), process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  const source = join(root, "中文 错误表.xlsx");
  execFileSync(pythonPath, ["-I", "-B", "-c", `
import sys
from openpyxl import Workbook
book = Workbook()
book.active.append(["SKU", "热销标记", "成本", "跨境价", "折扣价"])
for index in range(80):
    book.active.append([f"VN-{index}", None, 0, 2, 3])
book.save(sys.argv[1])
book.close()
`, source]);
  const dataRoot = join(root, "app");
  const store = new DesktopVietnamSettingsService({ dataRoot, pythonPath, managedPath: "", platform: process.platform });
  let message = "";
  try { await store.upload(source); } catch (error) { message = (error as Error).message; }
  expect(message).toContain("160 个错误，涉及 80 行");
  expect(message).toContain("Sheet!B2");
  expect(message).toContain("Sheet!C2");
  const directory = join(dataRoot, "tmp", "sku-map-validation");
  const reports = readdirSync(directory);
  expect(reports).toHaveLength(1);
  const report = join(directory, reports[0]!);
  expect(message).toContain(report);
  expect(readFileSync(report, "utf8")).toContain("Sheet!C81");
  expect(existsSync(join(dataRoot, "skill-data", "vietnam-stock-recommendation", "sku-map.xlsx"))).toBe(false);
});
