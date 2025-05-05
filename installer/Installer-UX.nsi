; Copyright(C) 2024-2025 Advanced Micro Devices, Inc. All rights reserved.
; SPDX-License-Identifier: MIT
; raux Installer UX Script - Additional tasks for the main installer

; This file contains additional UX-related functions that can be included
; by the main Installer.nsi script.

; Specify that admin privileges are not required
RequestExecutionLevel user

; Include required plugins and macros
!include LogicLib.nsh
; Include FileFunc.nsh for GetParameters and other file functions
!include FileFunc.nsh
!insertmacro GetParameters
!insertmacro GetOptions

; Include modern UI elements
!include "MUI2.nsh"

; Define constants - moved to the top so they're available throughout the script
!define /ifndef PRODUCT_NAME "RAUX"
!define /ifndef PROJECT_NAME "RAUX"
!define /ifndef PROJECT_NAME_CONCAT "raux"
!define /ifndef RAUX_RELEASE_VERSION "v0.6.5+raux.0.1.0.4f7c160"
!define /ifndef GITHUB_REPO "https://github.com/aigdat/${PROJECT_NAME_CONCAT}.git"
!define /ifndef EMPTY_FILE_NAME "empty_file.txt"
!define /ifndef ICON_FILE "${__FILE__}\..\..\static\${PROJECT_NAME_CONCAT}.ico"
!define /ifndef ICON_DEST "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}.ico"
!define /ifndef PYTHON_VERSION "3.11.8"
!define /ifndef PYTHON_DIR "python"
!define /ifndef PYTHON_EMBED_URL "https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip"
!define /ifndef GET_PIP_URL "https://bootstrap.pypa.io/get-pip.py"
; Add configurable release version parameter
!define RAUX_RELEASE_BASE_URL "https://github.com/aigdat/raux/releases/download/${RAUX_RELEASE_VERSION}"

; This is a compile-time fix to make sure that our selfhost CI runner can successfully install,
; since LOCALAPPDATA points to C:\Windows for "system users"
InstallDir "$LOCALAPPDATA\${PROJECT_NAME}"

; Read version from version.py
!tempfile TMPFILE
!system 'python -c "import sys; sys.path.append(\"..\"); from version import main; main()" > "${TMPFILE}"'
!define /file raux_VERSION "${TMPFILE}"
!delfile "${TMPFILE}"

; Define variables
Var PythonPath
Var LogFilePath
Var RauxReleaseURL
Var LocalReleasePath ; Variable for local release path that bypasses GitHub downloads

; Finish Page settings
!define MUI_TEXT_FINISH_INFO_TITLE "${PRODUCT_NAME} installed successfully!"
!define MUI_TEXT_FINISH_INFO_TEXT "${PRODUCT_NAME} has been installed successfully! A shortcut has been added to your Desktop. What would you like to do next?"

!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION RunAmdOpenWebUI
!define MUI_FINISHPAGE_RUN_TEXT "Run ${PRODUCT_NAME}"
!define MUI_FINISHPAGE_RUN_NOTCHECKED

; MUI Settings
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

; Set the installer icon
Icon ${ICON_FILE}

; Language settings
LangString MUI_TEXT_WELCOME_INFO_TITLE "${LANG_ENGLISH}" "Welcome to the ${PRODUCT_NAME} Installer"
LangString MUI_TEXT_WELCOME_INFO_TEXT "${LANG_ENGLISH}" "This wizard will install ${PRODUCT_NAME} on your computer."
LangString MUI_TEXT_DIRECTORY_TITLE "${LANG_ENGLISH}" "Select Installation Directory"
LangString MUI_TEXT_INSTALLING_TITLE "${LANG_ENGLISH}" "Installing ${PRODUCT_NAME}"
LangString MUI_TEXT_FINISH_TITLE "${LANG_ENGLISH}" "Installation Complete"
LangString MUI_TEXT_FINISH_SUBTITLE "${LANG_ENGLISH}" "Thank you for installing ${PRODUCT_NAME}!"
LangString MUI_TEXT_ABORT_TITLE "${LANG_ENGLISH}" "Installation Aborted"
LangString MUI_TEXT_ABORT_SUBTITLE "${LANG_ENGLISH}" "Installation has been aborted."

