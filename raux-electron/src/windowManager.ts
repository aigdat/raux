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
  private currentLemonadeStatus: LemonadeStatus | null = null;

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
      // Inject status indicator after loading main app
      this.mainWindow.webContents.once('did-finish-load', () => {
        this.injectLemonadeStatusIndicator();
        this.injectStatusUpdateListener();
        // Update with current status if available
        if (this.currentLemonadeStatus) {
          this.updateStatusIndicator(this.currentLemonadeStatus);
        }
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
   * Update Lemonade status in the window title and visual indicator
   */
  public updateLemonadeStatus(status: LemonadeStatus): void {
    this.currentLemonadeStatus = status;
    
    if (!this.mainWindow) return;

    // Update window title
    this.updateWindowTitle(status);
    
    // Update visual indicator if it's injected
    this.updateStatusIndicator(status);
  }

  /**
   * Update the window title with Lemonade status
   */
  private updateWindowTitle(status: LemonadeStatus): void {
    if (!this.mainWindow) return;

    let statusText: string;
    switch (status.status) {
      case 'running':
        statusText = status.isHealthy ? 'Running' : 'Running (Issues)';
        break;
      case 'starting':
        statusText = 'Starting';
        break;
      case 'stopped':
        statusText = 'Stopped';
        break;
      case 'crashed':
        statusText = 'Crashed';
        break;
      case 'unavailable':
        statusText = 'Unavailable';
        break;
      default:
        statusText = 'Unknown';
    }

    const title = `${this.baseTitle} - Lemonade: ${statusText}`;
    this.mainWindow.setTitle(title);
  }

  /**
   * Inject the Lemonade status indicator into the page
   */
  private injectLemonadeStatusIndicator(): void {
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
        transition: opacity 0.3s ease;
      }
      
      #lemonade-status-indicator:hover {
        opacity: 0.9;
      }

      .lemonade-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        transition: all 0.3s ease;
      }

      .lemonade-status-dot.green {
        background-color: #4CAF50;
        box-shadow: 0 0 8px rgba(76, 175, 80, 0.6);
      }

      .lemonade-status-dot.red {
        background-color: #F44336;
        box-shadow: 0 0 8px rgba(244, 67, 54, 0.6);
      }

      .lemonade-status-dot.yellow {
        background-color: #FFC107;
        box-shadow: 0 0 8px rgba(255, 193, 7, 0.6);
      }

      .lemonade-status-dot.gray {
        background-color: #666;
        box-shadow: 0 0 8px rgba(102, 102, 102, 0.6);
      }
    `;

    const html = `
      <div id="lemonade-status-indicator" title="Lemonade Server Status">
        <span class="lemonade-status-dot gray" id="lemonade-status-dot"></span>
        <span id="lemonade-status-text">Checking...</span>
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
   * Update the visual status indicator
   */
  private updateStatusIndicator(status: LemonadeStatus): void {
    if (!this.mainWindow) return;

    const { color, text, tooltip } = this.getStatusDisplay(status);

    this.mainWindow.webContents.executeJavaScript(`
      const indicator = document.getElementById('lemonade-status-indicator');
      const dot = document.getElementById('lemonade-status-dot');
      const textElement = document.getElementById('lemonade-status-text');
      
      if (indicator && dot && textElement) {
        // Update dot color
        dot.className = 'lemonade-status-dot ${color}';
        
        // Update text
        textElement.textContent = '${text}';
        
        // Update tooltip
        indicator.title = '${tooltip}';
      }
    `);
  }

  /**
   * Get display properties for status
   */
  private getStatusDisplay(status: LemonadeStatus): { color: string; text: string; tooltip: string } {
    const timestamp = new Date(status.timestamp).toLocaleTimeString();
    
    switch (status.status) {
      case 'running':
        return {
          color: status.isHealthy ? 'green' : 'yellow',
          text: status.isHealthy ? 'Running' : 'Issues',
          tooltip: `Lemonade Server: ${status.isHealthy ? 'Running normally' : 'Running with issues'}${status.version ? ` (v${status.version})` : ''}${status.port ? ` on port ${status.port}` : ''}\nLast checked: ${timestamp}${status.error ? `\nError: ${status.error}` : ''}`
        };
      
      case 'starting':
        return {
          color: 'yellow',
          text: 'Starting',
          tooltip: `Lemonade Server: Starting up\nLast checked: ${timestamp}`
        };
      
      case 'stopped':
        return {
          color: 'red',
          text: 'Stopped',
          tooltip: `Lemonade Server: Stopped\nLast checked: ${timestamp}${status.error ? `\nReason: ${status.error}` : ''}`
        };
      
      case 'crashed':
        return {
          color: 'red',
          text: 'Crashed',
          tooltip: `Lemonade Server: Crashed\nLast checked: ${timestamp}${status.error ? `\nError: ${status.error}` : ''}`
        };
      
      case 'unavailable':
        return {
          color: 'gray',
          text: 'Unavailable',
          tooltip: `Lemonade Server: Not available\nLast checked: ${timestamp}${status.error ? `\nReason: ${status.error}` : ''}`
        };
      
      default:
        return {
          color: 'gray',
          text: 'Unknown',
          tooltip: `Lemonade Server: Unknown status\nLast checked: ${timestamp}`
        };
    }
  }

  /**
   * Inject IPC listener for real-time status updates in the main app
   */
  private injectStatusUpdateListener(): void {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.executeJavaScript(`
      // Set up listener for Lemonade status updates if not already set
      if (!window.lemonadeStatusListenerSet) {
        window.lemonadeStatusListenerSet = true;
        
        if (window.ipc && window.ipc.on) {
          window.ipc.on('lemonade:status', (status) => {
            if (status) {
              // Update the visual indicator
              const indicator = document.getElementById('lemonade-status-indicator');
              const dot = document.getElementById('lemonade-status-dot');
              const textElement = document.getElementById('lemonade-status-text');
              
              if (indicator && dot && textElement) {
                // Determine display properties
                let color, text, tooltip;
                const timestamp = new Date(status.timestamp).toLocaleTimeString();
                
                switch (status.status) {
                  case 'running':
                    color = status.isHealthy ? 'green' : 'yellow';
                    text = status.isHealthy ? 'Running' : 'Issues';
                    tooltip = \`Lemonade Server: \${status.isHealthy ? 'Running normally' : 'Running with issues'}\${status.version ? \` (v\${status.version})\` : ''}\${status.port ? \` on port \${status.port}\` : ''}\\nLast checked: \${timestamp}\${status.error ? \`\\nError: \${status.error}\` : ''}\`;
                    break;
                  case 'starting':
                    color = 'yellow';
                    text = 'Starting';
                    tooltip = \`Lemonade Server: Starting up\\nLast checked: \${timestamp}\`;
                    break;
                  case 'stopped':
                    color = 'red';
                    text = 'Stopped';
                    tooltip = \`Lemonade Server: Stopped\\nLast checked: \${timestamp}\${status.error ? \`\\nReason: \${status.error}\` : ''}\`;
                    break;
                  case 'crashed':
                    color = 'red';
                    text = 'Crashed';
                    tooltip = \`Lemonade Server: Crashed\\nLast checked: \${timestamp}\${status.error ? \`\\nError: \${status.error}\` : ''}\`;
                    break;
                  case 'unavailable':
                    color = 'gray';
                    text = 'Unavailable';
                    tooltip = \`Lemonade Server: Not available\\nLast checked: \${timestamp}\${status.error ? \`\\nReason: \${status.error}\` : ''}\`;
                    break;
                  default:
                    color = 'gray';
                    text = 'Unknown';
                    tooltip = \`Lemonade Server: Unknown status\\nLast checked: \${timestamp}\`;
                }
                
                // Update the indicator
                dot.className = 'lemonade-status-dot ' + color;
                textElement.textContent = text;
                indicator.title = tooltip;
              }
            }
          });
        }
      }
    `);
  }
}