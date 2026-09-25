import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(testDir, "../../src");
const readSource = (relativePath) => readFileSync(path.join(sourceDir, relativePath), "utf8");

const models = readSource("features/models/view.tsx");
const runtimeStatus = readSource("features/runtime-status/view.tsx");
const providerMark = readSource("shared/ui/provider-brand-mark.tsx");
const styles = readSource("styles.css");
const kimiIcon = path.join(sourceDir, "assets/providers/kimi/kimi-icon-round.png");
const kimiDust = path.join(sourceDir, "assets/providers/kimi/kimi-moon-dust.png");

test("model and runtime surfaces share local provider marks", () => {
  assert.match(models, /ProviderBrandMark/);
  assert.match(models, /providerBrandKind/);
  assert.doesNotMatch(models, /<button\b|onCurrentModelChange|onThinkingLevelChange|onConfigureCredentials/);
  assert.match(models, /reconcileShowcaseSelections/);
  assert.match(runtimeStatus, /ProviderBrandMark provider=\{currentModel\?\.provider\}/);
  assert.match(runtimeStatus, /provider=\{currentModel\?\.provider\}/);
  assert.match(providerMark, /kimi-icon-round\.png/);
  assert.match(providerMark, /<img\b/);
  assert.doesNotMatch(providerMark, /https?:\/\//);
  assert.match(providerMark, /data-provider-mark=\{kind\}/);
  assert.ok(readFileSync(kimiIcon).byteLength > 0);
  const dustBytes = readFileSync(kimiDust);
  assert.equal(dustBytes.subarray(1, 4).toString("ascii"), "PNG");
});

test("provider card animation respects reduced motion", () => {
  assert.match(
    styles,
    /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.model-card\[data-provider="kimi_coding"\]\.item-active::after[\s\S]*?animation:\s*none/,
  );
});
