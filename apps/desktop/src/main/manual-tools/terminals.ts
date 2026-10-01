import { utilityProcess, type UtilityProcess } from "electron";
import { join } from "node:path";
import type { ManualToolEvent, TerminalSnapshot } from "@lxe/desktop-protocol";
interface Terminal { snapshot: TerminalSnapshot; child: UtilityProcess; ready: Promise<TerminalSnapshot>; closing?: Promise<void> | undefined; closed?: () => void; closeFailed?: (error: Error) => void }
export class ManualTerminals {
  private readonly items = new Map<string, Terminal>();
  constructor(root: string, private readonly emit: (event: ManualToolEvent) => void) { this.root = root.replace(/app\.asar([\\/])/, "app.asar.unpacked$1"); }
  private readonly root: string;
  get(sessionId: string, id: string): TerminalSnapshot | null {
    const entry = this.items.get(id); if (entry && entry.snapshot.sessionId !== sessionId) throw new Error("Terminal belongs to another session");
    return entry ? { ...entry.snapshot } : null;
  }
  async create(sessionId: string, id: string, cwd: string, cols: number, rows: number): Promise<TerminalSnapshot> {
    const old = this.get(sessionId, id); if (old) return this.items.get(id)!.ready;
    if ([...this.items.values()].filter(item => item.snapshot.sessionId === sessionId).length >= 8) throw new Error("This session already has 8 terminals");
    const child = utilityProcess.fork(join(this.root, "pty-host.cjs"), [join(this.root, "pty-runtime", "lib", "index.js")], { serviceName: "LXE Terminal", stdio: "pipe" });
    let resolve!: (snapshot: TerminalSnapshot) => void, reject!: (error: Error) => void;
    const ready = new Promise<TerminalSnapshot>((yes, no) => { resolve = yes; reject = no; });
    const entry: Terminal = { child, ready, snapshot: { id, sessionId, shell: "", output: "", sequence: 0, exited: false } };
    this.items.set(id, entry);
    const failure = (error: string) => { entry.snapshot.error = error; reject(new Error(error)); this.emit({ kind: "terminal.state", snapshot: { ...entry.snapshot } }); };
    let stderr = "";
    child.stderr?.on("data", data => { stderr = (stderr + data.toString()).slice(-16384); });
    const timer = setTimeout(() => { failure(`Terminal startup timed out${stderr ? `: ${stderr}` : ""}`); child.kill(); }, 15000);
    child.on("message", (message: { type: string; shell?: string; data?: string; error?: string; exitCode?: number }) => {
      if (message.type === "ready") { clearTimeout(timer); entry.snapshot.shell = message.shell!; resolve({ ...entry.snapshot }); this.emit({ kind: "terminal.state", snapshot: { ...entry.snapshot } }); }
      else if (message.type === "output") {
        const data = message.data!;
        entry.snapshot.sequence++;
        entry.snapshot.output = (entry.snapshot.output + data).slice(-1024 * 1024);
        this.emit({ kind: "terminal.output", sessionId, id, sequence: entry.snapshot.sequence, data });
      } else if (message.type === "exit") {
        entry.snapshot.exited = true; entry.snapshot.exitCode = message.exitCode ?? 0;
        this.emit({ kind: "terminal.state", snapshot: { ...entry.snapshot } });
      } else if (message.type === "error") { clearTimeout(timer); failure(message.error!); }
      else if (message.type === "closed") { entry.closed?.(); }
      else if (message.type === "close-error") { entry.closeFailed?.(new Error(message.error)); }
    });
    child.on("exit", code => {
      clearTimeout(timer);
      if (!entry.snapshot.exited) { entry.snapshot.exited = true; entry.snapshot.exitCode = code; failure(stderr || `Terminal host exited with code ${code}`); }
      if (entry.closing) entry.closed?.();
    });
    child.postMessage({ type: "start", cwd, cols, rows });
    return ready;
  }
  write(sessionId: string, id: string, data: string): void {
    const state = this.get(sessionId, id); if (!state || state.exited || state.error) throw new Error(state?.error || "Terminal has exited");
    this.items.get(id)!.child.postMessage({ type: "write", data });
  }
  resize(sessionId: string, id: string, cols: number, rows: number): void { if (this.get(sessionId, id)?.exited === false) this.items.get(id)!.child.postMessage({ type: "resize", cols, rows }); }
  async close(sessionId: string, id: string): Promise<void> {
    if (!this.get(sessionId, id)) return;
    const entry = this.items.get(id)!;
    if (!entry.closing) entry.closing = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Terminal cleanup timed out")), 12000);
      entry.closed = () => { clearTimeout(timer); this.items.delete(id); resolve(); };
      entry.closeFailed = error => { clearTimeout(timer); reject(error); };
      if (!entry.child.pid) entry.closed(); else entry.child.postMessage({ type: "close" });
    }).catch(error => { entry.closing = undefined; throw error; });
    return entry.closing;
  }
  async closeSession(sessionId?: string): Promise<void> {
    const results = await Promise.allSettled([...this.items.values()].filter(item => !sessionId || item.snapshot.sessionId === sessionId).map(item => this.close(item.snapshot.sessionId, item.snapshot.id)));
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(r => r.reason), failures.map(r => String(r.reason)).join("\n"));
  }
}
