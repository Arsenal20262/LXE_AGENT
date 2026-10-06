!include "LogicLib.nsh"
Var LxeFinal
Var LxeStage
Var LxeBackup
Var LxeCommitted
Var LxeResult
Var LxeResultCode
Var LxePrevious
Var LxePreviousUser
Var LxePreviousMachine
Var LxePriorSource

!macro LxeRunTransaction ACTION
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\lxe-update-files.ps1" -Action ${ACTION} -InstallRoot "$LxeFinal" -StageRoot "$LxeStage" -BackupRoot "$LxeBackup" -ResultPath "$LxeResult" -ProductName "${PRODUCT_NAME}" -ExecutableName "${APP_EXECUTABLE_FILENAME}"'
  Pop $LxeResultCode
  Pop $R1
  DetailPrint $R1
!macroend

Function LxeInstallFailure
  DetailPrint "Update failed. Diagnostic: $LxeResult; backup: $LxeBackup"
  MessageBox MB_OK|MB_ICONSTOP "Update failed ($LxeResultCode). Diagnostic: $LxeResult$\r$\nBackup: $LxeBackup" /SD IDOK
  SetErrorLevel 2
  Quit
FunctionEnd

!macro LxeExtractPayload FILE
  nsExec::ExecToStack '"$PLUGINSDIR\lxe-7za.exe" x -y -bd -bb0 "-o$INSTDIR" "${FILE}"'
  Pop $LxeResultCode
  Pop $R1
  ${If} $LxeResultCode != 0
    FileOpen $R2 "$LxeResult" w
    FileWrite $R2 "7za exit: $LxeResultCode$\r$\n$R1"
    FileClose $R2
    Push $LxeResultCode
    Call LxeCleanupApplication
    Pop $LxeResultCode
    Call LxeInstallFailure
  ${EndIf}
!macroend

!macro LxeStageApplication
  ReadRegStr $LxePrevious SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $LxePreviousUser HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $LxePreviousMachine HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadINIStr $LxePriorSource "$LxePrevious\lxe-legacy-data.ini" "LXE" "priorSource"
  ${If} $LxePriorSource == ""
    ReadINIStr $LxePriorSource "$LxePrevious\lxe-legacy-data.ini" "LXE" "previous"
  ${EndIf}
  StrCpy $LxeFinal $INSTDIR
  System::Call 'ole32::CoCreateGuid(g .r0)i.r1'
  ${If} $1 != 0
    Abort "Could not create installer transaction ID: $1"
  ${EndIf}
  StrCpy $LxeStage "$INSTDIR.new-$0"
  StrCpy $LxeBackup "$INSTDIR.old-$0"
  StrCpy $LxeResult "$TEMP\lxe-update-$0.log"
  StrCpy $LxeCommitted ""
  ClearErrors
  CreateDirectory "$LxeStage"
  ${If} ${Errors}
    Abort "Could not create staging directory: $LxeStage"
  ${EndIf}
  File /oname=$PLUGINSDIR\lxe-7za.exe "${LXE_SEVENZIP_PATH}"
  File /oname=$PLUGINSDIR\lxe-update-files.ps1 "${PROJECT_DIR}\resources\update-files.ps1"
  StrCpy $INSTDIR $LxeStage
  SetOutPath $INSTDIR
  !insertmacro installApplicationFiles
  # A UTF-16 BOM makes WriteINIStr preserve Chinese paths on every system locale.
  ClearErrors
  FileOpen $R3 "$INSTDIR\lxe-legacy-data.ini" w
  FileWriteByte $R3 255
  FileWriteByte $R3 254
  FileClose $R3
  WriteINIStr "$INSTDIR\lxe-legacy-data.ini" "LXE" "appId" "${APP_ID}"
  WriteINIStr "$INSTDIR\lxe-legacy-data.ini" "LXE" "scope" "$installMode"
  WriteINIStr "$INSTDIR\lxe-legacy-data.ini" "LXE" "previous" "$LxePrevious"
  WriteINIStr "$INSTDIR\lxe-legacy-data.ini" "LXE" "perUser" "$LxePreviousUser"
  WriteINIStr "$INSTDIR\lxe-legacy-data.ini" "LXE" "perMachine" "$LxePreviousMachine"
  WriteINIStr "$INSTDIR\lxe-legacy-data.ini" "LXE" "priorSource" "$LxePriorSource"
  ${If} ${Errors}
    System::Call 'kernel32::GetLastError() i.r0'
    Abort "Could not record legacy data locations (Win32=$0): $INSTDIR\lxe-legacy-data.ini"
  ${EndIf}
  File /oname=7zip-installer-LICENSE.txt "${PROJECT_DIR}\resources\7zip-LICENSE.txt"
  File /oname=7zip-installer-COPYING.txt "${PROJECT_DIR}\resources\7zip-COPYING.txt"
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" +2 0
    Abort "Staged executable is missing: $INSTDIR\${APP_EXECUTABLE_FILENAME}"
  IfFileExists "$INSTDIR\resources\app.asar" +2 0
    Abort "Staged application is missing: $INSTDIR\resources\app.asar"
  # Any prerequisite failure occurs before touching the installed program.
  Call LxeOfficePrerequisites
  StrCpy $INSTDIR $LxeFinal
  SetOutPath $PLUGINSDIR
