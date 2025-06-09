import { EventEmitter } from 'events';
import { lemonadeClient } from './clients/lemonadeClient';
import { LemonadeStatus, LemonadeHealthCheck } from './ipc/ipcTypes';
import { logInfo, logError } from './logger';

export class LemonadeStatusMonitor extends EventEmitter {
  private static instance: LemonadeStatusMonitor;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private currentStatus: LemonadeStatus;
  private isMonitoring: boolean = false;
  private readonly HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
  private readonly STARTUP_HEALTH_CHECK_INTERVAL = 3000; // 3 seconds during startup

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

    // Perform health check first - this is the primary indicator of server status
    const healthCheck: LemonadeHealthCheck = await lemonadeClient.checkHealth();
    
    if (healthCheck.isHealthy) {
      // Server is responding to health checks - it's running
      return {
        status: 'running',
        isHealthy: true,
        timestamp,
        port: lemonadeClient.getLemonadeServerConfig().port,
      };
    }

    // Health check failed - determine why
    const processStatus = lemonadeClient.getServerStatus();
    
    // Check if we have a managed process
    if (lemonadeClient.isServerManaged()) {
      // We're managing the process, so trust the process status
      if (processStatus === 'starting') {
        return {
          status: 'starting',
          isHealthy: false,
          timestamp,
          error: 'Server starting up',
          port: lemonadeClient.getLemonadeServerConfig().port,
        };
      } else if (processStatus === 'crashed') {
        return {
          status: 'crashed',
          isHealthy: false,
          timestamp,
          error: healthCheck.error || 'Server process crashed',
          port: lemonadeClient.getLemonadeServerConfig().port,
        };
      } else if (processStatus === 'stopped') {
        return {
          status: 'stopped',
          isHealthy: false,
          timestamp,
          error: 'Server not running',
          port: lemonadeClient.getLemonadeServerConfig().port,
        };
      }
    }

    // No managed process, but health check failed
    // Check if Lemonade CLI is even available
    const isAvailable = await lemonadeClient.isLemonadeAvailable();
    
    if (!isAvailable) {
      return {
        status: 'unavailable',
        isHealthy: false,
        timestamp,
        error: 'Lemonade CLI not found or not executable',
      };
    }

    // CLI is available but server not responding - assume stopped
    return {
      status: 'stopped',
      isHealthy: false,
      timestamp,
      error: healthCheck.error || 'Server not responding to health checks',
      port: lemonadeClient.getLemonadeServerConfig().port,
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