import { app } from 'electron';
import { existsSync, mkdirSync, copyFileSync, createWriteStream, rmSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { execSync, spawn } from 'child_process';
import * as os from 'os';
import fetch from 'node-fetch';
import * as tar from 'tar';
import { InstallationStrategy, InstallationPaths } from './InstallationStrategy';
import { getAppInstallDir, getBackendDir } from '../envUtils';
import { IPCChannels } from '../ipc/ipcChannels';

const PYTHON_VERSION = '3.11.8';
const PYTHON_BUILD_VERSION = '20240224';

export class LinuxInstallationStrategy extends InstallationStrategy {
  constructor() {
    super();
  }

  getName(): string {
    return 'Linux';
  }

  getPaths(): InstallationPaths {
    const appInstallDir = getAppInstallDir();
    const pythonDir = join(appInstallDir, 'python');
    
    return {
      appInstallDir,
      pythonDir,
      pythonExecutable: join(pythonDir, 'bin', 'python3'),
      pipExecutable: join(pythonDir, 'bin', 'python3'),
      openWebUIExecutable: join(pythonDir, 'bin', 'open-webui'),
      envFile: join(pythonDir, 'lib', 'python3.11', '.env')
    };
  }

  isPythonInstalled(): boolean {
    // Check if virtual environment exists
    const paths = this.getPaths();
    return existsSync(paths.pythonDir) && existsSync(paths.pythonExecutable);
  }

  isRAUXInstalled(): boolean {
    try {
      const paths = this.getPaths();
      
      if (!existsSync(paths.envFile)) {
        this.logInfo(`RAUX env file not found at: ${paths.envFile}`);
        return false;
      }
      this.logInfo(`RAUX env file found at: ${paths.envFile}`);

      if (!existsSync(paths.openWebUIExecutable)) {
        this.logInfo(`open-webui executable not found at: ${paths.openWebUIExecutable}`);
        return false;
      }

      // Try to run it with --help to verify it's functional
      execSync(`"${paths.openWebUIExecutable}" --help`, {
        encoding: 'utf8',
        timeout: 2000
      });

      this.logInfo('RAUX installation verified successfully');
      return true;
    } catch (err) {
      this.logError(`RAUX installation check failed: ${err}`);
      return false;
    }
  }

  async setupPythonEnvironment(): Promise<void> {
    const paths = this.getPaths();
    
    if (existsSync(paths.pythonDir)) {
      this.logInfo('Python directory already exists, skipping installation.');
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
        type: 'success', 
        message: 'Runtime environment already configured.', 
        step: 'python-check' 
      });
      return;
    }

    mkdirSync(paths.pythonDir, { recursive: true });
    
    const url = this.getPythonDownloadUrl();
    const tarPath = join(paths.pythonDir, 'python-standalone.tar.gz');

    this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
      type: 'info', 
      message: 'Downloading runtime components...', 
      step: 'python-download' 
    });
    
    await this.downloadPython(url, tarPath);
    
    this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
      type: 'info', 
      message: 'Extracting runtime libraries...', 
      step: 'python-extract' 
    });
    
    await this.extractPython(tarPath, paths.pythonDir);
    
    this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
      type: 'info', 
      message: 'Configuring package management...', 
      step: 'pip-install' 
    });
    
    await this.ensurePipInstalled();
    
    this.logInfo('Python standalone installation completed successfully.');
    this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
      type: 'success', 
      message: 'Runtime environment ready.', 
      step: 'python-complete' 
    });
  }

  async installRAUXWheel(wheelPath: string): Promise<void> {
    const paths = this.getPaths();
    const pipCacheDir = join(paths.appInstallDir, 'pip-cache');
    mkdirSync(pipCacheDir, { recursive: true });

    const result = await this.runPipCommand([
      'install',
      wheelPath,
      '--cache-dir',
      pipCacheDir,
      '--verbose'
    ]);

    if (result.code !== 0) {
      throw new Error(`Failed to install wheel. Exit code: ${result.code}\nError: ${result.stderr}`);
    }
  }

  async copyEnvFile(extractDir: string): Promise<void> {
    const paths = this.getPaths();
    const srcEnv = join(extractDir, 'raux.env');
    const destEnv = paths.envFile; // This is python/lib/python3.11/.env
    
    if (!existsSync(srcEnv)) {
      this.logError(`copyEnvFile: Source raux.env not found at ${srcEnv}`);
      throw new Error('raux.env not found in extract directory');
    }

    const libDir = dirname(destEnv);
    if (!existsSync(libDir)) {
      mkdirSync(libDir, { recursive: true });
    }
    
    copyFileSync(srcEnv, destEnv);
    this.logInfo(`Copied raux.env from ${srcEnv} to ${destEnv}`);
  }


  getOpenWebUICommand(): string[] {
    const paths = this.getPaths();
    return [paths.openWebUIExecutable];
  }

  configureApp(): void {
    // Disable sandbox in development mode on Linux to avoid permission issues
    if (!app.isPackaged) {
      app.commandLine.appendSwitch('no-sandbox');
      this.logInfo('Development mode detected - disabling Chrome sandbox');
    }
  }

  shouldUseLemonade(): boolean {
    // Linux should never use Lemonade - lemonade-server-dev is not on PATH
    return false;
  }

  getRAUXStartCommand(isDev: boolean, env: NodeJS.ProcessEnv): { 
    executable: string; 
    args: string[]; 
  } {
    const paths = this.getPaths();
    
    if (isDev) {
      // In dev mode on Linux, use dev.sh script - exactly like Windows uses start_windows.bat
      // Developer is responsible for activating conda environment before running
      const backendDir = getBackendDir();
      const devScript = join(backendDir, 'dev.sh');
      
      if (existsSync(devScript)) {
        return {
          executable: '/bin/bash',
          args: [devScript]
        };
      }
      
      // Fallback if dev.sh doesn't exist: run uvicorn directly
      // Assumes developer has activated the proper environment
      return {
        executable: 'uvicorn',
        args: [
          'open_webui.main:app',
          '--host', env.HOST || '0.0.0.0',
          '--port', env.PORT || '8080',
          '--forwarded-allow-ips', '*',
          '--workers', env.UVICORN_WORKERS || '1',
        ]
      };
    } else {
      // In production, use the installed open-webui executable from standalone Python
      return {
        executable: paths.openWebUIExecutable,
        args: ['serve']
      };
    }
  }

  private getPythonDownloadUrl(): string {
    const arch = os.arch();
    if (arch === 'x64') {
      return `https://github.com/indygreg/python-build-standalone/releases/download/${PYTHON_BUILD_VERSION}/cpython-${PYTHON_VERSION}+${PYTHON_BUILD_VERSION}-x86_64-unknown-linux-gnu-install_only.tar.gz`;
    } else {
      throw new Error('Unsupported architecture: ' + arch + '. Only x64 is supported.');
    }
  }

  private async downloadPython(url: string, tarPath: string): Promise<void> {
    this.logInfo('Downloading Python...');
    return new Promise<void>((resolve, reject) => {
      fetch(url)
        .then(response => {
          if (response.status !== 200) {
            this.logError('Failed to download Python: ' + response.status);
            reject(new Error('Failed to download Python: ' + response.status));
            return;
          }
          const file = createWriteStream(tarPath);
          response.body.pipe(file);
          file.on('finish', () => {
            file.close();
            this.logInfo('Python download finished.');
            resolve();
          });
        })
        .catch(err => {
          this.logError(`Download error: ${err}`);
          reject(err);
        });
    });
  }

  private async extractPython(tarPath: string, destDir: string): Promise<void> {
    this.logInfo('Extracting Python...');
    try {
      await tar.extract({
        file: tarPath,
        cwd: destDir,
        strip: 1 // Remove the top-level directory from extraction
      });
      
      // Make Python executable
      const pythonExe = join(destDir, 'bin', 'python3');
      if (existsSync(pythonExe)) {
        chmodSync(pythonExe, 0o755);
      }
      
      // Clean up tar file
      rmSync(tarPath, { force: true });
      this.logInfo('Python extraction finished.');
    } catch (error) {
      this.logError(`Failed to extract Python: ${error}`);
      throw error;
    }
  }

  private async ensurePipInstalled(): Promise<void> {
    // Python standalone builds come with pip already installed
    // Just verify it works
    const result = await this.runPipCommand(['--version']);
    if (result.code !== 0) {
      throw new Error(`pip verification failed. Exit code: ${result.code}\nError: ${result.stderr}`);
    }
    this.logInfo('pip verified successfully.');
  }

  private async runPipCommand(args: string[]): Promise<{ code: number, stdout: string, stderr: string }> {
    const paths = this.getPaths();
    return this.runCommand(paths.pythonExecutable, ['-m', 'pip', ...args]);
  }

  private async runCommand(cmd: string, args: string[]): Promise<{ code: number, stdout: string, stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      
      const isPipInstall = cmd.includes('pip') && args.includes('install');
      const isVerbose = args.includes('--verbose');
      
      proc.stdout.on('data', (data) => {
        stdout += data;
        if (isPipInstall && isVerbose) {
          this.logInfo(`[pip] ${data.toString().trim()}`);
        }
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data;
        if (isPipInstall) {
          this.logError(`[pip] ${data.toString().trim()}`);
        }
      });
      
      proc.on('close', (code) => {
        resolve({ code: code ?? -1, stdout, stderr });
      });
      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}