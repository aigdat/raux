import { BrowserWindow, app } from 'electron';
import { WindowsStrategy } from './WindowsStrategy';
import { getRendererPath, isInstallationComplete } from '../envUtils';
import { LemonadeStatus } from '../ipc/ipcTypes';
import { logInfo, logError } from '../logger';
import { lemonadeStatusIndicator } from '../lemonade/statusIndicator';

// Webpack-generated constants for entry points
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export class LinuxWindowsStrategy extends WindowsStrategy {
  getName(): string {
    return 'Linux';
  }

  getWindowOptions(): Electron.BrowserWindowConstructorOptions {
    const PRELOAD_SCRIPT = typeof MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY !== 'undefined'
      ? MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY
      : getRendererPath('main_window', 'preload.js');

    // Linux-specific window options
    const options: Electron.BrowserWindowConstructorOptions = {
      height: 1024,
      width: 1280,
      webPreferences: {
        preload: PRELOAD_SCRIPT,
        contextIsolation: true,
        nodeIntegration: false
      },
      show: true
    };

    // Disable sandbox in development mode on Linux to avoid permission issues
    if (!app.isPackaged) {
      options.webPreferences!.sandbox = false;
      logInfo('Development mode detected - disabling Chrome sandbox for Linux');
    }

    return options;
  }

  handleWindowCreation(mainWindow: BrowserWindow): void {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setTitle('AMD GAIA (OpenWebUI)');

    // Initial IPC registration - same as Windows
    this.ipcManager.registerRenderer(mainWindow.webContents.id, mainWindow.webContents);

    mainWindow.on('close', async () => {
      // Perform cleanup before destroying IPC connections
      await this.performCleanup();
      this.destroyIcps(mainWindow);
    });
    mainWindow.on('closed', () => this.destroyIcps(mainWindow));
  }

  setupNavigationHandlers(mainWindow: BrowserWindow): void {
    // Linux-specific navigation handlers with proper IPC lifecycle management
    mainWindow.webContents.on('did-start-navigation', (event, url) => {
      logInfo(`[WindowManager] Page navigation started to: ${url}`);
      
      // LINUX FIX: Unregister current renderer before navigation to prevent "Render frame was disposed" errors
      // This is crucial for Linux compatibility where WebContents disposal happens differently
      const currentId = mainWindow.webContents.id;
      logInfo(`[WindowManager] Unregistering renderer ${currentId} before navigation`);
      this.ipcManager.unregisterRenderer(currentId);
    });

    mainWindow.webContents.on('did-finish-load', async () => {
      const currentURL = mainWindow?.webContents.getURL();
      logInfo(`[WindowManager] Page finished loading: ${currentURL}`);

      // LINUX FIX: Re-register renderer after navigation completes with new WebContents
      // This ensures IPC messages can be sent to the new page context
      const newId = mainWindow.webContents.id;
      logInfo(`[WindowManager] Re-registering renderer ${newId} after navigation`);
      this.ipcManager.registerRenderer(newId, mainWindow.webContents);

      // Same indicator injection logic as Windows
      if (currentURL && !currentURL.includes('loading.html')) {
        const installationComplete = await isInstallationComplete();
        if (installationComplete) {
          logInfo('[WindowManager] Non-loading page loaded and installation complete - ensuring status indicator presence');
          this.setupRefreshPrevention(mainWindow);

          // Add a small delay to ensure DOM is fully ready
          setTimeout(() => {
            logInfo('[WindowManager] Starting indicator injection after DOM ready delay');
            lemonadeStatusIndicator.ensureIndicatorPresent(mainWindow);
          }, 500);
        } else {
          logInfo('[WindowManager] Installation not complete, skipping indicator injection');
        }
      } else {
        logInfo('[WindowManager] Loading page detected, skipping indicator injection');
      }
    });

    // Handle navigation within the app - same as Windows but with proper IPC handling
    mainWindow.webContents.on('did-navigate', async (event, url) => {
      logInfo(`[WindowManager] Page navigated to: ${url}`);
      // Check and reinject indicator after navigation only if installation is complete
      const installationComplete = await isInstallationComplete();
      if (installationComplete) {
        setTimeout(() => {
          lemonadeStatusIndicator.ensureIndicatorPresent(mainWindow);
        }, 2000);
      }
    });

    // Handle in-page navigation (like hash changes) - same as Windows
    mainWindow.webContents.on('did-navigate-in-page', async (event, url) => {
      logInfo(`[WindowManager] In-page navigation to: ${url}`);
      // Check if indicator still exists, if not reinject - only if installation is complete
      const installationComplete = await isInstallationComplete();
      if (installationComplete) {
        setTimeout(() => {
          lemonadeStatusIndicator.ensureIndicatorPresent(mainWindow);
        }, 2000);
      }
    });
  }

  /**
   * Setup refresh prevention mechanism - same as Windows
   */
  private setupRefreshPrevention(mainWindow: BrowserWindow): void {
    mainWindow.webContents.executeJavaScript(`
      // Override the default refresh behavior
      document.addEventListener('keydown', function(e) {
        // Prevent F5 and Ctrl+R
        if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
          e.preventDefault();
          console.log('Page refresh prevented');
          return false;
        }
      });

      // Prevent context menu refresh option
      document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
      });
    `);
  }

  private destroyIcps(mainWindow: BrowserWindow) {
    this.ipcManager.unregisterRenderer(mainWindow?.webContents.id);
    this.ipcManager.unregisterAllRenderers();
  }
}