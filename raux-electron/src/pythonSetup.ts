import { existsSync, mkdirSync, createWriteStream, rmSync } from 'fs';
import { join } from 'path';
import { getAppInstallDir, getPythonPath } from './envUtils';
import * as os from 'os';
import fetch from 'node-fetch';
import extract from 'extract-zip';
import { spawn } from 'child_process';
import { logInfo, logError } from './logger';
import type { Response } from 'node-fetch';

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
    fetch(url)
      .then((response: Response) => {
        if (response.status !== 200) {
          logError('Failed to download Python: ' + response.status);
          reject(new Error('Failed to download Python: ' + response.status));
          return;
        }
        const file = createWriteStream(zipPath);
        response.body.pipe(file);
        file.on('finish', () => {
          file.close();
          logInfo('Python download finished.');
          resolve();
        });
      })
      .catch((err: Error) => {
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
    fetch(getPipUrl)
      .then((response: Response) => {
        if (response.status !== 200) {
          logError('Failed to download get-pip.py: ' + response.status);
          reject(new Error('Failed to download get-pip.py: ' + response.status));
          return;
        }
        const file = createWriteStream(getPipPath);
        response.body.pipe(file);
        file.on('finish', () => {
          file.close();
          logInfo('get-pip.py download finished.');
          resolve();
        });
      })
      .catch((err: Error) => {
        logError(`Download error (get-pip.py): ${err}`);
        reject(err);
      });
  });

  // Run get-pip.py
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, [getPipPath, '--no-warn-script-location'], { stdio: 'pipe' });

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

  // Patch python311._pth to include Lib and Lib\site-packages
  try {
    const fs = await import('fs');
    const path = await import('path');
    // Find the ._pth file (e.g., python311._pth)
    const files = fs.readdirSync(PYTHON_DIR);
    const pthFile = files.find(f => /^python\d+\d+\._pth$/.test(f));
    
    if (!pthFile) {
      logError('No python*._pth file found to patch.');
      return;
    }

    const pthPath = path.join(PYTHON_DIR, pthFile);
    let content = fs.readFileSync(pthPath, 'utf-8');
    let changed = false;
    if (!content.match(/^Lib\s*$/m)) {
      content += '\nLib\n';
      changed = true;
    }
    if (!content.match(/^Lib\\site-packages\s*$/m)) {
      content += 'Lib\\site-packages\n';
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(pthPath, content, 'utf-8');
      logInfo(`Patched ${pthFile} to include Lib and Lib\\site-packages.`);
    } else {
      logInfo(`${pthFile} already includes Lib and Lib\\site-packages.`);
    }

  } catch (err) {
    logError(`Failed to patch python*._pth: ${err}`);
  }
}

async function downloadRAUXWheel(): Promise<string> {
  logInfo('Downloading RAUX wheel...');
  const wheelDir = join(getAppInstallDir(), 'wheels');
  mkdirSync(wheelDir, { recursive: true });
  const wheelPath = join(wheelDir, 'open_webui-0.6.5+raux.0.1.0-py3-none-any.whl');

  // Get the version directly from the environment variable defined by webpack
  const rauxVersion = process.env.RAUX_VERSION || 'latest';
  logInfo(`Using RAUX version: ${rauxVersion}`);
  
  // Construct URL with specific version if provided
  let wheelUrl: string;
  if (rauxVersion === 'latest') {
    wheelUrl = process.env.RAUX_WHEEL_URL || 'https://github.com/aigdat/raux/releases/latest/download/open_webui-0.6.5+raux.0.1.0-py3-none-any.whl';
  } else {
    // Remove the 'v' prefix if present for consistent URL formatting
    const versionStr = rauxVersion.startsWith('v') ? rauxVersion.substring(1) : rauxVersion;
    wheelUrl = process.env.RAUX_WHEEL_URL || 
               `https://github.com/aigdat/raux/releases/download/v${versionStr}/open_webui-0.6.5+raux.0.1.0-py3-none-any.whl`;
  }
  
  logInfo(`Downloading wheel from URL: ${wheelUrl}`);
  
  return new Promise<string>((resolve, reject) => {
    fetch(wheelUrl)
      .then((response: Response) => {
        if (response.status !== 200) {
          logError('Failed to download RAUX wheel: ' + response.status);
          reject(new Error('Failed to download RAUX wheel: ' + response.status));
          return;
        }
        const file = createWriteStream(wheelPath);
        response.body.pipe(file);
        file.on('finish', () => {
          file.close();
          logInfo(`RAUX wheel downloaded to ${wheelPath}`);
          resolve(wheelPath);
        });
      })
      .catch((err: Error) => {
        logError(`Wheel download error: ${err}`);
        reject(err);
      });
  });
}

