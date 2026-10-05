import {expect,test} from "bun:test";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
const require=createRequire(import.meta.url),desktop=createRequire(resolve("apps/desktop/package.json")),builder=createRequire(desktop.resolve("electron-builder/package.json"));
const templates=join(dirname(builder.resolve("app-builder-lib/package.json")),"templates/nsis");
const adapter=require("./windows-update-installer.cjs");
const section=readFileSync(join(templates,"installSection.nsh"),"utf8"),helper=readFileSync(join(templates,"include/installer.nsh"),"utf8");
test("pinned installer stages before shutdown and promotes before registration",()=>{
 const result=adapter.installSection(section,"installer-helper.nsh");
 expect(result.indexOf("!insertmacro LxeStageApplication")).toBeLessThan(result.indexOf("!insertmacro CHECK_APP_RUNNING"));
 expect(result.indexOf("Call LxePromoteApplication")).toBeLessThan(result.indexOf("!insertmacro registryAddInstallInfo"));
 expect(result).toContain('${If} $R4 == $INSTDIR');
 expect(adapter.installerHelper(helper)).not.toContain('!insertmacro copyFile "$EXEPATH"');
 expect(()=>adapter.installSection(section.replace("!insertmacro installApplicationFiles","new template"),"x")).toThrow("template changed");
 expect(()=>adapter.installerHelper(helper+helper)).toThrow("template changed");
});
test("upgrade path selection is fixed and first installation keeps its directory page",()=>{
 const result=adapter.assisted(readFileSync(join(templates,"assistedInstaller.nsh"),"utf8"));
 expect(result).toContain("MUI_PAGE_DIRECTORY");expect(result).toContain("Function LxeDirectoryPagePre");
 expect(result).toContain('ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation');
});
