import { app } from 'electron';
import { join, dirname } from 'path';
import os, { tmpdir } from 'os';
import { existsSync, unlinkSync } from 'fs';
import { logInfo, logError } from './logger';

export const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1';

// Get enhanced environment with user PATH for Windows
export function getEnhancedEnvironment(): Record<string, string> {
  const env = { ...process.env };
  
  logInfo(`[envUtils] Getting enhanced environment, platform: ${process.platform}`);
  logInfo(`[envUtils] Current PATH: ${env.PATH}`);
  
  // On Windows, Electron processes don't inherit full user PATH
  // We need to get the user PATH from the registry
  if (process.platform === 'win32') {
    try {
      logInfo(`[envUtils] Querying Windows registry for user PATH...`);
      // Try to get user PATH from Windows registry using reg command
      const { execSync } = require('child_process');
      const userPath = execSync('reg query "HKCU\\Environment" /v PATH', {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true
      });
      
      logInfo(`[envUtils] Registry query result: ${userPath}`);
      
      // Parse the registry output to extract PATH value
      const match = userPath.match(/PATH\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
      if (match && match[1]) {
        const userPathValue = match[1].trim();
        logInfo(`[envUtils] Found user PATH: ${userPathValue}`);
        
        // Combine system PATH with user PATH
        const currentPath = env.PATH || '';
        env.PATH = `${userPathValue};${currentPath}`;
        logInfo(`[envUtils] Enhanced PATH: ${env.PATH}`);
      } else {
        logInfo(`[envUtils] No user PATH found in registry output`);
      }
    } catch (error) {
      logError(`[envUtils] Failed to get user PATH from registry: ${error}`);
      // Continue with existing PATH
    }
  }
  
  return env;
}

// Directory for app binaries and dependencies (Python, open-webui)
export function getAppInstallDir() {
  if (isDev) {
    // In dev, backend is at ../../backend relative to src
    return join(__dirname, '../../');
  }
  // On Windows, use LOCALAPPDATA env var for AppData\Local
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local');
    // Store RAUX runtime in a subdirectory to avoid conflicts with Squirrel
    return join(localAppData, 'GaiaBeta', 'runtime');
  }

  return join(app.getPath('appData'), 'GaiaBeta', 'runtime');
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

// Check if RAUX installation is complete
export async function isInstallationComplete(): Promise<boolean> {
  // Import raux here to avoid circular dependency
  const { raux } = require('./rauxSetup');
  
  // First check if Python is installed
  const pythonDir = join(getAppInstallDir(), 'python');
  if (!existsSync(pythonDir)) {
    logInfo('Installation check: Python directory not found');
    return false;
  }
  
  // Then check if RAUX is installed and functional
  const rauxInstalled = raux.isRAUXInstalled();
  logInfo(`Installation check: RAUX installed = ${rauxInstalled}`);
  return rauxInstalled;
} 