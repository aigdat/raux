import { BaseCliRunner, CliCommandResult, CliCommandOptions } from './baseCliRunner';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { createServer } from 'net';
import { request } from 'http';
import { logInfo, logError } from '../logger';

export interface LemonadeVersion {
  full: string;
  major: number;
  minor: number;
  patch: number;
}

export class LemonadeClient extends BaseCliRunner {
  private static instance: LemonadeClient;
  private serverProcess: ChildProcessWithoutNullStreams | null = null;
  private serverStatus: 'starting' | 'running' | 'stopped' | 'crashed' = 'stopped';

  private constructor() {
    super('lemonade-server', {
      timeout: 10000,
      shell: true,
      windowsHide: true
    });
  }

  public static getInstance(): LemonadeClient {
    if (!LemonadeClient.instance) {
      LemonadeClient.instance = new LemonadeClient();
    }
    return LemonadeClient.instance;
  }

  /**
   * Get Lemonade version information
   */
  public async getVersion(options: CliCommandOptions = {}): Promise<CliCommandResult & { version?: LemonadeVersion }> {
    logInfo('Getting Lemonade version...');
    
    const result = await this.executeCommand(['--version'], options);

    if (result.success && result.stdout) {
      const version = this.parseVersion(result.stdout);
      return { ...result, version };
    }

    return result;
  }

  /**
   * Check if Lemonade is available
   */
  public async isLemonadeAvailable(options: CliCommandOptions = {}): Promise<boolean> {
    try {
      const result = await this.getVersion({ ...options, timeout: 5000 });
      return result.success && !!result.version;
    } catch {
      return false;
    }
  }

  /**
   * Parse version string from Lemonade output
   */
  private parseVersion(output: string): LemonadeVersion | undefined {
    const match = output.match(/([0-9]+)\.([0-9]+)\.([0-9]+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      const patch = parseInt(match[3], 10);
      
      return {
        full: `${major}.${minor}.${patch}`,
        major,
        minor,
        patch
      };
    }
    return undefined;
  }

  /**
   * Start Lemonade server as a managed long-running process
   */
  public async startServerProcess(options: { 
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    onExit?: (code: number | null) => void;
    envOverrides?: Record<string, string>;
    [key: string]: any;
  } = {}): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if already running
      if (this.serverProcess) {
        logInfo('Lemonade server is already running');
        return { success: true };
      }

      // Get default configuration and apply overrides
      const config = this.getLemonadeServerConfig(options.envOverrides || {});
      
      // Check if port is available
      const portNumber = parseInt(config.port, 10);
      if (await this.isPortInUse(portNumber)) {
        logError(`[LemonadeClient] Port ${portNumber} is already in use`);
        return { success: false, error: `Port ${portNumber} is already in use` };
      }
      
      const args = [];
      args.push('--host', config.host);
      args.push('--port', config.port);

      // Add any additional arguments from config (excluding callback functions and known config)
      Object.entries(config).forEach(([key, value]) => {
        if (key !== 'host' && key !== 'port' && value !== undefined) {
          args.push(`--${key}`, String(value));
        }
      });

      logInfo(`Starting Lemonade server process with args: ${args.join(' ')}`);
      this.serverStatus = 'starting';
      
      // Spawn the server process
      this.serverProcess = spawn(this.commandName, args, {
        stdio: 'pipe',
        windowsHide: true,
        env: { ...process.env }
      });

      if (!this.serverProcess.pid) {
        throw new Error('Failed to start Lemonade server process');
      }

      logInfo(`Lemonade server started with PID: ${this.serverProcess.pid}`);

      // Set up event handlers
      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        logInfo(`[Lemonade][stdout] ${output}`);
        
        // Check if server is ready
        if (this.serverStatus === 'starting' && (output.includes('Running on') || output.includes('Started'))) {
          this.serverStatus = 'running';
        }
        
        if (options.onStdout) {
          options.onStdout(output);
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        logError(`[Lemonade][stderr] ${output}`);
        
        if (options.onStderr) {
          options.onStderr(output);
        }
      });

