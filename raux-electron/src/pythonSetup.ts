import { existsSync, mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import { getInstallDir, getBackendDir } from './envUtils';
import * as os from 'os';
import * as https from 'https';
import * as unzipper from 'unzipper';
import { spawn } from 'child_process';

const PYTHON_VERSION = '3.11.8';
const PYTHON_DIR = join(getInstallDir(), 'python');
const PYTHON_EXE = join(PYTHON_DIR, 'python.exe');

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

export async function ensurePythonAndPipInstalled() {
  if (existsSync(PYTHON_EXE)) {
    return;
  }
  if (!existsSync(PYTHON_DIR)) {
    mkdirSync(PYTHON_DIR, { recursive: true });
  }
  const url = getPythonDownloadUrl();
  const zipPath = join(PYTHON_DIR, 'python-embed.zip');
  await new Promise<void>((resolve, reject) => {
    const file = createWriteStream(zipPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error('Failed to download Python: ' + response.statusCode));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
  await new Promise<void>((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: PYTHON_DIR }))
      .on('close', resolve)
      .on('error', reject);
  });
  // Optionally, remove the zip file after extraction
  // fs.unlinkSync(zipPath);

  // Run ensurepip
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, ['-m', 'ensurepip'], { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('ensurepip failed'));
    });
  });

  // Run pip install -r requirements.txt
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, ['-m', 'pip', 'install', '-r', join(getBackendDir(), 'requirements.txt')], {
      cwd: getBackendDir(),
      stdio: 'inherit',
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('pip install failed'));
    });
  });
} 