; Use a simple log initialization function with a fixed path
Function InitializeLog
  ; Create the log directory if it doesn't exist
  CreateDirectory "$LOCALAPPDATA\${PROJECT_NAME}"
  
  ; Use a fixed log file path
  StrCpy $LogFilePath "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_install.log"
  
  ; Debug the log file path
  DetailPrint "Log file path: $LogFilePath"
  
  ; Clear the existing log file
  FileOpen $0 $LogFilePath "w"
  FileWrite $0 "=== ${PRODUCT_NAME} Installation Log ===\r\n"
  FileWrite $0 "Version: ${RAUX_RELEASE_VERSION}\r\n"
  FileWrite $0 "LogFile: $LogFilePath\r\n"
  FileWrite $0 "======================================\r\n\r\n"
  FileClose $0
  
  ; Push a message to the log using our LogMessage function
  Push "Installer initialization completed for log file: $LogFilePath"
  Call LogMessage
FunctionEnd

Function .onInit
  ; Initialize variables
  StrCpy $PythonPath "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\python.exe"
  StrCpy $LocalReleasePath "" ; Initialize to empty string
  
  ; Process command line parameters
  ${GetParameters} $R0
  DetailPrint "Command line parameters: $R0"
  ${GetOptions} $R0 "/LOCAL_RELEASE=" $LocalReleasePath
  
  ; If LocalReleasePath is not empty, log it
  ${If} $LocalReleasePath != ""
    DetailPrint "Local release path specified: $LocalReleasePath"
    DetailPrint "Will use local file instead of downloading from GitHub"
  ${Else}
    DetailPrint "No local release path specified, will download from GitHub"
  ${EndIf}
  
  ; Initialize the log file
  Call InitializeLog
FunctionEnd

; Helper function to log messages to the log file
Function LogMessage
  Exch $0 ; Get message from stack
  
  ; Always open in append mode to prevent overwriting
  FileOpen $1 $LogFilePath "a"
  ; Make sure to not add \r\n to the path itself
  FileWrite $1 "$0$\r$\n"
  FileClose $1
  
  ; Also output to detail window
  DetailPrint "$0"
  
  Pop $0
FunctionEnd