      this.serverProcess.on('close', (code) => {
        logInfo(`Lemonade server process exited with code: ${code}`);
        this.serverStatus = code === 0 ? 'stopped' : 'crashed';
        this.serverProcess = null;
        
        if (options.onExit) {
          options.onExit(code);
        }
      });

      this.serverProcess.on('error', (error) => {
        logError(`Lemonade server process error: ${error.message}`);
        this.serverStatus = 'crashed';
        this.serverProcess = null;
      });

      return { success: true };
    } catch (error) {
      logError(`Failed to start Lemonade server: ${error}`);
      this.serverStatus = 'crashed';
      this.serverProcess = null;
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Stop the managed Lemonade server process
   */
  public stopServerProcess(): void {
    if (this.serverProcess) {
      logInfo('Stopping Lemonade server process...');
      
      try {
        this.serverProcess.kill('SIGTERM');
        
        // Force kill after 5 seconds if not stopped gracefully
        setTimeout(() => {
          if (this.serverProcess) {
            logInfo('Force killing Lemonade server process...');
            this.serverProcess.kill('SIGKILL');
          }
        }, 5000);
      } catch (error) {
        logError(`Error stopping Lemonade server: ${error}`);
      }
    }
    
    this.serverStatus = 'stopped';
  }

  /**
   * Get the current server status
   */
  public getServerStatus(): string {
    return this.serverStatus;
  }

  /**
   * Check if the server process is being managed by this client
   */
  public isServerManaged(): boolean {
    return this.serverProcess !== null;
  }

  /**
   * Legacy method - use startServerProcess for new code
   * @deprecated Use startServerProcess instead
   */
  public async startServer(options: { host?: string; port?: string; [key: string]: any } = {}): Promise<CliCommandResult> {
    logInfo('Warning: startServer is deprecated, use startServerProcess for managed processes');
    
    const args = [];
    
    if (options.host) {
      args.push('--host', options.host);
    }
    
    if (options.port) {
      args.push('--port', options.port);
    }

    // Add any additional arguments from options
    Object.entries(options).forEach(([key, value]) => {
      if (key !== 'host' && key !== 'port' && value !== undefined) {
        args.push(`--${key}`, String(value));
      }
    });

    logInfo(`Starting Lemonade server with args: ${args.join(' ')}`);
    
    // For server start, we want a longer timeout and persistent process
    return await this.executeCommand(args, {
      timeout: 60000, // 60 seconds for startup
      ...options
    });
  }

  /**
   * Check if a port is in use
   */
  private async isPortInUse(port: number): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        const server = createServer();
        
        server.listen(port, () => {
          server.close(() => {
            resolve(false); // Port is available
          });
        });
        
        server.on('error', () => {
          resolve(true); // Port is in use
        });
      });
    } catch {
      return true; // Assume port is in use if we can't check
    }
  }

  /**
   * Get Lemonade server configuration with overrides
   */
  public getLemonadeServerConfig(envOverrides: Record<string, string> = {}): Record<string, string> {
    const defaultConfig = {
      host: '0.0.0.0',
      port: '8000',
    };

    return {
      ...defaultConfig,
      host: envOverrides.LEMONADE_HOST || defaultConfig.host,
      port: envOverrides.LEMONADE_PORT || defaultConfig.port,
      // Add other configuration options as needed
    };
  }

  /**
   * Check if a version meets minimum requirements
   */
  public static isVersionCompatible(version: LemonadeVersion, minVersion: LemonadeVersion): boolean {
    if (version.major !== minVersion.major) {
      return version.major >= minVersion.major;
    }
    if (version.minor !== minVersion.minor) {
      return version.minor >= minVersion.minor;
    }
    return version.patch >= minVersion.patch;
  }
}

export const lemonadeClient = LemonadeClient.getInstance();