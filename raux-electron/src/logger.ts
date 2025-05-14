import log from 'electron-log';
import { getUserInstallDir } from './envUtils';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

const logPath = join(getUserInstallDir(), 'raux.log');
const logDir = dirname(logPath);

if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

console.log('RAUX log file path:', logPath);

// Set log file location
log.transports.file.resolvePath = () => logPath;

export function logInfo(message: string) {
  log.info(message);
}

export function logError(message: string) {
  log.error(message);
}
