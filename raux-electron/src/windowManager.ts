import { BrowserWindow, app } from 'electron';
import { join } from 'path';
import { IPCManager } from './ipc/ipcManager';
import { getRendererPath } from './envUtils';
import { LemonadeStatus } from './ipc/ipcTypes';
import { logInfo, logError } from './logger';
import { lemonadeStatusIndicator } from './lemonade/statusIndicator';

const RAUX_URL = 'http://localhost:8080';
const LOADING_PAGE = getRendererPath('pages', 'loading', 'loading.html');
const PRELOAD_SCRIPT = getRendererPath('main_window', 'preload.js');

export class WindowManager {
	private static instance: WindowManager;
	private mainWindow: BrowserWindow | null = null;
	private ipcManager = IPCManager.getInstance();

	private constructor() {}

	public static getInstance(): WindowManager {
		if (!WindowManager.instance) {
			WindowManager.instance = new WindowManager();
		}
		return WindowManager.instance;
	}

	public createMainWindow(): void {
		this.mainWindow = new BrowserWindow({
			height: 1024,
			width: 1280,
			webPreferences: {
				preload: PRELOAD_SCRIPT,
				contextIsolation: true,
				nodeIntegration: false
			},
			show: true
		});

		this.mainWindow.setMenuBarVisibility(false);
		this.mainWindow.setTitle('AMD GAIA (OpenWebUI)');

		this.mainWindow.loadFile(LOADING_PAGE);

		this.ipcManager.registerRenderer(this.mainWindow.webContents.id, this.mainWindow.webContents);

		this.mainWindow.on('close', () => this.destroyIcps());
		this.mainWindow.on('closed', () => this.destroyIcps());

		// Add event listeners to handle page refreshes and navigation
		this.setupPageNavigationHandlers();
	}

	/**
	 * Setup event handlers for page navigation and refresh
	 */
	private setupPageNavigationHandlers(): void {
		if (!this.mainWindow) return;

		// Handle page refresh - reinject indicator when page reloads
		this.mainWindow.webContents.on('did-start-navigation', (event, url) => {
			logInfo(`[WindowManager] Page navigation started to: ${url}`);
		});

		this.mainWindow.webContents.on('did-finish-load', () => {
			const currentURL = this.mainWindow?.webContents.getURL();
			logInfo(`[WindowManager] Page finished loading: ${currentURL}`);

			// Only inject indicator if we're not on the loading page
			if (currentURL && !currentURL.includes('loading.html')) {
				logInfo('[WindowManager] Non-loading page loaded - ensuring status indicator presence');
				this.setupRefreshPrevention();

				// Add a small delay to ensure DOM is fully ready
				setTimeout(() => {
					logInfo('[WindowManager] Starting indicator injection after DOM ready delay');
					lemonadeStatusIndicator.ensureIndicatorPresent(this.mainWindow);
				}, 500);
			} else {
				logInfo('[WindowManager] Loading page detected, skipping indicator injection');
			}
		});

		// Handle navigation within the app
		this.mainWindow.webContents.on('did-navigate', (event, url) => {
			logInfo(`[WindowManager] Page navigated to: ${url}`);
			// Check and reinject indicator after navigation
			setTimeout(() => {
				lemonadeStatusIndicator.ensureIndicatorPresent(this.mainWindow);
			}, 100);
		});

		// Handle in-page navigation (like hash changes)
		this.mainWindow.webContents.on('did-navigate-in-page', (event, url) => {
			logInfo(`[WindowManager] In-page navigation to: ${url}`);
			// Check if indicator still exists, if not reinject
			setTimeout(() => {
				lemonadeStatusIndicator.ensureIndicatorPresent(this.mainWindow);
			}, 100);
		});
	}

	/**
	 * Setup refresh prevention mechanism
	 */
	private setupRefreshPrevention(): void {
		if (!this.mainWindow) return;

		this.mainWindow.webContents.executeJavaScript(`
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

	public showLoadingPage(): void {
		if (this.mainWindow) {
			this.mainWindow.loadFile(LOADING_PAGE);
		}
	}

	public showErrorPage(message: string): void {
		if (this.mainWindow) {
			this.mainWindow.loadURL(`data:text/html,<h1>${message}</h1>`);
		}
	}

	public showMainApp(): void {
		if (this.mainWindow) {
			this.mainWindow.loadURL(RAUX_URL);
			// Note: The injection is now handled by the did-finish-load event in setupPageNavigationHandlers
		}
	}

	public getMainWindow(): BrowserWindow | null {
		return this.mainWindow;
	}

	public destroyIcps() {
		this.ipcManager.unregisterRenderer(this.mainWindow?.webContents.id);
		this.ipcManager.unregisterAllRenderers();
		this.mainWindow = null;
	}

	/**
	 * Update Lemonade status visual indicator only (no title bar updates)
	 */
	public updateLemonadeStatus(status: LemonadeStatus): void {
		lemonadeStatusIndicator.updateLemonadeStatus(status, this.mainWindow);
	}
}