; Define a section for the installation
Section "Install Main Components" SEC01
  ; Log installation start
  DetailPrint "*** INSTALLATION STARTED ***"
  DetailPrint "------------------------"
  DetailPrint "- Installation Section -"
  DetailPrint "------------------------"

  ; Check if directory exists before proceeding
  IfFileExists "$LOCALAPPDATA\${PROJECT_NAME}\*.*" 0 continue_install
    ${IfNot} ${Silent}
      MessageBox MB_YESNO "An existing ${PRODUCT_NAME} installation was found at $LOCALAPPDATA\${PROJECT_NAME}.$\n$\nWould you like to remove it and continue with the installation?" IDYES remove_dir
      ; If user selects No, show exit message and quit the installer
      MessageBox MB_OK "Installation cancelled. Exiting installer..."
      DetailPrint "Installation cancelled by user"
      Quit
    ${Else}
      GoTo remove_dir
    ${EndIf}

  remove_dir:
    ; Try to remove directory and verify it was successful
    RMDir /r "$LOCALAPPDATA\${PROJECT_NAME}"
    DetailPrint "- Deleted all contents of install dir"

    IfFileExists "$LOCALAPPDATA\${PROJECT_NAME}\*.*" 0 continue_install
      ${IfNot} ${Silent}
        MessageBox MB_OK "Unable to remove existing installation. Please close any applications using ${PRODUCT_NAME} and try again."
      ${EndIf}
      DetailPrint "Failed to remove existing installation"
      Quit

  continue_install:
    ; Create fresh directory
    CreateDirectory "$LOCALAPPDATA\${PROJECT_NAME}"
    CreateDirectory "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}"

    ; Set the output path for future operations
    SetOutPath "$LOCALAPPDATA\${PROJECT_NAME}"

    DetailPrint "Starting '${PRODUCT_NAME}' Installation..."
    DetailPrint "Configuration:"
    DetailPrint "  Install Dir: $LOCALAPPDATA\${PROJECT_NAME}"
    DetailPrint "  Python Version: ${PYTHON_VERSION}"
    DetailPrint "  Python Path: $PythonPath"
    DetailPrint "-------------------------------------------"

    ; Setup Python first
    DetailPrint "[Python-Setup] Setting up Python ${PYTHON_VERSION}..."
    DetailPrint "[Python-Setup] Downloading embedded Python..."
    
    ; Download embedded Python
    ExecWait 'curl -s -o "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\python.zip" "${PYTHON_EMBED_URL}"' $0
    ${If} $0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to download Python"
      ${IfNot} ${Silent}
        MessageBox MB_OK "Failed to download Python. Installation will be aborted."
      ${EndIf}
      Quit
    ${EndIf}
    
    ; Extract Python zip
    DetailPrint "[Python-Setup] Extracting Python..."
    Push "[Python-Setup] Extracting Python..."
    Call LogMessage
    nsExec::ExecToStack 'powershell -Command "Expand-Archive -Path \"$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\python.zip\" -DestinationPath \"$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\" -Force"'
    Pop $0
    Pop $1
    ${If} $0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to extract Python"
      DetailPrint "[Python-Setup] Error details: $1"
      Push "[Python-Setup] ERROR: Failed to extract Python"
      Call LogMessage
      Push "[Python-Setup] Error details: $1"
      Call LogMessage
      ${IfNot} ${Silent}
        MessageBox MB_OK "Failed to extract Python. Installation will be aborted."
      ${EndIf}
      Quit
    ${EndIf}
    Delete "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\python.zip"
    
    ; Download get-pip.py
    DetailPrint "[Python-Setup] Setting up pip..."
    Push "[Python-Setup] Setting up pip..."
    Call LogMessage
    ExecWait 'curl -sSL "${GET_PIP_URL}" -o "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\get-pip.py"' $0
    ${If} $0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to download get-pip.py"
      Push "[Python-Setup] ERROR: Failed to download get-pip.py"
      Call LogMessage
      ${IfNot} ${Silent}
        MessageBox MB_OK "Failed to download get-pip.py. Installation will be aborted."
      ${EndIf}
      Quit
    ${EndIf}
    
    ; Install pip
    Push "[Python-Setup] Installing pip..."
    Call LogMessage
    ExecWait '"$PythonPath" "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\get-pip.py" --no-warn-script-location' $0
    ${If} $0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to install pip"
      Push "[Python-Setup] ERROR: Failed to install pip"
      Call LogMessage
      ${IfNot} ${Silent}
        MessageBox MB_OK "Failed to install pip. Installation will be aborted."
      ${EndIf}
      Quit
    ${EndIf}
    Delete "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\get-pip.py"
    
    ; Modify python*._pth file to include site-packages
    DetailPrint "[Python-Setup] Configuring Python paths..."
    Push "[Python-Setup] Configuring Python paths..."
    Call LogMessage
    FileOpen $2 "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\python311._pth" a
    FileSeek $2 0 END
    FileWrite $2 "$\r$\nLib$\r$\n"
    FileWrite $2 "$\r$\nLib\site-packages$\r$\n"
    FileClose $2

    ; Install required packages
    DetailPrint "[Python-Setup] Installing required packages..."
    Push "[Python-Setup] Installing required packages..."
    Call LogMessage
    nsExec::ExecToLog '"$PythonPath" -m pip install --upgrade pip setuptools wheel'
    Pop $R0
    ${If} $R0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to install basic Python packages"
      Push "[Python-Setup] ERROR: Failed to install basic Python packages"
      Call LogMessage
      ${IfNot} ${Silent}
        MessageBox MB_OK "ERROR: Failed to install required Python packages. Installation will be aborted."
      ${EndIf}
      Quit
    ${EndIf}

    DetailPrint "[Python-Setup] Installing requests package..."
    Push "[Python-Setup] Installing requests package..."
    Call LogMessage
    nsExec::ExecToLog '"$PythonPath" -m pip install requests'
    Pop $R0
    ${If} $R0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to install requests package"
      Push "[Python-Setup] ERROR: Failed to install requests package"
      Call LogMessage
      ${IfNot} ${Silent}
        MessageBox MB_OK "ERROR: Failed to install requests package. Installation will be aborted."
      ${EndIf}
      Quit
    ${EndIf}

    ; Pack into the installer
    ; Exclude hidden files (like .git, .gitignore) and the installation folder itself
    ; Include the installer script and LICENSE file
    File "${PROJECT_NAME_CONCAT}_installer.py"
    File "LICENSE"
    File ${ICON_FILE}

    ; Start RAUX installation
    DetailPrint "--------------------------"
    DetailPrint "- ${PROJECT_NAME} Installation -"
    DetailPrint "--------------------------"

    DetailPrint "- Creating ${PROJECT_NAME} installation directory..."
    CreateDirectory "$LOCALAPPDATA\${PROJECT_NAME}"
    
    DetailPrint "- Creating temporary directory for ${PROJECT_NAME} installation..."
    CreateDirectory "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp"
    SetOutPath "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp"
    
    DetailPrint "- Preparing for ${PROJECT_NAME} installation..."
    
    ; Check if we're using a local release or downloading
    DetailPrint "Local release path is: $LocalReleasePath"
    ${If} $LocalReleasePath != ""
      DetailPrint "Using local release file - skipping GitHub download"
    ${Else}
      DetailPrint "No local release file specified - will download from GitHub"
    ${EndIf}
    
    ; Download the release from GitHub or use local file
    DetailPrint "- Getting RAUX release ${RAUX_RELEASE_VERSION}..."
    Push "Starting acquisition of RAUX release ${RAUX_RELEASE_VERSION}"
    Call LogMessage
    Call DownloadRelease
    
    ; Copy the Python installer script to the temp directory (should be in the downloaded release)
    DetailPrint "- Checking for installer script in downloaded release..."
    IfFileExists "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\${PROJECT_NAME_CONCAT}_installer.py" found_installer_script copy_installer_script

    copy_installer_script:
      DetailPrint "- Installer script not found in release, using bundled script..."
      File "${PROJECT_NAME_CONCAT}_installer.py"
      Goto continue_installation

    found_installer_script:
      DetailPrint "- Using installer script from downloaded release..."

    continue_installation:
      DetailPrint "- Using Python script: $LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\${PROJECT_NAME_CONCAT}_installer.py"
      DetailPrint "- Installation directory: $LOCALAPPDATA\${PROJECT_NAME}"
      DetailPrint "- Using standalone Python for the entire installation process"
      DetailPrint "- RAUX version: ${RAUX_RELEASE_VERSION}"
    
      ; Execute the Python script with the required parameters using standalone Python
      Push "Executing installer script with Python"
      Call LogMessage

      ; Enhanced logging to diagnose command execution
      ${If} $LocalReleasePath != ""
        ; Log exact command with clear formatting for debugging
        Push "Command to execute (with local release):"
        Call LogMessage
        Push "$PythonPath $LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\${PROJECT_NAME_CONCAT}_installer.py --install-dir $LOCALAPPDATA\${PROJECT_NAME} --debug --log-file $LogFilePath --version ${RAUX_RELEASE_VERSION} --local-release $LocalReleasePath"
        Call LogMessage
        
        ; Use PowerShell for more reliable parameter passing with paths
        DetailPrint "Running installer script using PowerShell for better parameter handling..."
        nsExec::ExecToLog 'powershell -Command "& ''$PythonPath'' ''$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\${PROJECT_NAME_CONCAT}_installer.py'' --install-dir ''$LOCALAPPDATA\${PROJECT_NAME}'' --debug --log-file ''$LogFilePath'' --version ''${RAUX_RELEASE_VERSION}'' --local-release ''$LocalReleasePath''"'
        Pop $R0
      ${Else}
        Push "Command to execute (standard GitHub download):"
        Call LogMessage 
        Push "$PythonPath $LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\${PROJECT_NAME_CONCAT}_installer.py --install-dir $LOCALAPPDATA\${PROJECT_NAME} --debug --log-file $LogFilePath --version ${RAUX_RELEASE_VERSION}"
        Call LogMessage
        
        ; Standard execution for GitHub downloads
        DetailPrint "Running: $PythonPath $LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\${PROJECT_NAME_CONCAT}_installer.py --install-dir $LOCALAPPDATA\${PROJECT_NAME} --debug --log-file $LogFilePath --version ${RAUX_RELEASE_VERSION}"
        ExecWait '"$PythonPath" "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\${PROJECT_NAME_CONCAT}_installer.py" --install-dir "$LOCALAPPDATA\${PROJECT_NAME}" --debug --log-file "$LogFilePath" --version "${RAUX_RELEASE_VERSION}"' $R0
      ${EndIf}

      DetailPrint "${PRODUCT_NAME} installation exit code: $R0"
      Push "${PRODUCT_NAME} installation exit code: $R0"
      Call LogMessage
      
      ; Check if installation was successful
      ${If} $R0 == 0
        DetailPrint "*** ${PRODUCT_NAME} INSTALLATION COMPLETED ***"
        Push "*** ${PRODUCT_NAME} INSTALLATION COMPLETED ***"
        Call LogMessage
      ${Else}
        DetailPrint "*** ${PRODUCT_NAME} INSTALLATION FAILED ***"
        Push "*** ${PRODUCT_NAME} INSTALLATION FAILED ***"
        Call LogMessage
        Push "For additional support, please contact support@amd.com and include the log file: $LogFilePath"
        Call LogMessage
        ${IfNot} ${Silent}
          MessageBox MB_OK "${PRODUCT_NAME} installation failed.$\n$\nPlease check the log file at:$\n$LogFilePath$\n$\nfor detailed error information."
        ${EndIf}
      ${EndIf}
      
      ; IMPORTANT: Do NOT attempt to clean up the temporary directory
      ; This is intentional to prevent file-in-use errors
      ; The directory will be left for the system to clean up later
      DetailPrint "- Intentionally NOT cleaning up temporary directory to prevent file-in-use errors"
      SetOutPath "$INSTDIR"
      
      ; Create RAUX shortcut - using the GAIA icon but pointing to RAUX installation
      DetailPrint "- Creating ${PROJECT_NAME} desktop shortcut"
      
      ; Copy the launcher scripts to the RAUX installation directory if they exist
      DetailPrint "- Copying ${PROJECT_NAME} launcher scripts"
      
      ; Use /nonfatal flag to prevent build failure if files don't exist
      File /nonfatal "/oname=$LOCALAPPDATA\${PROJECT_NAME}\launch_${PROJECT_NAME_CONCAT}.ps1" "${__FILE__}\..\launch_${PROJECT_NAME_CONCAT}.ps1"
      File /nonfatal "/oname=$LOCALAPPDATA\${PROJECT_NAME}\launch_${PROJECT_NAME_CONCAT}.cmd" "${__FILE__}\..\launch_${PROJECT_NAME_CONCAT}.cmd"
      
      ; Copy the icon file to the RAUX installation directory
      DetailPrint "- Copying ${PROJECT_NAME} icon file"
      File "/oname=${ICON_DEST}" "${ICON_FILE}"
      
      ; Create shortcut to the batch wrapper script (will appear as a standalone app)
      DetailPrint "- Creating desktop shortcut with version ${RAUX_RELEASE_VERSION}"
      CreateShortcut "$DESKTOP\GAIA-UI-BETA.lnk" "$LOCALAPPDATA\${PROJECT_NAME}\launch_${PROJECT_NAME_CONCAT}.cmd" "--version ${RAUX_RELEASE_VERSION}" "${ICON_DEST}"

