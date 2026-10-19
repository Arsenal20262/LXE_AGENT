import { describe, expect, test } from "bun:test";
import { LxeSkillRuntimeService } from "../../src/operations/lxeskill-runtime";
import type { CliTerminalResult } from "../../src/tooling/one-shot-cli";

const listResult = (): CliTerminalResult => ({
  protocol_version: "1", type: "result", command: "list", ok: true,
  data: { commands: [] }, files: [],
});

describe("LxeSkillRuntimeService", () => {
  test("only probes list, remains idempotent and can restart", async () => {
    const calls: string[][] = [];
    const service = new LxeSkillRuntimeService({
      runner: { execute: async (arguments_) => { calls.push(arguments_); return listResult(); } },
      recovery: "repair runtime",
    });
    await service.start();
    await service.start();
    expect(calls).toEqual([["list"]]);
    expect(service.snapshot()).toEqual({ state: "ready", available: true, message: "", recovery: "" });
    await service.stop();
    await service.start();
    expect(calls).toEqual([["list"], ["list"]]);
    await service.stop();
  });

  test("preserves the probe failure without preventing host startup", async () => {
    const service = new LxeSkillRuntimeService({
      runner: { execute: async () => { throw new Error("No module named lxeskill"); } },
      recovery: "run uv sync",
    });
    await expect(service.start()).resolves.toBeUndefined();
    expect(service.snapshot()).toMatchObject({ state: "unavailable", available: false, recovery: "run uv sync" });
    expect(service.snapshot().message).toContain("No module named lxeskill");
    await service.stop();
  });

  test("reports an absent executable without spawning a process", async () => {
    const service = new LxeSkillRuntimeService({ recovery: "install CLI", unavailableMessage: "not configured" });
    await service.start();
    expect(service.snapshot()).toMatchObject({ state: "unavailable", available: false });
    expect(service.snapshot().message).toContain("not configured");
    await service.stop();
  });
});
