import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodingProcessManager } from "../../src/tooling/coding/process-manager";
import { ZhihuiProgressDecoder, zhihuiProgressMessage } from "../../src/tooling/coding/zhihui-progress";
import { ExecShellAdapter } from "../../src/tooling/exec-shell";
import { removeTemporaryRoot } from "../temp-directory";
import { workspaceFor } from "../workspace";

const progress = (stage: string, fields: Record<string, unknown> = {}): string => JSON.stringify({
  protocol_version: "1", type: "progress", command: "tms philippines products-export", stage, ...fields,
});

describe("Zhihui progress decoder", () => {
  test("accepts a split CLI progress line and ignores terminal output", () => {
    const decoder = new ZhihuiProgressDecoder();
    const bytes = new TextEncoder().encode(`${progress("listed", { page: 2, page_records: 3, total_records: 1003 })}\n`);
    expect(decoder.push(bytes.subarray(0, 19))).toEqual([]);
    expect(decoder.push(bytes.subarray(19))).toEqual(["智汇 TMS：第2页读取3条，累计1003条"]);
    expect(decoder.push(new TextEncoder().encode(`${JSON.stringify({ type: "result", ok: true })}\n`))).toEqual([]);
  });

  test("rejects unknown fields, bad numbers, wrong commands and long lines", () => {
    expect(zhihuiProgressMessage(progress("listed", { page: 1, page_records: 2, total_records: 2, token: "secret" })))
      .toBeUndefined();
    expect(zhihuiProgressMessage(progress("downloaded", { page: -1, total_pages: 2, rows: 1 })))
      .toBeUndefined();
    expect(zhihuiProgressMessage(progress("toString"))).toBeUndefined();
    expect(zhihuiProgressMessage(progress("authenticated").replace("tms philippines products-export", "other")))
      .toBeUndefined();
    const decoder = new ZhihuiProgressDecoder();
    expect(decoder.push(new TextEncoder().encode(`${"x".repeat(3_000)}\n${progress("merged", { total_pages: 1, rows: 2 })}\n`)))
      .toEqual(["智汇 TMS：1页已合并，2行"]);
  });

  test("the process stdout pump publishes only safe progress for a tracked export", async () => {
    const root = mkdtempSync(join(tmpdir(), "zhihui-progress-"));
    const manager = new CodingProcessManager({
      maxOutputBytes: 64_000, tailBytes: 2_000, shell: new ExecShellAdapter(),
    });
    const published: string[] = [];
    manager.onZhihuiTmsProgress = (event) => {
      expect(event).toMatchObject({ sessionId: "session-1", turnId: "turn-1", toolCallId: "tool-1" });
      published.push(event.message);
    };
    try {
      const valid = progress("authenticated");
      const unsafe = progress("authenticated", { token: "secret" });
      const command = process.platform === "win32"
        ? `Write-Output '${valid}'; Write-Output '${unsafe}'`
        : `printf '%s\\n' '${valid}' '${unsafe}'`;
      const result = await manager.execute({
        command, cwd: root, sessionId: "session-1", responseRouteId: "route-1",
        workspace: workspaceFor(root), yieldMs: 5_000, signal: new AbortController().signal,
        toolCallId: "tool-1", turnId: "turn-1", trackZhihuiProgress: true,
      });
      expect(result.status).toBe("completed");
      expect(published).toEqual(["智汇 TMS：登录成功"]);
    } finally {
      await manager.stop();
      await removeTemporaryRoot(root);
    }
  });
});
