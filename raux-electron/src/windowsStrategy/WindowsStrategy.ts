import { BrowserWindow } from 'electron';
import { IPCManager } from '../ipc/ipcManager';

export abstract class WindowsStrategy {
  protected ipcManager: IPCManager;
  private cleanupCallback: (() => Promise<void>) | null = null;

  constructor() {
    this.ipcManager = IPCManager.getInstance();
  }

  /**
   * Set a cleanup callback to be called before IPC destruction
   */
  public setCleanupCallback(callback: () => Promise<void>): void {
    this.cleanupCallback = callback;
  }

  /**
   * Call the cleanup callback if set
   */
  protected async performCleanup(): Promise<void> {
    if (this.cleanupCallback) {
      await this.cleanupCallback();
    }
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