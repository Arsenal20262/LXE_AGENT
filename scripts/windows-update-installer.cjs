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
 !insertmacro readReg $R4 "\${ROOT_KEY}" "\${INSTALL_REGISTRY_KEY}" InstallLocation
 \${If} $R4 == $INSTDIR
  StrCpy $R0 0
  ClearErrors
 \${Else}
  Push "\${ROOT_KEY}"
  Call uninstallOldVersion
 \${EndIf}
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
 s=replaceOnce(s,'    !insertmacro skipPageIfUpdated\n    !insertmacro MUI_PAGE_DIRECTORY',`    !define MUI_PAGE_CUSTOMFUNCTION_PRE LxeDirectoryPagePre
    !insertmacro MUI_PAGE_DIRECTORY
    Function LxeDirectoryPagePre
      ReadRegStr $0 SHELL_CONTEXT "\${INSTALL_REGISTRY_KEY}" InstallLocation
      \${If} $0 != ""
        StrCpy $INSTDIR $0
        Abort
      \${EndIf}
      \${If} \${isUpdated}
        Abort
      \${EndIf}
    FunctionEnd`);
 s=replaceOnce(s,'    Function instFilesPre',`    Function instFilesPre
      ReadRegStr $0 SHELL_CONTEXT "\${INSTALL_REGISTRY_KEY}" InstallLocation
      \${If} $0 != ""
        StrCpy $INSTDIR $0
        Return
      \${EndIf}`);
 return s;
}
function cleanupExits(source){return source.replaceAll(/^(\s*)Quit\s*$/gm,'$1!ifndef BUILD_UNINSTALLER\n$1Call LxeCleanupApplication\n$1!endif\n$1Quit');}
async function installAdapter(context){
 const desktopRequire=createRequire(join(context.packager.projectDir,'package.json'));
 const builderRequire=createRequire(desktopRequire.resolve('electron-builder/package.json'));
 const library=builderRequire('app-builder-lib'); // initialize mutually dependent platform modules
 const libRequire=createRequire(builderRequire.resolve('app-builder-lib/package.json'));
 if(libRequire('./package.json').version!=='26.0.12')throw new Error('Review the NSIS adapter before upgrading electron-builder');
 const {NsisTarget}=libRequire('./out/targets/nsis/NsisTarget.js');
 const {getPath7za}=libRequire('./out/toolsets/7zip.js');
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
  const sourceTool=await getPath7za(),tool=join(output,'7za.exe');await copyFile(sourceTool,tool);await this.packager.signIf(tool);
  let adapted=replaceOnce(source,'!include "installSection.nsh"',`!include "${section}"`);
  adapted=replaceOnce(adapted,'!include "assistedInstaller.nsh"',`!include "${ui}"`);
  for(const name of ['allowOnlyOneInstallerInstance.nsh','installUtil.nsh']){
   const file=join(output,name);await writeFile(file,cleanupExits(await readFile(join(templates,'include',name),'utf8')));
   adapted=replaceOnce(adapted,`!include "${name}"`,`!include "${file}"`);
  }
  return `!define LXE_SEVENZIP_PATH "${tool}"\n!define LXE_SEVENZIP_LICENSE_DIR "${dirname(dirname(sourceTool))}"\n${await compute.call(this,adapted,...args)}`;
 };
}
module.exports=installAdapter;
Object.assign(module.exports,{replaceOnce,installSection,installerHelper,assisted,cleanupExits});
