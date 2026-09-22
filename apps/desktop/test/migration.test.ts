import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapDesktopState } from "../src/main/migration";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lxe-bootstrap-")); roots.push(root);
  const source = join(root, "default.yaml"), data = join(root, "data");
  const defaults = readFileSync("config/mcp_servers.default.yaml", "utf8");
  writeFileSync(source, defaults);
  return { source, data, defaults, target: join(data, "config/mcp_servers.local.yaml") };
}
test("initializes the native disabled default and connector state only when missing", () => {
  const f = fixture(); bootstrapDesktopState(f.source, f.data);
  expect(readFileSync(f.target, "utf8")).toBe(f.defaults);
  expect(f.defaults).toContain("X-LXE-Client: cli");
  expect(f.defaults).toContain("enabled: false");
  expect(readFileSync(join(f.data, "config/connector-states.local.json"), "utf8")).toBe("{}\n");
});
test("does not convert old company credentials or overwrite local settings", () => {
  const f = fixture(); mkdirSync(join(f.data, "config"), { recursive: true });
  const old = "mcpServers:\n  lxe-saihu:\n    enabled: false\n    url: http://10.88.0.1:8000/mcp/\n    bearer_token_env_var: LXE_SAIHU_MCP_API_KEY\n    startup_timeout_s: 17\n    disabled_tools: [write]\n";
  writeFileSync(f.target, old);
  const state = join(f.data, "config/connector-states.local.json");
  writeFileSync(state, '{"other":true}');
  bootstrapDesktopState(f.source, f.data); bootstrapDesktopState(f.source, f.data);
  expect(readFileSync(f.target, "utf8")).toBe(old);
  expect(readFileSync(state, "utf8")).toBe('{"other":true}');
});
