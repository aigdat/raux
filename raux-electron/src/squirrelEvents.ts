import { app } from 'electron';
import { getAppInstallDir, getUserInstallDir } from './envUtils';
import { rauxProcessManager } from './rauxProcessManager';
import { rmSync } from 'fs';

function cleanupRauxInstallation(): boolean {
  // Terminate any running RAUX process (ignore errors, do not wait)
  try {
    console.log('Attempting to kill RAUX processes...');
    rauxProcessManager.stopRaux();
  } catch (e) {
    // Ignore errors
  }
  // Remove install and user data directories (ignore errors)
  try {
    const installDir = getAppInstallDir();
    const userDir = getUserInstallDir();
    console.log('Removing install dir:', installDir);
    rmSync(installDir, { recursive: true, force: true });
    console.log('Removing user dir:', userDir);
    rmSync(userDir, { recursive: true, force: true });
    app.quit();
    return true;
  } catch (e) {
    // Ignore errors
  }
  
  return false;
}

/**
 * Handles Squirrel events for Electron (Windows install/uninstall/update hooks).
 * Returns true if a Squirrel event was handled and the app should exit.
 */
export function handleSquirrelEvent(): boolean {
  if (process.platform !== 'win32') return false;
  const squirrelEvent = process.argv[1];
  switch (squirrelEvent) {
    case '--squirrel-uninstall':
      return cleanupRauxInstallation();
    case '--squirrel-install':
    case '--squirrel-updated':
    case '--squirrel-obsolete':
      // No custom logic for these events, but can be added if needed
      app.quit();
      return true;
    default:
      return false;
  }
}