import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DesktopAmazonFinalRestockSettings } from "@lxe/desktop-protocol";
import { redactAndBound, type AssetCommandExecution, type DesktopInputAssetsOptions } from "./input-assets";

/** Desktop consumes the lxeskill contract; Python owns validation and storage. */
export class DesktopAmazonFinalRestockSettingsService {
  constructor(private readonly options: DesktopInputAssetsOptions) {}

  private async call(action: "read" | "save", value?: string): Promise<DesktopAmazonFinalRestockSettings> {
    const temporaryRoot = join(this.options.dataRoot, "tmp");
    mkdirSync(temporaryRoot, { recursive: true });
    const args = ["-I", "-B", "-X", "utf8", "-m", "lxeskill", "replenish", "final-restock", "settings", "--action", action];
    if (value !== undefined) args.push("--parameters", value);
    const options = {
      cwd: this.options.dataRoot, timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true,
      env: { ...process.env, LXE_DATA_ROOT: this.options.dataRoot,
        LXE_SQLITE_DB_PATH: join(this.options.dataRoot, "db", "lxeskill.sqlite3"),
        LXE_WORKSPACE_ROOT: join(this.options.dataRoot, "workspace"), TMP: temporaryRoot, TEMP: temporaryRoot,
        TMPDIR: temporaryRoot, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    };
    const execution = this.options.execute ? await this.options.execute(args, options)
      : await new Promise<AssetCommandExecution>(resolve => {
        execFile(this.options.pythonPath, args, options, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
      });
    let result: { type?: unknown; ok?: unknown; data?: { success?: unknown; data?: DesktopAmazonFinalRestockSettings }; error?: { message?: unknown } } | undefined;
    const terminal = execution.stdout.split(/\r?\n/u).filter(line => line.trim()).at(-1) ?? "";
    try { result = JSON.parse(terminal); } catch { /* Preserve actual process diagnostics below. */ }
    if (execution.error || result?.type !== "result" || result.ok !== true
      || result.data?.success !== true || !result.data.data
      || typeof result.data.data.peak_boost_enabled !== "boolean") {
      const observed = typeof result?.error?.message === "string" && result.error.message.trim() ? result.error.message : undefined;
      throw new Error(redactAndBound(observed || execution.stderr || execution.error?.message
        || `Invalid lxeskill settings result: ${terminal}`));
    }
    return result.data.data;
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
