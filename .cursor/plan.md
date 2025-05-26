// ... existing code ...

# Auto-Launch Prevention Plan

## Overview
Implement a mechanism to prevent RAUX Electron app from automatically launching after installation when installed via GAIA's NSIS installer, while still allowing auto-launch when self-installed.

## Problem Statement
- RAUX should auto-launch after self-installation (default Squirrel installer behavior from Electron Forge)
- RAUX should NOT auto-launch when installed via GAIA's NSIS installer
- Since GAIA (NSIS) invokes RAUX (Squirrel), we need coordination between different installer systems

## Installer Architecture Context
- **GAIA**: Uses NSIS installer (traditional Windows installer)
- **RAUX**: Uses Squirrel installer from Electron Forge (auto-launches by default)
- **Flow**: GAIA NSIS → downloads raux-wheel-context.zip → invokes RAUX Squirrel installer → Squirrel auto-launches app

## Approach
Use a temporary file as a flag to control auto-launch behavior:
1. GAIA NSIS installer creates a flag file in user's temp directory before invoking RAUX Squirrel installer
2. RAUX Squirrel installer installs and auto-launches the app (default Squirrel behavior)
3. RAUX app checks for flag file at startup and exits immediately if found
4. GAIA NSIS installer removes the flag file after a short delay

## Tasks

### 1. Modify RAUX Electron App
- [ ] Add temp file check early in the application lifecycle
- [ ] If the flag file exists, exit the application immediately
- [ ] Place check before any initialization or window creation

### 2. Update GAIA NSIS Installer
- [ ] Add code to create flag file in temp directory before invoking RAUX installer
- [ ] Add delay and cleanup code to remove the flag file after installation
- [ ] Document this behavior for future maintenance

### 3. Testing
- [ ] Test RAUX self-installation (should auto-launch)
- [ ] Test RAUX installation via NSIS (should not auto-launch)
- [ ] Test manual RAUX launch after NSIS installation (should launch)

## Implementation Details

### 1. RAUX Electron App Changes (index.ts)
```typescript
import { tmpdir } from 'os';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';

// Add this at the top of the file, before any other app initialization code
const preventAutoLaunchFile = path.join(tmpdir(), 'RAUX_PREVENT_AUTOLAUNCH');
if (existsSync(preventAutoLaunchFile)) {
  logInfo('Detected RAUX_PREVENT_AUTOLAUNCH flag file. Exiting to prevent auto-launch.');
  try {
    unlinkSync(preventAutoLaunchFile); // Clean up the file
  } catch (error) {
    logError('Failed to remove RAUX_PREVENT_AUTOLAUNCH flag file:', error);
  }
  process.exit(0);
}
```

### 2. GAIA NSIS Installer Changes (Installer.nsi)
```nsi
; Before RAUX installation
DetailPrint "[RAUX-Installer] Creating auto-launch prevention flag file..."
StrCpy $TEMP "$TEMP\RAUX_PREVENT_AUTOLAUNCH"
FileOpen $0 "$TEMP" w
FileWrite $0 "prevent"
FileClose $0
DetailPrint "[RAUX-Installer] Flag file created: $TEMP"

; Install RAUX here (invoke RAUX Squirrel installer)...

; After RAUX installation, schedule removal of the flag file
DetailPrint "[RAUX-Installer] Scheduling flag file cleanup..."
nsExec::ExecToStack 'powershell -Command "Start-Sleep -Seconds 5; Remove-Item -Path \"$env:TEMP\\RAUX_PREVENT_AUTOLAUNCH\" -ErrorAction SilentlyContinue"'
Pop $0
Pop $1
DetailPrint "[RAUX-Installer] Scheduled cleanup result: $0"
```

## Considerations
1. **Safer than environment variables**: No registry modifications or system-wide state changes
2. **Self-cleaning**: RAUX removes the file when it detects it, providing immediate cleanup
3. **OS cleanup**: Temp directory is automatically cleaned by Windows if manual cleanup fails
4. **Timing window**: 5-second delay ensures RAUX has time to start and check for the flag file
5. **User experience**: If user manually launches RAUX during the brief window, it exits gracefully
6. **Installation failure resilient**: Flag file cleanup occurs regardless of RAUX installation success
7. **Non-blocking**: PowerShell scheduled cleanup doesn't block the GAIA installer

## Benefits of Temp File Approach
- **No system pollution**: Won't persist if cleanup fails
- **No registry access**: Avoids Windows registry modifications  
- **Isolated impact**: Doesn't affect other processes
- **Easy debugging**: File can be inspected manually if needed
- **Cross-process reliable**: Works between NSIS and Squirrel installers

## Future Improvements
- Consider adding timestamp to flag file for debugging
- Add installation telemetry to monitor success rates
- Explore more robust inter-installer communication if needed