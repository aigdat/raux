import { existsSync, mkdirSync, createWriteStream, rmSync } from 'fs';
import { join } from 'path';
import { getAppInstallDir, getPythonPath } from './envUtils';
import * as os from 'os';
import fetch from 'node-fetch';
import extract from 'extract-zip';
import { spawn } from 'child_process';
import { logInfo, logError } from './logger';
import { IPCManager } from './ipc/ipcManager';
import { IPCChannels } from './ipc/ipcChannels';
import { InstallationStrategy } from './installation/InstallationStrategy';
import { InstallationStrategyFactory } from './installation/InstallationStrategyFactory';

const PYTHON_VERSION = '3.11.8';
const PYTHON_DIR = join(getAppInstallDir(), 'python');
const PYTHON_EXE = getPythonPath();

class PythonExec {
  private static instance: PythonExec;
  private installationStrategy: InstallationStrategy;
  private constructor() {
    this.installationStrategy = InstallationStrategyFactory.create();
  }
  private ipcManager = IPCManager.getInstance();

  public static getInstance(): PythonExec {
    if (!PythonExec.instance) {
      PythonExec.instance = new PythonExec();
    }
    return PythonExec.instance;
  }

  public getPath(): string {
    return PYTHON_EXE;
  }

  // Verification method for startup flow - no installation messages
  public verifyEnvironment(): boolean {
    return this.installationStrategy.isPythonInstalled();
  }

  public async install(): Promise<void> {
    try {
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { type: 'info', message: 'Setting up runtime environment...', step: 'python-check' });
      
      await this.installationStrategy.setupPythonEnvironment();
      
      logInfo('Python and pip setup completed successfully.');
    } catch (err) {
      logError('Python installation failed: ' + (err && err.toString ? err.toString() : String(err)));
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, { type: 'error', message: 'Runtime environment setup failed!', step: 'python-error' });
      throw err;
    }
  }

  public async runPythonCommand(args: string[], options?: any): Promise<{ code: number, stdout: string, stderr: string }> {
    const paths = this.installationStrategy.getPaths();
    return this.runCommand(paths.pythonExecutable, args, options);
  }

  public async runPipCommand(args: string[], options?: any): Promise<{ code: number, stdout: string, stderr: string }> {
    const paths = this.installationStrategy.getPaths();
    return this.runCommand(paths.pythonExecutable, ['-m', 'pip', ...args], options);
  }

  // --- Private helpers ---

  private async runCommand(cmd: string, args: string[], options?: any): Promise<{ code: number, stdout: string, stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      
      // Log pip install output in real-time if verbose flag is present
      const isPipInstall = args.includes('pip') && args.includes('install');
      const isVerbose = args.includes('--verbose');
      
      proc.stdout.on('data', (data) => {
        stdout += data;
        if (isPipInstall && isVerbose) {
          logInfo(`[pip] ${data.toString().trim()}`);
        }
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data;
        if (isPipInstall) {
          logError(`[pip] ${data.toString().trim()}`);
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

export const python = PythonExec.getInstance(); 