SectionEnd

Function RunAmdOpenWebUI
  ExecShell "open" "http://localhost:8080/"
FunctionEnd

; Function to download release assets from GitHub or use local file
Function DownloadRelease
  ; Check if a local release path was specified
  DetailPrint "Local release path value: '$LocalReleasePath'"
  Push "LOCAL_RELEASE parameter value: '$LocalReleasePath'"
  Call LogMessage
  
  ${If} $LocalReleasePath != ""
    ; Use local release file instead of downloading from GitHub
    Push "Using local release file: $LocalReleasePath"
    Call LogMessage
    Push "Skipping GitHub download entirely"
    Call LogMessage
    
    ; Verify the file exists with explicit logging
    IfFileExists "$LocalReleasePath" local_release_file_exists local_release_file_missing
    
    local_release_file_missing:
      Push "ERROR: Specified local release file does not exist: $LocalReleasePath"
      Call LogMessage
      ${IfNot} ${Silent}
        MessageBox MB_OK "The specified local release file does not exist:$\n$LocalReleasePath$\n$\nPlease check the path and try again."
      ${EndIf}
      Quit
    
    local_release_file_exists:
      ; Copy local file to temp directory with better path handling
      Push "Copying local release file to temp directory..."
      Call LogMessage
      CopyFiles "$LocalReleasePath" "$TEMP\raux-release.zip"
      Push "Local file copied to: $TEMP\raux-release.zip"
      Call LogMessage
      Goto extract_release
  ${Else}
    ; Use GitHub release URL - standard download process
    ; Remove the 'v' prefix for the filename if present
    StrCpy $1 ${RAUX_RELEASE_VERSION} 1
    ${If} $1 == "v"
      StrCpy $1 ${RAUX_RELEASE_VERSION} "" 1  ; Get substring starting from position 1 (skipping 'v')
      StrCpy $RauxReleaseURL "${RAUX_RELEASE_BASE_URL}/raux-$1-setup.zip"
    ${Else}
      StrCpy $RauxReleaseURL "${RAUX_RELEASE_BASE_URL}/raux-${RAUX_RELEASE_VERSION}-setup.zip"
    ${EndIf}
    
    ; Download the asset file
    Push "Downloading RAUX release ${RAUX_RELEASE_VERSION}"
    Call LogMessage
    Push "URL: $RauxReleaseURL"
    Call LogMessage
    
    ExecWait 'curl -L -o "$TEMP\raux-release.zip" "$RauxReleaseURL"' $0
    
    ${If} $0 != 0
      Push "ERROR: Failed to download release"
      Call LogMessage
      ${IfNot} ${Silent}
        MessageBox MB_OK "Failed to download release from GitHub. Please check your internet connection and try again."
      ${EndIf}
      Quit
    ${EndIf}
  ${EndIf}
  
  extract_release:
  ; Extract the downloaded release
  Push "Extracting release..."
  Call LogMessage
  CreateDirectory "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp"
  nsExec::ExecToStack 'powershell -Command "Expand-Archive -Path \"$TEMP\raux-release.zip\" -DestinationPath \"$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\" -Force"'
  Pop $0
  Pop $1
  
  ${If} $0 != 0
    Push "ERROR: Failed to extract release"
    Call LogMessage
    Push "Error details: $1"
    Call LogMessage
    ${IfNot} ${Silent}
      MessageBox MB_OK "Failed to extract downloaded release. Installation will be aborted."
    ${EndIf}
    Quit
  ${EndIf}
  
  Push "Successfully extracted release"
  Call LogMessage
  Delete "$TEMP\raux-release.zip"
FunctionEnd
