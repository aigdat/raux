import { app } from 'electron';
import { join } from 'path';

export const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1';

export function getInstallDir() {
  if (isDev) {
    // In dev, backend is at ../../backend relative to src
    return join(__dirname, '../../');
  }
  return join(app.getPath('userData'), 'RAUX');
}

export function getBackendDir() {
  if (isDev) {
    // In dev, backend is at ../../../backend relative to src
    return join(__dirname, '../../../backend');
  }
  return join(getInstallDir(), 'backend');
}

export function getPythonPath() {
  if (isDev) {
    return 'python'; // Use system Python in dev
  }
  return join(getInstallDir(), 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
} 