import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

test.skipIf(process.platform !== "win32")("migration probe rejects old writers but ignores its bootstrap process tree", async () => {
  const root = mkdtempSync(join(tmpdir(), "lxe-idle-probe-"));
  const source = join(root, "var");
  const sleeper = "setTimeout(() => {}, 30000)";
  const bootstrap = Bun.spawn([process.execPath, "-e", `const c=Bun.spawn([process.execPath,'-e',${JSON.stringify(sleeper)},${JSON.stringify(source)}]); process.on('SIGTERM',()=>c.kill()); setTimeout(()=>{},30000);`], {stdout:"ignore",stderr:"ignore"});
  const writer = Bun.spawn([process.execPath, "-e", sleeper, source], {stdout:"ignore",stderr:"ignore"});
  const probe = () => Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", resolve("apps/desktop/resources/data-migration-idle.ps1"), "-SourceRoot", source, "-OwnerPid", String(bootstrap.pid)], {stdout:"pipe",stderr:"pipe",timeout:15000});
  try {
    const blocked = probe();
    expect(blocked.exitCode).not.toBe(0);
    expect(blocked.stderr.toString()).toContain(String(writer.pid));
    writer.kill(); await writer.exited;
    const idle = probe();
    expect(idle.stderr.toString()).toBe("");
    expect(idle.exitCode).toBe(0);
  } finally {
    if (writer.exitCode === null) { writer.kill(); await writer.exited; }
    Bun.spawnSync(["taskkill", "/PID", String(bootstrap.pid), "/T", "/F"], {stdout:"ignore",stderr:"ignore"});
    await bootstrap.exited;
    rmSync(root,{recursive:true,force:true});
  }
}, 45000);
