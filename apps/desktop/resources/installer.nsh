!ifndef BUILD_UNINSTALLER
!macro customHeader
!include "${PROJECT_DIR}\resources\office-prerequisites.nsh"
!include "${PROJECT_DIR}\resources\update-installer.nsh"
!macroend
!macro customInstall
  Call LxeCommitApplication
!macroend
!endif

!ifdef BUILD_UNINSTALLER
!include "FileFunc.nsh"
!include "LogicLib.nsh"

Function un.LxeRemoveProgramFilesPreservingVar
  CreateDirectory "$PLUGINSDIR\old-install"
  FindFirst $R0 $R1 "$INSTDIR\*.*"

  lxe_remove_loop:
    StrCmp $R1 "" lxe_remove_complete
    StrCmp $R1 "." lxe_remove_next
    StrCmp $R1 ".." lxe_remove_next
    StrCmp $R1 "var" lxe_remove_next

    IfFileExists "$INSTDIR\$R1\*.*" lxe_remove_directory lxe_remove_file

    lxe_remove_directory:
      CreateDirectory "$PLUGINSDIR\old-install\$R1"
      Push "\$R1"
      Call un.atomicRMDir
      Pop $R2
      ${If} $R2 != 0
        Goto lxe_remove_failed
      ${EndIf}
      Goto lxe_remove_next

    lxe_remove_file:
      ClearErrors
      Rename "$INSTDIR\$R1" "$PLUGINSDIR\old-install\$R1"
      ${If} ${Errors}
        StrCpy $R2 "$INSTDIR\$R1"
        Goto lxe_remove_failed
      ${EndIf}

    lxe_remove_next:
      FindNext $R0 $R1
      Goto lxe_remove_loop

  lxe_remove_failed:
    FindClose $R0
    Push ""
    Call un.restoreFiles
    Pop $R3
    Abort "无法更新或卸载 LXE Agent，因为文件正在使用：$R2"

  lxe_remove_complete:
    FindClose $R0
    RMDir /r "$PLUGINSDIR\old-install"

    # atomicRMDir leaves the now-empty directory structure in place. Remove only
    # those program directories; var remains untouched in its original location.
    FindFirst $R0 $R1 "$INSTDIR\*.*"

  lxe_cleanup_loop:
    StrCmp $R1 "" lxe_cleanup_complete
    StrCmp $R1 "." lxe_cleanup_next
    StrCmp $R1 ".." lxe_cleanup_next
    StrCmp $R1 "var" lxe_cleanup_next
    RMDir /r "$INSTDIR\$R1"
    Delete "$INSTDIR\$R1"

  lxe_cleanup_next:
    FindNext $R0 $R1
    Goto lxe_cleanup_loop

  lxe_cleanup_complete:
    FindClose $R0
FunctionEnd

!macro customUnInit
  ${GetParameters} "$0"
  ClearErrors
  ${GetOptions} "$0" "/DELETE_LXE_DATA=" $1
  ${IfNot} ${Errors}
    DetailPrint "DELETE_LXE_DATA is ignored. User data and WireGuard configuration are always retained."
  ${EndIf}
!macroend

!macro customRemoveFiles
  Call un.LxeRemoveProgramFilesPreservingVar
  RMDir "$INSTDIR"
!macroend
!endif
