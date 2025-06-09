import { BrowserWindow, app } from 'electron';
import { join } from 'path';
import { IPCManager } from './ipc/ipcManager';
import { getRendererPath } from './envUtils';

const RAUX_URL = 'http://localhost:8080';
const LOADING_PAGE = getRendererPath('pages', 'loading', 'loading.html');
const PRELOAD_SCRIPT = getRendererPath('main_window', 'preload.js');

export class WindowManager {
  private static instance: WindowManager;
  private mainWindow: BrowserWindow | null = null;
  private ipcManager = IPCManager.getInstance();
  private baseTitle = 'RAUX';

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
        nodeIntegration: false,
      },
      show: true,
    });

    this.mainWindow.setMenuBarVisibility(false);
    
    this.mainWindow.loadFile(LOADING_PAGE);
    
    this.ipcManager.registerRenderer(this.mainWindow.webContents.id, this.mainWindow.webContents);
    
    this.mainWindow.on('close', () => this.destroyIcps());
    this.mainWindow.on('closed', () => this.destroyIcps());
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
   * Inject the Lemonade status indicator into the page
   */
  private injectLemonadeStatusIndicator(): void {
    // Temporarily disabled - status monitoring logic remains active
    return;
    
    if (!this.mainWindow) return;

    const css = `
      #lemonade-status-indicator {
        position: fixed;
        bottom: 15px;
        right: 15px;
        z-index: 10000;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-family: system-ui, sans-serif;
        pointer-events: none;
        user-select: none;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      #lemonade-status-indicator:hover {
        opacity: 0.9;
      }
    `;

    const html = `
      <div id="lemonade-status-indicator">
        <span id="lemonade-status-icon">⚫</span>
        <span id="lemonade-status-text">Unknown</span>
      </div>
    `;

    this.mainWindow.webContents.insertCSS(css);
    this.mainWindow.webContents.executeJavaScript(`
      if (!document.getElementById('lemonade-status-indicator')) {
        document.body.insertAdjacentHTML('beforeend', \`${html}\`);
      }
    `);
  }
}