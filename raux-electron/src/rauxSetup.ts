import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import fetch from 'node-fetch';
import extract from 'extract-zip';
import { python } from './pythonExec';
import { getAppInstallDir } from './envUtils';
import { logInfo, logError } from './logger';
import { IPCManager } from './ipc/ipcManager';
import { IPCChannels } from './ipc/ipcChannels';

class RauxSetup {
  private static instance: RauxSetup;
  private static readonly RAUX_HYBRID_ENV = 'raux-hybrid.env';
  private static readonly RAUX_GENERIC_ENV = 'raux-generic.env';
  private constructor() {}
  private ipcManager = IPCManager.getInstance();

  public static getInstance(): RauxSetup {
    if (!RauxSetup.instance) {
      RauxSetup.instance = new RauxSetup();
    }
    return RauxSetup.instance;
  }

  public async install(): Promise<void> {
    let tmpDir: string | null = null;
    try {
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { type: 'info', message: 'Downloading GAIA environment...', step: 'raux-download' });
      tmpDir = await this.downloadRAUXWheel();
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { type: 'info', message: 'Installing GAIA environment...', step: 'raux-install' });
      await this.installRAUXWheel(tmpDir);
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { type: 'info', message: 'Ensuring GAIA environment configuration...', step: 'raux-env' });
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
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { type: 'success', message: 'GAIA environment setup completed.', step: 'raux-complete' });
    } catch (err) {
      logError(`RAUX wheel installation failed: ${err}`);
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, { type: 'error', message: 'GAIA installation failed, check logs!', step: 'raux-error' });
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
      zipUrl = process.env.RAUX_WHEEL_URL || 'https://github.com/aigdat/raux/releases/latest/download/raux-wheel-context.zip';
    } else {
      const versionStr = rauxVersion.startsWith('v') ? rauxVersion.substring(1) : rauxVersion;
      zipUrl = process.env.RAUX_WHEEL_URL || 
               `https://github.com/aigdat/raux/releases/download/v${versionStr}/raux-wheel-context.zip`;
    }
    logInfo(`Downloading build context zip from URL: ${zipUrl}`);
    const tmpDir = join(wheelDir, `tmp-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const zipPath = join(tmpDir, 'raux-build-context.zip');
    await new Promise<void>((resolve, reject) => {
      fetch(zipUrl)
        .then(response => {
          if (response.status !== 200) {
            logError('Failed to download build context zip: ' + response.status);
            this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, { type: 'error', message: 'Failed to download GAIA environment.', step: 'raux-download' });
            reject(new Error('Failed to download build context zip: ' + response.status));
            return;
          }
          const file = require('fs').createWriteStream(zipPath);
          response.body.pipe(file);
          file.on('finish', () => {
            file.close();
            logInfo('Build context zip download finished.');
            this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { type: 'success', message: 'GAIA environment download finished.', step: 'raux-download' });
            resolve();
          });
        })
        .catch(err => {
          logError(`Build context zip download error: ${err}`);
          this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, { type: 'error', message: 'GAIA environment download error.', step: 'raux-download' });
          reject(err);
        });
    });
    logInfo('Extracting build context zip...');
    try {
      await extract(zipPath, { dir: tmpDir });
      logInfo('Build context extraction finished.');
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { type: 'success', message: 'GAIA environment extraction finished.', step: 'raux-extract' });
    } catch (error) {
      logError(`Failed to extract build context zip: ${error}`);
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, { type: 'error', message: 'Failed to extract GAIA environment.', step: 'raux-extract' });
      throw error;
    }
    return tmpDir;
  }

  private async installRAUXWheel(extractDir: string): Promise<void> {
    logInfo(`Installing RAUX wheel(s) from directory: ${extractDir}...`);
    const fs = require('fs');
    const path = require('path');
    const whlFiles = fs.readdirSync(extractDir).filter((f: string) => f.endsWith('.whl'));
    if (whlFiles.length === 0) {
      logError('No .whl files found in extracted build context.');
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, { type: 'error', message: 'No GAIA environment found.', step: 'raux-install' });
      throw new Error('No .whl files found in extracted build context.');
    }
    for (const whlFile of whlFiles) {
      const wheelPath = path.join(extractDir, whlFile);
      const result = await python.runPipCommand(['install', wheelPath, '--verbose', '--no-warn-script-location']);
      if (result.code === 0) {
        logInfo(`${whlFile} installed successfully.`);
        this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { type: 'success', message: 'GAIA environment installed successfully.', step: 'raux-install' });
      } else {
        logError(`Failed to install ${whlFile}. Exit code: ${result.code}`);
        this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, { type: 'error', message: 'Failed to install GAIA environment.', step: 'raux-install' });
        throw new Error(`Failed to install ${whlFile}. Exit code: ${result.code}`);
      }
    }
  }

  private async copyEnvToPythonLib(extractDir: string): Promise<void> {
    try {
      if (process.platform !== 'win32') {
        logError('copyEnvToPythonLib: Only supported on Windows.');
        this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, { type: 'error', message: 'GAIA environment only supported on Windows.', step: 'raux-env' });
        return;
      }
      const gaiaMode = process.env.GAIA_MODE;
      let envFileName: string;
      if (gaiaMode !== undefined) {
        if (gaiaMode === 'HYBRID') {
          envFileName = RauxSetup.RAUX_HYBRID_ENV;
        } else {
          envFileName = RauxSetup.RAUX_GENERIC_ENV;
        }
      } else {
        const pathEnv = process.env.PATH || '';
        const userProfile = process.env.USERPROFILE || '';
        const hasLemonade = pathEnv.includes('lemonade_server') || userProfile.includes('lemonade_server');
        envFileName = hasLemonade ? RauxSetup.RAUX_HYBRID_ENV : RauxSetup.RAUX_GENERIC_ENV;
      }
      const srcEnv = join(extractDir, envFileName);
      const destEnv = join(getAppInstallDir(), 'python', 'Lib', '.env');
      if (!existsSync(srcEnv)) {
        logError(`copyEnvToPythonLib: Source ${envFileName} not found at ${srcEnv}`);
        this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, { type: 'error', message: 'GAIA environment not found.', step: 'raux-env' });
        return;
      }
      const libDir = join(getAppInstallDir(), 'python', 'Lib');
      if (!existsSync(libDir)) {
        mkdirSync(libDir, { recursive: true });
      }
      require('fs').copyFileSync(srcEnv, destEnv);
      logInfo(`Copied ${envFileName} to ${destEnv}`);
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_STATUS, { type: 'success', message: 'GAIA environment configured.', step: 'raux-env' });
    } catch (err) {
      logError(`copyEnvToPythonLib failed: ${err}`);
      this.ipcManager.sendToAll(IPCChannels.INSTALLATION_ERROR, { type: 'error', message: 'GAIA environment configuration failed.', step: 'raux-env' });
    }
  }
}

export const raux = RauxSetup.getInstance(); 