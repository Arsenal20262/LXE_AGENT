import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DesktopAmazonFinalRestockSettingsService } from "../src/main/amazon-final-restock-settings";

describe("Amazon final-restock settings bridge", () => {
  test("reads and saves only the persistent feature setting through the private Python module", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "amazon-restock-settings-"));
    const calls: string[][] = [];
    const service = new DesktopAmazonFinalRestockSettingsService({
      platform: "darwin", pythonPath: "/managed/python", managedPath: "/managed", dataRoot,
      execute: async (args) => {
        calls.push(args);
        const enabled = args[6] === "save" ? JSON.parse(args[7]!).peak_boost_enabled : true;
        return { stdout: JSON.stringify({ success: true, data: { peak_boost_enabled: enabled } }), stderr: "", error: null };
      },
    });
    expect(await service.read()).toEqual({ peak_boost_enabled: true });
    expect(await service.save({ peak_boost_enabled: false })).toEqual({ peak_boost_enabled: false });
    expect(calls).toEqual([
      ["-I", "-B", "-X", "utf8", "-m", "services.mabang.amazon.fba.final_restock_settings", "read"],
      ["-I", "-B", "-X", "utf8", "-m", "services.mabang.amazon.fba.final_restock_settings", "save", '{"peak_boost_enabled":false}'],
    ]);
    rmSync(dataRoot, { recursive: true, force: true });
  });

  test("real managed Python persists across service restarts and reports corrupt settings", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "amazon-restock-settings-process-"));
    const options = { platform: "darwin" as const,
      pythonPath: resolve(import.meta.dirname, "../../../.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"),
      managedPath: "/managed", dataRoot };
    try {
      const first = new DesktopAmazonFinalRestockSettingsService(options);
      expect(await first.read()).toEqual({ peak_boost_enabled: true });
      await first.save({ peak_boost_enabled: false });
      const restarted = new DesktopAmazonFinalRestockSettingsService(options);
      expect(await restarted.read()).toEqual({ peak_boost_enabled: false });
      await restarted.save({ peak_boost_enabled: true });
      expect(await new DesktopAmazonFinalRestockSettingsService(options).read()).toEqual({ peak_boost_enabled: true });
      writeFileSync(join(dataRoot, "skill-data/amazon-final-restock/parameters.json"), '{"peak_boost_enabled":"false"}');
      await expect(restarted.read()).rejects.toThrow("ValueError: Amazon 最终备货设置格式无效");
    } finally { rmSync(dataRoot, { recursive: true, force: true }); }
  }, 15_000);

  test("rejects invalid renderer settings before invoking Python", async () => {
    const service = new DesktopAmazonFinalRestockSettingsService({
      platform: "darwin", pythonPath: "/managed/python", managedPath: "/managed", dataRoot: "/state",
      execute: async () => { throw new Error("must not execute"); },
    });
    expect(() => service.save({ peak_boost_enabled: "false" })).toThrow("must be a boolean");
  });
});
