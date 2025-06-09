import { EventEmitter } from 'events';
import { lemonadeClient } from './clients/lemonadeClient';
import { LemonadeStatus, LemonadeHealthCheck } from './ipc/ipcTypes';
import { logInfo, logError } from './logger';

export class LemonadeStatusMonitor extends EventEmitter {
  private static instance: LemonadeStatusMonitor;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private currentStatus: LemonadeStatus;
  private isMonitoring: boolean = false;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly STARTUP_HEALTH_CHECK_INTERVAL = 5000; // 5 seconds during startup

  private constructor() {
    super();
    this.currentStatus = {
      status: 'unavailable',
      isHealthy: false,
      timestamp: Date.now(),
    };
  }

  public static getInstance(): LemonadeStatusMonitor {
    if (!LemonadeStatusMonitor.instance) {
      LemonadeStatusMonitor.instance = new LemonadeStatusMonitor();
    }
    return LemonadeStatusMonitor.instance;
  }

  /**
   * Start monitoring Lemonade status
   */
  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      logInfo('[LemonadeStatusMonitor] Already monitoring');
      return;
    }

    logInfo('[LemonadeStatusMonitor] Starting status monitoring...');
    this.isMonitoring = true;

    // Initial status check
    await this.updateStatus();

    // Set up periodic health checks
    this.scheduleHealthCheck();
  }

  /**
   * Stop monitoring Lemonade status
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    logInfo('[LemonadeStatusMonitor] Stopping status monitoring...');
    this.isMonitoring = false;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get current status
   */
  public getCurrentStatus(): LemonadeStatus {
    return { ...this.currentStatus };
  }

  /**
   * Force a status update
   */
  public async forceUpdate(): Promise<void> {
    await this.updateStatus();
  }

  /**
   * Schedule the next health check based on current status
   */
  private scheduleHealthCheck(): void {
    if (!this.isMonitoring) {
      return;
    }

    // Clear existing interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Use shorter interval during startup to catch when server becomes ready
    const interval = this.currentStatus.status === 'starting' 
      ? this.STARTUP_HEALTH_CHECK_INTERVAL 
      : this.HEALTH_CHECK_INTERVAL;

    this.healthCheckInterval = setInterval(async () => {
      await this.updateStatus();
    }, interval);
  }

  /**
   * Update status by checking availability and health
   */
  private async updateStatus(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    try {
      const newStatus = await this.determineStatus();
      
      // Check if status changed
      if (this.hasStatusChanged(newStatus)) {
        const previousStatus = this.currentStatus.status;
        this.currentStatus = newStatus;
        
        logInfo(`[LemonadeStatusMonitor] Status changed: ${previousStatus} -> ${newStatus.status}`);
        
        // Emit status change event
        this.emit('statusChange', newStatus);
        
        // Reschedule health check if needed (e.g., startup interval changes)
        if (previousStatus !== newStatus.status) {
          this.scheduleHealthCheck();
        }
      }
    } catch (error) {
      logError(`[LemonadeStatusMonitor] Error updating status: ${error}`);
    }
  }

  /**
   * Determine current Lemonade status
   */
  private async determineStatus(): Promise<LemonadeStatus> {
    const timestamp = Date.now();

    // First, check if Lemonade CLI is available
    const isAvailable = await lemonadeClient.isLemonadeAvailable();
    
    if (!isAvailable) {
      return {
        status: 'unavailable',
        isHealthy: false,
        timestamp,
        error: 'Lemonade CLI not found or not executable',
      };
    }

    // Get current process status from our client
    const processStatus = lemonadeClient.getServerStatus();
    
    // Try CLI status command first
    let cliStatus: string | null = null;
    try {
      const statusResult = await lemonadeClient.executeCommand(['status'], { timeout: 5000 });
      if (statusResult.success && statusResult.stdout) {
        cliStatus = statusResult.stdout.trim().toLowerCase();
        logInfo(`[LemonadeStatusMonitor] CLI status: ${cliStatus}`);
      }
    } catch (error) {
      logInfo(`[LemonadeStatusMonitor] CLI status command failed: ${error}`);
    }
    
    // Perform health check
    const healthCheck: LemonadeHealthCheck = await lemonadeClient.checkHealth(3000);
    
    // Determine overall status based on CLI status, process status, and health check
    let status: LemonadeStatus['status'];
    let error: string | undefined;

    if (healthCheck.isHealthy) {
      // Health check passed - server is definitely running
      status = 'running';
    } else if (cliStatus && cliStatus.includes('running')) {
      // CLI says running but health check failed - might be starting up
      status = 'starting';
      error = 'Server starting up or health endpoint not ready';
    } else if (cliStatus && (cliStatus.includes('stopped') || cliStatus.includes('not running'))) {
      // CLI confirms server is stopped
      status = 'stopped';
      error = 'Server confirmed stopped via CLI';
    } else if (processStatus === 'starting') {
      // Our process manager thinks it's starting
      status = 'starting';
      error = 'Server starting up';
    } else if (processStatus === 'crashed') {
      // Our process manager detected a crash
      status = 'crashed';
      error = healthCheck.error || 'Server process crashed';
    } else if (processStatus === 'stopped') {
      // Our process manager says it's stopped
      status = 'stopped';
      error = healthCheck.error || 'Server not running';
    } else {
      // Unclear state - health failed and no clear CLI status
      status = 'stopped';
      error = healthCheck.error || 'Server not responding and status unclear';
    }

    // Get version info if available (only for logging, not critical)
    let version: string | undefined;
    try {
      const versionResult = await lemonadeClient.getVersion({ timeout: 2000 });
      if (versionResult.success && versionResult.version) {
        version = versionResult.version.full;
      }
    } catch {
      // Version check failed, but that's not critical for status
    }

    // Get port configuration
    const config = lemonadeClient.getLemonadeServerConfig();
    
    return {
      status,
      isHealthy: healthCheck.isHealthy,
      timestamp,
      error,
      version,
      port: config.port,
    };
  }

  /**
   * Check if status has meaningfully changed
   */
  private hasStatusChanged(newStatus: LemonadeStatus): boolean {
    return (
      this.currentStatus.status !== newStatus.status ||
      this.currentStatus.isHealthy !== newStatus.isHealthy ||
      this.currentStatus.error !== newStatus.error ||
      this.currentStatus.version !== newStatus.version
    );
  }
}

export const lemonadeStatusMonitor = LemonadeStatusMonitor.getInstance();