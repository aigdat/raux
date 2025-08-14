import { existsSync, mkdirSync, createWriteStream, rmSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { execSync, spawn } from 'child_process';
import * as os from 'os';
import fetch from 'node-fetch';
import extract from 'extract-zip';
import { InstallationStrategy, InstallationPaths } from './InstallationStrategy';
import { getAppInstallDir, getBackendDir, isDev } from '../envUtils';
import { IPCChannels } from '../ipc/ipcChannels';

const PYTHON_VERSION = '3.11.8';

export class WindowsInstallationStrategy extends InstallationStrategy {
  getName(): string {
    return 'Windows';
  }

  getPaths(): InstallationPaths {
    const appInstallDir = getAppInstallDir();
    const pythonDir = join(appInstallDir, 'python');
    
    return {
      appInstallDir,
      pythonDir,
      pythonExecutable: join(pythonDir, 'python.exe'),
      pipExecutable: join(pythonDir, 'python.exe'),
      openWebUIExecutable: join(pythonDir, 'Scripts', 'open-webui.exe'),
      envFile: join(pythonDir, 'Lib', '.env')
    };
  }

  isPythonInstalled(): boolean {
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
        timeout: 2000,
        windowsHide: true
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
    const zipPath = join(paths.pythonDir, 'python-embed.zip');

    this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
      type: 'info', 
      message: 'Downloading runtime components...', 
      step: 'python-download' 
    });
    
    await this.downloadPython(url, zipPath);
    
    this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
      type: 'info', 
      message: 'Extracting runtime libraries...', 
      step: 'python-extract' 
    });
    
    await this.extractPython(zipPath, paths.pythonDir);
    
    this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
      type: 'info', 
      message: 'Configuring package management...', 
      step: 'pip-install' 
    });
    
    await this.ensurePipInstalled();
    
    this.logInfo('Python and pip setup completed successfully.');
    this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { 
      type: 'success', 
      message: 'Runtime environment ready.', 
      step: 'python-complete' 
    });
  }

  async installRAUXWheel(wheelPath: string): Promise<void> {
    const paths = this.getPaths();
    const pipCacheDir = join(paths.appInstallDir, 'python', 'pip-cache');
    mkdirSync(pipCacheDir, { recursive: true });

    const result = await this.runPipCommand([
      'install',
      wheelPath,
      '--cache-dir',
      pipCacheDir,
      '--verbose',
      '--no-warn-script-location'
    ]);

    if (result.code !== 0) {
      throw new Error(`Failed to install wheel. Exit code: ${result.code}\nError: ${result.stderr}`);
    }
  }

  async copyEnvFile(srcPath: string, destPath: string): Promise<void> {
    const paths = this.getPaths();
    const libDir = join(paths.pythonDir, 'Lib');
    
    if (!existsSync(libDir)) {
      mkdirSync(libDir, { recursive: true });
    }
    
    copyFileSync(srcPath, destPath);
    this.logInfo(`Copied env file to ${destPath}`);
  }

  getOpenWebUICommand(): string[] {
    const paths = this.getPaths();
    return [paths.openWebUIExecutable];
  }

  configureApp(): void {
    // No special app configuration needed for Windows
    this.logInfo('Windows platform - no special app configuration required');
  }

  shouldUseLemonade(): boolean {
    // Windows should attempt to use Lemonade if available
    return true;
  }

  getRAUXStartCommand(isDev: boolean, env: NodeJS.ProcessEnv): { 
    executable: string; 
    args: string[]; 
  } {
    const paths = this.getPaths();
    
    if (isDev) {
      // In dev mode on Windows, use start_windows.bat - exactly as current code does
      const backendDir = getBackendDir();
      const batPath = join(backendDir, 'start_windows.bat');
      return {
        executable: 'cmd.exe',
        args: ['/c', batPath]
      };
    } else {
      // In production, use the installed open-webui.exe from Scripts directory
      // This matches the current code exactly: pythonDir/Scripts/open-webui.exe
      const pythonDir = paths.pythonDir;
      const scriptsDir = join(pythonDir, 'Scripts');
      const openWebuiExe = join(scriptsDir, 'open-webui.exe');
      return {
        executable: openWebuiExe,
        args: ['serve']
      };
    }
  }

  private getPythonDownloadUrl(): string {
    const arch = os.arch();
    if (arch === 'x64') {
      return `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
    } else if (arch === 'arm64') {
      return `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-arm64.zip`;
    } else {
      throw new Error('Unsupported architecture: ' + arch);
    }
  }

  private async downloadPython(url: string, zipPath: string): Promise<void> {
    this.logInfo('Downloading Python...');
    return new Promise<void>((resolve, reject) => {
      fetch(url)
        .then(response => {
          if (response.status !== 200) {
            this.logError('Failed to download Python: ' + response.status);
            reject(new Error('Failed to download Python: ' + response.status));
            return;
          }
          const file = createWriteStream(zipPath);
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

  private async extractPython(zipPath: string, destDir: string): Promise<void> {
    this.logInfo('Extracting Python...');
    try {
      await extract(zipPath, { dir: destDir });
      this.logInfo('Python extraction finished.');
    } catch (error) {
      this.logError(`Failed to extract Python: ${error}`);
      throw error;
    }
  }

  private async ensurePipInstalled(): Promise<void> {
    const paths = this.getPaths();
    this.logInfo('Ensuring pip is installed using get-pip.py...');
    const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
    const getPipPath = join(paths.pythonDir, 'get-pip.py');

    // Download get-pip.py
    await new Promise<void>((resolve, reject) => {
      fetch(getPipUrl)
        .then(response => {
          if (response.status !== 200) {
            reject(new Error('Failed to download get-pip.py: ' + response.status));
            return;
          }
          const file = createWriteStream(getPipPath);
          response.body.pipe(file);
          file.on('finish', () => {
            file.close();
            this.logInfo('get-pip.py download finished.');
            resolve();
          });
        })
        .catch(err => {
          reject(err);
        });
    });

    // Run get-pip.py
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(paths.pythonExecutable, [getPipPath, '--no-warn-script-location'], { stdio: 'pipe' });
      proc.stdout.on('data', (data) => this.logInfo(`[get-pip.py][stdout] ${data}`));
      proc.stderr.on('data', (data) => this.logError(`[get-pip.py][stderr] ${data}`));
      proc.on('close', (code) => {
        if (code === 0) {
          this.logInfo('pip installed successfully via get-pip.py.');
          resolve();
        } else {
          reject(new Error('get-pip.py failed'));
        }
      });
      proc.on('error', (err) => {
        reject(err);
      });
    });

    // Clean up get-pip.py
    try {
      rmSync(getPipPath, { force: true });
      this.logInfo('get-pip.py deleted after pip installation.');
    } catch (err) {
      this.logError(`Failed to delete get-pip.py: ${err}`);
    }

    // Patch python311._pth to include Lib and Lib\site-packages
    await this.patchPythonPath();
  }

  private async patchPythonPath(): Promise<void> {
    try {
      const paths = this.getPaths();
      const fs = await import('fs');
      const files = fs.readdirSync(paths.pythonDir);
      const pthFile = files.find(f => /^python\d+\d+\._pth$/.test(f));
      
      if (!pthFile) {
        this.logError('No python*._pth file found to patch.');
        return;
      }
      
      const pthPath = join(paths.pythonDir, pthFile);
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
        this.logInfo(`Patched ${pthFile} to include Lib and Lib\\site-packages.`);
      } else {
        this.logInfo(`${pthFile} already includes Lib and Lib\\site-packages.`);
      }
    } catch (err) {
      this.logError(`Failed to patch python*._pth: ${err}`);
    }
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
      
      const isPipInstall = args.includes('pip') && args.includes('install');
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