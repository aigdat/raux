import { IPCManager } from '../ipc/ipcManager';
import { logInfo, logError } from '../logger';

export interface PythonEnvironment {
  pythonPath: string;
  pipPath: string;
  isVirtual: boolean;
}

export interface InstallationPaths {
  appInstallDir: string;
  pythonDir: string;
  pythonExecutable: string;
  pipExecutable: string;
  openWebUIExecutable: string;
  envFile: string;
}

export abstract class InstallationStrategy {
  protected ipcManager: IPCManager;

  constructor() {
    this.ipcManager = IPCManager.getInstance();
  }

  abstract getName(): string;
  
  abstract getPaths(): InstallationPaths;
  
  abstract isPythonInstalled(): boolean;
  
  abstract isRAUXInstalled(): boolean;
  
  abstract setupPythonEnvironment(): Promise<void>;
  
  abstract installRAUXWheel(wheelPath: string): Promise<void>;
  
  abstract copyEnvFile(srcPath: string, destPath: string): Promise<void>;
  
  abstract getOpenWebUICommand(): string[];
  
  protected logInfo(message: string): void {
    logInfo(`[${this.getName()}] ${message}`);
  }
  
  protected logError(message: string): void {
    logError(`[${this.getName()}] ${message}`);
  }
}