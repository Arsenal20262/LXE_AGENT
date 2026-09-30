import { expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { convertExcel } from "../../../src/features/file-preview/excel/convert";
import { openTab, closeTab, restoreLayout, emptyLayout } from "../../../src/features/file-preview/layout-state";
const limits = { maxBytes: 16777216, maxCells: 250000, timeoutMs: 15000 };
test("XLSX retains saved formula values, formulas, second sheet, styles, merges and frozen columns", async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("中文 表格");
  sheet.getCell("A1").value = 7; sheet.getCell("A2").value = { formula: "SUM(A1,3)", result: 10 };
  sheet.getCell("B1").value = { formula: "A1*2" }; sheet.getCell("A1").font = { bold: true, color: { argb: "FF123456" } };
  sheet.mergeCells("C1:D2"); sheet.getCell("C1").value = "合并"; sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  workbook.addWorksheet("说明").getCell("A1").value = "preserved";
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer()), before = bytes.slice();
  const value = await convertExcel(bytes, "xlsx", limits), first = value.sheets[0]!;
  expect(first.name).toBe("中文 表格"); expect(value.sheets).toHaveLength(2); expect(value.missingResults).toBe(1);
  expect(first.celldata?.find(c => c.r === 1 && c.c === 0)?.v).toMatchObject({ f: "=SUM(A1,3)", v: 10 });
  expect(first.config?.merge?.["0_2"]?.cs).toBe(2); expect(first.frozen?.type).toBe("rangeBoth"); expect(bytes).toEqual(before);
});
test("CSV keeps leading zeros and formula-looking strings; rejects malformed fields and excessive matrices", async () => {
  const encode = (text: string) => new TextEncoder().encode(text);
  const value = await convertExcel(encode('001,=1+1,"two, words"\n003,true,2026-10-01'), "csv", limits);
  expect(value.sheets[0]!.celldata?.slice(0, 3).map(c => c.v?.v)).toEqual(["001", "=1+1", "two, words"]);
  await expect(convertExcel(encode('"unterminated'), "csv", limits)).rejects.toThrow();
  await expect(convertExcel(encode("a,b\nc,d"), "csv", { ...limits, maxCells: 3 })).rejects.toThrow("tooLarge");
  await expect(convertExcel(new Uint8Array([1, 2, 3]), "xlsx", limits)).rejects.toThrow();
});
test("tabs deduplicate, close chooses a neighbor and restore never imports another session", () => {
  const tab = { key: "a", name: "same.xlsx", ref: { session_id: "s", kind: "artifact" as const, id: "a" } };
  let state = openTab(openTab(emptyLayout(), tab), tab); expect(state.tabs).toHaveLength(1);
  state = openTab(state, { ...tab, key: "b" }); expect(closeTab(state, "b").active).toBe("a");
  expect(restoreLayout({ getItem: () => JSON.stringify(state) }, "other").tabs).toHaveLength(0);
  expect(restoreLayout({ getItem: () => "invalid" }, "s").width).toBe(420);
});

test("legacy BIFF XLS is decoded from a real Office file without changing source bytes", async () => {
  const path = new URL("../../../../desktop/test/fixtures/file-preview/legacy.xls", import.meta.url);
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer()), original = bytes.slice();
  const value = await convertExcel(bytes, "xls", limits);
  expect(value.sheets.length).toBeGreaterThan(0);
  expect(value.sheets[0]!.celldata?.[0]?.v?.v).toBe("Office preview 中文文档");
  expect(bytes).toEqual(original);
});
test("XLSX preview explicitly reports drawings it omits", async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Images");
  sheet.getCell("A1").value = "Visible data";
  const image = workbook.addImage({ base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5ZkAAAAASUVORK5CYII=", extension: "png" });
  sheet.addImage(image, "B2:D5");
  const value = await convertExcel(new Uint8Array(await workbook.xlsx.writeBuffer()), "xlsx", limits);
  expect(value.unsupportedFeatures).toContain("images");
  expect(value.sheets[0]!.celldata?.[0]?.v?.v).toBe("Visible data");
});
