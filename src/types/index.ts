export interface CDPClientOptions {
    host?: string;
    port: number;
    enableDomains?: string[];
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

export interface NetworkRequestInfo {
    requestId: string;
    url: string;
    method: string;
    headers?: Record<string, string>;
    type?: string;
    timestamp: number;
}

export type LoginState = "login" | "logout";

export interface LoginCallback {
    (state: LoginState): void;
}

export interface DisconnectCallback {
    (): void;
}

export interface CachedRequest {
    url: string;
    timestamp: number;
    response: any;
    request?: string;
}
