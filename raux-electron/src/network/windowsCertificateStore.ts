// Copyright (c) RAUX Contributors
// This software is released under the MIT License.

import { spawn } from 'child_process';
import { logInfo, logError } from '../logger';

export class WindowsCertificateStore {
  /**
   * Extracts certificates from Windows Certificate Store
   * This uses PowerShell to export certificates in PEM format
   */
  static async getSystemCertificates(): Promise<Buffer[]> {
    if (process.platform !== 'win32') {
      return [];
    }

    try {
      logInfo('[WindowsCertificateStore] Extracting certificates from Windows Certificate Store');
      
      // PowerShell command to export root certificates in PEM format
      const psCommand = `
        $certs = Get-ChildItem -Path Cert:\\\\LocalMachine\\\\Root
        $pemCerts = @()
        foreach ($cert in $certs) {
          $pemCert = @"
-----BEGIN CERTIFICATE-----
$([Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks'))
-----END CERTIFICATE-----
"@
          $pemCerts += $pemCert
        }
        $pemCerts -join "\`n"
      `;

      const certificates = await this.executePowerShell(psCommand);
      
      if (certificates) {
        logInfo('[WindowsCertificateStore] Successfully extracted certificates from Windows store');
        return [Buffer.from(certificates)];
      }
      
      return [];
    } catch (error) {
      logError(`[WindowsCertificateStore] Failed to extract Windows certificates: ${error}`);
      return [];
    }
  }

  private static executePowerShell(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command', command
      ]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`PowerShell exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Checks if we can access Windows Certificate Store
   */
  static async isAvailable(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }

    try {
      const result = await this.executePowerShell('echo "test"');
      return result.trim() === 'test';
    } catch {
      return false;
    }
  }
}