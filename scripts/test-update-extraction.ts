/** Exercise the real NSIS failure/cleanup boundary without packaging the full app. */
import {createRequire} from "node:module";
import {existsSync,mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";

if(process.platform!=="win32")throw new Error("NSIS extraction qualification requires Windows");
const compiler=process.argv[2];
if(!compiler||!existsSync(compiler))throw new Error("Pass the cached makensis.exe path");
const require=createRequire(resolve("apps/desktop/package.json"));
const builder=createRequire(require.resolve("electron-builder/package.json"));
const lib=createRequire(builder.resolve("app-builder-lib/package.json"));
const sevenZip=lib("7zip-bin").path7za;
const root=mkdtempSync(join(tmpdir(),"lxe-extraction "));
const nsis=(path:string)=>path.replaceAll("$","$$");
const install=join(root,"安装"),stage=install+".new-fixture",backup=install+".old-fixture";
const diagnostic=join(root,"diagnostic.log"),executable=join(root,"extraction.exe");
writeFileSync(join(root,"corrupt.7z"),"deliberately invalid archive");
const source=join(root,"extraction.nsi");
writeFileSync(source,`Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${nsis(executable)}"
!include "FileFunc.nsh"
Var installMode
!define APP_INSTALLER_STORE_FILE "lxe-extraction-fixture\\installer.exe"
!include "${nsis(resolve("apps/desktop/resources/update-installer.nsh"))}"
Section
 InitPluginsDir
 SetOutPath $PLUGINSDIR
 File /oname=lxe-7za.exe "${nsis(sevenZip)}"
 File /oname=lxe-update-files.ps1 "${nsis(resolve("apps/desktop/resources/update-files.ps1"))}"
 File /oname=corrupt.7z "${nsis(join(root,"corrupt.7z"))}"
 StrCpy $LxeFinal "${nsis(install)}"
 StrCpy $LxeStage "${nsis(stage)}"
 StrCpy $LxeBackup "${nsis(backup)}"
 StrCpy $LxeResult "${nsis(diagnostic)}"
 StrCpy $INSTDIR $LxeStage
 CreateDirectory $INSTDIR
 !insertmacro LxeExtractPayload "$PLUGINSDIR\\corrupt.7z"
 SetErrorLevel 99
SectionEnd
`);
execFileSync(compiler,["/V2","/NOCD",source],{stdio:"inherit"});
const child=Bun.spawn([executable,"/S"],{stdin:"ignore",stdout:"ignore",stderr:"ignore"});
const timeout=setTimeout(()=>{try{execFileSync("taskkill",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore"});}catch{}},180_000);
let code:number;
try{code=await child.exited;}finally{clearTimeout(timeout);}
const detail=existsSync(diagnostic)?readFileSync(diagnostic,"utf8"):"No extraction diagnostic";
if(code!==2||!detail.includes("7za exit: 2")||!detail.includes("Commit succeeded")||existsSync(stage)||existsSync(backup)){
 throw new Error(`Extraction qualification failed (exit ${code}): ${detail}; artifacts: ${root}`);
}
writeFileSync(join(root,"results.json"),JSON.stringify({exit_code:code,original_error_preserved:true,stage_removed:true}));
console.log("PASS native NSIS extraction failure retains exit code and diagnostics through staging cleanup: "+root);
