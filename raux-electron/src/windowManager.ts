import { BrowserWindow, app } from 'electron';
import { join } from 'path';
import { IPCManager } from './ipc/ipcManager';
import { getRendererPath } from './envUtils';
import { LemonadeStatus } from './ipc/ipcTypes';
import { logInfo, logError } from './logger';

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
        background: rgba(0, 0, 0, 0.95);
        transform: translateY(1px);
      }

      .lemonade-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        transition: all 0.3s ease;
        flex-shrink: 0;
      }

      .lemonade-status-dot.green {
        background-color: #22c55e;
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
      }

      .lemonade-status-dot.red {
        background-color: #ef4444;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
      }

      .lemonade-status-dot.yellow {
        background-color: #f59e0b;
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
      }

      .lemonade-status-dot.gray {
        background-color: #6b7280;
        box-shadow: 0 0 6px rgba(107, 114, 128, 0.6);
      }

      #lemonade-status-text {
        font-weight: 500;
        white-space: nowrap;
      }
    `;

    const html = `
      <div id="lemonade-status-indicator" title="Lemonade Server Status">
        <span class="lemonade-status-dot gray" id="lemonade-status-dot"></span>
        <span id="lemonade-status-text">Checking...</span>
      </div>
    `;

    // Inject CSS
    this.mainWindow.webContents.insertCSS(css);
    
    // Inject HTML with retry mechanism
    this.injectIndicatorWithRetry(html, 0);
  }

  /**
   * Inject indicator with retry mechanism to handle timing issues
   */
  private injectIndicatorWithRetry(html: string, attempt: number): void {
    if (!this.mainWindow || attempt >= 5) {
      if (attempt >= 5) {
        logError('[WindowManager] Failed to inject Lemonade status indicator after 5 attempts');
      }
      return;
    }

    this.mainWindow.webContents.executeJavaScript(`
      (function() {
        // Check if indicator already exists
        if (document.getElementById('lemonade-status-indicator')) {
          return { success: true, reason: 'already_exists' };
        }
        
        // Check if document body is ready
        if (!document.body) {
          return { success: false, reason: 'body_not_ready' };
        }
        
        // Inject the indicator
        try {
          document.body.insertAdjacentHTML('beforeend', \`${html}\`);
          const indicator = document.getElementById('lemonade-status-indicator');
          return { 
            success: !!indicator, 
            reason: indicator ? 'injected' : 'injection_failed' 
          };
        } catch (error) {
          return { success: false, reason: 'injection_error', error: error.message };
        }
      })();
    `).then((result: any) => {
      if (result.success) {
        logInfo(`[WindowManager] Lemonade status indicator ${result.reason === 'already_exists' ? 'already exists' : 'injected successfully'}`);
      } else {
        logInfo(`[WindowManager] Injection attempt ${attempt + 1} failed: ${result.reason}`);
        // Retry after a delay
        setTimeout(() => {
          this.injectIndicatorWithRetry(html, attempt + 1);
        }, 500);
      }
    }).catch((error) => {
      logError(`[WindowManager] Error during injection attempt ${attempt + 1}: ${error}`);
      // Retry after a delay
      setTimeout(() => {
        this.injectIndicatorWithRetry(html, attempt + 1);
      }, 500);
    });
  }

  /**
   * Update the visual status indicator
   */
  private updateStatusIndicator(status: LemonadeStatus): void {
    if (!this.mainWindow) return;

    const { color, text, tooltip } = this.getStatusDisplay(status);

    this.mainWindow.webContents.executeJavaScript(`
      (function() {
        const indicator = document.getElementById('lemonade-status-indicator');
        const dot = document.getElementById('lemonade-status-dot');
        const textElement = document.getElementById('lemonade-status-text');
        
        if (indicator && dot && textElement) {
          // Update dot color
          dot.className = 'lemonade-status-dot ${color}';
          
          // Update text
          textElement.textContent = '${text}';
          
          // Update tooltip
          indicator.title = \`${tooltip.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
          
          return { success: true };
        } else {
          return { 
            success: false, 
            missing: {
              indicator: !indicator,
              dot: !dot,
              text: !textElement
            }
          };
        }
      })();
    `).then((result: any) => {
      if (!result.success) {
        logInfo(`[WindowManager] Status indicator update failed - missing elements: ${JSON.stringify(result.missing)}`);
        // Try to re-inject the indicator if it's missing
        if (result.missing.indicator) {
          logInfo('[WindowManager] Re-injecting status indicator...');
          this.injectLemonadeStatusIndicator();
        }
      }
    }).catch((error) => {
      logError(`[WindowManager] Error updating status indicator: ${error}`);
    });
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