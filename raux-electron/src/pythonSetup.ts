import { existsSync, mkdirSync, createWriteStream, rmSync } from 'fs';
import { join } from 'path';
import { getAppInstallDir, getBackendDir, getPythonPath } from './envUtils';
import * as os from 'os';
import * as https from 'https';
import extract from 'extract-zip';
import { spawn } from 'child_process';
import { logInfo, logError } from './logger';

const PYTHON_VERSION = '3.11.8';
const PYTHON_DIR = join(getAppInstallDir(), 'python');
const PYTHON_EXE = getPythonPath();

function getPythonDownloadUrl() {
  const arch = os.arch();
  if (arch === 'x64') {
    return `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
  } else if (arch === 'arm64') {
    return `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-arm64.zip`;
  } else {
    throw new Error('Unsupported architecture: ' + arch);
  }
}

async function downloadPython(url: string, zipPath: string) {
  logInfo('Downloading Python...');
  return new Promise<void>((resolve, reject) => {

    const file = createWriteStream(zipPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        logError('Failed to download Python: ' + response.statusCode);
        reject(new Error('Failed to download Python: ' + response.statusCode));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        logInfo('Python download finished.');
        resolve();
      });
    }).on('error', (err) => {
      logError(`Download error: ${err}`);
      reject(err);
    });

  });
}

async function extractPython(zipPath: string, destDir: string) {
  logInfo('Extracting Python...');
  try {
    await extract(zipPath, { dir: destDir });
    logInfo('Python extraction finished.');
  } catch (error) {
    logError(`Failed to extract Python: ${error}`);
    throw error;
  }
}

async function ensurePipInstalled() {
  logInfo('Ensuring pip is installed using get-pip.py...');
  const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
  const getPipPath = join(PYTHON_DIR, 'get-pip.py');

  // Download get-pip.py
  await new Promise<void>((resolve, reject) => {
    const file = createWriteStream(getPipPath);
    https.get(getPipUrl, (response) => {
      if (response.statusCode !== 200) {
        logError('Failed to download get-pip.py: ' + response.statusCode);
        reject(new Error('Failed to download get-pip.py: ' + response.statusCode));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        logInfo('get-pip.py download finished.');
        resolve();
      });
    }).on('error', (err) => {
      logError(`Download error (get-pip.py): ${err}`);
      reject(err);
    });
  });

  // Run get-pip.py
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, [getPipPath], { stdio: 'pipe' });
    proc.stdout.on('data', (data) => logInfo(`[get-pip.py][stdout] ${data}`));
    proc.stderr.on('data', (data) => logError(`[get-pip.py][stderr] ${data}`));
    proc.on('close', (code) => {
      if (code === 0) {
        logInfo('pip installed successfully via get-pip.py.');
        resolve();
      } else {
        logError('get-pip.py failed');
        reject(new Error('get-pip.py failed'));
      }
    });
    proc.on('error', (err) => {
      logError(`get-pip.py process error: ${err}`);
      reject(err);
    });
  });

  // Clean up get-pip.py
  try {
    rmSync(getPipPath, { force: true });
    logInfo('get-pip.py deleted after pip installation.');
  } catch (err) {
    logError(`Failed to delete get-pip.py: ${err}`);
  }
}

async function installRequirements() {
  logInfo('Installing requirements...');
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, ['-m', 'pip', 'install', '-r', join(getBackendDir(), 'requirements.txt')], {
      cwd: getBackendDir(),
      stdio: 'pipe',
    });
    proc.stdout.on('data', (data) => logInfo(`[pip-install][stdout] ${data}`));
    proc.stderr.on('data', (data) => logError(`[pip-install][stderr] ${data}`));
    proc.on('close', (code) => {
      if (code === 0) {
        logInfo('Requirements installed successfully.');
        resolve();
      } else {
        logError('pip install failed');
        reject(new Error('pip install failed'));
      }
    });
    proc.on('error', (err) => {
      logError(`pip install process error: ${err}`);
      reject(err);
    });
  });
}

export async function ensurePythonAndPipInstalled() {
  try {
    // Remove PYTHON_DIR if it exists, then recreate it
    if (existsSync(PYTHON_DIR)) {
      rmSync(PYTHON_DIR, { recursive: true, force: true });
    }
    mkdirSync(PYTHON_DIR, { recursive: true });
    const url = getPythonDownloadUrl();
    const zipPath = join(PYTHON_DIR, 'python-embed.zip');
    await downloadPython(url, zipPath);
    await extractPython(zipPath, PYTHON_DIR);
    await ensurePipInstalled();
    await installRequirements();
    logInfo('Python and pip setup completed successfully.');
  } catch (err) {
    logError(`ensurePythonAndPipInstalled failed: ${err}`);
    throw err;
  }
} 