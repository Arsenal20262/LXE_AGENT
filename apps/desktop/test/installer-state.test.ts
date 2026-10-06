import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const installer = readFileSync(resolve(import.meta.dirname, "../resources/installer.nsh"), "utf8")
  .replaceAll("\r\n", "\n");

describe("Windows installer runtime state", () => {
  test("an application update clears only the legacy injected var override", () => {
    const update=readFileSync(resolve(import.meta.dirname,"../resources/update-installer.nsh"),"utf8").replaceAll("\r\n","\n");
    expect(update).toContain('${If} ${isUpdated}\n    ReadEnvStr $R0 "LXE_DATA_ROOT"');
    expect(update).toContain('${If} $R0 == "$INSTDIR\\var"');
    expect(update).toContain('SetEnvironmentVariable(t "LXE_DATA_ROOT", p 0)');
  });
  test("uninstall always preserves var and never removes the tunnel", () => {
    expect(installer).toContain("Call un.LxeRemoveProgramFilesPreservingVar");
    expect(installer).toContain('StrCmp $R1 "var" lxe_remove_next');
    expect(installer).toContain('StrCmp $R1 "var" lxe_cleanup_next');
    expect(installer).toContain("DELETE_LXE_DATA is ignored");
    expect(installer).not.toContain("RMDir /r \"$INSTDIR\\var");
    expect(installer).not.toContain("LxeRemoveManagedTunnel");
    expect(installer).not.toContain("NSD_CreateCheckbox");
  });
  test("transactional program removal restores files on a failure", () => {
    expect(installer).toContain("Call un.atomicRMDir");
    expect(installer).toContain("Call un.restoreFiles");
    expect(installer).not.toContain('Rename "$INSTDIR\\var"');
  });
});
