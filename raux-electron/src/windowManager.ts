import { BrowserWindow, app } from 'electron';
import { join } from 'path';
import { IPCManager } from './ipc/ipcManager';
import { getRendererPath } from './envUtils';
import { LemonadeStatus } from './ipc/ipcTypes';

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
      titleBarOverlay: {
        color: '#18181b',
        symbolColor: '#ffffff',
        height: 30
      },
      titleBarStyle: 'hidden',
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
      
      // Inject Lemonade status indicator after the web app loads
      this.mainWindow.webContents.once('did-finish-load', () => {
        this.injectLemonadeStatusIndicator();
        
        // Get current status and update the indicator
        const { lemonadeStatusMonitor } = require('./lemonadeStatusMonitor');
        const currentStatus = lemonadeStatusMonitor.getCurrentStatus();
        this.updateLemonadeStatus(currentStatus);
      });
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
    if (!this.mainWindow) return;

    const css = `
      #lemonade-status-indicator {
        position: fixed;
        top: 8px;
        right: 120px; /* Position before window controls */
        z-index: 9999;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-family: system-ui, sans-serif;
        pointer-events: none;
        user-select: none;
        -webkit-app-region: no-drag;
        display: flex;
        align-items: center;
        gap: 4px;
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

  /**
   * Update Lemonade status indicator
   */
  public updateLemonadeStatus(status: LemonadeStatus): void {
    if (!this.mainWindow) {
      return;
    }

    const { icon, text, color } = this.formatStatusForIndicator(status);
    
    this.mainWindow.webContents.executeJavaScript(`
      const indicator = document.getElementById('lemonade-status-indicator');
      const iconEl = document.getElementById('lemonade-status-icon');
      const textEl = document.getElementById('lemonade-status-text');
      
      if (indicator && iconEl && textEl) {
        iconEl.textContent = '${icon}';
        textEl.textContent = '${text}';
        indicator.style.background = 'rgba(0, 0, 0, 0.8)';
        indicator.style.border = '1px solid ${color}';
      }
    `);
  }

  /**
   * Clear Lemonade status indicator
   */
  public clearLemonadeStatus(): void {
    if (!this.mainWindow) {
      return;
    }

    this.mainWindow.webContents.executeJavaScript(`
      const indicator = document.getElementById('lemonade-status-indicator');
      if (indicator) {
        indicator.remove();
      }
    `);
  }

  /**
   * Format status for display in indicator
   */
  private formatStatusForIndicator(status: LemonadeStatus): { icon: string; text: string; color: string } {
    const { status: state, isHealthy } = status;
    
    switch (state) {
      case 'running':
        return { 
          icon: '🟢', 
          text: 'Running', 
          color: '#22c55e' 
        };
      case 'starting':
        return { 
          icon: '🟡', 
          text: 'Starting', 
          color: '#f59e0b' 
        };
      case 'stopped':
        return { 
          icon: '🔴', 
          text: 'Stopped', 
          color: '#ef4444' 
        };
      case 'crashed':
        return { 
          icon: '🔴', 
          text: 'Crashed', 
          color: '#ef4444' 
        };
      case 'unavailable':
        return { 
          icon: '⚫', 
          text: 'Unavailable', 
          color: '#6b7280' 
        };
      default:
        return { 
          icon: '❓', 
          text: 'Unknown', 
          color: '#6b7280' 
        };
    }
  }
} 