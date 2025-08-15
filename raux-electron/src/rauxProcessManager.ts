import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync, openSync } from 'fs';
import { join, dirname } from 'path';
import { isDev, getAppInstallDir, getBackendDir } from './envUtils';
import { logInfo, logError } from './logger';
import { python } from './pythonExec';
import { InstallationStrategyFactory } from './installation/InstallationStrategyFactory';
import { InstallationStrategy } from './installation/InstallationStrategy';

class RauxProcessManager {
  private rauxProcess: ChildProcessWithoutNullStreams | null = null;
  private pythonPath: string;
  private backendDir: string;
  private status: 'starting' | 'running' | 'stopped' | 'crashed' = 'stopped';
  private logPath: string;
  private installationStrategy: InstallationStrategy;

  constructor() {
    this.installationStrategy = InstallationStrategyFactory.create();
    const installDir = getAppInstallDir();
    this.pythonPath = python.getPath();
    this.backendDir = getBackendDir();

    this.logPath = join(installDir, 'raux.log');
    
    logInfo(`[RauxProcessManager] installDir: ${installDir}`);
    logInfo(`[RauxProcessManager] pythonPath: ${this.pythonPath}`);
    logInfo(`[RauxProcessManager] backendDir: ${this.backendDir}`);
    logInfo(`[RauxProcessManager] logPath: ${this.logPath}`);
  }


  // TODO: remove this ... it should auto generate!
  ensureSecretKey(): string {
    const keyFile = join(getAppInstallDir(), '.webui_secret_key');
    const keyDir = dirname(keyFile);
    if (!existsSync(keyDir)) {
      // Ensure parent directory exists
      require('fs').mkdirSync(keyDir, { recursive: true });
    }
    if (!existsSync(keyFile)) {
      // Generate a random 12-byte base64 string
      const random = Buffer.from(Array.from({ length: 12 }, () => Math.floor(Math.random() * 256)));
      writeFileSync(keyFile, random.toString('base64'));
    }
    
    const result = readFileSync(keyFile, 'utf-8').trim();

    if (!result) {
      logError('[RauxProcessManager] Secret key is empty');
      throw new Error('Secret key is empty');
    } else {
      logInfo('[RauxProcessManager] Ensured key exists');
    }

    return result;
  }

  async ensurePlaywrightInstalled(env: NodeJS.ProcessEnv) {
    if (env.WEB_LOADER_ENGINE?.toLowerCase() === 'playwright' && !env.PLAYWRIGHT_WS_URL) {
      await new Promise<void>((resolve, reject) => {
        const pw = spawn(this.pythonPath, ['-m', 'playwright', 'install', 'chromium'], {
          cwd: this.backendDir,
          stdio: 'pipe',
        });

        pw.stdout.on('data', (data) => logInfo(`[playwright][stdout] ${data}`));
        pw.stderr.on('data', (data) => logError(`[playwright][stderr] ${data}`));
        pw.on('close', (code) => {
          if (code === 0) resolve();
          else {
            logError('playwright install failed');
            reject(new Error('playwright install failed'));
          }
        });
      });
      
      // Download NLTK data
      await new Promise<void>((resolve, reject) => {
        const nltk = spawn(this.pythonPath, ['-c', "import nltk; nltk.download('punkt_tab')"], {
          cwd: this.backendDir,
          stdio: 'pipe',
        });
        nltk.stdout.on('data', (data) => logInfo(`[nltk][stdout] ${data}`));
        nltk.stderr.on('data', (data) => logError(`[nltk][stderr] ${data}`));
        nltk.on('close', (code) => {
          if (code === 0) resolve();
          else {
            logError('nltk download failed');
            reject(new Error('nltk download failed'));
          }
        });
      });
    }
  }

  async startRaux(envOverrides: Record<string, string> = {}) {
    try {
      logInfo('[RauxProcessManager] Starting RAUX backend...');
      
      const secretKey = this.ensureSecretKey();

      // Set up environment variables
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PORT: envOverrides.PORT || '8080',
        HOST: envOverrides.HOST || '0.0.0.0',
        WEBUI_SECRET_KEY: secretKey,
        PYTHONIOENCODING: 'utf-8',
        ...envOverrides,
      };
      await this.ensurePlaywrightInstalled(env);

      logInfo('[RauxProcessManager] Ensured Playwright installed');
      
      // Ensure log file exists
      if (!existsSync(this.logPath)) openSync(this.logPath, 'w');
      
      // Use InstallationStrategy to get platform-specific command
      const { executable, args } = this.installationStrategy.getRAUXStartCommand(isDev, env);
      
      logInfo(`[RauxProcessManager] Spawning RAUX backend:`);
      logInfo(`[RauxProcessManager] - Executable: ${executable}`);
      logInfo(`[RauxProcessManager] - Args: ${JSON.stringify(args)}`);
      logInfo(`[RauxProcessManager] - CWD: ${this.backendDir}`);

      this.rauxProcess = spawn(executable, args, {
        cwd: this.backendDir,
        env,
        stdio: 'pipe',
        shell: false,
      });
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
      try {
        this.rauxProcess.kill('SIGTERM');
      } catch (e) {
        // Ignore errors
      }
      this.rauxProcess = null;
    }
  }

  getStatus() {
    return this.status;
  }
}

export const rauxProcessManager = new RauxProcessManager();