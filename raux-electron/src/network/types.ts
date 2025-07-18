// Copyright (c) RAUX Contributors
// This software is released under the MIT License.

import { Readable } from 'stream';

export interface DownloadOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

export interface RequestOptions extends DownloadOptions {
  method?: string;
  body?: string | Buffer;
}

export interface IHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Readable;
  ok: boolean;
}

export interface IHttpClient {
  download(url: string, options?: DownloadOptions): Promise<IHttpResponse>;
  get(url: string, options?: RequestOptions): Promise<IHttpResponse>;
}

export interface ICertificateManager {
  getCertificates(): Promise<Buffer[]>;
  shouldRejectUnauthorized(): boolean;
  getRauxCertPath(): string | null;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly isSSLError: boolean = false
  ) {
    super(message);
    this.name = 'HttpError';
  }
}