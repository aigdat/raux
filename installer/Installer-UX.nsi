; Copyright(C) 2024-2025 Advanced Micro Devices, Inc. All rights reserved.
; SPDX-License-Identifier: MIT
; raux Installer UX Script - Additional tasks for the main installer

; This file contains additional UX-related functions that can be included
; by the main Installer.nsi script.

; Specify that admin privileges are not required
RequestExecutionLevel user

; Include required plugins and macros
!include LogicLib.nsh

; Include modern UI elements
!include "MUI2.nsh"

; Define constants - moved to the top so they're available throughout the script
!define /ifndef PRODUCT_NAME "RAUX"
!define /ifndef PROJECT_NAME "RAUX"
!define /ifndef PROJECT_NAME_CONCAT "raux"
!define /ifndef GITHUB_REPO "https://github.com/aigdat/${PROJECT_NAME_CONCAT}.git"
!define /ifndef EMPTY_FILE_NAME "empty_file.txt"
!define /ifndef ICON_FILE "${__FILE__}\..\..\static\${PROJECT_NAME_CONCAT}.ico"
!define /ifndef ICON_DEST "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}.ico"
!define /ifndef PYTHON_VERSION "3.11.8"
!define /ifndef PYTHON_DIR "python"
!define /ifndef PYTHON_EMBED_URL "https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip"
!define /ifndef GET_PIP_URL "https://bootstrap.pypa.io/get-pip.py"

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
LangString MUI_BUTTONTEXT_FINISH "${LANG_ENGLISH}" "Finish"
LangString MUI_TEXT_LICENSE_TITLE ${LANG_ENGLISH} "License Agreement"
LangString MUI_TEXT_LICENSE_SUBTITLE ${LANG_ENGLISH} "Please review the license terms before installing ${PRODUCT_NAME}."

Function .onInit
  ; Initialize variables
  StrCpy $PythonPath "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\python.exe"
  ; Fix the log file path to avoid variable substitution issues
  StrCpy $LogFilePath "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_install.log"
  
  ; Create the log directory if it doesn't exist
  CreateDirectory "$LOCALAPPDATA\${PROJECT_NAME}"
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
    nsExec::ExecToStack 'powershell -Command "Expand-Archive -Path \"$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\python.zip\" -DestinationPath \"$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\" -Force"'
    Pop $0
    Pop $1
    ${If} $0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to extract Python"
      DetailPrint "[Python-Setup] Error details: $1"
      ${IfNot} ${Silent}
        MessageBox MB_OK "Failed to extract Python. Installation will be aborted."
      ${EndIf}
      Quit
    ${EndIf}
    Delete "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\python.zip"
    
    ; Download get-pip.py
    DetailPrint "[Python-Setup] Setting up pip..."
    ExecWait 'curl -sSL "${GET_PIP_URL}" -o "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\get-pip.py"' $0
    ${If} $0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to download get-pip.py"
      ${IfNot} ${Silent}
        MessageBox MB_OK "Failed to download get-pip.py. Installation will be aborted."
      ${EndIf}
      Quit
    ${EndIf}
    
    ; Install pip
    ExecWait '"$PythonPath" "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\get-pip.py" --no-warn-script-location' $0
    ${If} $0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to install pip"
      ${IfNot} ${Silent}
        MessageBox MB_OK "Failed to install pip. Installation will be aborted."
      ${EndIf}
      Quit
    ${EndIf}
    Delete "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\get-pip.py"
    
    ; Modify python*._pth file to include site-packages
    DetailPrint "[Python-Setup] Configuring Python paths..."
    FileOpen $2 "$LOCALAPPDATA\${PROJECT_NAME}\${PYTHON_DIR}\python311._pth" a
    FileSeek $2 0 END
    FileWrite $2 "$\r$\nLib$\r$\n"
    FileWrite $2 "$\r$\nLib\site-packages$\r$\n"
    FileClose $2

    ; Install required packages
    DetailPrint "[Python-Setup] Installing required packages..."
    nsExec::ExecToLog '"$PythonPath" -m pip install --upgrade pip setuptools wheel'
    Pop $R0
    ${If} $R0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to install basic Python packages"
      ${IfNot} ${Silent}
        MessageBox MB_OK "ERROR: Failed to install required Python packages. Installation will be aborted."
      ${EndIf}
      Quit
    ${EndIf}

    DetailPrint "[Python-Setup] Installing requests package..."
    nsExec::ExecToLog '"$PythonPath" -m pip install requests'
    Pop $R0
    ${If} $R0 != 0
      DetailPrint "[Python-Setup] ERROR: Failed to install requests package"
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

    install_app:
      DetailPrint "--------------------------"
      DetailPrint "- ${PROJECT_NAME} Installation -"
      DetailPrint "--------------------------"

      DetailPrint "- Creating ${PROJECT_NAME} installation directory..."
      CreateDirectory "$LOCALAPPDATA\${PROJECT_NAME}"
      
      DetailPrint "- Creating temporary directory for ${PROJECT_NAME} installation..."
      CreateDirectory "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp"
      SetOutPath "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp"
      
      DetailPrint "- Preparing for ${PROJECT_NAME} installation..."
      
      ; Copy the Python installer script to the temp directory
      File "${__FILE__}\..\${PROJECT_NAME_CONCAT}_installer.py"

      DetailPrint "- Using Python script: $LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\${PROJECT_NAME_CONCAT}_installer.py"
      DetailPrint "- Installation directory: $LOCALAPPDATA\${PROJECT_NAME}"
      DetailPrint "- Using standalone Python for the entire installation process"
      
      ; Execute the Python script with the required parameters using standalone Python
      ExecWait '"$PythonPath" "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\${PROJECT_NAME_CONCAT}_installer.py" --install-dir "$LOCALAPPDATA\${PROJECT_NAME}" --debug' $R0

      DetailPrint "${PRODUCT_NAME} installation exit code: $R0"
      
      ; Check if installation was successful
      ${If} $R0 == 0
        DetailPrint "*** ${PRODUCT_NAME} INSTALLATION COMPLETED ***"
        DetailPrint "- ${PRODUCT_NAME} installation completed successfully"
      ${Else}
        DetailPrint "*** ${PRODUCT_NAME} INSTALLATION FAILED ***"
        DetailPrint "- For additional support, please contact support@amd.com and"
        DetailPrint "include the error details, or create an issue at"
        DetailPrint "https://github.com/aigdat/open-webui"
        ${IfNot} ${Silent}
          MessageBox MB_OK "${PRODUCT_NAME} installation failed.$\n$\nPlease check the log file at $LOCALAPPDATA\${PRODUCT_NAME}\${PROJECT_NAME_CONCAT}_Installer.log for detailed error information."
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
      CreateShortcut "$DESKTOP\GAIA-UI-BETA.lnk" "$LOCALAPPDATA\${PROJECT_NAME}\launch_${PROJECT_NAME_CONCAT}.cmd" "" "${ICON_DEST}"

SectionEnd

Function RunAmdOpenWebUI
  ExecShell "open" "http://localhost:8080/"
FunctionEnd
