import { app } from 'electron';
import { getAppInstallDir, getUserInstallDir } from './envUtils';
import { rauxProcessManager } from './rauxProcessManager';
import { rmSync, readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { spawn, exec } from 'child_process';
import { logInfo } from './logger';
import * as path from 'path';
import * as os from 'os';

/**
 * Schedules a self-deleting Windows task to remove the GaiaBeta directory.
 * The task runs once after a delay and then removes itself.
 */
function scheduleGaiaBetaCleanup(): void {
  try {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const gaiaBetaDir = path.join(localAppData, 'GaiaBeta');
    
    // Create a unique task name
    const taskName = `RAUX_Cleanup_${Date.now()}`;
    
    // PowerShell command to create a scheduled task that:
    // 1. Waits 60 seconds after creation
    // 2. Removes the GaiaBeta directory (silently)
    // 3. Deletes itself from Task Scheduler (silently)
    const psCommand = `
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -Command \`"Start-Sleep -Seconds 5; Remove-Item -Path '${gaiaBetaDir}' -Recurse -Force -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName '${taskName}' -Confirm:\`$false -ErrorAction SilentlyContinue\`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(60)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -DeleteExpiredTaskAfter 00:00:01
    Register-ScheduledTask -TaskName "${taskName}" -Action $action -Trigger $trigger -Settings $settings -Force -ErrorAction SilentlyContinue
    `.trim().replace(/\n/g, '; ');
    
    exec(`powershell -WindowStyle Hidden -Command "${psCommand}"`, (error, stdout, stderr) => {
      if (error) {
        // Only log to console since log file may be deleted during uninstall
        console.error(`Error creating cleanup task: ${error.message}`);
      } else {
        console.log(`Created self-deleting cleanup task: ${taskName}`);
      }
    });
  } catch (e) {
    // Only log to console since log file may be deleted during uninstall
    console.error(`Error scheduling GaiaBeta cleanup: ${e}`);
  }
}

function cleanupRauxInstallation(): void {
  try {
    logInfo('Attempting to kill RAUX processes...');
    rauxProcessManager.stopRaux();
  } catch (e) {
    // Ignore errors
  }
  
  try {
    // Remove RAUX runtime directory (now safe as it's in a subdirectory)
    const installDir = getAppInstallDir(); // This is now GaiaBeta/runtime
    logInfo(`Removing RAUX runtime dir: ${installDir}`);
    rmSync(installDir, { recursive: true, force: true });
    
    // Remove user data directory
    const userDir = getUserInstallDir();
    logInfo(`Removing user data dir: ${userDir}`);
    rmSync(userDir, { recursive: true, force: true });
    
    // Explicitly remove desktop shortcut since Squirrel isn't doing it automatically
    try {
      const updateExe = path.resolve(process.execPath, '..', '..', 'Update.exe');
      const exeName = 'raux.exe';
      logInfo('Removing desktop shortcut...');
      spawn(updateExe, ['--removeShortcut', exeName], { detached: true });
    } catch (e) {
      logInfo(`Error removing shortcut: ${e}`);
    }
    
    // Schedule cleanup of the GaiaBeta directory since Squirrel doesn't always clean it up
    scheduleGaiaBetaCleanup();
    
    // Note: The parent GaiaBeta directory should be cleaned up by Squirrel's 
    // uninstaller automatically after this process exits, but we schedule a backup cleanup
    app.quit();
  } catch (e) {
    logInfo(`Error during cleanup: ${e}`);
    // Ignore errors and continue uninstall
  }
}

/**
 * Ensures the embedded Python environment can find installed packages like pip and setuptools.
 *
 * This function patches the python311._pth file in the embedded Python directory to add
 * 'Lib\\site-packages' and an empty line at the end (enabling import site). This is required
 * because the embeddable Python distribution on Windows uses python311._pth to control sys.path.
 * Without this, Python will not find site-packages or pip, even if they exist on disk.
 *
 * Should be called after Python extraction during install/update events.
 *
 * @param {string} pythonDir - The path to the embedded Python directory.
 */
function patchPythonPthFile(pythonDir: string): void {
  const pthPath = path.join(pythonDir, 'python311._pth');
  if (!existsSync(pthPath)) return;
  let content = readFileSync(pthPath, 'utf-8');
  if (!content.includes('Lib\\site-packages')) {
    content += '\nLib\\site-packages\n\n';
    writeFileSync(pthPath, content, 'utf-8');
  } else if (!content.endsWith('\n\n')) {
    // Ensure there's an empty line at the end to enable import site
    content += '\n';
    writeFileSync(pthPath, content, 'utf-8');
  }
}

function createDesktopShortcut(updateExe: any, exeName: string): void {
  // Patch python311._pth after extraction (in case Python was just installed)
  const pythonDir = path.resolve(getAppInstallDir(), 'python');
  patchPythonPthFile(pythonDir);
  try {
    spawn(updateExe, ['--createShortcut', exeName], { detached: true });
  } catch (e) {
    // Ignore errors
  }
  app.quit();
}

/**
 * Handles Squirrel events for Electron (Windows install/uninstall/update hooks).
 * Returns true if a Squirrel event was handled and the app should exit.
 */
export function handleSquirrelEvent(): boolean {
  if (process.platform !== 'win32') return false;
  const squirrelEvent = process.argv[1];
  const exeName = 'raux.exe';
  const updateExe = path.resolve(process.execPath, '..', '..', 'Update.exe');
  switch (squirrelEvent) {
    case '--squirrel-uninstall':
      cleanupRauxInstallation();
      return true;
    case '--squirrel-install':
    case '--squirrel-updated':
      createDesktopShortcut(updateExe, exeName);
      return true;
    case '--squirrel-obsolete':
      app.quit();
      return true;
    default:
      // Not a Squirrel event, do not quit, just return false
      return false;
  }
}