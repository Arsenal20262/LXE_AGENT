import { expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryRoot } from "@lxe/core";
import { ExecShellAdapter, OneShotCliRunner, TurnUsageSyncService } from "@lxe/runtime";
import { createAgentRuntimeHost } from "../src/runtime-host";

for (const cliState of ["missing", "failed", "ready"] as const) {
  test(`usage sync starts independently when lxeskill is ${cliState}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-usage-lifecycle-"));
    const skills = join(root, "skills"); mkdirSync(skills);
    const soul = join(root, "SOUL.md"); writeFileSync(soul, "Test instructions");
    const order: string[] = [];
    const originalStart = TurnUsageSyncService.prototype.start;
    const start = spyOn(TurnUsageSyncService.prototype, "start").mockImplementation(async function (this: TurnUsageSyncService) {
      order.push("usage");
      await originalStart.call(this);
    });
    const stop = spyOn(TurnUsageSyncService.prototype, "stop");
    const argv = spyOn(ExecShellAdapter.prototype, "lxeSkillArgv")
      .mockReturnValue(cliState === "missing" ? undefined : ["fixture-python", "-m", "lxeskill"]);
    const commands: string[][] = [];
    const execute = spyOn(OneShotCliRunner.prototype, "execute").mockImplementation(async (args) => {
      commands.push(args); order.push("probe");
      if (cliState === "failed") throw new Error("fixture CLI unavailable");
      return { protocol_version: "1", type: "result", command: "list", ok: true, data: {}, files: [] };
    });
    const host = createAgentRuntimeHost({
      dataRoot: root, legacyWorkspace: { directory: root, worktree: root },
      agentSoulPath: soul, skillsRoot: skills, userSkillsRoot: join(root, "user"),
      llmConfigRoot: join(repositoryRoot(import.meta.dir), "config", "llm"),
      lxeskillCatalogPath: join(root, "missing-catalog.json"),
      environment: { LOCAL_LOGS_ENABLED: "0", LXE_DATA_SERVER_ENABLED: "1", LXE_DATA_SERVER_URL: "https://fixture.invalid" },
      emitter: { emit: async () => {}, typing: async () => {} },
    });
    try {
      await host.start();
      expect(host.health().ready).toBe(true);
      expect(start).toHaveBeenCalledTimes(1);
      expect(order).toEqual(cliState === "missing" ? ["usage"] : ["usage", "probe"]);
      expect(commands).toEqual(cliState === "missing" ? [] : [["list"]]);
      await host.stop();
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      await host.stop();
      start.mockRestore(); stop.mockRestore(); argv.mockRestore(); execute.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
}
