import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync, copyFileSync, readFileSync, writeFileSync, appendFileSync, openSync } from 'fs';
import { join } from 'path';
import { isDev, getInstallDir, getBackendDir, getPythonPath } from './envUtils';
import { logInfo, logError } from './logger';

class RauxProcessManager {
  private rauxProcess: ChildProcessWithoutNullStreams | null = null;
  private installDir: string;
  private pythonPath: string;
  private backendDir: string;
  private status: 'starting' | 'running' | 'stopped' | 'crashed' = 'stopped';
  private logPath: string;

  constructor() {
    this.installDir = getInstallDir();
    this.pythonPath = getPythonPath();
    this.backendDir = getBackendDir();
    this.logPath = join(this.installDir, 'raux.log');
    logInfo(`[RauxProcessManager] installDir: ${this.installDir}`);
    logInfo(`[RauxProcessManager] pythonPath: ${this.pythonPath}`);
    logInfo(`[RauxProcessManager] backendDir: ${this.backendDir}`);
    logInfo(`[RauxProcessManager] logPath: ${this.logPath}`);
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
    const keyDir = this.backendDir;
    if (!existsSync(keyDir)) {
      // Ensure parent directory exists
      require('fs').mkdirSync(keyDir, { recursive: true });
    }
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
    try {
      logInfo('[RauxProcessManager] Starting RAUX backend...');
      this.ensureEnvFile();
      logInfo('[RauxProcessManager] Ensured .env file');
      const secretKey = this.ensureSecretKey();
      logInfo('[RauxProcessManager] Ensured secret key');
      await this.ensureRequirementsInstalled();
      logInfo('[RauxProcessManager] Ensured requirements installed');
      // Set up environment variables
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PORT: envOverrides.PORT || '8080',
        HOST: envOverrides.HOST || '0.0.0.0',
        WEBUI_SECRET_KEY: secretKey,
        ...envOverrides,
      };
      await this.ensurePlaywrightInstalled(env);
      logInfo('[RauxProcessManager] Ensured Playwright installed');
      // Ensure log file exists
      if (!existsSync(this.logPath)) openSync(this.logPath, 'w');
      // Windows dev mode: use start_windows.bat
      if (isDev && process.platform === 'win32') {
        const batPath = join(this.backendDir, 'start_windows.bat');
        logInfo(`[RauxProcessManager] Spawning RAUX backend via start_windows.bat: ${batPath}`);
        logInfo(`[RauxProcessManager] CWD: ${this.backendDir}`);
        this.rauxProcess = spawn('cmd.exe', ['/c', batPath], {
          cwd: this.backendDir,
          env,
          stdio: 'pipe',
          shell: false,
        });
      } else {
        // Choose executable and args based on dev/prod
        let executable: string;
        let args: string[];
        if (isDev) {
          executable = 'uvicorn';
          args = [
            'open_webui.main:app',
            '--host', env.HOST!,
            '--port', env.PORT!,
            '--forwarded-allow-ips', '*',
            '--workers', env.UVICORN_WORKERS || '1',
          ];
        } else {
          executable = this.pythonPath;
          args = [
            '-m', 'uvicorn',
            'open_webui.main:app',
            '--host', env.HOST!,
            '--port', env.PORT!,
            '--forwarded-allow-ips', '*',
            '--workers', env.UVICORN_WORKERS || '1',
          ];
        }
        logInfo(`[RauxProcessManager] Spawning RAUX backend:`);
        logInfo(`[RauxProcessManager]   Executable: ${executable}`);
        logInfo(`[RauxProcessManager]   Args: ${JSON.stringify(args)}`);
        logInfo(`[RauxProcessManager]   CWD: ${this.backendDir}`);
        this.rauxProcess = spawn(executable, args, {
          cwd: this.backendDir,
          env,
          stdio: 'pipe',
          shell: false,
        });
      }
      this.rauxProcess.stdout.on('data', (data) => {
        appendFileSync(this.logPath, data.toString());
        if (this.status === 'starting') this.status = 'running';
      });
      this.rauxProcess.stderr.on('data', (data) => {
        appendFileSync(this.logPath, data.toString());
        logError(`[RauxProcessManager][stderr] ${data.toString()}`);
      });
      this.rauxProcess.on('close', (code) => {
        this.status = code === 0 ? 'stopped' : 'crashed';
        appendFileSync(this.logPath, `\nRAUX process exited with code ${code}\n`);
        logError(`[RauxProcessManager] RAUX process exited with code ${code}`);
        this.rauxProcess = null;
      });
    } catch (err) {
      logError(`[RauxProcessManager] Error starting RAUX: ${err && err.toString ? err.toString() : String(err)}`);
      throw err;
    }
  }

  stopRaux() {
    if (this.rauxProcess) {
      this.rauxProcess.kill('SIGTERM');
      this.rauxProcess = null;
    }
  }

  getStatus() {
    return this.status;
  }
}

export const rauxProcessManager = new RauxProcessManager(); 