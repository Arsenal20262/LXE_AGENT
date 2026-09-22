// Opt-in Electron smoke test. No real model requests or user sessions are used.
import { resolveWorkspaceContext } from "../packages/foundation/core/src/workspace";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TypeScriptAgentRuntime } from "../packages/agent/runtime/src/engine/runtime";
import { SqliteRuntimeStore } from "../packages/agent/runtime/src/state/storage";
import { ToolRegistry } from "../packages/agent/runtime/src/tooling/registry";
import { registerCodingTools } from "../packages/agent/runtime/src/tooling/coding-tools";
import type { AgentJob, ToolStep } from "../packages/foundation/protocol/src";
import type { AssistantMessage } from "../packages/agent/runtime/src/engine/types";

const root = resolve(import.meta.dirname, ".."), out = await mkdtemp(join(tmpdir(), "lxe-image-view-smoke-"));
const workspace = resolveWorkspaceContext(out);
const registry = new ToolRegistry(), processes = registerCodingTools(registry, {});
const store = new SqliteRuntimeStore(join(out, "agent.sqlite3"));
const steps = new Map<string, ToolStep>();
const paths: string[] = [];
for (const [i, width, height, color] of [[0, 600, 300, "#45b6bb"], [1, 300, 600, "#ac8be9"]] as const) {
  const path = join(out, `image-${i}.png`);
  const stride = Math.ceil(width * 3 / 4) * 4;
  const bmp = Buffer.alloc(54 + stride * height);
  bmp.write("BM"); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18); bmp.writeInt32LE(height, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = 54 + y * stride + x * 3;
    bmp[offset] = parseInt(color.slice(5, 7), 16); bmp[offset + 1] = Math.round(80 + y / height * 120); bmp[offset + 2] = x < width / 2 ? 80 : 180;
  }
  await writeFile(path, await new Bun.Image(bmp).png().bytes()); paths.push(path);
}
let round = 0;
const runtime = new TypeScriptAgentRuntime({ store, tools: registry, systemPrompt: "test", provider: {
  summarize: async () => ({ text: "unused", usage: { input_tokens: 0, output_tokens: 0 } }),
  turn: async () => {
    const index = round++;
    return { id: `answer-${index}`, role: "assistant", timestamp: Date.now(), api: "anthropic_messages", provider: "test", model: "test",
      content: index < 2 ? [{ type: "tool_call", id: `read-${index}`, name: "read", arguments: { path: paths[index] } }] : [{ type: "text", text: "Done" }],
      stopReason: index < 2 ? "toolUse" : "stop", usage: { input_tokens: 0, output_tokens: 0, status: "complete" },
    } as AssistantMessage;
  },
}, emitter: { emit: async () => {}, typing: async () => {}, desktopStream: async batch => {
  for (const mutation of batch.mutations) if (mutation.kind === "part_updated" && mutation.part.type === "tool") {
    const step = mutation.part.tool_step; if (step.image_view) steps.set(step.id, step);
  }
} } });
await runtime.start();
const job: AgentJob = { job_id: "image-turn", session_id: "image-fixture", session_key: "image-fixture", response_route_id: "route",
  user_id: "test", conversation_id: "test", is_group: false, message_id: "message", user_input: "Read two pictures", job_kind: "turn",
  sender_nick: "Tester", source: { platform: "desktop" }, raw_data: {}, user_content_blocks: [], diagnostics: [], workspace };
try {
  await store.ensureSession({ session_id: job.session_id, source: job.source, workspace });
  await runtime.runTurn(job, { signal: new AbortController().signal, cancelled: false, drainSteering: () => [], registerProcess: () => () => {} });
} finally { await runtime.stop(); await processes.stop(); }
const cold = new SqliteRuntimeStore(join(out, "agent.sqlite3")); await cold.start();
const resolved: Record<string, string> = {};
let messages: unknown;
try {
  messages = (await cold.sessionDetail(job.session_id, { limit: 10 }))!.messages;
  for (const step of steps.values()) resolved[step.image_view!.view_id] = (await cold.resolveImageView(job.session_id, step.image_view!.view_id))!.path;
} finally { await cold.stop(); }
if (steps.size !== 2) throw new Error(`Expected two real read events, received ${steps.size}`);
await writeFile(join(out, "data.json"), JSON.stringify({ messages, steps: [...steps.values()], paths: resolved }));
for (const [entry, name, target] of [
  ["apps/desktop/src/preload.ts", "preload.cjs", "node"],
  ["apps/desktop/test/fixtures/image-views.electron.ts", "main.cjs", "node"],
  ["apps/dashboard/test/features/sessions/image-views-fixture.tsx", "renderer.js", "browser"],
] as const) {
  const result = await Bun.build({ entrypoints: [join(root, entry)], outdir: out, naming: { entry: target === "browser" ? "renderer.[ext]" : name, asset: "[name]-[hash].[ext]", chunk: "[name]-[hash].[ext]" }, target,
    format: target === "node" ? "cjs" : "esm", external: ["electron"], define: { "process.env.NODE_ENV": JSON.stringify("development") } });
  if (!result.success) throw new AggregateError(result.logs, `Build failed: ${entry}`);
}
await writeFile(join(out, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script type="module" src="renderer.js"></script></body></html>');
const electron = createRequire(join(root, "apps/desktop/package.json"))("electron") as string;
const child = Bun.spawn([electron, join(out, "main.cjs"), join(out, "preload.cjs"), join(out, "index.html"), join(out, "data.json")],
  { cwd: root, stdout: "inherit", stderr: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
const code = await child.exited;
if (code !== 0) throw new Error(`Electron smoke failed with exit code ${code}. Artifacts: ${out}`);
