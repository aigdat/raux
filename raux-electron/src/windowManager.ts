import { BrowserWindow, app } from 'electron';
import { join } from 'path';
import { IPCManager } from './ipc/ipcManager';
import { getRendererPath, isInstallationComplete } from './envUtils';
import { LemonadeStatus } from './ipc/ipcTypes';
import { logInfo, logError } from './logger';
import { lemonadeStatusIndicator } from './lemonade/statusIndicator';
import { WindowsStrategyFactory } from './windowsStrategy/WindowsStrategyFactory';
import { WindowsStrategy } from './windowsStrategy/WindowsStrategy';

// Webpack-generated constants for entry points
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

const RAUX_URL = 'http://localhost:8080';
// Use webpack constants when available (in production), fallback to getRendererPath for dev
const LOADING_PAGE = typeof MAIN_WINDOW_WEBPACK_ENTRY !== 'undefined' 
	? MAIN_WINDOW_WEBPACK_ENTRY 
	: getRendererPath('pages', 'loading', 'loading.html');
const PRELOAD_SCRIPT = typeof MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY !== 'undefined'
	? MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY
	: getRendererPath('main_window', 'preload.js');

export class WindowManager {
	private static instance: WindowManager;
	private mainWindow: BrowserWindow | null = null;
	private ipcManager = IPCManager.getInstance();
	private windowsStrategy: WindowsStrategy;

	private constructor() {
		this.windowsStrategy = WindowsStrategyFactory.create();
	}

	public static getInstance(): WindowManager {
		if (!WindowManager.instance) {
			WindowManager.instance = new WindowManager();
		}
		return WindowManager.instance;
	}

	public createMainWindow(): void {
		// Get platform-specific window options from strategy
		const windowOptions = this.windowsStrategy.getWindowOptions();
		this.mainWindow = new BrowserWindow(windowOptions);

		// LOADING_PAGE is either a URL (from webpack) or a file path
		if (LOADING_PAGE.startsWith('http://') || LOADING_PAGE.startsWith('file://')) {
			this.mainWindow.loadURL(LOADING_PAGE);
		} else {
			this.mainWindow.loadFile(LOADING_PAGE);
		}

		// Delegate window creation setup to strategy
		this.windowsStrategy.handleWindowCreation(this.mainWindow);

		// Delegate navigation handlers setup to strategy
		this.windowsStrategy.setupNavigationHandlers(this.mainWindow);
	}

	// Navigation handlers are now handled by the platform-specific strategy

	// Refresh prevention is now handled by the platform-specific strategy

	public showLoadingPage(): void {
		if (this.mainWindow) {
			// LOADING_PAGE is either a URL (from webpack) or a file path
			if (LOADING_PAGE.startsWith('http://') || LOADING_PAGE.startsWith('file://')) {
				this.mainWindow.loadURL(LOADING_PAGE);
			} else {
				this.mainWindow.loadFile(LOADING_PAGE);
			}
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

	public getWindowsStrategy(): WindowsStrategy {
		return this.windowsStrategy;
	}

	public destroyIcps() {
		// ICP cleanup is now handled by the platform-specific strategy when window events occur
		this.mainWindow = null;
	}

	/**
	 * Update Lemonade status visual indicator only (no title bar updates)
	 */
	public updateLemonadeStatus(status: LemonadeStatus): void {
		if (this.mainWindow && !this.mainWindow.isDestroyed()) {
			lemonadeStatusIndicator.updateLemonadeStatus(status, this.mainWindow);
		}
	}
}
