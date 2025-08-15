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
  
  abstract copyEnvFile(extractDir: string): Promise<void>;
  
  abstract getOpenWebUICommand(): string[];
  
  /**
   * Configure app-level settings for the platform (called early in app initialization)
   * This is where platform-specific configurations like sandbox settings should go
   */
  abstract configureApp(): void;
  
  /**
   * Get the command to start RAUX backend server
   * @param isDev - Whether running in development mode
   * @param env - Environment variables object with HOST, PORT, etc.
   * @returns Object with executable path and arguments
   */
  abstract getRAUXStartCommand(isDev: boolean, env: NodeJS.ProcessEnv): { 
    executable: string; 
    args: string[]; 
  };
  
  /**
   * Determines if Lemonade server should be used on this platform
   * @returns true if Lemonade should be attempted, false to skip entirely
   */
  abstract shouldUseLemonade(): boolean;
  
  protected logInfo(message: string): void {
    logInfo(`[${this.getName()}] ${message}`);
  }
  
  protected logError(message: string): void {
    logError(`[${this.getName()}] ${message}`);
  }
}