import type Protocol from 'devtools-protocol/types/protocol.d';

export interface CDPClientOptions {
  host?: string;
  port: number;
  enableDomains?: string[];
}

export interface NetworkRequestInfo {
  requestId: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  type?: string;
  timestamp: number;
}

export interface NetworkResponseInfo {
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  mimeType: string;
  headers?: Record<string, string>;
  timestamp: number;
  body?: string;
}

export interface HARLogEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
  };
  response: {
    status: number;
    statusText: string;
    mimeType: string;
    text: string;
  };
}

export interface HAR {
  log: {
    version: string;
    creator: {
      name: string;
      version: string;
    };
    entries: HARLogEntry[];
  };
}

export type NetworkCallback = (response: any, request?: string) => void;

export type LoginState = 'login' | 'logout';

export interface LoginCallback {
  (state: LoginState): void;
}

export interface DisconnectCallback {
  (): void;
}

export interface CDPClientConfig {
  uid?: number;
  port: number;
  name?: string;
  disconnectCallback?: DisconnectCallback;
  loginCallback?: LoginCallback;
  watchUrls?: string[];
  loginUrlPatterns?: {
    loginUrl: string;
    targetPrefix: string;
  };
}

export interface NetworkListenerConfig {
  watchUrls?: string[];
  enableHAR?: boolean;
}

export interface RequestData {
  pureUrl: string;
  params: number;
}