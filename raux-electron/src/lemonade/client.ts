import { BaseCliRunner, CliCommandResult, CliCommandOptions } from '../clients/baseCliRunner';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { createServer } from 'net';
import { logInfo, logError } from '../logger';
import { LemonadeHealthCheck } from '../ipc/ipcTypes';

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
	private isStartedByRaux: boolean = false; // Track if RAUX started this process

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
	public async getVersion(
		options: CliCommandOptions = {}
	): Promise<CliCommandResult & { version?: LemonadeVersion }> {
		logInfo('[LemonadeClient] Getting Lemonade version...');

		const result = await this.executeCommand(['--version'], options);

		logInfo(`[LemonadeClient] Version command result: success=${result.success}, exitCode=${result.exitCode}`);
		logInfo(`[LemonadeClient] Version stdout: "${result.stdout || '(empty)'}"`);
		logInfo(`[LemonadeClient] Version stderr: "${result.stderr || '(empty)'}"`);

		if (result.success && result.stdout) {
			const version = this.parseVersion(result.stdout);
			if (version) {
				logInfo(`[LemonadeClient] Successfully parsed version: ${version.full}`);
			} else {
				logError('[LemonadeClient] Failed to parse version from stdout');
			}
			return { ...result, version };
		}

		logError(`[LemonadeClient] Version command failed: ${result.error || 'Unknown error'}`);
		return result;
	}

	/**
	 * Check if Lemonade is available
	 */
	public async isLemonadeAvailable(options: CliCommandOptions = {}): Promise<boolean> {
		try {
			logInfo('[LemonadeClient] Checking if Lemonade is available...');

			// First try a quick version check with extended timeout and environment override to suppress warnings
			const envOptions = {
				...options,
				timeout: 15000,
				env: {
					...options.env,
					// Suppress the pkg_resources deprecation warning that might cause hangs
					PYTHONWARNINGS: 'ignore::DeprecationWarning'
				}
			};

			const result = await this.getVersion(envOptions);
			if (result.success && !!result.version) {
				logInfo(`[LemonadeClient] Lemonade available - version: ${result.version?.full}`);
				return true;
			}

			logInfo(`[LemonadeClient] Version check failed - trying alternative detection methods`);
			logInfo(
				`[LemonadeClient] Version result: success=${result.success}, exitCode=${result.exitCode}, error=${result.error}`
			);

			// If version check fails, try a help command as fallback
			const helpResult = await this.executeCommand(['--help'], { ...envOptions, timeout: 10000 });
			if (helpResult.success || helpResult.exitCode === 0) {
				logInfo('[LemonadeClient] Lemonade available via help command');
				return true;
			}

			logInfo(
				`[LemonadeClient] Help command also failed: success=${helpResult.success}, exitCode=${helpResult.exitCode}`
			);

			// Last resort: try without any arguments (some commands show help when no args)
			const noArgsResult = await this.executeCommand([], { ...envOptions, timeout: 8000 });
			if (
				noArgsResult.success ||
				(noArgsResult.stderr && noArgsResult.stderr.includes('lemonade'))
			) {
				logInfo('[LemonadeClient] Lemonade available via no-args detection');
				return true;
			}

			logInfo('[LemonadeClient] All detection methods failed - Lemonade not available');
			return false;
		} catch (error) {
			logError(`[LemonadeClient] Exception checking Lemonade availability: ${error}`);
			return false;
		}
	}

	/**
	 * Check Lemonade server health using the Health API
	 */
	public async checkHealth(timeoutMs: number = 5000): Promise<LemonadeHealthCheck> {
		const startTime = Date.now();

		try {
			const config = this.getLemonadeServerConfig();
			const healthUrl = `http://localhost:${config.port}/api/v0/health`;

			// Use fetch with timeout
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

			const response = await fetch(healthUrl, {
				method: 'GET',
				signal: controller.signal,
				headers: {
					Accept: 'application/json'
				}
			});

			clearTimeout(timeoutId);
			const responseTime = Date.now() - startTime;

			if (response.ok) {
				return {
					isHealthy: true,
					responseTime,
					timestamp: Date.now()
				};
			}

			return {
				isHealthy: false,
				responseTime,
				error: `HTTP ${response.status}: ${response.statusText}`,
				timestamp: Date.now()
			};
		} catch (error) {
			const responseTime = Date.now() - startTime;

			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					return {
						isHealthy: false,
						responseTime,
						error: `Health check timeout after ${timeoutMs}ms`,
						timestamp: Date.now()
					};
				}

				return {
					isHealthy: false,
					responseTime,
					error: error.message,
					timestamp: Date.now()
				};
			}

			return {
				isHealthy: false,
				responseTime,
				error: 'Unknown error during health check',
				timestamp: Date.now()
			};
		}
	}

	/**
	 * Parse version string from Lemonade output
	 */
	private parseVersion(output: string): LemonadeVersion | undefined {
		logInfo(`[LemonadeClient] Parsing version from output: "${output.trim()}"`);
		
		// Try to match semantic version pattern (x.y.z)
		let match = output.match(/([0-9]+)\.([0-9]+)\.([0-9]+)/);
		if (match) {
			const major = parseInt(match[1], 10);
			const minor = parseInt(match[2], 10);
			const patch = parseInt(match[3], 10);

			const version = {
				full: `${major}.${minor}.${patch}`,
				major,
				minor,
				patch
			};
			logInfo(`[LemonadeClient] Parsed semantic version: ${version.full}`);
			return version;
		}
		
		// Try to match version with additional parts (x.y.z.w or x.y.z-something)
		match = output.match(/([0-9]+)\.([0-9]+)\.([0-9]+)(?:[.-].*)?/);
		if (match) {
			const major = parseInt(match[1], 10);
			const minor = parseInt(match[2], 10);
			const patch = parseInt(match[3], 10);

			const version = {
				full: `${major}.${minor}.${patch}`,
				major,
				minor,
				patch
			};
			logInfo(`[LemonadeClient] Parsed extended version: ${version.full}`);
			return version;
		}
		
		// Try to extract any version-like pattern from the output
		match = output.match(/version.*?([0-9]+(?:\.[0-9]+)*)/i);
		if (match) {
			const versionStr = match[1];
			const parts = versionStr.split('.').map(p => parseInt(p, 10));
			
			if (parts.length >= 3) {
				const version = {
					full: `${parts[0]}.${parts[1]}.${parts[2]}`,
					major: parts[0],
					minor: parts[1],
					patch: parts[2]
				};
				logInfo(`[LemonadeClient] Parsed from text version: ${version.full}`);
				return version;
			}
		}
		
		logError(`[LemonadeClient] Could not parse version from output: "${output.trim()}"`);
		return undefined;
	}

	/**
	 * Start Lemonade server as a managed long-running process
	 */
	public async startServerProcess(
		options: {
			onStdout?: (data: string) => void;
			onStderr?: (data: string) => void;
			onExit?: (code: number | null) => void;
			envOverrides?: Record<string, string>;
			[key: string]: any;
		} = {}
	): Promise<{ success: boolean; error?: string }> {
		try {
			// Check if already running
			if (this.serverProcess) {
				logInfo('Lemonade server is already running');
				return { success: true };
			}

			// Verify the command exists before attempting to spawn
			logInfo(`[LemonadeClient] Verifying command exists: ${this.commandName}`);
			const commandExists = await this.isLemonadeAvailable();
			if (!commandExists) {
				const error = `Command '${this.commandName}' not found or not executable`;
				logError(`[LemonadeClient] ${error}`);
				return { success: false, error };
			}

			// Get configuration for port
			const config = this.getLemonadeServerConfig(options.envOverrides || {});
			const args = ['serve', '--port', config.port];

			logInfo(`[LemonadeClient] Starting Lemonade server with args: ${args.join(' ')}`);
			logInfo(`[LemonadeClient] Command: ${this.commandName}`);
			logInfo(`[LemonadeClient] Working directory: ${process.cwd()}`);
			logInfo(`[LemonadeClient] PATH: ${process.env.PATH}`);
			this.serverStatus = 'starting';

			// Start the lemonade-server with serve command and port
			const spawnOptions = {
				stdio: 'pipe' as const,
				windowsHide: true,
				shell: true, // Required on Windows to find commands in PATH
				env: {
					...process.env,
					...options.envOverrides,
					// Suppress warnings that might interfere with startup
					PYTHONWARNINGS: 'ignore::DeprecationWarning'
				}
			};

			logInfo(
				`[LemonadeClient] Spawn options: ${JSON.stringify({ ...spawnOptions, env: Object.keys(spawnOptions.env).length + ' env vars' })}`
			);

			this.serverProcess = spawn(this.commandName, args, spawnOptions);

			// Add immediate error handler before checking PID
			this.serverProcess.on(
				'error',
				(
					error: Error & {
						code?: string;
						errno?: string;
						syscall?: string;
						path?: string;
						spawnfile?: string;
					}
				) => {
					logError(`[LemonadeClient] Spawn error immediately after creation: ${error.message}`);
					logError(`[LemonadeClient] Error code: ${error.code || 'unknown'}`);
					logError(`[LemonadeClient] Error errno: ${error.errno || 'unknown'}`);
					logError(`[LemonadeClient] Error syscall: ${error.syscall || 'unknown'}`);
					logError(`[LemonadeClient] Error path: ${error.path || 'unknown'}`);
					logError(`[LemonadeClient] Error spawnfile: ${error.spawnfile || 'unknown'}`);
					this.serverStatus = 'crashed';
					this.serverProcess = null;
				}
			);

			// Wait a brief moment for spawn to complete and potential immediate errors
			await new Promise((resolve) => setTimeout(resolve, 200));

			if (!this.serverProcess || !this.serverProcess.pid) {
				const error = 'Failed to start Lemonade server process - no PID assigned';
				logError(`[LemonadeClient] ${error}`);
				logError(`[LemonadeClient] serverProcess exists: ${!!this.serverProcess}`);
				logError(`[LemonadeClient] serverProcess.killed: ${this.serverProcess?.killed}`);
				logError(`[LemonadeClient] serverProcess.exitCode: ${this.serverProcess?.exitCode}`);
				logError(`[LemonadeClient] serverProcess.signalCode: ${this.serverProcess?.signalCode}`);
				this.serverStatus = 'crashed';
				this.serverProcess = null;
				return { success: false, error };
			}

			logInfo(`[LemonadeClient] Lemonade server started with PID: ${this.serverProcess.pid}`);
			this.isStartedByRaux = true; // Mark that RAUX started this process

			// Set up event handlers
			this.serverProcess.stdout.on('data', (data) => {
				const output = data.toString();
				logInfo(`[Lemonade][stdout] ${output}`);

				// Check if server is ready
				if (
					this.serverStatus === 'starting' &&
					(output.includes('Running on') || output.includes('Started'))
				) {
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
	 * Stop the managed Lemonade server process using proper stop command
	 * Only stops if RAUX started the process
	 */
	public async stopServerProcess(): Promise<void> {
		if (!this.isStartedByRaux) {
			logInfo('[LemonadeClient] Lemonade server was not started by RAUX - skipping stop');
			return;
		}

		logInfo('[LemonadeClient] Stopping Lemonade server using stop command (started by RAUX)...');

		try {
			// Use the proper lemonade-server stop command
			const result = await this.executeCommand(['stop'], { timeout: 10000 });

			if (result.success) {
				logInfo('[LemonadeClient] Lemonade server stopped successfully via stop command');
			} else {
				logError(`[LemonadeClient] Stop command failed: ${result.error || result.stderr}`);

				// Fallback to process kill if stop command fails
				if (this.serverProcess) {
					logInfo('[LemonadeClient] Falling back to process termination...');
					this.serverProcess.kill('SIGTERM');

					setTimeout(() => {
						if (this.serverProcess) {
							logInfo('[LemonadeClient] Force killing Lemonade server process...');
							this.serverProcess.kill('SIGKILL');
						}
					}, 3000);
				}
			}
		} catch (error) {
			logError(`[LemonadeClient] Error executing stop command: ${error}`);

			// Fallback to process kill if stop command throws
			if (this.serverProcess) {
				logInfo('[LemonadeClient] Falling back to process termination...');
				this.serverProcess.kill('SIGTERM');
			}
		}

		this.serverStatus = 'stopped';
		this.serverProcess = null;
		this.isStartedByRaux = false;
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
	 * Check if the server was started by RAUX
	 */
	public isServerStartedByRaux(): boolean {
		return this.isStartedByRaux;
	}

	/**
	 * Legacy method - use startServerProcess for new code
	 * @deprecated Use startServerProcess instead
	 */
	public async startServer(
		options: { host?: string; port?: string; [key: string]: any } = {}
	): Promise<CliCommandResult> {
		logInfo('Warning: startServer is deprecated, use startServerProcess for managed processes');

		const config = this.getLemonadeServerConfig();
		const args = ['serve', '--port', options.port || config.port];

		logInfo(`Starting Lemonade server with args: ${args.join(' ')}`);

		// Start the lemonade-server with serve command and port
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
	public getLemonadeServerConfig(
		envOverrides: Record<string, string> = {}
	): Record<string, string> {
		const defaultConfig = {
			host: '0.0.0.0',
			port: '8000'
		};

		return {
			...defaultConfig,
			host: envOverrides.LEMONADE_HOST || defaultConfig.host,
			port: envOverrides.LEMONADE_PORT || defaultConfig.port
			// Add other configuration options as needed
		};
	}

	/**
	 * Check if a version meets minimum requirements
	 */
	public static isVersionCompatible(
		version: LemonadeVersion,
		minVersion: LemonadeVersion
	): boolean {
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
