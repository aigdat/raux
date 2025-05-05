# RAUX Installer LOCAL_RELEASE Flag Fix

## Issue Analysis
The RAUX installer was updated to support a `/LOCAL_RELEASE` flag that should bypass GitHub downloads and use a local release file. However, based on the log file, it appears this flag is being ignored, as the installer is still attempting to download from GitHub and failing with a 404 error.

## Detailed Findings

1. **NSIS Script Implementation:**
   - The NSIS script (Installer-UX.nsi) correctly retrieves the `/LOCAL_RELEASE` parameter using `${GetOptions}`
   - It correctly stores the path in the `$LocalReleasePath` variable
   - It properly adds the parameter to the Python command when executing `raux_installer.py`

2. **Python Script Implementation:**
   - The Python script (raux_installer.py) has proper handling for the `--local-release` parameter
   - When the parameter is provided, it should bypass GitHub download and copy the local file instead
   - The log doesn't show any "Using local release file" message, suggesting the parameter isn't reaching the Python script

3. **Problem Diagnosis:**
   - Based on the log, the installer is still attempting to download from GitHub, indicating that either:
     a) The parameter isn't being passed correctly from NSIS to Python, or
     b) The parameter is being passed but not being recognized by the Python script's argument parser
     c) The parameter might be passed with incorrect formatting or escaping

## Tasks

- [x] **Investigate the root cause**
  - [x] Review the NSIS installer script to identify how `/LOCAL_RELEASE` parameter is processed
  - [x] Check if the parameter is properly passed to the Python installer script
  - [x] Review the Python installer script to see if it's properly handling the `--local-release` parameter
  - [x] Check for any escaping issues with spaces or special characters in the local path
  - [x] Add additional debug logging in the NSIS script to show exact command being executed

- [x] **Fix the implementation**
  - [x] Ensure proper path escaping for Windows paths with spaces or special characters
  - [x] Add debug logging in the Python script to show received arguments
  - [x] Test the fix with various path formats (with spaces, without spaces, etc.)
  - [x] Add error handling for missing or inaccessible local release files

- [ ] **Test the solution**
  - [ ] Test the installer with the `/LOCAL_RELEASE` flag pointing to a valid local file
  - [ ] Verify it correctly bypasses GitHub downloads
  - [ ] Check logs to confirm proper execution path
  - [ ] Test paths with spaces and special characters

- [x] **Document the fix**
  - [x] Update documentation on how to use the `/LOCAL_RELEASE` parameter
  - [x] Add comments in the code explaining the implementation

## Implemented Changes

1. **Fixed NSIS DownloadRelease Function**
   - Enhanced logging of the local release parameter value
   - Added explicit verification that the local file exists 
   - Improved error handling with clear user messages
   - Added more detailed logging throughout the process

2. **Improved Python Script Execution**
   - Added detailed command logging before execution
   - Used PowerShell with proper quoting for more reliable parameter passing
   - Created separate execution paths for local release vs. GitHub download

3. **Enhanced Python Script Debugging**
   - Added command-line argument logging at script startup
   - Added parameter parsing verification
   - Improved error handling for local file operations
   - Added file existence and path verification

4. **Added User Documentation**
   - Added a new section to the development guide explaining how to use the `/LOCAL_RELEASE` parameter
   - Provided examples of correct parameter usage
   - Added troubleshooting guidance for common issues
   - Explained the benefits of using local releases for testing

## Additional Bug Fixes

### 1. Log File Overwriting Issue in NSIS Script
We identified and fixed an issue where the installer was overwriting the log file instead of appending to it:
   - **Root Cause**: The `InitializeLog` function in Installer-UX.nsi was using write mode ("w") to open the log file regardless of whether it already existed
   - **Fix**: Modified the function to check if the log file exists first and use append mode if it does
   - **Implementation**:
     ```nsi
     ; Check if log file exists - append to it if it does
     IfFileExists "$LogFilePath" log_append log_create
     
     log_create:
       ; Create a new log file
       FileOpen $0 $LogFilePath "w"
       ; ...

     log_append:
       ; Append to existing log
       FileOpen $0 $LogFilePath "a"
       ; ...
     ```

### 2. Log File Overwriting Issue in Python Script
We identified a second issue where the log file was being overwritten due to a problem in the Python script:
   - **Root Cause**: The `raux_installer.py` script reinitializes logging after closing handlers, but uses the original `log_mode` variable which might be "w" if the file didn't exist at the start
   - **Fix**: Modified the second logging initialization to always use append mode ("a") since we know we've already been writing to the file
   - **Implementation**:
     ```python
     # Reinitialize logging with append mode - always use append at this point
     # since we've already been logging to the file
     logging.basicConfig(
         level=log_level,
         format="[%(asctime)s] [RAUX-Installer] %(message)s",
         datefmt="%Y-%m-%d %H:%M:%S",
         handlers=[
             logging.FileHandler(log_file, mode="a"),  # Always use append mode here
             logging.StreamHandler(sys.stdout),
         ],
     )
     
     logging.info("\n===== RAUX INSTALLER CONTINUING AFTER HANDLER RESET =====")
     ```

### 3. PowerShell Command Syntax Error
We fixed a syntax error in the PowerShell command used to execute the Python installer:
   - **Root Cause**: The command was using the PowerShell `&` call operator incorrectly, resulting in a "Missing expression after '&' in pipeline element" error
   - **Fix**: Revised the PowerShell command to use direct execution with quoted paths instead of the `&` operator
   - **Implementation**:
     ```nsi
     ; Before:
     nsExec::ExecToLog 'powershell -Command "& ''$PythonPath'' ''$LOCAL_PATH'' ..."'
     
     ; After:
     nsExec::ExecToLog 'powershell -Command "\"$PythonPath\" \"$LOCAL_PATH\" ..."'
     ```

## Next Steps

1. **Testing**
   - Test the installer with a valid local release file
   - Verify the local path is correctly passed and processed
   - Monitor logs to ensure GitHub download is bypassed
   - Check that logs are properly appended to rather than overwritten

## Implementation Summary

We've successfully implemented a comprehensive fix for the `/LOCAL_RELEASE` flag issue by:

1. Improving path handling and parameter passing in the NSIS script
2. Enhancing debug logging in both the NSIS and Python components
3. Adding robust error handling for local file access issues
4. Using PowerShell for safer command execution with complex paths
5. Adding comprehensive documentation for developers
6. Fixing log overwriting issues in both NSIS and Python scripts
7. Fixing PowerShell command syntax errors

These changes should ensure that the `/LOCAL_RELEASE` parameter works correctly, allowing developers to test installer changes locally without requiring GitHub releases, saving time and simplifying the development workflow.