!macroend

Function LxePromoteApplication
  SetOutPath $PLUGINSDIR
  !insertmacro LxeRunTransaction Promote
  ${If} $LxeResultCode != 0
    # The helper already attempted rollback and retained exact error details.
    StrCpy $LxeCommitted "failed"
    Call LxeInstallFailure
  ${EndIf}
  StrCpy $INSTDIR $LxeFinal
  SetOutPath $INSTDIR
FunctionEnd

Function LxeCleanupApplication
  ${If} $LxeFinal == ""
  ${OrIf} $LxeCommitted != ""
    Return
  ${EndIf}
  SetOutPath $PLUGINSDIR
  ${If} ${FileExists} "$LxeBackup\transaction.json"
    !insertmacro LxeRunTransaction Rollback
    ${If} $LxeResultCode != 0
      StrCpy $LxeCommitted "failed"
      Return
    ${EndIf}
  ${EndIf}
  # Only directories owned by this installer are discarded.
  !insertmacro LxeRunTransaction Commit
  StrCpy $INSTDIR $LxeFinal
FunctionEnd

Function .onGUIEnd
  Call LxeCleanupApplication
FunctionEnd

Function LxeCommitApplication
  # Never roll back after deleting any part of the old program.
  StrCpy $LxeCommitted "1"
  !insertmacro LxeRunTransaction Commit
  ${If} $LxeResultCode != 0
    DetailPrint "Installed successfully; backup cleanup failed. See $LxeResult"
  ${EndIf}
  ${If} $installMode == "all"
    SetShellVarContext current
  ${EndIf}
  ${GetParent} "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}" $R0
  CreateDirectory "$R0"
  # CopyFiles uses the Shell and can wait for an overwrite dialog even in /S.
  # CopyFile replaces our temporary cache file without involving Shell UI.
  System::Call 'kernel32::CopyFile(t "$EXEPATH",t "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}.new",i 0)i.r1 ?e'
  Pop $R2
  ${If} $1 != 0
    System::Call 'kernel32::MoveFileEx(t "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}.new",t "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}",i 9)i.r1 ?e'
    Pop $R2
  ${EndIf}
  ${If} $1 == 0
    FileOpen $R3 "$LxeResult" a
    FileWrite $R3 "$\r$\nInstalled successfully; installer cache replacement failed (Win32=$R2). Next update may download the complete installer."
    FileClose $R3
    Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}.new"
  ${EndIf}
  ${If} $installMode == "all"
    SetShellVarContext all
  ${EndIf}
FunctionEnd
