import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import fetch from 'node-fetch';
import extract from 'extract-zip';
import { python } from './pythonExec';
import { getAppInstallDir } from './envUtils';
import { logInfo, logError } from './logger';
import { IPCManager } from './ipc/ipcManager';
import { IPCChannels } from './ipc/ipcChannels';
import { InstallationStrategy } from './installation/InstallationStrategy';
import { InstallationStrategyFactory } from './installation/InstallationStrategyFactory';

class RauxSetup {
	private static instance: RauxSetup;
	private static readonly RAUX_ENV = 'raux.env';
	private installationStrategy: InstallationStrategy;
	private constructor() {
		this.installationStrategy = InstallationStrategyFactory.create();
	}
	private ipcManager = IPCManager.getInstance();

	public static getInstance(): RauxSetup {
		if (!RauxSetup.instance) {
			RauxSetup.instance = new RauxSetup();
		}
		return RauxSetup.instance;
	}

	public isRAUXInstalled(): boolean {
		return this.installationStrategy.isRAUXInstalled();
	}

	// Verification method for startup flow - no installation messages
	public verifyInstallation(): boolean {
		return this.installationStrategy.isRAUXInstalled();
	}

	public async install(): Promise<void> {
		// Check if RAUX is already installed
		if (this.isRAUXInstalled()) {
			logInfo('RAUX installation already exists and is functional, skipping installation.');
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
				type: 'success',
				message: 'GAIA UI components already installed.',
				step: 'raux-check'
			});
			return;
		}

		let tmpDir: string | null = null;
		try {
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
				type: 'info',
				message: 'Downloading GAIA UI components...',
				step: 'raux-download'
			});
			tmpDir = await this.downloadRAUXWheel();
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
				type: 'info',
				message: 'Installing GAIA UI...',
				step: 'raux-install'
			});
			await this.installRAUXWheel(tmpDir);
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
				type: 'info',
				message: 'Configuring GAIA UI environment...',
				step: 'raux-env'
			});
			await this.copyEnvToPythonLib(tmpDir);
			if (tmpDir) {
				try {
					rmSync(tmpDir, { recursive: true, force: true });
					logInfo(`Temporary directory ${tmpDir} removed.`);
				} catch (err) {
					logError(`Failed to remove temporary directory ${tmpDir}: ${err}`);
				}
			}
			logInfo('RAUX wheel and env setup completed successfully.');
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_COMPLETE, {
				type: 'success',
				message: 'GAIA UI installation completed.',
				step: 'raux-complete'
			});
		} catch (err) {
			logError(`RAUX wheel installation failed: ${err}`);
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, {
				type: 'error',
				message: 'GAIA UI installation failed!',
				step: 'raux-error'
			});
			throw err;
		}
	}

	private async downloadRAUXWheel(): Promise<string> {
		logInfo('Downloading RAUX build context zip...');
		const wheelDir = join(getAppInstallDir(), 'wheels');
		mkdirSync(wheelDir, { recursive: true });
		const rauxVersion = process.env.RAUX_VERSION || 'latest';
		logInfo(`Using RAUX version: ${rauxVersion}`);
		let zipUrl: string;
		if (rauxVersion === 'latest') {
			zipUrl =
				process.env.RAUX_WHEEL_URL ||
				'https://github.com/aigdat/raux/releases/latest/download/raux-wheel-context.zip';
		} else {
			const versionStr = rauxVersion.startsWith('v') ? rauxVersion.substring(1) : rauxVersion;
			zipUrl =
				process.env.RAUX_WHEEL_URL ||
				`https://github.com/aigdat/raux/releases/download/v${versionStr}/raux-wheel-context.zip`;
		}
		logInfo(`Downloading build context zip from URL: ${zipUrl}`);
		const tmpDir = join(wheelDir, `tmp-${Date.now()}`);
		mkdirSync(tmpDir, { recursive: true });
		const zipPath = join(tmpDir, 'raux-build-context.zip');
		// Simple retry logic - try up to 3 times
		const maxAttempts = 3;
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				await new Promise<void>((resolve, reject) => {
					fetch(zipUrl)
						.then((response) => {
							if (response.status !== 200) {
								logError('Failed to download build context zip: ' + response.status);
								reject(new Error('Failed to download build context zip: ' + response.status));
								return;
							}
							const file = require('fs').createWriteStream(zipPath);
							response.body.pipe(file);
							file.on('finish', () => {
								file.close();
								logInfo('Build context zip download finished.');
								this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
									type: 'success',
									message: 'GAIA UI components downloaded.',
									step: 'raux-download'
								});
								resolve();
							});
						})
						.catch((err) => {
							logError(`Build context zip download error: ${err}`);
							reject(err);
						});
				});
				// Success - exit the retry loop
				lastError = null;
				break;
			} catch (err) {
				lastError = err as Error;
				if (attempt < maxAttempts) {
					logInfo(`Download failed, retrying... (attempt ${attempt + 1}/${maxAttempts})`);
					await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
				}
			}
		}

		if (lastError) {
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, {
				type: 'error',
				message: 'Failed to download GAIA environment.',
				step: 'raux-download'
			});
			throw lastError;
		}
		logInfo('Extracting build context zip...');
		try {
			await extract(zipPath, { dir: tmpDir });
			logInfo('Build context extraction finished.');
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
				type: 'success',
				message: 'GAIA UI components extracted.',
				step: 'raux-extract'
			});
		} catch (error) {
			logError(`Failed to extract build context zip: ${error}`);
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, {
				type: 'error',
				message: 'Failed to extract GAIA environment.',
				step: 'raux-extract'
			});
			throw error;
		}
		return tmpDir;
	}

	private async installRAUXWheel(extractDir: string): Promise<void> {
		logInfo(`Installing RAUX wheel(s) from directory: ${extractDir}...`);
		this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
			type: 'info',
			message: 'Preparing GAIA UI installation...',
			step: 'raux-env'
		});

		const fs = require('fs');
		const path = require('path');
		const whlFiles = fs.readdirSync(extractDir).filter((f: string) => f.endsWith('.whl'));

		if (whlFiles.length === 0) {
			logError('No .whl files found in extracted build context.');
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, {
				type: 'error',
				message: 'Installation package not found.',
				step: 'raux-install'
			});
			throw new Error('No .whl files found in extracted build context.');
		}

		this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
			type: 'info',
			message: 'Installing components!',
			step: 'raux-env'
		});
		this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
			type: 'info',
			message: 'Install may take 5 to 10 minutes...',
			step: 'raux-env'
		});

		for (const whlFile of whlFiles) {
			const wheelPath = path.join(extractDir, whlFile);

			try {
				await this.installationStrategy.installRAUXWheel(wheelPath);
				logInfo(`${whlFile} installed successfully.`);
				this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
					type: 'success',
					message: 'GAIA UI components installed successfully.',
					step: 'raux-install'
				});
			} catch (err) {
				logError(`Failed to install ${whlFile}: ${err}`);
				this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, {
					type: 'error',
					message: 'Failed to install GAIA environment.',
					step: 'raux-install'
				});
				throw err;
			}
		}
	}

	private async copyEnvToPythonLib(extractDir: string): Promise<void> {
		try {
			const envFileName = RauxSetup.RAUX_ENV;
			const srcEnv = join(extractDir, envFileName);
			const paths = this.installationStrategy.getPaths();
			const destEnv = paths.envFile;

			if (!existsSync(srcEnv)) {
				logError(`copyEnvToPythonLib: Source ${envFileName} not found at ${srcEnv}`);
				this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, {
					type: 'error',
					message: 'GAIA environment not found.',
					step: 'raux-env'
				});
				return;
			}

			await this.installationStrategy.copyEnvFile(srcEnv, destEnv);

			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, {
				type: 'success',
				message: 'GAIA UI configuration completed.',
				step: 'raux-env'
			});
		} catch (err) {
			logError(`copyEnvToPythonLib failed: ${err}`);
			this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, {
				type: 'error',
				message: 'GAIA environment configuration failed.',
				step: 'raux-env'
			});
		}
	}
}

export const raux = RauxSetup.getInstance();
