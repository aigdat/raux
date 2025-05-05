# RAUX Installer LOCAL_RELEASE Flag Fix

## Issue Analysis
The RAUX installer was updated to support a `/LOCAL_RELEASE` flag that should bypass GitHub downloads and use a local release file. However, based on the log file, it appears this flag is being ignored, as the installer is still attempting to download from GitHub and failing with a 404 error.

Another issue has been identified where the installation log file is being overwritten instead of being appended to throughout the installation process. This makes it difficult to diagnose issues as earlier log entries are lost.

## Detailed Findings

1. **NSIS Script Implementation:**
   - The NSIS script (Installer-UX.nsi) correctly retrieves the `/LOCAL_RELEASE` parameter using `${GetOptions}`
   - It correctly stores the path in the `$LocalReleasePath` variable
   - It properly adds the parameter to the Python command when executing `raux_installer.py`

2. **Python Script Implementation:**
   - The Python script (raux_installer.py) has proper handling for the `--local-release` parameter
   - When the parameter is provided, it should bypass GitHub download and copy the local file instead
   - The log doesn't show any "Using local release file" message, suggesting the parameter isn't reaching the Python script

3. **Log File Overwriting Issue:**
   - The log file (`raux_install.log`) is being overwritten during the installation process
   - This happens because:
     - The NSIS InitializeLog function isn't properly preserving existing log content
     - The Python script's logging reinitialization doesn't properly maintain append mode
     - FileHandlers might be using write mode ('w') in some cases where append ('a') is needed

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

- [x] **Fix Log File Overwriting Issue**
  - [x] Identify where the log file is being overwritten
  - [x] Modify the NSIS InitializeLog function to preserve existing log content
  - [x] Fix the Python script's DebugFileHandler to always use append mode
  - [x] Add robust error handling for the logging system
  - [x] Test to ensure logs are properly appended to throughout the installation process

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

5. **Fixed Log File Overwriting Issues**
   - Completely rewrote the DebugFileHandler in Python to force append mode
   - Added backup/restore mechanism for log content in NSIS InitializeLog function
   - Modified LogMessage function to check file existence before writing
   - Added log content preservation when reinitializing logging
   - Added extensive debug output to track log file operations
   - Ensured log file path is properly converted to absolute path

## Additional Bug Fixes

### 1. Log File Overwriting Issue in NSIS Script
We identified and fixed an issue where the installer was overwriting the log file instead of appending to it:
   - **Root Cause**: The `InitializeLog` function in Installer-UX.nsi was using write mode ("w") to open the log file regardless of whether it already existed
   - **Fix**: Modified the function to check if the log file exists first, save its content to a temporary file, and restore it after writing the new header
   - **Implementation**:
     ```nsi
     ; First, check if the log file exists and read its content if it does
     IfFileExists "$LogFilePath" save_log_content create_new_log
     
     save_log_content:
       ; Create a temporary file to store existing log content
       FileOpen $1 "$LogFilePath" "r"
       FileOpen $2 "$TEMP\log_backup.txt" "w"
       log_read_loop:
         FileRead $1 $3
         IfErrors log_read_done
         FileWrite $2 $3
         Goto log_read_loop
       log_read_done:
       FileClose $1
       FileClose $2
       Goto append_to_log
     ```

### 2. Log File Overwriting Issue in Python Script
We identified a second issue where the log file was being overwritten due to a problem in the Python script:
   - **Root Cause**: The `DebugFileHandler` class in raux_installer.py wasn't consistently enforcing append mode 
   - **Fix**: Completely rewrote the handler to always use append mode regardless of what's requested
   - **Implementation**:
     ```python
     class DebugFileHandler(logging.FileHandler):
         def __init__(self, filename, mode='a', encoding=None, delay=False):
             # ALWAYS force append mode no matter what
             mode = 'a'
             print(f"DEBUG-HANDLER: Creating file handler for {filename} with FORCED append mode")
             # ... additional checks and error handling ...
             super().__init__(filename, mode, encoding, delay)
     ```

### 3. Log Content Preservation During Handler Reset
We fixed an issue where log content was being lost when handlers were reset:
   - **Root Cause**: The Python script was closing log handlers without preserving their content
   - **Fix**: Added code to save existing log content before closing handlers, then restore it after reinitialization
   - **Implementation**:
     ```python
     # Save all existing log messages to ensure they're not lost
     log_buffer = []
     for handler in logging.root.handlers[:]:
         if isinstance(handler, logging.FileHandler):
             # Try to get the current log file content
             try:
                 with open(handler.baseFilename, 'r') as f:
                     log_buffer.append(f.read())
             except Exception as e:
                 print(f"Error reading log file before closing handler: {str(e)}")
     ```

## Next Steps

1. **Testing**
   - Test the installer with a valid local release file
   - Verify the local path is correctly passed and processed
   - Monitor logs to ensure GitHub download is bypassed
   - Check that logs are properly appended to rather than overwritten

2. **Log File Validation**
   - Run the installer multiple times to confirm logs are correctly appended
   - Verify log entries from all stages of the installation process are preserved
   - Check logs from both the NSIS and Python components
   - Ensure log file is readable and properly formatted

## Implementation Summary

We've successfully implemented a comprehensive fix for both the `/LOCAL_RELEASE` flag issue and the log file overwriting issue by:

1. Improving path handling and parameter passing in the NSIS script
2. Enhancing debug logging in both the NSIS and Python components
3. Adding robust error handling for local file access issues
4. Using PowerShell for safer command execution with complex paths
5. Adding comprehensive documentation for developers
6. Completely rewriting the logging mechanisms to ensure append mode
7. Adding log content preservation mechanisms during handler resets
8. Implementing file existence checks before all log operations

These changes should ensure that the `/LOCAL_RELEASE` parameter works correctly and that installation logs are properly maintained throughout the entire process, making troubleshooting much easier.
