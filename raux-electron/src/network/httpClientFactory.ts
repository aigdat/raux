// Copyright (c) RAUX Contributors
// This software is released under the MIT License.

import { IHttpClient } from './types';
import { StandardHttpClient } from './standardHttpClient';
import { SecureHttpClient } from './secureHttpClient';
import { logInfo } from '../logger';
import { existsSync } from 'fs';
import { join } from 'path';
import { getAppInstallDir } from '../envUtils';

export class HttpClientFactory {
  private static client: IHttpClient | null = null;
  private static sslErrorDetected: boolean = false;
  
  static getClient(): IHttpClient {
    if (!this.client) {
      this.client = this.createClient();
    }
    return this.client;
  }
  
  static resetClient(): void {
    if (this.client && 'destroy' in this.client) {
      (this.client as SecureHttpClient).destroy();
    }
    this.client = null;
  }
  
  static markSSLError(): void {
    logInfo('[HttpClientFactory] SSL error detected, switching to SecureHttpClient');
    this.sslErrorDetected = true;
    this.resetClient();
  }
  
  private static createClient(): IHttpClient {
    // Check if we should use secure client
    if (this.shouldUseSecureClient()) {
      logInfo('[HttpClientFactory] Using SecureHttpClient with SSL certificate handling');
      return new SecureHttpClient();
    }
    
    logInfo('[HttpClientFactory] Using StandardHttpClient');
    return new StandardHttpClient();
  }
  
  private static shouldUseSecureClient(): boolean {
    // Use secure client if:
    // 1. SSL error was previously detected
    if (this.sslErrorDetected) {
      logInfo('[HttpClientFactory] Using SecureHttpClient due to previous SSL error');
      return true;
    }
    
    // 2. Environment variable is set for extra certificates
    if (process.env.NODE_EXTRA_CA_CERTS) {
      logInfo('[HttpClientFactory] Using SecureHttpClient due to NODE_EXTRA_CA_CERTS');
      return true;
    }
    
    // 3. RAUX-specific secure client flag
    if (process.env.RAUX_USE_SECURE_CLIENT === '1' || process.env.RAUX_USE_SECURE_CLIENT === 'true') {
      logInfo('[HttpClientFactory] Using SecureHttpClient due to RAUX_USE_SECURE_CLIENT');
      return true;
    }
    
    // 4. Custom certificates are configured
    if (this.hasCustomCertificates()) {
      logInfo('[HttpClientFactory] Using SecureHttpClient due to custom certificates');
      return true;
    }
    
    // 5. Check if we're in a known corporate environment (heuristic)
    if (this.isLikelyCorporateEnvironment()) {
      logInfo('[HttpClientFactory] Using SecureHttpClient due to corporate environment detection');
      return true;
    }
    
    return false;
  }
  
  private static hasCustomCertificates(): boolean {
    // Check for RAUX certificate bundle
    const rauxCertPath = process.env.RAUX_CA_BUNDLE;
    if (rauxCertPath && existsSync(rauxCertPath)) {
      return true;
    }
    
    // Check in app install directory
    const appCertPath = join(getAppInstallDir(), 'certificates', 'ca-bundle.crt');
    if (existsSync(appCertPath)) {
      return true;
    }
    
    // Check in current directory
    const cwdCertPath = join(process.cwd(), 'ca-bundle.crt');
    if (existsSync(cwdCertPath)) {
      return true;
    }
    
    return false;
  }
  
  private static hasPreviousSSLErrors(): boolean {
    // This could be enhanced to check a persistent store for previous SSL errors
    return this.sslErrorDetected;
  }
  
  private static isLikelyCorporateEnvironment(): boolean {
    // Heuristics to detect corporate environment
    
    // Check for common corporate proxy environment variables
    const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
    const hasProxy = proxyVars.some(varName => !!process.env[varName]);
    
    if (hasProxy) {
      logInfo('[HttpClientFactory] Corporate proxy detected');
      return true;
    }
    
    // Check for common corporate domain patterns in environment
    const computerName = process.env.COMPUTERNAME || process.env.HOSTNAME || '';
    const userDomain = process.env.USERDOMAIN || '';
    
    // Common corporate patterns
    const corpPatterns = ['.corp', '.internal', '.local', 'WORKGROUP'];
    const isCorpDomain = corpPatterns.some(pattern => 
      computerName.includes(pattern) || userDomain.includes(pattern)
    );
    
    if (isCorpDomain) {
      logInfo('[HttpClientFactory] Corporate domain pattern detected');
      return true;
    }
    
    // Check for common corporate security software paths (Windows)
    if (process.platform === 'win32') {
      const corpSecurityPaths = [
        'C:\\Program Files\\Symantec',
        'C:\\Program Files\\McAfee',
        'C:\\Program Files\\Trend Micro',
        'C:\\Program Files (x86)\\Sophos',
      ];
      
      const hasCorpSecurity = corpSecurityPaths.some(path => existsSync(path));
      if (hasCorpSecurity) {
        logInfo('[HttpClientFactory] Corporate security software detected');
        return true;
      }
    }
    
    return false;
  }
}