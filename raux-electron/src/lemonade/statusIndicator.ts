import { BrowserWindow } from 'electron';
import { LemonadeStatus } from '../ipc/ipcTypes';
import { logInfo, logError } from '../logger';

export class LemonadeStatusIndicator {
	private static instance: LemonadeStatusIndicator;
	private currentLemonadeStatus: LemonadeStatus | null = null;

	private constructor() {}

	public static getInstance(): LemonadeStatusIndicator {
		if (!LemonadeStatusIndicator.instance) {
			LemonadeStatusIndicator.instance = new LemonadeStatusIndicator();
		}
		return LemonadeStatusIndicator.instance;
	}

	/**
	 * Update Lemonade status visual indicator only (no title bar updates)
	 */
	public updateLemonadeStatus(status: LemonadeStatus, mainWindow: BrowserWindow | null): void {
		this.currentLemonadeStatus = status;

		if (!mainWindow) return;

		// Update visual indicator if it's injected
		this.updateStatusIndicator(status, mainWindow);
	}

	/**
	 * Ensure indicator is present and in the correct location
	 */
	public ensureIndicatorPresent(mainWindow: BrowserWindow | null): void {
		if (!mainWindow) return;

		logInfo('[LemonadeStatusIndicator] ensureIndicatorPresent() called - checking DOM elements');

		mainWindow.webContents
			.executeJavaScript(
				`
      (function() {
        const indicator = document.getElementById('lemonade-status-indicator');
        const navElement = document.querySelector('nav');
        const controlsElement = navElement ? navElement.querySelector('[aria-label="Controls"]') : null;
        
        // Debug: Get details about the nav element and its aria-label children
        const navInfo = navElement ? {
          tagName: navElement.tagName,
          className: navElement.className,
          id: navElement.id,
          childrenCount: navElement.children.length,
          ariaLabelsInNav: Array.from(navElement.querySelectorAll('[aria-label]')).map(el => ({
            tagName: el.tagName,
            ariaLabel: el.getAttribute('aria-label'),
            className: el.className,
            id: el.id
          }))
        } : null;
        
        return {
          indicatorExists: !!indicator,
          navExists: !!navElement,
          controlsExists: !!controlsElement,
          indicatorInCorrectLocation: indicator && controlsElement && controlsElement.parentElement && controlsElement.parentElement.contains(indicator) && controlsElement.previousElementSibling === indicator,
          debug: {
            navInfo: navInfo,
            documentReady: document.readyState,
            bodyExists: !!document.body,
            ariaLabelsInNavCount: navInfo ? navInfo.ariaLabelsInNav.length : 0
          }
        };
      })();
    `
			)
			.then((result: any) => {
				logInfo(`[LemonadeStatusIndicator] DOM Check Results: ${JSON.stringify(result, null, 2)}`);

				if (!result.indicatorExists || !result.indicatorInCorrectLocation) {
					if (result.navExists && result.controlsExists) {
						logInfo(
							'[LemonadeStatusIndicator] Status indicator missing or in wrong location - ensuring presence'
						);
						// Remove existing indicator if it exists but is in wrong location
						if (result.indicatorExists && !result.indicatorInCorrectLocation) {
							mainWindow.webContents.executeJavaScript(`
              const oldIndicator = document.getElementById('lemonade-status-indicator');
              if (oldIndicator) oldIndicator.remove();
            `);
						}
						this.injectLemonadeStatusIndicator(mainWindow);
						this.injectStatusUpdateListener(mainWindow);
						if (this.currentLemonadeStatus) {
							this.updateStatusIndicator(this.currentLemonadeStatus, mainWindow);
						}
					} else {
						logError(
							`[LemonadeStatusIndicator] Required elements not found - Nav: ${result.navExists}, Controls: ${result.controlsExists}`
						);
						if (result.debug.navInfo) {
							logInfo(
								`[LemonadeStatusIndicator] Nav found but missing controls. Nav has ${result.debug.ariaLabelsInNavCount} aria-labels: ${JSON.stringify(result.debug.navInfo.ariaLabelsInNav)}`
							);
						} else {
							logInfo(`[LemonadeStatusIndicator] No nav element found in DOM`);
						}

						// Try again after a longer delay
						setTimeout(() => {
							logInfo(
								'[LemonadeStatusIndicator] Retrying ensureIndicatorPresent after 2 seconds...'
							);
							this.ensureIndicatorPresent(mainWindow);
						}, 2000);
					}
				} else {
					logInfo('[LemonadeStatusIndicator] Indicator already exists and is in correct location');
				}
			})
			.catch((error) => {
				logError(`[LemonadeStatusIndicator] Error ensuring indicator presence: ${error}`);
			});
	}

