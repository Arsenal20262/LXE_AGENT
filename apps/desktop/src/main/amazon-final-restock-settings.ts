import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DesktopAmazonFinalRestockSettings } from "@lxe/desktop-protocol";
import { redactAndBound, type DesktopInputAssetsOptions } from "./input-assets";

/** Private Desktop bridge to the feature-owned persistent Python setting. */
export class DesktopAmazonFinalRestockSettingsService {
  constructor(private readonly options: DesktopInputAssetsOptions) {}

  private async call(action: "read" | "save", value?: string): Promise<DesktopAmazonFinalRestockSettings> {
    const temporaryRoot = join(this.options.dataRoot, "tmp");
    mkdirSync(temporaryRoot, { recursive: true });
    const args = ["-I", "-B", "-X", "utf8", "-m", "services.mabang.amazon.fba.final_restock_settings", action];
    if (value !== undefined) args.push(value);
    const options = {
      cwd: this.options.dataRoot, timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true,
      env: { ...process.env, LXE_DATA_ROOT: this.options.dataRoot, TMP: temporaryRoot, TEMP: temporaryRoot,
        TMPDIR: temporaryRoot, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    };
    const execution = this.options.execute ? await this.options.execute(args, options)
      : await new Promise<{ stdout: string; stderr: string; error: Error | null }>(resolve => {
        execFile(this.options.pythonPath, args, options, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
      });
    let result: { success?: boolean; data?: DesktopAmazonFinalRestockSettings; error?: string } | undefined;
    try { result = JSON.parse(execution.stdout.trim()); } catch { /* Include concrete process diagnostics below. */ }
    if (execution.error || result?.success !== true || !result.data
      || typeof result.data.peak_boost_enabled !== "boolean") {
      throw new Error(redactAndBound(result?.error || execution.stderr || execution.error?.message
        || `Invalid Amazon final-restock settings response: ${execution.stdout}`));
    }
    return result.data;
  }

  read(): Promise<DesktopAmazonFinalRestockSettings> { return this.call("read"); }
  save(input: unknown): Promise<DesktopAmazonFinalRestockSettings> {
    if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).length !== 1 || typeof (input as Record<string, unknown>).peak_boost_enabled !== "boolean") {
      throw new Error("peak_boost_enabled must be a boolean");
    }
    const serialized = JSON.stringify(input);
    return this.call("save", serialized);
  }
}
