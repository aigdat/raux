// Copyright (c) RAUX Contributors
// This software is released under the MIT License.

import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ICertificateManager } from './types';
import { logInfo, logError } from '../logger';
import { getAppInstallDir } from '../envUtils';
import { WindowsCertificateStore } from './windowsCertificateStore';

export class CertificateManager implements ICertificateManager {
  // File-based certificate paths for non-Windows systems
  private systemCertPaths: Record<string, string[]> = {
    darwin: [
      '/etc/ssl/cert.pem',
      '/usr/local/etc/openssl/cert.pem',
      '/opt/homebrew/etc/ca-certificates/cert.pem',
    ],
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
      return this.cachedCertificates;
    }

    const certs: Buffer[] = [];
    
    // 1. Check NODE_EXTRA_CA_CERTS environment variable (highest priority)
    if (process.env.NODE_EXTRA_CA_CERTS) {
      logInfo(`[CertificateManager] Loading certificates from NODE_EXTRA_CA_CERTS: ${process.env.NODE_EXTRA_CA_CERTS}`);
      try {
        const cert = await this.loadCertFile(process.env.NODE_EXTRA_CA_CERTS);
        if (cert) certs.push(cert);
      } catch (error) {
        logError(`[CertificateManager] Failed to load NODE_EXTRA_CA_CERTS: ${error}`);
      }
    }
    
    // 2. Check RAUX-specific certificate configuration
    const rauxCertPath = this.getRauxCertPath();
    if (rauxCertPath && existsSync(rauxCertPath)) {
      logInfo(`[CertificateManager] Loading RAUX certificate from: ${rauxCertPath}`);
      try {
        const cert = await this.loadCertFile(rauxCertPath);
        if (cert) certs.push(cert);
      } catch (error) {
        logError(`[CertificateManager] Failed to load RAUX certificate: ${error}`);
      }
    }
    
    // 3. Try to load system certificates
    const systemCerts = await this.loadSystemCertificates();
    certs.push(...systemCerts);
    
    // If no certificates found and we're in a corporate environment, 
    // return empty array to let Node.js use its default certificate handling
    if (certs.length === 0) {
      logInfo('[CertificateManager] No custom certificates found, will use Node.js default certificate handling');
      // Return empty array - Node.js will use OS certificate store automatically
      return [];
    }
    
    // Cache the certificates
    this.cachedCertificates = certs;
    
    logInfo(`[CertificateManager] Loaded ${certs.length} certificate bundle(s)`);
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
    
    // For Windows, try to extract from Windows Certificate Store
    if (platform === 'win32') {
      try {
        const windowsCerts = await WindowsCertificateStore.getSystemCertificates();
        certs.push(...windowsCerts);
        if (windowsCerts.length > 0) {
          logInfo('[CertificateManager] Successfully loaded certificates from Windows Certificate Store');
          return certs;
        }
      } catch (error) {
        logError(`[CertificateManager] Failed to load Windows Certificate Store: ${error}`);
      }
      
      // Fallback: Check common locations where tools like Git for Windows install certificates
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