	/**
	 * Inject the Lemonade status indicator into the page
	 */
	private injectLemonadeStatusIndicator(mainWindow: BrowserWindow): void {
		// Lemon SVG encoded as data URI - we'll use different colors for different states
		const lemonSvgTemplate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" style="width: 20px; height: 20px;"><path fill="#5C913B" d="M11.405 3.339c6.48-1.275 8.453 1.265 11.655.084 3.202-1.181.093 2.82-.745 3.508-.84.688-8.141 4.809-11.307 3.298-3.166-1.511-3.182-6.186.397-6.89z"/><path fill="#77B255" d="M15.001 16c-.304 0-.605-.138-.801-.4-.687-.916-1.308-1.955-1.965-3.056C9.967 8.749 7.396 4.446.783 2.976c-.539-.12-.879-.654-.654-1.193.12-.54.654-.878 1.193-.759C8.671 2.68 11.599 7.581 13.952 11.519c.63 1.054 1.224 2.049 1.848 2.881.332.442.242 1.069-.2 1.4-.18.135-.39.2-.599.2z"/><path fill="LEMON_COLOR" d="M34.3 31.534c.002-.017-.003-.028-.003-.043 2.774-5.335 2.647-15.113-3.346-21.107-5.801-5.8-13.68-5.821-18.767-4.067-1.579.614-2.917.066-3.815.965-.881.881-.351 2.719-.714 3.819-3.169 5.202-3.405 13.025 2.688 19.117 4.962 4.962 10.438 6.842 19.98 4.853.002-.002.005-.001.008-.002 1.148-.218 2.95.523 3.566-.094 1.085-1.085.309-2.358.403-3.441z"/><path fill="#77B255" d="M8.208 6.583s-4.27-.59-6.857 4.599c-2.587 5.188.582 9.125.29 12.653-.293 3.53 1.566 1.265 2.621-.445s4.23-4.895 4.938-9.269c.707-4.376-.07-6.458-.992-7.538z"/></svg>`;

		const css = `
      #lemonade-status-indicator {
        display: inline-flex;
        align-items: center;
        color: white;
        padding: 4px 8px;
        font-size: 11px;
        font-family: system-ui, sans-serif;
        user-select: none;
        z-index: 1000;
      }
      
      #lemonade-status-indicator:hover {
        background: var(--color-gray-850, #262626);
        transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, -webkit-text-decoration-color;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;
      }

      .lemonade-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        flex-shrink: 0;
      }

      .lemonade-icon.running {
        filter: hue-rotate(0deg) saturate(1) brightness(1);
      }

      .lemonade-icon.stopped {
        filter: grayscale(1) brightness(0.7);
      }

      .lemonade-icon.starting {
        filter: hue-rotate(45deg) saturate(1.2) brightness(1.1);
        animation: pulse 1.5s ease-in-out infinite;
      }

      .lemonade-icon.error {
        filter: hue-rotate(0deg) saturate(1.5) brightness(0.8);
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    `;

		const html = `
      <div id="lemonade-status-indicator" title="Lemonade Server Status">
        <div class="lemonade-icon stopped" id="lemonade-icon">${lemonSvgTemplate.replace('LEMON_COLOR', '#FFCC4D')}</div>
      </div>
    `;

		// Inject CSS
		mainWindow.webContents.insertCSS(css);

		// Inject HTML with retry mechanism targeting the chat context menu button's parent
		this.injectIndicatorWithRetry(html, 0, mainWindow);
	}

