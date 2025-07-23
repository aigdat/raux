// Copyright (c) RAUX Contributors
// This software is released under the MIT License.

import fetch, { Response } from 'node-fetch';
import https from 'https';
import { IHttpClient, IHttpResponse, DownloadOptions, RequestOptions, HttpError } from './types';
import { CertificateManager } from './certificateManager';
import { Readable } from 'stream';
import { logInfo, logError } from '../logger';

export class SecureHttpClient implements IHttpClient {
  private certificateManager: CertificateManager;
  private httpsAgent: https.Agent | null = null;
  
  constructor() {
    this.certificateManager = new CertificateManager();
  }
  
  async download(url: string, options?: DownloadOptions): Promise<IHttpResponse> {
    logInfo(`[SecureHttpClient] Downloading from: ${url}`);
    
    try {
      const agent = await this.getHttpsAgent();
      
      const response = await fetch(url, {
        agent: url.startsWith('https') ? agent : undefined,
        headers: options?.headers,
        timeout: options?.timeout || 30000, // 30 seconds default
      });

      return this.mapResponse(response);
    } catch (error: any) {
      logError(`[SecureHttpClient] Download failed: ${error.message}`);
      
      // If it's an SSL error and we haven't already tried with system certs, retry
      if (this.isSSLError(error.message) && !this.httpsAgent) {
        logInfo('[SecureHttpClient] SSL error detected, retrying with system certificates');
        this.certificateManager.clearCache();
        this.httpsAgent = null;
        
        // One retry with fresh certificates
        try {
          const agent = await this.getHttpsAgent();
          const response = await fetch(url, {
            agent: url.startsWith('https') ? agent : undefined,
            headers: options?.headers,
            timeout: options?.timeout || 30000,
          });
          return this.mapResponse(response);
        } catch (retryError: any) {
          logError(`[SecureHttpClient] Retry failed: ${retryError.message}`);
          throw this.mapError(retryError);
        }
      }
      
      throw this.mapError(error);
    }
  }

  async get(url: string, options?: RequestOptions): Promise<IHttpResponse> {
    logInfo(`[SecureHttpClient] GET request to: ${url}`);
    
    try {
      const agent = await this.getHttpsAgent();
      
      const response = await fetch(url, {
        method: options?.method || 'GET',
        agent: url.startsWith('https') ? agent : undefined,
        headers: options?.headers,
        body: options?.body,
        timeout: options?.timeout || 30000,
      });

      return this.mapResponse(response);
    } catch (error: any) {
      logError(`[SecureHttpClient] Request failed: ${error.message}`);
      throw this.mapError(error);
    }
  }
  
  private async getHttpsAgent(): Promise<https.Agent> {
    if (this.httpsAgent) {
      return this.httpsAgent;
    }
    
    const certificates = await this.certificateManager.getCertificates();
    const rejectUnauthorized = this.certificateManager.shouldRejectUnauthorized();
    
    // Check if win-ca is loaded on Windows
    const winCaLoaded = process.platform === 'win32' && (global as any).__WIN_CA_LOADED__;
    
    // If win-ca is loaded and we have no custom certificates, get Windows certificates
    if (winCaLoaded && certificates.length === 0) {
      try {
        // Get certificates from win-ca explicitly
        const winCa = require('win-ca/fallback');
        const windowsCerts: Buffer[] = [];
        
        // Fetch all certificates from Windows store
        winCa.each((cert: string | Buffer) => {
          if (Buffer.isBuffer(cert)) {
            windowsCerts.push(cert);
          } else if (typeof cert === 'string') {
            windowsCerts.push(Buffer.from(cert));
          }
        });
        
        if (windowsCerts.length > 0) {
          logInfo(`[SecureHttpClient] Loaded ${windowsCerts.length} certificates from Windows Certificate Store`);
          certificates.push(...windowsCerts);
        } else {
          logInfo('[SecureHttpClient] No certificates found in Windows Certificate Store');
        }
      } catch (error) {
        logError(`[SecureHttpClient] Failed to load Windows certificates: ${error}`);
      }
    }
    
    // Otherwise, create a custom agent
    const agentOptions: https.AgentOptions = {
      rejectUnauthorized,
      // Additional options for better compatibility
      secureProtocol: 'TLSv1_2_method',
      maxCachedSessions: 0, // Disable session caching to avoid issues
    };
    
    // Only set ca if we have custom certificates
    if (certificates.length > 0) {
      agentOptions.ca = certificates;
      logInfo(`[SecureHttpClient] Using ${certificates.length} custom certificate bundle(s)`);
    } else {
      logInfo('[SecureHttpClient] No custom certificates configured');
    }
    
    this.httpsAgent = new https.Agent(agentOptions);
    
    logInfo(`[SecureHttpClient] Created HTTPS agent, rejectUnauthorized: ${rejectUnauthorized}`);
    
    return this.httpsAgent;
  }

  private mapResponse(response: Response): IHttpResponse {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body: response.body as unknown as Readable,
      ok: response.ok,
    };
  }

  private mapError(error: any): Error {
    const errorMessage = error.message || 'Unknown error';
    const isSSLError = this.isSSLError(errorMessage);
    
    // Provide more specific error messages for SSL issues
    if (isSSLError) {
      const enhancedMessage = this.enhanceSSLErrorMessage(errorMessage);
      return new HttpError(enhancedMessage, 0, true);
    }
    
    if (error.type === 'system' && error.code) {
      return new HttpError(`Network error: ${error.code} - ${errorMessage}`, 0, false);
    }
    
    return new HttpError(errorMessage, 0, false);
  }

  private isSSLError(message: string): boolean {
    const sslErrorPatterns = [
      'unable to get local issuer certificate',
      'self signed certificate',
      'certificate verify failed',
      'CERT_',
      'SSL_',
      'certificate',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'ERR_TLS_CERT_ALTNAME_INVALID',
    ];
    
    return sslErrorPatterns.some(pattern => 
      message.toLowerCase().includes(pattern.toLowerCase())
    );
  }
  
  private enhanceSSLErrorMessage(originalMessage: string): string {
    let enhanced = `SSL Certificate Error: ${originalMessage}\n\n`;
    
    if (originalMessage.includes('unable to get local issuer certificate')) {
      enhanced += 'This typically occurs in corporate environments with custom CA certificates.\n';
      enhanced += 'Solutions:\n';
      enhanced += '1. Set NODE_EXTRA_CA_CERTS environment variable to your CA bundle path\n';
      enhanced += '2. Place ca-bundle.crt in the RAUX installation directory\n';
      enhanced += '3. Contact your IT administrator for the proper certificates';
    } else if (originalMessage.includes('self signed certificate')) {
      enhanced += 'The server is using a self-signed certificate.\n';
      enhanced += 'For development only, you can set NODE_TLS_REJECT_UNAUTHORIZED=0\n';
      enhanced += 'WARNING: This disables certificate verification and is insecure.';
    }
    
    return enhanced;
  }
  
  // Clean up resources
  destroy(): void {
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
      this.httpsAgent = null;
    }
  }
}