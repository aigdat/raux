import { spawn, ChildProcess } from 'child_process';
import { logInfo, logError } from '../logger';

export interface CliCommandResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface CliCommandOptions {
  timeout?: number;
  shell?: boolean;
  windowsHide?: boolean;
  cwd?: string;
  env?: Record<string, string>;
}

export abstract class BaseCliRunner {
  protected readonly commandName: string;
  protected readonly defaultOptions: CliCommandOptions;

  constructor(commandName: string, defaultOptions: CliCommandOptions = {}) {
    this.commandName = commandName;
    this.defaultOptions = {
      timeout: 10000, // 10 second default timeout
      shell: true,
      windowsHide: true,
      ...defaultOptions
    };
  }

  /**
   * Execute a CLI command with the given arguments
   * @param args Command arguments
   * @param options Optional command execution options
   * @returns Promise resolving to command result
   */
  protected async executeCommand(args: string[] = [], options: CliCommandOptions = {}): Promise<CliCommandResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    logInfo(`Executing command: ${this.commandName} ${args.join(' ')}`);
    logInfo(`Command options: timeout=${mergedOptions.timeout}ms, shell=${mergedOptions.shell}, cwd=${mergedOptions.cwd || 'default'}`);

    return new Promise((resolve) => {
      const startTime = Date.now();
      const proc: ChildProcess = spawn(this.commandName, args, {
        shell: mergedOptions.shell,
        timeout: mergedOptions.timeout,
        windowsHide: mergedOptions.windowsHide,
        cwd: mergedOptions.cwd,
        env: { ...process.env, ...mergedOptions.env }
      });

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout | null = null;
      let processResolved = false;

      const resolveOnce = (result: CliCommandResult) => {
        if (processResolved) return;
        processResolved = true;
        
        const duration = Date.now() - startTime;
        logInfo(`Command completed in ${duration}ms: ${this.commandName} ${args.join(' ')}`);
        
        if (timeoutId) clearTimeout(timeoutId);
        resolve(result);
      };

      // Set up timeout handling
      if (mergedOptions.timeout && mergedOptions.timeout > 0) {
        timeoutId = setTimeout(() => {
          const duration = Date.now() - startTime;
          logError(`Command '${this.commandName} ${args.join(' ')}' timed out after ${duration}ms (limit: ${mergedOptions.timeout}ms)`);
          logError(`Stdout so far: ${stdout}`);
          logError(`Stderr so far: ${stderr}`);
          
          proc.kill('SIGTERM');
          
          resolveOnce({
            success: false,
            exitCode: -1,
            stdout,
            stderr,
            error: `Command timed out after ${mergedOptions.timeout}ms`
          });
        }, mergedOptions.timeout);
      }

      proc.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        logInfo(`[${this.commandName}][stdout] ${output.trim()}`);
      });

      proc.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        logInfo(`[${this.commandName}][stderr] ${output.trim()}`);
      });

      proc.on('error', (error) => {
        const duration = Date.now() - startTime;
        logError(`Command '${this.commandName}' failed with error after ${duration}ms: ${error.message}`);
        logError(`Error details: code=${error.code}, errno=${error.errno}, syscall=${error.syscall}`);
        
        resolveOnce({
          success: false,
          exitCode: -1,
          stdout,
          stderr,
          error: error.message
        });
      });

      proc.on('close', (code) => {
        const duration = Date.now() - startTime;
        
        const result: CliCommandResult = {
          success: code === 0,
          exitCode: code ?? -1,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        };

        if (result.success) {
          logInfo(`Command '${this.commandName}' completed successfully after ${duration}ms`);
        } else {
          logError(`Command '${this.commandName}' failed with exit code ${code} after ${duration}ms`);
          if (stderr) {
            logError(`stderr: ${stderr}`);
          }
          if (stdout) {
            logInfo(`stdout: ${stdout}`);
          }
        }

        resolveOnce(result);
      });
    });
  }

  /**
   * Try multiple command variations (useful for commands that might have different names)
   * @param commandVariations Array of command name variations to try
   * @param args Command arguments
   * @param options Command execution options
   * @returns Promise resolving to first successful result or last failure
   */
  protected async tryCommandVariations(
    commandVariations: string[], 
    args: string[] = [], 
    options: CliCommandOptions = {}
  ): Promise<CliCommandResult> {
    let lastResult: CliCommandResult | null = null;

    for (const variation of commandVariations) {
      const originalCommand = this.commandName;
      // Temporarily change command name for this attempt
      (this as any).commandName = variation;
      
      try {
        const result = await this.executeCommand(args, options);
        
        // Restore original command name
        (this as any).commandName = originalCommand;
        
        if (result.success) {
          logInfo(`Successfully executed with command variation: ${variation}`);
          return result;
        }
        
        lastResult = result;
      } catch (error) {
        // Restore original command name
        (this as any).commandName = originalCommand;
        lastResult = {
          success: false,
          exitCode: -1,
          stdout: '',
          stderr: '',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return lastResult || {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: '',
      error: 'All command variations failed'
    };
  }

  /**
   * Check if the command is available in the system
   * @returns Promise resolving to true if command is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const result = await this.executeCommand(['--help'], { timeout: 5000 });
      return result.success || result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Get the command name being used
   */
  public getCommandName(): string {
    return this.commandName;
  }
}