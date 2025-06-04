import { BaseCliRunner, CliCommandResult, CliCommandOptions } from './baseCliRunner';
import { logInfo } from '../logger';

export interface LemonadeVersion {
  full: string;
  major: number;
  minor: number;
  patch: number;
}

export class LemonadeClient extends BaseCliRunner {
  private static instance: LemonadeClient;

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