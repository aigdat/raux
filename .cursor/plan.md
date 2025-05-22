// ... existing code ...

# Auto-Launch Prevention Plan

## Overview
Implement a mechanism to prevent RAUX Electron app from automatically launching after installation when installed via GAIA's NSIS installer, while still allowing auto-launch when self-installed.

## Problem Statement
- RAUX should auto-launch after self-installation (default Squirrel.Windows behavior)
- RAUX should NOT auto-launch when installed via GAIA's NSIS installer
- Since install paths may vary, we need a centralized coordination mechanism

## Approach
Use a temporary environment variable as a flag to control auto-launch behavior:
1. NSIS installer sets a user environment variable before installing RAUX
2. RAUX checks for this environment variable at startup
3. If the variable exists, RAUX exits immediately
4. NSIS removes the environment variable after a short delay

## Tasks

### 1. Modify RAUX Electron App
- [ ] Add environment variable check early in the application lifecycle
- [ ] If the variable is present, exit the application
- [ ] Place check before any initialization or window creation

### 2. Update GAIA NSIS Installer
- [ ] Add code to set environment variable before RAUX installation
- [ ] Add delay and cleanup code to remove the variable after installation
- [ ] Document this behavior for future maintenance

### 3. Testing
- [ ] Test RAUX self-installation (should auto-launch)
- [ ] Test RAUX installation via NSIS (should not auto-launch)
- [ ] Test manual RAUX launch after NSIS installation (should launch)

## Implementation Details

### 1. RAUX Electron App Changes (index.ts)
```typescript
// Add this at the top of the file, before any other app initialization code
if (process.env.RAUX_PREVENT_AUTOLAUNCH === 'true') {
  logInfo('Detected RAUX_PREVENT_AUTOLAUNCH environment variable. Exiting to prevent auto-launch.');
  process.exit(0);
}
```

### 2. NSIS Installer Changes (Installer.nsi)
```nsi
; Before RAUX installation
DetailPrint "[RAUX-Installer] Setting environment variable to prevent auto-launch..."
WriteRegExpandStr HKCU "Environment" "RAUX_PREVENT_AUTOLAUNCH" "true"
SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000

; Install RAUX here...

; After RAUX installation, schedule removal of the environment variable
DetailPrint "[RAUX-Installer] Scheduling environment variable cleanup..."
nsExec::ExecToStack 'powershell -Command "Start-Sleep -Seconds 5; Remove-ItemProperty -Path \"HKCU:\\Environment\" -Name \"RAUX_PREVENT_AUTOLAUNCH\" -ErrorAction SilentlyContinue"'
Pop $0
Pop $1
DetailPrint "[RAUX-Installer] Scheduled cleanup result: $0"
```

## Considerations
1. The 5-second delay is to ensure RAUX has time to start and check the environment variable
2. If a user manually launches RAUX during this brief window, it will exit immediately
3. Environment variable will be cleaned up even if RAUX installation fails
4. Using PowerShell for the delayed cleanup avoids blocking the installer

## Future Improvements
- Consider a more robust communication mechanism between installers
- Explore alternatives like command-line arguments to the RAUX launcher
- Add logging and telemetry to monitor installation success rates