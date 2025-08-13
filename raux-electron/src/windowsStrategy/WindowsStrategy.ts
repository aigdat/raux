import { BrowserWindow } from 'electron';
import { IPCManager } from '../ipc/ipcManager';

export abstract class WindowsStrategy {
  protected ipcManager: IPCManager;

  constructor() {
    this.ipcManager = IPCManager.getInstance();
  }

  /**
   * Setup platform-specific navigation event handlers for the window
   */
  abstract setupNavigationHandlers(mainWindow: BrowserWindow): void;

  /**
   * Handle platform-specific setup when window is created
   */
  abstract handleWindowCreation(mainWindow: BrowserWindow): void;

  /**
   * Get platform-specific BrowserWindow constructor options
   */
  abstract getWindowOptions(): Electron.BrowserWindowConstructorOptions;

  /**
   * Get the name of this windows strategy for logging
   */
  abstract getName(): string;
}