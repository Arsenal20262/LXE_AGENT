import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { userInfo } from "node:os";
import { join } from "node:path";
import type { IPty } from "node-pty";
const port = (process as unknown as { parentPort: { postMessage(value: unknown): void; on(event: "message", callback: (event: { data: Record<string, unknown> }) => void): void } }).parentPort;
const pty = createRequire(__filename)(process.argv[2]!) as typeof import("node-pty");
let terminal: IPty | undefined, exited = false, closing = false;
function shell(): { file: string; args: string[] } {
  if (process.platform !== "win32") return { file: userInfo().shell || process.env.SHELL || "/bin/zsh", args: ["-l"] };
  try { const path = execFileSync("where.exe", ["pwsh.exe"], { encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/)[0]; if (path) return { file: path, args: ["-NoLogo"] }; } catch { /* PowerShell 7 is optional. */ }
  return { file: join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), args: ["-NoLogo"] };
}
function close(): void {
  if (closing) return;
  closing = true;
  try {
    if (terminal && !exited) {
      if (process.platform === "win32") execFileSync("taskkill.exe", ["/PID", String(terminal.pid), "/T", "/F"], { windowsHide: true, timeout: 10000 });
      else {
        // Interactive shells put background jobs in separate process groups.
        const rows = execFileSync("/bin/ps", ["-axo", "pid=,ppid="], { encoding: "utf8", timeout: 5000 }).trim().split(/\r?\n/).map(line => line.trim().split(/\s+/).map(Number));
        const descendants = new Set<number>([terminal.pid]);
        let previous = 0;
        while (previous !== descendants.size) { previous = descendants.size; for (const [pid, parent] of rows) if (pid && parent && descendants.has(parent)) descendants.add(pid); }
        for (const pid of [...descendants].reverse()) {
          if (pid === terminal.pid) continue;
          try { process.kill(pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
        }
        try { process.kill(-terminal.pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      }
    }
    if (terminal) try { terminal.kill(); } catch (error) { if (!exited) throw error; }
    port.postMessage({ type: "closed" });
    setTimeout(() => process.exit(0), 20);
  } catch (error) { closing = false; port.postMessage({ type: "close-error", error: String(error) }); }
}
port.on("message", ({ data }) => {
  try {
    if (data.type === "start") {
      if (terminal) throw new Error("Terminal has already started");
      const selected = shell();
      const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith("LXE_")));
      terminal = pty.spawn(selected.file, selected.args, { cwd: String(data.cwd), cols: Number(data.cols), rows: Number(data.rows), name: "xterm-256color", env });
      terminal.onData(text => port.postMessage({ type: "output", data: text }));
      terminal.onExit(event => { exited = true; port.postMessage({ type: "exit", exitCode: event.exitCode }); });
      port.postMessage({ type: "ready", shell: selected.file, pid: terminal.pid });
    } else if (data.type === "write") {
      if (!terminal || exited) throw new Error("Terminal has exited"); terminal.write(String(data.data));
    } else if (data.type === "resize") {
      if (terminal && !exited) terminal.resize(Number(data.cols), Number(data.rows));
    } else if (data.type === "close") close();
  } catch (error) { port.postMessage({ type: "error", error: String(error) }); }
});