	/**
	 * Inject indicator with retry mechanism to handle timing issues
	 */
	private injectIndicatorWithRetry(html: string, attempt: number, mainWindow: BrowserWindow): void {
		if (attempt >= 10) {
			logError(
				'[LemonadeStatusIndicator] Failed to inject Lemonade status indicator after 10 attempts'
			);
			return;
		}

		mainWindow.webContents
			.executeJavaScript(
				`
      (function() {
        // Check if indicator already exists
        if (document.getElementById('lemonade-status-indicator')) {
          return { success: true, reason: 'already_exists' };
        }
        
        // Check if document body is ready
        if (!document.body) {
          return { success: false, reason: 'body_not_ready' };
        }
        
        // Find the nav element
        const navElement = document.querySelector('nav');
        if (!navElement) {
          return { success: false, reason: 'nav_element_not_found' };
        }
        
        // Find child element with aria-label="Controls" within the nav
        const controlsElement = navElement.querySelector('[aria-label="Controls"]');
        if (!controlsElement) {
          return { success: false, reason: 'controls_element_not_found' };
        }
        
        // Inject the indicator before the controls element
        try {
          controlsElement.insertAdjacentHTML('beforebegin', \`${html}\`);
          const indicator = document.getElementById('lemonade-status-indicator');
          return { 
            success: !!indicator, 
            reason: indicator ? 'injected_before_controls' : 'injection_failed',
            navTag: navElement.tagName,
            navClass: navElement.className,
            controlsTag: controlsElement.tagName,
            controlsClass: controlsElement.className
          };
        } catch (error) {
          return { success: false, reason: 'injection_error', error: error.message };
        }
      })();
    `
			)
			.then((result: any) => {
				if (result.success) {
					logInfo(
						`[LemonadeStatusIndicator] Lemonade status indicator ${result.reason === 'already_exists' ? 'already exists' : 'injected successfully before controls element in ' + (result.navTag || 'unknown') + ' nav'}`
					);
				} else {
					logInfo(
						`[LemonadeStatusIndicator] Injection attempt ${attempt + 1} failed: ${result.reason}`
					);
					// Retry after a delay, with longer delays for later attempts
					const delay = Math.min(500 + attempt * 200, 2000);
					setTimeout(() => {
						this.injectIndicatorWithRetry(html, attempt + 1, mainWindow);
					}, delay);
				}
			})
			.catch((error) => {
				logError(
					`[LemonadeStatusIndicator] Error during injection attempt ${attempt + 1}: ${error}`
				);
				// Retry after a delay
				setTimeout(() => {
					this.injectIndicatorWithRetry(html, attempt + 1, mainWindow);
				}, 500);
			});
	}

	/**
	 * Update the visual status indicator
	 */
	private updateStatusIndicator(status: LemonadeStatus, mainWindow: BrowserWindow): void {
		const { iconClass, tooltip } = this.getStatusDisplay(status);

		mainWindow.webContents
			.executeJavaScript(
				`
      (function() {
        const indicator = document.getElementById('lemonade-status-indicator');
        const icon = document.getElementById('lemonade-icon');
        
        if (indicator && icon) {
          // Update icon class for styling
          icon.className = 'lemonade-icon ${iconClass}';
          
          // Update tooltip
          indicator.title = \`${tooltip.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
          
          return { success: true };
        } else {
          return { 
            success: false, 
            missing: {
              indicator: !indicator,
              icon: !icon
            }
          };
        }
      })();
    `
			)
			.then((result: any) => {
				if (!result.success) {
					logInfo(
						`[LemonadeStatusIndicator] Status indicator update failed - missing elements: ${JSON.stringify(result.missing)}`
					);
					// Try to ensure the indicator is present if it's missing
					if (result.missing.indicator) {
						logInfo(
							'[LemonadeStatusIndicator] Ensuring indicator presence after update failure...'
						);
						this.ensureIndicatorPresent(mainWindow);
					}
				}
			})
			.catch((error) => {
				logError(`[LemonadeStatusIndicator] Error updating status indicator: ${error}`);
			});
	}

	/**
	 * Get display properties for status
	 */
	private getStatusDisplay(status: LemonadeStatus): { iconClass: string; tooltip: string } {
		const version = status.version ? `v${status.version}` : 'Unknown version';
		
		const isRunning = status.status === 'running' && status.isHealthy;
		const statusText = isRunning ? 'Running' : 'Stopped';
		const iconClass = isRunning ? 'running' : 'stopped';

		return {
			iconClass,
			tooltip: `${version} Lemonade is ${statusText}`
		};
	}

	/**
	 * Inject IPC listener for real-time status updates in the main app
	 */
	private injectStatusUpdateListener(mainWindow: BrowserWindow): void {
		mainWindow.webContents.executeJavaScript(`
      // Set up listener for Lemonade status updates if not already set
      if (!window.lemonadeStatusListenerSet) {
        window.lemonadeStatusListenerSet = true;
        
        if (window.ipc && window.ipc.on) {
          window.ipc.on('lemonade:status', (status) => {
            if (status) {
              // Update the visual indicator
              const indicator = document.getElementById('lemonade-status-indicator');
              const icon = document.getElementById('lemonade-icon');
              
              if (indicator && icon) {
                // Determine display properties
                const version = status.version ? \`v\${status.version}\` : 'Unknown version';
                const isRunning = status.status === 'running' && status.isHealthy;
                const statusText = isRunning ? 'Running' : 'Stopped';
                const iconClass = isRunning ? 'running' : 'stopped';
                const tooltip = \`\${version} Lemonade is \${statusText}\`;
                
                // Update the indicator
                icon.className = 'lemonade-icon ' + iconClass;
                indicator.title = tooltip;
              }
            }
          });
        }
      }
    `);
	}
}

export const lemonadeStatusIndicator = LemonadeStatusIndicator.getInstance();
