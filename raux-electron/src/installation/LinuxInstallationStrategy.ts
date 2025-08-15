import { app } from 'electron';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { execSync, spawn } from 'child_process';
import * as os from 'os';
import { InstallationStrategy, InstallationPaths } from './InstallationStrategy';
import { getAppInstallDir, getBackendDir } from '../envUtils';
import { IPCChannels } from '../ipc/ipcChannels';

export class LinuxInstallationStrategy extends InstallationStrategy {
  private virtualEnvPath: string;

  constructor() {
    super();
    const appInstallDir = getAppInstallDir();
    this.virtualEnvPath = join(appInstallDir, 'venv');
  }

  getName(): string {
    return 'Linux';
  }

  getPaths(): InstallationPaths {
    const appInstallDir = getAppInstallDir();
    
    return {
      appInstallDir,
      pythonDir: this.virtualEnvPath,
      pythonExecutable: join(this.virtualEnvPath, 'bin', 'python3'),
      pipExecutable: join(this.virtualEnvPath, 'bin', 'pip3'),
      openWebUIExecutable: join(this.virtualEnvPath, 'bin', 'open-webui'),
      envFile: join(appInstallDir, '.env')
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
    
    // Check if virtual environment already exists
    if (existsSync(paths.pythonDir) && existsSync(paths.pythonExecutable)) {
      this.logInfo('Python virtual environment already exists, skipping creation.');
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
        type: 'success', 
        message: 'Runtime environment already configured.', 
        step: 'python-check' 
      });
      return;
    }

    // Check system Python version
    const pythonVersion = await this.checkSystemPython();
    if (!pythonVersion) {
      throw new Error('Python 3.11 or higher is required but not found on the system');
    }

    this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
      type: 'info', 
      message: 'Creating Python virtual environment...', 
      step: 'python-venv' 
    });

    // Create parent directory if it doesn't exist
    const parentDir = dirname(paths.pythonDir);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Create virtual environment
    await this.createVirtualEnvironment();

    // Upgrade pip in virtual environment
    this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
      type: 'info', 
      message: 'Upgrading pip in virtual environment...', 
      step: 'pip-upgrade' 
    });
    
    await this.upgradePip();

    this.logInfo('Python virtual environment setup completed successfully.');
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

  async copyEnvFile(srcPath: string, destPath: string): Promise<void> {
    const destDir = dirname(destPath);
    
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    
    copyFileSync(srcPath, destPath);
    this.logInfo(`Copied env file to ${destPath}`);
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
      // In production, use the installed open-webui executable from venv
      return {
        executable: paths.openWebUIExecutable,
        args: ['serve']
      };
    }
  }

  private async checkSystemPython(): Promise<string | null> {
    try {
      // Try python3 first
      const version = execSync('python3 --version', { encoding: 'utf8' }).trim();
      const match = version.match(/Python (\d+)\.(\d+)\.(\d+)/);
      
      if (match) {
        const major = parseInt(match[1]);
        const minor = parseInt(match[2]);
        
        if (major === 3 && minor >= 11) {
          this.logInfo(`Found system Python: ${version}`);
          return version;
        }
      }
    } catch (err) {
      this.logError(`Failed to check system Python: ${err}`);
    }
    
    return null;
  }

  private async createVirtualEnvironment(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn('python3', ['-m', 'venv', this.virtualEnvPath], { 
        stdio: 'pipe' 
      });
      
      let stderr = '';
      
      proc.stderr.on('data', (data) => {
        stderr += data;
        this.logError(`[venv] ${data.toString().trim()}`);
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          this.logInfo('Virtual environment created successfully.');
          resolve();
        } else {
          reject(new Error(`Failed to create virtual environment. Exit code: ${code}\nError: ${stderr}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  private async upgradePip(): Promise<void> {
    const result = await this.runPipCommand([
      'install',
      '--upgrade',
      'pip'
    ]);

    if (result.code !== 0) {
      throw new Error(`Failed to upgrade pip. Exit code: ${result.code}\nError: ${result.stderr}`);
    }
    
    this.logInfo('pip upgraded successfully.');
  }

  private async runPipCommand(args: string[]): Promise<{ code: number, stdout: string, stderr: string }> {
    const paths = this.getPaths();
    return this.runCommand(paths.pipExecutable, args);
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