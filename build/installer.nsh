; Custom NSIS installer script for Open Headers
; Includes information about bundled Portable Git

!macro customInstall
  ; Show progress messages during installation
  DetailPrint "Installing OpenHeaders..."
  SetDetailsPrint both
  
  ; Show extraction progress
  DetailPrint "Extracting files..."
  
  ; Clean up old/corrupted registry entries first
  DetailPrint "Cleaning up old protocol handler entries..."
  DeleteRegKey HKCR "openheaders"
  
  ; Register openheaders:// protocol with clean entries
  DetailPrint "Registering openheaders:// protocol handler..."
  WriteRegStr HKCR "openheaders" "" "URL:OpenHeaders Protocol"
  WriteRegStr HKCR "openheaders" "URL Protocol" ""
  WriteRegStr HKCR "openheaders\DefaultIcon" "" "$INSTDIR\OpenHeaders.exe,0"
  WriteRegStr HKCR "openheaders\shell" "" "open"
  WriteRegStr HKCR "openheaders\shell\open" "" "Open with OpenHeaders"
  WriteRegStr HKCR "openheaders\shell\open" "FriendlyAppName" "OpenHeaders"
  WriteRegStr HKCR "openheaders\shell\open\command" "" '"$INSTDIR\OpenHeaders.exe" "%1"'
  
  ; Also register in HKCU for current user (fallback)
  WriteRegStr HKCU "Software\Classes\openheaders" "" "URL:OpenHeaders Protocol"
  WriteRegStr HKCU "Software\Classes\openheaders" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\openheaders\DefaultIcon" "" "$INSTDIR\OpenHeaders.exe,0"
  WriteRegStr HKCU "Software\Classes\openheaders\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\openheaders\shell\open" "" "Open with OpenHeaders"
  WriteRegStr HKCU "Software\Classes\openheaders\shell\open" "FriendlyAppName" "OpenHeaders"
  WriteRegStr HKCU "Software\Classes\openheaders\shell\open\command" "" '"$INSTDIR\OpenHeaders.exe" "%1"'
  
  DetailPrint "Protocol handler registered successfully."
  
  ; Inform user about bundled Portable Git
  DetailPrint "Open Headers includes Portable Git for team workspace features."
  DetailPrint "No additional Git installation is required."
  
  ; Verify portable Git was bundled correctly
  ${If} ${FileExists} "$INSTDIR\resources\git\bin\git.exe"
    DetailPrint "Portable Git successfully bundled at: $INSTDIR\resources\git"
  ${Else}
    DetailPrint "Warning: Portable Git not found in bundle. Team workspaces may not work correctly."
    DetailPrint "Please ensure the installer was built with 'npm run download-portable-git' before packaging."
  ${EndIf}
!macroend

!macro customUnInstall
  ; Show uninstall progress
  DetailPrint "Uninstalling OpenHeaders..."
  SetDetailsPrint both
  
  ; Remove protocol handlers
  DetailPrint "Removing protocol handlers..."
  DeleteRegKey HKCR "openheaders"
  DeleteRegKey HKCU "Software\Classes\openheaders"
  
  ; Clean up registry entries
  DetailPrint "Cleaning up registry entries..."
  DeleteRegValue HKLM "Software\RegisteredApplications" "OpenHeaders"
  DeleteRegValue HKCU "Software\RegisteredApplications" "OpenHeaders"
  
  ; Remove application files
  DetailPrint "Removing application files..."
  Sleep 500
  
  ; Final cleanup
  DetailPrint "Completing uninstallation..."
!macroend