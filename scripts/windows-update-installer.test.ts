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
 expect(result).not.toContain('Call uninstallOldVersion');
 expect(adapter.installerHelper(helper)).not.toContain('!insertmacro copyFile "$EXEPATH"');
 expect(()=>adapter.installSection(section.replace("!insertmacro installApplicationFiles","new template"),"x")).toThrow("template changed");
 expect(()=>adapter.installerHelper(helper+helper)).toThrow("template changed");
 const util=readFileSync(join(templates,"include/installUtil.nsh"),"utf8");
 expect(adapter.installUtil(util)).not.toContain('Function uninstallOldVersion');
 expect(adapter.installUtil(util)).not.toContain('ExecWait');
 expect(()=>adapter.installUtil(util.replace('Function GetInQuotes','Function changed'))).toThrow('template changed');
});
test("manual installations retain the directory page and update skips it without replacing /D",()=>{
 const result=adapter.assisted(readFileSync(join(templates,"assistedInstaller.nsh"),"utf8"));
 expect(result).toContain("MUI_PAGE_DIRECTORY");expect(result).toContain("Function LxeDirectoryPagePre");
 expect(result).toContain('${If} ${isUpdated}');
 expect(result.slice(0,result.indexOf('!macro initMultiUser'))).not.toContain('StrCpy $INSTDIR');
});

test("retained uninstaller uses its own root and guards shared registration",()=>{
 const source=readFileSync(join(templates,"uninstaller.nsh"),"utf8");
 const result=adapter.uninstaller(source);
 expect(result).toContain('StrCpy $LxeUninstallRoot $INSTDIR');
 expect(result).toContain('StrCpy $INSTDIR $LxeUninstallRoot');
 expect(result).toContain('${If} $LxeOwnsRegistration == "1"');
 expect(result).not.toContain('RMDir /r "$APPDATA');
 expect(()=>adapter.uninstaller(source.replace('  !insertmacro initMultiUser','changed'))).toThrow('template changed');
});
