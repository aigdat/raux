import { WindowsStrategy } from './WindowsStrategy';
import { WindowsWindowsStrategy } from './WindowsWindowsStrategy';
import { LinuxWindowsStrategy } from './LinuxWindowsStrategy';

export class WindowsStrategyFactory {
  static create(): WindowsStrategy {
    switch (process.platform) {
      case 'win32':
        return new WindowsWindowsStrategy();
      case 'linux':
        return new LinuxWindowsStrategy();
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }
}