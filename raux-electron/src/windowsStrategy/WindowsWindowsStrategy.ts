import { BrowserWindow } from 'electron';
import { WindowsStrategy } from './WindowsStrategy';
import { getRendererPath, isInstallationComplete } from '../envUtils';
import { LemonadeStatus } from '../ipc/ipcTypes';
import { logInfo, logError } from '../logger';
import { lemonadeStatusIndicator } from '../lemonade/statusIndicator';

// Webpack-generated constants for entry points
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export class WindowsWindowsStrategy extends WindowsStrategy {
  getName(): string {
    return 'Windows';
  }

  getWindowOptions(): Electron.BrowserWindowConstructorOptions {
    const PRELOAD_SCRIPT = typeof MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY !== 'undefined'
      ? MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY
      : getRendererPath('main_window', 'preload.js');

    return {
      height: 1024,
      width: 1280,
      webPreferences: {
        preload: PRELOAD_SCRIPT,
        contextIsolation: true,
        nodeIntegration: false
      },
      show: true
    };
  }

  handleWindowCreation(mainWindow: BrowserWindow): void {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setTitle('AMD GAIA (OpenWebUI)');

    // EXACT COPY of current main branch logic - register IPC immediately
    this.ipcManager.registerRenderer(mainWindow.webContents.id, mainWindow.webContents);

    mainWindow.on('close', async () => {
      // Perform cleanup before destroying IPC connections
      await this.performCleanup();
      this.destroyIcps(mainWindow);
    });
    mainWindow.on('closed', () => this.destroyIcps(mainWindow));
  }

  setupNavigationHandlers(mainWindow: BrowserWindow): void {
    // EXACT COPY of current setupPageNavigationHandlers from main branch
    mainWindow.webContents.on('did-start-navigation', (event, url) => {
      logInfo(`[WindowManager] Page navigation started to: ${url}`);
    });

    mainWindow.webContents.on('did-finish-load', async () => {
      const currentURL = mainWindow?.webContents.getURL();
      logInfo(`[WindowManager] Page finished loading: ${currentURL}`);

      // Only inject indicator if we're not on the loading page and installation is complete
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

    // Handle navigation within the app
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

    // Handle in-page navigation (like hash changes)
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
   * Setup refresh prevention mechanism - EXACT COPY from main
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
    try {
      if (!mainWindow.isDestroyed()) {
        this.ipcManager.unregisterRenderer(mainWindow.webContents.id);
      }
    } catch (error) {
      // Window/webContents already destroyed, ignore the error
    }
    this.ipcManager.unregisterAllRenderers();
  }
}