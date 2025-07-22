// Copyright (c) RAUX Contributors
// This software is released under the MIT License.

import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ICertificateManager } from './types';
import { logInfo, logError } from '../logger';
import { getAppInstallDir } from '../envUtils';

export class CertificateManager implements ICertificateManager {
  // File-based certificate paths for Linux systems
  private systemCertPaths: Record<string, string[]> = {
    linux: [
      '/etc/ssl/certs/ca-certificates.crt',
      '/etc/pki/tls/certs/ca-bundle.crt',
      '/etc/ssl/ca-bundle.pem',
      '/etc/pki/tls/cert.pem',
      '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem',
    ],
  };

  private cachedCertificates: Buffer[] | null = null;

  async getCertificates(): Promise<Buffer[]> {
    if (this.cachedCertificates) {
      logInfo('[CertificateManager] Using cached certificates');
      return this.cachedCertificates;
    }

    logInfo('[CertificateManager] Starting certificate loading process...');
    const certs: Buffer[] = [];
    
    // 1. Check NODE_EXTRA_CA_CERTS environment variable (highest priority)
    if (process.env.NODE_EXTRA_CA_CERTS) {
      logInfo(`[CertificateManager] NODE_EXTRA_CA_CERTS is set: ${process.env.NODE_EXTRA_CA_CERTS}`);
      try {
        const cert = await this.loadCertFile(process.env.NODE_EXTRA_CA_CERTS);
        if (cert) {
          certs.push(cert);
          logInfo('[CertificateManager] Successfully loaded certificate from NODE_EXTRA_CA_CERTS');
        }
      } catch (error) {
        logError(`[CertificateManager] Failed to load NODE_EXTRA_CA_CERTS: ${error}`);
      }
    } else {
      logInfo('[CertificateManager] NODE_EXTRA_CA_CERTS not set');
    }
    
    // 2. Check RAUX-specific certificate configuration
    const rauxCertPath = this.getRauxCertPath();
    if (rauxCertPath && existsSync(rauxCertPath)) {
      logInfo(`[CertificateManager] Found RAUX certificate at: ${rauxCertPath}`);
      try {
        const cert = await this.loadCertFile(rauxCertPath);
        if (cert) {
          certs.push(cert);
          logInfo('[CertificateManager] Successfully loaded RAUX certificate');
        }
      } catch (error) {
        logError(`[CertificateManager] Failed to load RAUX certificate: ${error}`);
      }
    } else {
      logInfo('[CertificateManager] No RAUX certificate found in expected locations');
    }
    
    // 3. Try to load system certificates
    logInfo('[CertificateManager] Attempting to load system certificates...');
    const systemCerts = await this.loadSystemCertificates();
    if (systemCerts.length > 0) {
      certs.push(...systemCerts);
      logInfo(`[CertificateManager] Loaded ${systemCerts.length} system certificate bundle(s)`);
    } else {
      logInfo('[CertificateManager] No system certificates loaded');
    }
    
    // If no certificates found and we're in a corporate environment, 
    // return empty array to let Node.js use its default certificate handling
    if (certs.length === 0) {
      logInfo('[CertificateManager] No custom certificates found, will use Node.js default certificate handling');
      // Return empty array - Node.js will use OS certificate store automatically
      return [];
    }
    
    // Cache the certificates
    this.cachedCertificates = certs;
    
    logInfo(`[CertificateManager] Total certificates loaded: ${certs.length}`);
    return certs;
  }
  
  shouldRejectUnauthorized(): boolean {
    // Only disable if explicitly set (security by default)
    const shouldReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0';
    if (!shouldReject) {
      logInfo('[CertificateManager] WARNING: Certificate verification is disabled (NODE_TLS_REJECT_UNAUTHORIZED=0)');
    }
    return shouldReject;
  }
  
  getRauxCertPath(): string | null {
    // Check multiple possible locations for RAUX certificates
    const possiblePaths = [
      process.env.RAUX_CA_BUNDLE, // Environment variable
      join(getAppInstallDir(), 'certificates', 'ca-bundle.crt'), // App install directory
      join(process.cwd(), 'ca-bundle.crt'), // Current working directory
    ];
    
    for (const path of possiblePaths) {
      if (path && existsSync(path)) {
        return path;
      }
    }
    
    return null;
  }
  
  private async loadSystemCertificates(): Promise<Buffer[]> {
    const platform = process.platform;
    const certs: Buffer[] = [];
    
    logInfo(`[CertificateManager] Loading system certificates for platform: ${platform}`);
    
    // For Windows, Node.js will automatically use the Windows Certificate Store
    // when we don't provide custom certificates (ca is undefined)
    // We only check for explicitly provided certificate files
    if (platform === 'win32') {
      logInfo('[CertificateManager] On Windows - will use native certificate store unless custom certs are provided');
      
      // Check common locations where tools like Git for Windows install certificates
      const windowsFallbackPaths = [
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'mingw64', 'ssl', 'certs', 'ca-bundle.crt'),
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'ssl', 'certs', 'ca-bundle.crt'),
        join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'mingw64', 'ssl', 'certs', 'ca-bundle.crt'),
      ];
      
      for (const path of windowsFallbackPaths) {
        if (existsSync(path)) {
          try {
            logInfo(`[CertificateManager] Found certificate bundle at: ${path}`);
            const cert = await fs.readFile(path);
            certs.push(cert);
            break;
          } catch (error) {
            logError(`[CertificateManager] Failed to load certificate from ${path}: ${error}`);
          }
        }
      }
    } else {
      // For non-Windows systems, check standard file locations
      const paths = this.systemCertPaths[platform] || [];
      
      for (const path of paths) {
        if (existsSync(path)) {
          try {
            logInfo(`[CertificateManager] Found system certificate at: ${path}`);
            const cert = await fs.readFile(path);
            certs.push(cert);
            break; // Usually only need one system certificate bundle
          } catch (error) {
            logError(`[CertificateManager] Failed to load system certificate from ${path}: ${error}`);
          }
        }
      }
    }
    
    if (certs.length === 0) {
      logInfo('[CertificateManager] No system certificates found in file system');
    }
    
    return certs;
  }
  
  private async loadCertFile(path: string): Promise<Buffer | null> {
    try {
      const content = await fs.readFile(path);
      // Basic validation - check if it looks like a certificate
      const contentStr = content.toString();
      if (contentStr.includes('-----BEGIN CERTIFICATE-----')) {
        return content;
      } else {
        logError(`[CertificateManager] File ${path} does not appear to be a valid certificate`);
        return null;
      }
    } catch (error) {
      logError(`[CertificateManager] Failed to read certificate file ${path}: ${error}`);
      return null;
    }
  }
  
  clearCache(): void {
    this.cachedCertificates = null;
  }
}