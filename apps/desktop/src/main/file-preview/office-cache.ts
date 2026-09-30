import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rename, rm, readdir, stat, utimes } from "node:fs/promises";
import { readLimited } from "./paths";
import { join } from "node:path";

export function runOffice(node: string, cli: string, input: string, output: string, signal: AbortSignal, timeoutMs = 60000): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(node, [cli, "convert", "--input", input, "--output", output, "--timeout-ms", String(timeoutMs)], { windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", stdoutTruncated = false, stderrTruncated = false, killed = false, timedOut = false;
    const kill = () => {
      killed = true;
      if (process.platform === "win32" && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => child.kill());
      else {
        // Kit starts a native engine child. Kill its process group as well as the CLI.
        try { if (child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill("SIGKILL"); }
      }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", kill); };
    signal.addEventListener("abort", kill, { once: true });
    child.stdout.on("data", data => { stdoutTruncated ||= stdout.length + String(data).length > 65536; stdout = (stdout + String(data)).slice(-65536); });
    child.stderr.on("data", data => { stderrTruncated ||= stderr.length + String(data).length > 65536; stderr = (stderr + String(data)).slice(-65536); });
    child.on("error", error => { cleanup(); reject(error); });
    child.on("close", (code, exitSignal) => {
      cleanup();
      if (stdoutTruncated) stdout = "[stdout truncated to last 65536 characters]\n" + stdout;
      if (stderrTruncated) stderr = "[stderr truncated to last 65536 characters]\n" + stderr;
      if (killed || code !== 0) reject(new Error(`${timedOut ? `Office conversion exceeded ${timeoutMs} ms` : killed ? "Office conversion cancelled" : `Office exited ${code ?? exitSignal}`}\n${stderr}\n${stdout}`.trim()));
      else resolve(stdout);
    });
    if (signal.aborted) kill();
  });
}
interface Result { bytes: Uint8Array; missingFonts: string[] }
interface Task { controller: AbortController; consumers: Set<symbol>; result: Promise<Result> }
export class OfficePreviewCache {
  private tail: Promise<unknown> = Promise.resolve();
  private initialized = false;
  private leases = new Map<string, number>();
  private tasks = new Map<string, Task>();
  constructor(private root: string, private node: string, private cli: string, private convert = runOffice) {}
  async get(bytes: Uint8Array, extension: string, signal: AbortSignal): Promise<Result & { release(): void }> {
    signal.throwIfAborted();
    const key = createHash("sha256").update("libreoffice-kit-0.1.3\0" + extension).update(bytes).digest("hex");
    let task = this.tasks.get(key);
    if (task?.controller.signal.aborted) task = undefined;
    if (!task) {
      const controller = new AbortController();
      const created: Task = { controller, consumers: new Set(), result: Promise.resolve({ bytes: new Uint8Array(), missingFonts: [] }) };
      created.result = this.tail.catch(() => {}).then(() => this.convertOne(key, bytes, extension, controller.signal));
      this.tail = created.result;
      this.tasks.set(key, created);
      void created.result.finally(() => { if (this.tasks.get(key) === created) this.tasks.delete(key); }).catch(() => {});
      task = created;
    }
    const retained = task, owner = Symbol();
    retained.consumers.add(owner);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return false;
        done = true; signal.removeEventListener("abort", abort); retained.consumers.delete(owner);
        if (!retained.consumers.size) retained.controller.abort();
        return true;
      };
      const abort = () => { if (finish()) reject(signal.reason ?? new Error("Preview cancelled")); };
      signal.addEventListener("abort", abort, { once: true });
      retained.result.then(value => { if (finish()) {
        this.leases.set(key, (this.leases.get(key) ?? 0) + 1); let released = false;
        resolve({ ...value, release: () => { if (released) return; released = true; const count = (this.leases.get(key) ?? 1) - 1; if (count) this.leases.set(key, count); else this.leases.delete(key); } });
      } }, error => { if (finish()) reject(error); });
      if (signal.aborted) abort();
    });
  }
  private async convertOne(key: string, bytes: Uint8Array, extension: string, signal: AbortSignal): Promise<Result> {
    signal.throwIfAborted();
    await mkdir(this.root, { recursive: true });
    if (!this.initialized) { await this.clean(""); this.initialized = true; }
    const target = join(this.root, `${key}.pdf`), info = join(this.root, `${key}.json`);
    try {
      const pdf = await readLimited(target, 50 * 1024 * 1024), fonts: unknown = JSON.parse(await readFile(info, "utf8"));
      if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) || !Array.isArray(fonts) || fonts.some(x => typeof x !== "string")) throw new Error("Invalid preview cache");
      await utimes(target, new Date(), new Date());
      return { bytes: pdf, missingFonts: fonts };
    } catch (error) {
      // Only disposable cache data is removed. Source documents are never outputs.
      await Promise.all([rm(target, { force: true }), rm(info, { force: true })]);
    }
    signal.throwIfAborted();
    const id = randomUUID(), input = join(this.root, `${id}${extension}`), output = join(this.root, `${id}.pdf`);
    try {
      await writeFile(input, bytes, { flag: "wx" });
      const stdout = await this.convert(this.node, this.cli, input, output, signal);
      signal.throwIfAborted();
      const pdf = await readLimited(output, 50 * 1024 * 1024);
      if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error(`Office output is not a PDF\n${stdout}`);
      if (pdf.byteLength > 50 * 1024 * 1024) throw new Error("Converted PDF exceeds 50 MiB");
      let parsed: { missingFonts?: unknown };
      try { parsed = JSON.parse(stdout); }
      catch (error) { throw new Error(`Invalid Office CLI JSON: ${String(error)}\n${stdout}`); }
      const missingFonts = Array.isArray(parsed.missingFonts) ? parsed.missingFonts.map(String) : [];
      await rename(output, target); await writeFile(info, JSON.stringify(missingFonts));
      await this.clean(key);
      return { bytes: pdf, missingFonts };
    } finally { await Promise.all([rm(input, { force: true }), rm(output, { force: true })]); }
  }
  private async clean(keep: string): Promise<void> {
    const files = await Promise.all((await readdir(this.root)).filter(name => /^[a-f0-9]{64}\.pdf$/.test(name)).map(async name => ({ name, ...(await stat(join(this.root, name))) })));
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    let total = 0;
    for (const file of files) {
      total += file.size;
      const key = file.name.slice(0, -4);
      if (key !== keep && !this.tasks.has(key) && !this.leases.has(key) && (total > 512 * 1024 * 1024 || Date.now() - file.mtimeMs > 7 * 86400000)) {
        await rm(join(this.root, file.name), { force: true }); await rm(join(this.root, `${key}.json`), { force: true });
      }
    }
  }
  async dispose(): Promise<void> { for (const task of this.tasks.values()) task.controller.abort(); await this.tail.catch(() => {}); this.leases.clear(); }
}
