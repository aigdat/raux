import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

// Configurable install path (should be set at install time or loaded from config)
const getInstallDir = (): string => {
  // Example: use Electron's userData or a config file
  // Replace with actual logic as needed
  // e.g., return app.getPath('userData');
  // For now, assume a fixed path for demonstration:
  return join(app.getPath('userData'), 'RAUX');
};

const PYTHON_RELATIVE_PATH = join('python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
const BACKEND_RELATIVE_PATH = 'backend';

class RauxProcessManager {
  private rauxProcess: ChildProcessWithoutNullStreams | null = null;
  private installDir: string;
  private pythonPath: string;
  private backendDir: string;

  constructor() {
    this.installDir = getInstallDir();
    this.pythonPath = join(this.installDir, PYTHON_RELATIVE_PATH);
    this.backendDir = join(this.installDir, BACKEND_RELATIVE_PATH);
  }

  ensureEnvFile() {
    const envPath = join(this.backendDir, '.env');
    const envExamplePath = join(this.backendDir, '.env.example');
    if (!existsSync(envPath) && existsSync(envExamplePath)) {
      copyFileSync(envExamplePath, envPath);
    }
  }

  ensureSecretKey(): string {
    const keyFile = join(this.backendDir, '.webui_secret_key');
    if (!existsSync(keyFile)) {
      // Generate a random 12-byte base64 string
      const random = Buffer.from(Array.from({ length: 12 }, () => Math.floor(Math.random() * 256)));
      writeFileSync(keyFile, random.toString('base64'));
    }
    return readFileSync(keyFile, 'utf-8').trim();
  }

  async ensureRequirementsInstalled() {
    // Check for a marker file to avoid reinstalling every time
    const marker = join(this.backendDir, '.requirements_installed');
    if (existsSync(marker)) return;
    await new Promise<void>((resolve, reject) => {
      const pip = spawn(this.pythonPath, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
        cwd: this.backendDir,
        stdio: 'inherit',
      });
      pip.on('close', (code) => {
        if (code === 0) {
          writeFileSync(marker, 'ok');
          resolve();
        } else {
          reject(new Error('pip install failed'));
        }
      });
    });
  }

  async ensurePlaywrightInstalled(env: NodeJS.ProcessEnv) {
    if (env.WEB_LOADER_ENGINE?.toLowerCase() === 'playwright' && !env.PLAYWRIGHT_WS_URL) {
      await new Promise<void>((resolve, reject) => {
        const pw = spawn(this.pythonPath, ['-m', 'playwright', 'install', 'chromium'], {
          cwd: this.backendDir,
          stdio: 'inherit',
        });
        pw.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error('playwright install failed'));
        });
      });
      // Download NLTK data
      await new Promise<void>((resolve, reject) => {
        const nltk = spawn(this.pythonPath, ['-c', "import nltk; nltk.download('punkt_tab')"], {
          cwd: this.backendDir,
          stdio: 'inherit',
        });
        nltk.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error('nltk download failed'));
        });
      });
    }
  }

  async startRaux(envOverrides: Record<string, string> = {}) {
    this.ensureEnvFile();
    const secretKey = this.ensureSecretKey();
    await this.ensureRequirementsInstalled();

    // Set up environment variables
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: envOverrides.PORT || '8080',
      HOST: envOverrides.HOST || '0.0.0.0',
      WEBUI_SECRET_KEY: secretKey,
      ...envOverrides,
    };

    await this.ensurePlaywrightInstalled(env);

    // Start uvicorn
    const args = [
      '-m', 'uvicorn',
      'open_webui.main:app',
      '--host', env.HOST!,
      '--port', env.PORT!,
      '--forwarded-allow-ips', '*',
      '--workers', env.UVICORN_WORKERS || '1',
    ];
    this.rauxProcess = spawn(this.pythonPath, args, {
      cwd: this.backendDir,
      env,
      stdio: 'inherit',
    });
    this.rauxProcess.on('close', (code) => {
      console.log(`RAUX process exited with code ${code}`);
      this.rauxProcess = null;
    });
  }

  stopRaux() {
    if (this.rauxProcess) {
      this.rauxProcess.kill('SIGTERM');
      this.rauxProcess = null;
    }
  }
}

export const rauxProcessManager = new RauxProcessManager(); 