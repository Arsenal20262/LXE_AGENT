import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../../src/desktop/windows-titlebar.css", import.meta.url), "utf8");
const shared = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");

test("Windows reserves one caption outside the complete content frame", () => {
  assert.ok(styles.includes("--desktop-caption-height: 40px"));
  assert.ok(styles.includes("height: calc(100dvh - var(--desktop-caption-height))"));
  assert.ok(!shared.includes(".desktop-platform-win32 .sessions-focus .conversation-header-copy"));
  assert.ok(!shared.includes("- env(titlebar-area-x"));
});

test("Windows overlays and caption menus respect the shared top boundary", () => {
  assert.ok(styles.includes(".modal-backdrop, .sent-image-backdrop, .session-delete-backdrop"));
  assert.ok(styles.includes("left: 48px"));
});
