import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { verifyPackagedLark } = require("./verify-packaged-lark.cjs");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(script?: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lxe-lark-package-"))); roots.push(root);
  const tools = join(root, "resources/runtime/tools"); mkdirSync(tools, { recursive: true });
  if (script) writeFileSync(join(tools, "lark-cli.exe"), "#!/bin/sh\n" + script, { mode: 0o755 });
  return root;
}
const valid = `
[ "$PATH" = "$PWD" ] || exit 42
case "$*" in
  --version) printf 'lark-cli version 1.0.96\\n';;
  'skills list') printf '%s\\n' '{"ok":true,"skills":[{"name":"lark-doc"}]}';;
  'skills read lark-doc') printf '%s\\n' '---' 'name: lark-doc' '---';;
  *) exit 43;;
esac
`;
// POSIX fixtures exercise subprocess failures and PATH isolation; real Windows EXE
// execution is mandatory in the production afterPack hook.
const posix = process.platform === "win32" ? test.skip : test;
test("rejects missing packaged CLI even when a host installation is available", () => {
  expect(() => verifyPackagedLark(fixture(), "1.0.96")).toThrow("Packaged Lark CLI is missing");
});
posix("runs only the packaged executable and reads its embedded skills", () => {
  expect(() => verifyPackagedLark(fixture(valid), "1.0.96")).not.toThrow();
});
posix("rejects a stale binary", () => {
  expect(() => verifyPackagedLark(fixture(valid), "1.0.97")).toThrow("version mismatch");
});
posix("rejects missing embedded skills", () => {
  expect(() => verifyPackagedLark(fixture(valid.replace('"skills":[{"name":"lark-doc"}]', '"skills":[]')), "1.0.96")).toThrow("skill list is incomplete");
});
posix("preserves the child process error", () => {
  expect(() => verifyPackagedLark(fixture("printf 'loader failure: missing payload' >&2\nexit 9\n"), "1.0.96")).toThrow("loader failure: missing payload");
});
