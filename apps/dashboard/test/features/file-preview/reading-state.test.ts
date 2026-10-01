import { expect, test } from "bun:test";
import { readingState, forgetReadingTab, forgetPreviewSession } from "../../../src/features/file-preview/reading-state";
import { closeTab, emptyLayout, openTab, restoreLayout, type PreviewLayout } from "../../../src/features/file-preview/layout-state";
import { numberCodeLines } from "../../../src/shared/ui/code-block";

test("reading state survives viewer remounts, isolates sessions, and clears on close/delete", () => {
  const state = readingState("a", "file"); state.zoom = 200; state.loadedLines = 10000;
  state.scroll.rendered = { top: 650, left: 0 }; state.excel.active = "Notes";
  expect(readingState("a", "file")).toBe(state); expect(readingState("b", "file").zoom).toBe(0);
  const layout = openTab(emptyLayout(), { key: "file", name: "notes.md", ref: { session_id: "a", kind: "workspace", path: "notes.md" } });
  const json = JSON.stringify(layout); expect(json).not.toContain("loadedLines"); expect(json).not.toContain("zoom");
  expect(restoreLayout({ getItem: () => json }, "a").active).toBe("file");
  forgetReadingTab("a", "file"); expect(readingState("a", "file").zoom).toBe(0);
  forgetPreviewSession("a"); expect(readingState("a", "file")).not.toBe(state);
  expect(closeTab(layout, "file")).toMatchObject({ shown: true, active: "start", tabs: [{ key: "start" }] });
});

test("numbered code keeps multiline syntax spans balanced without mixing line numbers into content", () => {
  expect(numberCodeLines('<span class="hljs-string">first\nsecond</span>')).toBe('<span class="code-line" data-line="1"><span class="hljs-string">first</span></span><span class="code-line" data-line="2"><span class="hljs-string">second</span></span>');
});

test("legacy file layouts and tool addresses survive restoration without changing width", () => {
  const legacy: Omit<PreviewLayout, "expanded"> = { tabs: [{ key: "tree", name: "Files" }, { key: "file", name: "a.md", ref: { kind: "workspace", session_id: "s", path: "a.md" } }, { key: "terminal:t", kind: "terminal", name: "Terminal" }, { key: "browser:b", kind: "browser", name: "Page", url: "https://example.com/" }], active: "browser:b", width: 570, shown: true };
  const restored = restoreLayout({ getItem: () => JSON.stringify(legacy) }, "s");
  expect(restored.tabs).toEqual(legacy.tabs); expect(restored.width).toBe(570); expect(restored.active).toBe("browser:b");
});
