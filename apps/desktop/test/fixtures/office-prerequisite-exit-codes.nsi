# Compile with /DLXE_TEST_OUTPUT=<exe> and run /S. Exit 0 proves the same UAC
# helper used by the installer preserves success, failure and restart codes.
Unicode true
RequestExecutionLevel user
Name "LXE Office prerequisite exit-code test"
OutFile "${LXE_TEST_OUTPUT}"
SilentInstall silent
!include "${__FILEDIR__}\..\..\resources\office-prerequisites.nsh"

!macro AssertExit EXPECTED
  !insertmacro LxeExecElevated "$SYSDIR\cmd.exe" "/c exit ${EXPECTED}" $0 $1
  ${If} $0 != ${EXPECTED}
  ${OrIf} $1 != 0
    SetErrorLevel 91
    Abort "Expected ${EXPECTED}; received exit=$0, Win32=$1"
  ${EndIf}
!macroend

Section
  !insertmacro AssertExit 0
  !insertmacro AssertExit 42
  !insertmacro AssertExit 3010
  InitPluginsDir
  !insertmacro LxeExecElevated "$PLUGINSDIR\missing-office-installer.exe" "" $0 $1
  ${If} $0 != -1
  ${OrIf} $1 != 2
    SetErrorLevel 92
    Abort "Expected missing-file diagnostic; received exit=$0, Win32=$1"
  ${EndIf}
SectionEnd
