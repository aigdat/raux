// Copyright (c) RAUX Contributors
// This software is released under the MIT License.

import fetch, { Response } from 'node-fetch';
import { IHttpClient, IHttpResponse, DownloadOptions, RequestOptions, HttpError } from './types';
import { Readable } from 'stream';
import { logInfo, logError } from '../logger';
import { HttpClientFactory } from './httpClientFactory';

export class StandardHttpClient implements IHttpClient {
  async download(url: string, options?: DownloadOptions): Promise<IHttpResponse> {
    logInfo(`[StandardHttpClient] Downloading from: ${url}`);
    
    try {
      const response = await fetch(url, {
        headers: options?.headers,
        timeout: options?.timeout || 30000, // 30 seconds default
      });

      return this.mapResponse(response);
    } catch (error: any) {
      logError(`[StandardHttpClient] Download failed: ${error.message}`);
      const mappedError = this.mapError(error);
      
      // If it's an SSL error, mark it and let the factory retry with SecureHttpClient
      if (mappedError instanceof HttpError && mappedError.isSSLError) {
        logInfo('[StandardHttpClient] SSL error detected, marking for retry with SecureHttpClient');
        HttpClientFactory.markSSLError();
        // Get the new client (which will be SecureHttpClient) and retry
        const secureClient = HttpClientFactory.getClient();
        logInfo('[StandardHttpClient] Retrying with SecureHttpClient...');
        return secureClient.download(url, options);
      }
      
      throw mappedError;
    }
  }

  async get(url: string, options?: RequestOptions): Promise<IHttpResponse> {
    logInfo(`[StandardHttpClient] GET request to: ${url}`);
    
    try {
      const response = await fetch(url, {
        method: options?.method || 'GET',
        headers: options?.headers,
        body: options?.body,
        timeout: options?.timeout || 30000,
      });

      return this.mapResponse(response);
    } catch (error: any) {
      logError(`[StandardHttpClient] Request failed: ${error.message}`);
      const mappedError = this.mapError(error);
      
      // If it's an SSL error, mark it and let the factory retry with SecureHttpClient
      if (mappedError instanceof HttpError && mappedError.isSSLError) {
        logInfo('[StandardHttpClient] SSL error detected, marking for retry with SecureHttpClient');
        HttpClientFactory.markSSLError();
        // Get the new client (which will be SecureHttpClient) and retry
        const secureClient = HttpClientFactory.getClient();
        logInfo('[StandardHttpClient] Retrying with SecureHttpClient...');
        return secureClient.get(url, options);
      }
      
      throw mappedError;
    }
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
    
    if (error.type === 'system' && error.code) {
      return new HttpError(`Network error: ${error.code} - ${errorMessage}`, 0, isSSLError);
    }
    
    return new HttpError(errorMessage, 0, isSSLError);
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
    ];
    
    return sslErrorPatterns.some(pattern => 
      message.toLowerCase().includes(pattern.toLowerCase())
    );
  }
}