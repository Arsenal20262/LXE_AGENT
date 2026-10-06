const {readFile,mkdir,writeFile,copyFile}=require('node:fs/promises');
const {createRequire}=require('node:module');
const {join,dirname}=require('node:path');
function replaceOnce(source,before,after){
 if(source.split(before).length!==2)throw new Error('Pinned NSIS template changed: '+before);
 return source.replace(before,after);
}
function installSection(source,helper){
 let s=source.replaceAll('\r\n','\n');
 s=replaceOnce(s,'!include installer.nsh',`!include "${helper}"
!macroundef extractUsing7za
!macro extractUsing7za FILE
 !insertmacro LxeExtractPayload "\${FILE}"
!macroend
!macroundef uninstallOldVersion
!macro uninstallOldVersion ROOT_KEY
 # Retain previous installations, including their var directories.
 StrCpy $R0 0
 ClearErrors
!macroend`);
 s=replaceOnce(s,'StrCpy $appExe "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"','!insertmacro LxeStageApplication\nStrCpy $appExe "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"');
 s=replaceOnce(s,'!ifdef UNINSTALLER_ICON\n  File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"\n!endif\n','');
 s=replaceOnce(s,'!insertmacro installApplicationFiles','Call LxePromoteApplication');
 return s;
}
function installerHelper(source){
 return replaceOnce(source.replaceAll('\r\n','\n'),'      !insertmacro copyFile "$EXEPATH" "$LOCALAPPDATA\\${APP_INSTALLER_STORE_FILE}"','      # Cache replacement is deferred until LxeCommitApplication.');
}
function assisted(source){
 let s=source.replaceAll('\r\n','\n');
 s=replaceOnce(s,'  !include multiUserUi.nsh','  !ifndef BUILD_UNINSTALLER\n    !include multiUserUi.nsh\n  !endif');
 s=replaceOnce(s,'    !insertmacro skipPageIfUpdated\n    !insertmacro MUI_PAGE_DIRECTORY',`    !define MUI_PAGE_CUSTOMFUNCTION_PRE LxeDirectoryPagePre
    !insertmacro MUI_PAGE_DIRECTORY
    Function LxeDirectoryPagePre
      \${If} \${isUpdated}
        Abort
      \${EndIf}
    FunctionEnd`);
 // Preserve the exact directory chosen by the user (or /D during an update).
 s=replaceOnce(s,`    Function instFilesPre
      \${StrContains} $0 "\${APP_FILENAME}" $INSTDIR
      \${If} $0 == ""
        StrCpy $INSTDIR "$INSTDIR\\\${APP_FILENAME}"
      \${endIf}
    FunctionEnd`,`    Function instFilesPre
    FunctionEnd`);
 s=replaceOnce(s,`  !ifndef INSTALL_MODE_PER_ALL_USERS
    !insertmacro PAGE_INSTALL_MODE
  !endif
  !insertmacro MUI_UNPAGE_INSTFILES`,`  !insertmacro MUI_UNPAGE_INSTFILES`);
 return s;
}
function uninstaller(source){
 let s=source.replaceAll('\r\n','\n');
 s=replaceOnce(s,'Function un.onInit',`Var LxeUninstallRoot
Var LxeOwnsRegistration
Function un.onInit
  StrCpy $LxeUninstallRoot $INSTDIR`);
 s=replaceOnce(s,'  !insertmacro initMultiUser',`  !insertmacro initMultiUser
  StrCpy $INSTDIR $LxeUninstallRoot
  ReadINIStr $0 "$INSTDIR\\lxe-legacy-data.ini" "LXE" "scope"
  \${If} $0 == "all"
    StrCpy $installMode "all"
    SetShellVarContext all
  \${ElseIf} $0 == "CurrentUser"
    StrCpy $installMode "CurrentUser"
    SetShellVarContext current
  \${EndIf}
  ReadRegStr $0 SHELL_CONTEXT "\${INSTALL_REGISTRY_KEY}" InstallLocation
  StrCpy $LxeOwnsRegistration "0"
  \${If} $0 == $INSTDIR
    StrCpy $LxeOwnsRegistration "1"
  \${EndIf}`);
 s=replaceOnce(s,'Function un.checkAppRunning\n  !insertmacro CHECK_APP_RUNNING\nFunctionEnd',`Function un.checkAppRunning
  ReadRegStr $0 SHELL_CONTEXT "\${INSTALL_REGISTRY_KEY}" InstallLocation
  \${If} $0 == $INSTDIR
    !insertmacro CHECK_APP_RUNNING
  \${EndIf}
FunctionEnd`);
 s=replaceOnce(s,'    call un.checkAppRunning\n  \${else}','    # Check after restoring the original uninstaller directory.\n  \${else}');
 s=replaceOnce(s,'    !insertmacro customUnInit\n  !endif\nFunctionEnd','    !insertmacro customUnInit\n  !endif\n  ${If} ${Silent}\n    Call un.checkAppRunning\n  ${EndIf}\nFunctionEnd');
 s=replaceOnce(s,'  \${ifNot} \${isKeepShortcuts}','  \${If} $LxeOwnsRegistration == "1"\n  \${ifNot} \${isKeepShortcuts}');
 s=replaceOnce(s,'  Var /GLOBAL isDeleteAppData','  \${EndIf}\n\n  Var /GLOBAL isDeleteAppData');
 const start=s.indexOf('  Var /GLOBAL isDeleteAppData'),end=s.indexOf('  DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"');
 if(start<0||end<start)throw new Error('Pinned uninstaller data cleanup template changed');
 s=s.slice(0,start)+'  # User data is always retained, including legacy delete flags.\n  ${If} $LxeOwnsRegistration == "1"\n'+s.slice(end);
 s=replaceOnce(s,'  DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"','  DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"\n  ${EndIf}');
 return s;
}
function cleanupExits(source){return source.replaceAll(/^(\s*)Quit\s*$/gm,'$1!ifndef BUILD_UNINSTALLER\n$1Call LxeCleanupApplication\n$1!endif\n$1Quit');}
async function installAdapter(context){
 const desktopRequire=createRequire(join(context.packager.projectDir,'package.json'));
 const builderRequire=createRequire(desktopRequire.resolve('electron-builder/package.json'));
 builderRequire('app-builder-lib'); // initialize mutually dependent platform modules
 const libRequire=createRequire(builderRequire.resolve('app-builder-lib/package.json'));
 if(libRequire('./package.json').version!=='26.0.12')throw new Error('Review the NSIS adapter before upgrading electron-builder');
 const {NsisTarget}=libRequire('./out/targets/nsis/NsisTarget.js');
 const zipRoot=dirname(libRequire.resolve('7zip-bin/package.json'));
 if(libRequire('7zip-bin/package.json').version!=='5.2.0')throw new Error('Review extractor and notices before changing 7zip-bin');
 const marker=Symbol.for('lxe.transactional-installer');
 if(NsisTarget.prototype[marker])return;
 NsisTarget.prototype[marker]=true;
 const compute=NsisTarget.prototype.computeFinalScript;
 const templates=join(dirname(builderRequire.resolve('app-builder-lib/package.json')),'templates/nsis');
 NsisTarget.prototype.computeFinalScript=async function(source,...args){
  const output=join(this.outDir,'.nsis-update-installer');await mkdir(output,{recursive:true});
  const helper=join(output,'installer.nsh'),section=join(output,'installSection.nsh'),ui=join(output,'assistedInstaller.nsh');
  await writeFile(helper,installerHelper(await readFile(join(templates,'include/installer.nsh'),'utf8')));
  await writeFile(section,installSection(await readFile(join(templates,'installSection.nsh'),'utf8'),helper));
  await writeFile(ui,assisted(await readFile(join(templates,'assistedInstaller.nsh'),'utf8')));
  const uninstall=join(output,'uninstaller.nsh');
  await writeFile(uninstall,uninstaller(await readFile(join(templates,'uninstaller.nsh'),'utf8')));
  const sourceTool=join(zipRoot,'win/x64/7za.exe'),tool=join(output,'7za.exe');await copyFile(sourceTool,tool);await this.packager.sign(tool);
  let adapted=replaceOnce(source,'!include "installSection.nsh"',`!include "${section}"`);
  adapted=replaceOnce(adapted,'!include "assistedInstaller.nsh"',`!include "${ui}"`);
  adapted=replaceOnce(adapted,'!include "uninstaller.nsh"',`!include "${uninstall}"`);
  for(const name of ['allowOnlyOneInstallerInstance.nsh','installUtil.nsh']){
   const file=join(output,name);await writeFile(file,cleanupExits(await readFile(join(templates,'include',name),'utf8')));
   adapted=replaceOnce(adapted,`!include "${name}"`,`!include "${file}"`);
  }
  return `!define LXE_SEVENZIP_PATH "${tool}"\n${await compute.call(this,adapted,...args)}`;
 };
}
module.exports=installAdapter;
Object.assign(module.exports,{replaceOnce,installSection,installerHelper,assisted,uninstaller,cleanupExits});
