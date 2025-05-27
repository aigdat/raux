import { app } from 'electron';
import { join, dirname } from 'path';
import os, { tmpdir } from 'os';
import { existsSync, unlinkSync } from 'fs';
import { logInfo, logError } from './logger';

export const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1';

// Directory for app binaries and dependencies (Python, open-webui)
export function getAppInstallDir() {
  if (isDev) {
    // In dev, backend is at ../../backend relative to src
    return join(__dirname, '../../');
  }
  // On Windows, use LOCALAPPDATA env var for AppData\Local
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local');
    return join(localAppData, 'raux');
  }

  return join(app.getPath('appData'), 'raux');
}

// Directory for user data (settings, logs, etc.)
export function getUserInstallDir() {
  if (isDev) {
    return join(__dirname, '../../');
  }
  // In production, use Roaming/raux
  return app.getPath('userData');
}

// Backend directory (open-webui)
export function getBackendDir() {
  if (isDev) {
    return join(__dirname, '../../../backend');
  }
  // Use the resources directory of the running app version
  return dirname(app.getAppPath());
}

// Python executable path
export function getPythonPath() {
  if (isDev) {
    return 'python'; // Use system Python in dev
  }
  return join(getAppInstallDir(), 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
}

// Returns the correct path to a renderer asset (html, js) for dev and production
export function getRendererPath(...segments: string[]): string {
  // In production, files are in .webpack/renderer/
  const base = app.isPackaged ? app.getAppPath() : __dirname;
  return app.isPackaged
    ? join(base, '.webpack', 'renderer', ...segments)
    : join(base, ...segments);
}

// Check for auto-launch prevention flag file
export function checkAndHandleAutoLaunchPrevention(): boolean {
  const preventAutoLaunchFile = join(tmpdir(), 'RAUX_PREVENT_AUTOLAUNCH');
  
  if (existsSync(preventAutoLaunchFile)) {
    logInfo('Detected RAUX_PREVENT_AUTOLAUNCH flag file. Exiting to prevent auto-launch.');
    
    // Remove the flag file as per plan
    try {
      unlinkSync(preventAutoLaunchFile);
      logInfo('Removed RAUX_PREVENT_AUTOLAUNCH flag file successfully.');
    } catch (error) {
      logError('Failed to remove RAUX_PREVENT_AUTOLAUNCH flag file: ' + (error && error.toString ? error.toString() : String(error)));
    }
    
    return true; // Should exit immediately after
  }
  
  return false; // Should not exit
}

// Check if RAUX installation is complete by testing if open-webui is callable
export async function isInstallationComplete(): Promise<boolean> {
  const pythonDir = join(getAppInstallDir(), 'python');
  
  // Quick check if Python directory exists first
  if (!existsSync(pythonDir)) {
    logInfo('Installation check: Python directory not found');
    return false;
  }
  
  try {
    // Import execSync for synchronous execution
    const { execSync } = require('child_process');
    const pythonPath = getPythonPath();
    
    // Try to run open-webui --help to verify installation
    execSync(`"${pythonPath}" -m open_webui --help`, {
      encoding: 'utf8',
      timeout: 2000, // 2 second timeout - help should be instant
      windowsHide: true
    });
    
    // If we get here without throwing, the command succeeded
    logInfo('Installation check: open-webui module is callable');
    return true;
  } catch (error) {
    logInfo('Installation check: open-webui module not callable - ' + (error && error.toString ? error.toString() : String(error)));
    return false;
  }
} 