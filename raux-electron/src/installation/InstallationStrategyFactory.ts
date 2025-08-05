import { InstallationStrategy } from './InstallationStrategy';
import { WindowsInstallationStrategy } from './WindowsInstallationStrategy';
import { LinuxInstallationStrategy } from './LinuxInstallationStrategy';

export class InstallationStrategyFactory {
  static create(): InstallationStrategy {
    switch (process.platform) {
      case 'win32':
        return new WindowsInstallationStrategy();
      case 'linux':
        return new LinuxInstallationStrategy();
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }
}