async function installRAUXWheel(wheelPath: string): Promise<void> {
  logInfo(`Installing RAUX wheel from ${wheelPath}...`);
  
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, ['-m', 'pip', 'install', wheelPath, '--verbose', '--no-warn-script-location'], {
      stdio: 'pipe'
    });

    proc.stdout.on('data', (data) => logInfo(`[wheel-install][stdout] ${data}`));
    proc.stderr.on('data', (data) => logError(`[wheel-install][stderr] ${data}`));

    proc.on('close', (code) => {
      if (code === 0) {
        logInfo('RAUX wheel installed successfully.');
        resolve();
      } else {
        logError(`Failed to install RAUX wheel. Exit code: ${code}`);
        reject(new Error(`Failed to install RAUX wheel. Exit code: ${code}`));
      }
    });

    proc.on('error', (err) => {
      logError(`Wheel installation process error: ${err}`);
      reject(err);
    });
  });
}

export async function ensurePythonAndPipInstalled() {
  try {
    // If PYTHON_DIR exists, assume setup is complete and skip installation
    if (existsSync(PYTHON_DIR)) {
      logInfo('Python directory already exists, skipping installation.');
      return;
    }
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
    
    // Download and install RAUX wheel before installing other requirements
    try {
      const wheelPath = await downloadRAUXWheel();
      await installRAUXWheel(wheelPath);
      logInfo('RAUX wheel setup completed successfully.');
    } catch (wheelError) {
      logError(`RAUX wheel installation failed: ${wheelError}`);
      logError('Falling back to requirements.txt installation...');
      // Continue with requirements.txt as fallback
    }

    // Copy raux.env to python/Lib/.env (always overwrite)
    await copyEnvToPythonLib();
    
    logInfo('Python and pip setup completed successfully.');
  } catch (err) {
    logError(`ensurePythonAndPipInstalled failed: ${err}`);
    throw err;
  }
}

// Copy raux.env from Electron resources to python/Lib/.env, always overwriting
async function copyEnvToPythonLib() {
  try {
    // Electron's resourcesPath is available via process.resourcesPath
    // In dev mode, fallback to getAppInstallDir()/resources
    const isPackaged = !!process.resourcesPath;
    const resourcesDir = isPackaged
      ? process.resourcesPath
      : join(getAppInstallDir(), 'resources');
    const srcEnv = join(resourcesDir, 'raux.env');
    const destEnv = join(PYTHON_DIR, 'Lib', '.env');
    if (!existsSync(srcEnv)) {
      logError(`copyEnvToPythonLib: Source raux.env not found at ${srcEnv}`);
      return;
    }
    // Ensure Lib directory exists
    const libDir = join(PYTHON_DIR, 'Lib');
    if (!existsSync(libDir)) {
      mkdirSync(libDir, { recursive: true });
    }
    // Copy and overwrite
    const fs = await import('fs');
    fs.copyFileSync(srcEnv, destEnv);
    logInfo(`Copied raux.env to ${destEnv}`);
  } catch (err) {
    logError(`copyEnvToPythonLib failed: ${err}`);
  }
} 