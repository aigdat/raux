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

; This is a compile-time fix to make sure that our selfhost CI runner can successfully install,
; since LOCALAPPDATA points to C:\Windows for "system users"
InstallDir "$LOCALAPPDATA\${PROJECT_NAME}"

; Read version from version.py
!tempfile TMPFILE
!system 'python -c "import sys; sys.path.append(\"..\"); from version import main; main()" > "${TMPFILE}"'
!define /file raux_VERSION "${TMPFILE}"
!delfile "${TMPFILE}"

; Define variables
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
  StrCpy $raux_CONDA_ENV "${PROJECT_NAME_CONCAT}_env"
  StrCpy $PythonVersion "3.11"
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

    ; Set the output path for future operations
    SetOutPath "$LOCALAPPDATA\${PROJECT_NAME}"

    DetailPrint "Starting '${PRODUCT_NAME}' Installation..."
    DetailPrint "Configuration:"
    DetailPrint "  Install Dir: $LOCALAPPDATA\${PROJECT_NAME}"
    DetailPrint "  Python Version: ${PYTHON_VERSION}"
    DetailPrint "-------------------------------------------"

    ; Pack into the installer
    ; Exclude hidden files (like .git, .gitignore) and the installation folder itself
    ; Include the installer script and LICENSE file
    File "${PROJECT_NAME_CONCAT}_installer.py"
    File "LICENSE"
    File ${ICON_FILE}

    ; Check if conda is available
    ExecWait 'where conda' $2
    DetailPrint "- Checked if conda is available"

    ; If conda is not found, show a message and exit
    ; Otherwise, continue with the installation
    StrCmp $2 "0" create_env conda_not_available

    conda_not_available:
      DetailPrint "- Conda not installed."
      ${IfNot} ${Silent}
        MessageBox MB_YESNO "Conda is not installed. Would you like to install Miniconda?" IDYES install_miniconda IDNO exit_installer
      ${Else}
        GoTo install_miniconda
      ${EndIf}

    exit_installer:
      DetailPrint "- Something went wrong. Exiting installer"
      Quit

    install_miniconda:
      DetailPrint "-------------"
      DetailPrint "- Miniconda -"
      DetailPrint "-------------"
      DetailPrint "- Downloading Miniconda installer..."
      ExecWait 'curl -s -o "$TEMP\Miniconda3-latest-Windows-x86_64.exe" "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe"'

      ; Install Miniconda silently
      ExecWait '"$TEMP\Miniconda3-latest-Windows-x86_64.exe" /InstallationType=JustMe /AddToPath=1 /RegisterPython=0 /S /D=$PROFILE\miniconda3' $2
      ; Check if Miniconda installation was successful
      ${If} $2 == 0
        DetailPrint "- Miniconda installation successful"
        ${IfNot} ${Silent}
          MessageBox MB_OK "Miniconda has been successfully installed."
        ${EndIf}

        StrCpy $R1 "$PROFILE\miniconda3\Scripts\conda.exe"
        GoTo create_env

      ${Else}
        DetailPrint "- Miniconda installation failed"
        ${IfNot} ${Silent}
          MessageBox MB_OK "Error: Miniconda installation failed. Installation will be aborted."
        ${EndIf}
        GoTo exit_installer
      ${EndIf}

    create_env:
      DetailPrint "---------------------"
      DetailPrint "- Conda Environment -"
      DetailPrint "---------------------"

      DetailPrint "- Initializing conda..."
      ; Use the appropriate conda executable
      ${If} $R1 == ""
        StrCpy $R1 "conda"
      ${EndIf}
      ; Initialize conda (needed for systems where conda was previously installed but not initialized)
      nsExec::ExecToLog '"$R1" init'

      DetailPrint "- Creating a Python $PythonVersion environment named '$raux_CONDA_ENV' in the installation directory: $LOCALAPPDATA\${PROJECT_NAME}..."
      ExecWait '"$R1" create -n "$raux_CONDA_ENV" python=$PythonVersion -y' $R0

      ; Check if the environment creation was successful (exit code should be 0)
      StrCmp $R0 0 set_conda_env env_creation_failed

    set_conda_env:
      DetailPrint "- Setting conda environment $raux_CONDA_ENV..."
      DetailPrint "- Changing to installation directory..."
      SetOutPath "$LOCALAPPDATA\${PROJECT_NAME}"
      
      DetailPrint "- Verifying conda environment..."
      ; Instead of trying to activate the environment (which doesn't work well in scripts),
      ; we'll just verify that the environment exists and is ready to use
      ExecWait '"$R1" list -n "$raux_CONDA_ENV"' $R0

      StrCmp $R0 0 install_app env_creation_failed

    env_creation_failed:
      DetailPrint "- ERROR: Environment creation failed"
      ; Display an error message and exit
      ${IfNot} ${Silent}
        MessageBox MB_OK "ERROR: Failed to create the Python environment. Installation will be aborted."
      ${EndIf}
      Quit

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
      DetailPrint "- Using system Python for the entire installation process"
      
      ; Execute the Python script with the required parameters using system Python
      ; Note: We're not passing the python-exe parameter, so it will use the system Python
      ExecWait 'python "$LOCALAPPDATA\${PROJECT_NAME}\${PROJECT_NAME_CONCAT}_temp\${PROJECT_NAME_CONCAT}_installer.py" --install-dir "$LOCALAPPDATA\${PROJECT_NAME}" --debug' $R0

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
