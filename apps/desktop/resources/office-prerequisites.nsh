!include "LogicLib.nsh"
!include "WordFunc.nsh"

# Kept in sync with config/desktop-runtime/office/vc-redist.lock.json.
!define LXE_VC_REDIST_VERSION "14.51.36247.0"

# ExecShellWait in the bundled NSIS waits but does not return the child exit code.
# Use ShellExecuteEx so both UAC launch errors and MSI restart codes stay visible.
# Structure layout follows https://nsis.sourceforge.io/ShellExecWait.
!macro LxeExecElevated FILE PARAMETERS EXIT_CODE WIN32_ERROR
  System::Store S
  !if ${NSIS_PTR_SIZE} > 4
    !define /math LXE_SHELLEXECUTEINFO_SIZE 14 * ${NSIS_PTR_SIZE}
  !else
    !define LXE_SHELLEXECUTEINFO_SIZE 60
  !endif
  System::Call '*(&i${LXE_SHELLEXECUTEINFO_SIZE})p.r0'
  System::Call '*$0(i ${LXE_SHELLEXECUTEINFO_SIZE},i 0x440,p $hwndparent,t "runas",t $\'${FILE}$\',t $\'${PARAMETERS}$\',p 0,i 0)p.r0'
  System::Call 'shell32::ShellExecuteEx(t)(pr0)i.r1 ?e'
  Pop $2
  StrCpy $4 -1
  ${If} $1 != 0
    System::Call '*$0(i,i,p,p,p,p,p,p,p,p,p,p,p,p,p.r3)'
    System::Call 'kernel32::WaitForSingleObject(pr3,i -1)i.r1 ?e'
    Pop $2
    ${If} $1 == 0
      System::Call 'kernel32::GetExitCodeProcess(pr3,*i.r4)i.r1 ?e'
      Pop $2
      ${If} $1 != 0
        StrCpy $2 0
      ${EndIf}
    ${EndIf}
    System::Call 'kernel32::CloseHandle(pr3)'
  ${EndIf}
  System::Free $0
  Push $4
  Push $2
  System::Store L
  Pop ${WIN32_ERROR}
  Pop ${EXIT_CODE}
  !undef LXE_SHELLEXECUTEINFO_SIZE
!macroend

Function LxeOfficePrerequisites
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ReadRegStr $1 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Version"
  SetRegView lastused
  ${If} $0 == 1
    StrCpy $1 $1 "" 1
    ${VersionCompare} "$1" "${LXE_VC_REDIST_VERSION}" $2
    ${If} $2 != 2
      Return
    ${EndIf}
  ${EndIf}
  IfFileExists "$INSTDIR\resources\runtime\office\vc_redist.x64.exe" +2 0
    Abort "Missing bundled VC++ x64 installer: $INSTDIR\resources\runtime\office\vc_redist.x64.exe"
  !insertmacro LxeExecElevated "$INSTDIR\resources\runtime\office\vc_redist.x64.exe" '/install /quiet /norestart /log "$TEMP\lxe-vc-redist.log"' $0 $1
  ${If} $1 != 0
    Abort "VC++ x64 setup launch/wait failed (Win32=$1). Log: $TEMP\lxe-vc-redist.log"
  ${EndIf}
  ${If} $0 == 3010
    SetRebootFlag true
  ${ElseIf} $0 != 0
    Abort "VC++ x64 setup failed with exit code $0. Log: $TEMP\lxe-vc-redist.log"
  ${EndIf}
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ReadRegStr $1 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Version"
  SetRegView lastused
  StrCpy $1 $1 "" 1
  ${VersionCompare} "$1" "${LXE_VC_REDIST_VERSION}" $2
  ${If} $0 != 1
  ${OrIf} $2 == 2
    Abort "VC++ x64 setup did not register the required runtime (Installed=$0, Version=$1). Log: $TEMP\lxe-vc-redist.log"
  ${EndIf}
FunctionEnd
