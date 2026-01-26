import CDP from "chrome-remote-interface";
import type Protocol from "devtools-protocol/types/protocol.d";
import {toLocaleTimeString, wildcardToRegex} from "../utils/tools";
import {createLogger} from "../utils/logger";
import type {CachedRequest, NetworkRequestInfo} from "../types";

const logger = createLogger("NetworkListener");

export class NetworkListener {
    private readonly client: CDP.Client;
    private dumpMap: Map<string, NetworkRequestInfo>;
    private initialized: boolean;
    private enabled: boolean; // 控制监听器是否启用
    private requestCache: Map<string, CachedRequest[]>; // 缓存请求结果（按 urlPattern 存储）
    private watchedPatterns: string[]; // 要监听的 urlPattern 列表
    private watchedRegexes: RegExp[]; // 要监听的 url正则 列表
    private inFlightRequests: Set<string>; // 跟踪所有活跃的请求（用于 networkidle 检测）

    constructor(client: CDP.Client) {
        this.client = client;
        this.dumpMap = new Map();
        this.initialized = false;
        this.enabled = false; // 默认禁用
        this.requestCache = new Map();
        this.watchedPatterns = []; // 默认不监听任何 pattern
        this.watchedRegexes = []; // 默认不监听任何 url正则
        this.inFlightRequests = new Set(); // 初始化活跃请求跟踪
    }

    async init(): Promise<void> {
        if (this.initialized) {
            logger.debug("NetworkListener already initialized");
            return;
        }

        const {Network} = this.client;

        // 监听所有请求（用于 networkidle 检测）
        Network.requestWillBeSent(
            (event: Protocol.Network.RequestWillBeSentEvent) => {
                // 跟踪所有活跃请求
                this.inFlightRequests.add(event.requestId);
                logger.debug(`[NetworkListener] Request started, in-flight: ${this.inFlightRequests.size}, type: ${event.type}`);

                // 处理 XHR 请求（用于缓存）
                this.handleRequestWillBeSent(event);
            },
        );

        Network.loadingFinished(
            async (event: Protocol.Network.LoadingFinishedEvent) => {
                // 从活跃请求中移除
                this.inFlightRequests.delete(event.requestId);
                logger.debug(`[NetworkListener] Request finished, in-flight: ${this.inFlightRequests.size}`);

                // 处理 XHR 请求（用于缓存）
                await this.handleLoadingFinished(event);
            },
        );

        Network.loadingFailed((event: Protocol.Network.LoadingFailedEvent) => {
            // 从活跃请求中移除
            this.inFlightRequests.delete(event.requestId);
            logger.debug(`[NetworkListener] Request failed, in-flight: ${this.inFlightRequests.size}`);

            // 处理 XHR 请求
            this.handleLoadingFailed(event);
        });

        this.initialized = true;
        logger.debug("NetworkListener initialized");
    }

    private handleRequestWillBeSent(
        event: Protocol.Network.RequestWillBeSentEvent,
    ): void {
        // 如果监听器未启用，直接返回
        if (!this.enabled || this.watchedRegexes.length === 0) {
            return;
        }

        const {requestId, request, type, timestamp} = event;

        // 只记录 XHR 请求用于监控（Fetch 请求通常是页面资源，不需要记录）
        if (type !== "XHR") {
            return;
        }

        const {url, method} = request;
        if (!url) {
            return;
        }

        // 检查 URL 是否匹配 watchedRegexes 中的任何一个 pattern
        for (const regex of this.watchedRegexes) {
            if (regex.test(url)) {
                this.dumpMap.set(requestId, {
                    requestId,
                    url,
                    method,
                    headers: request.headers,
                    type,
                    timestamp,
                });

                logger.debug(`[${type}] → ${method} ${url}`);
                break;
            }
        }
    }

    private async handleLoadingFinished(
        event: Protocol.Network.LoadingFinishedEvent,
    ): Promise<void> {
        // 如果监听器未启用，直接返回
        if (!this.enabled || this.watchedRegexes.length === 0) {
            return;
        }

        const {requestId} = event;

        // 获取请求信息
        const req = this.dumpMap.get(requestId);
        if (!req || !req.url || req.type !== "XHR") {
            return;
        }

        const {Network} = this.client;

        try {
            // 缓存所有 XHR 请求（按 urlPattern 存储，每个 pattern 只保留最新的一条）
            // 检查 URL 是否匹配 watchedRegexes 中的任何一个 regex
            for (const [index, regex] of this.watchedRegexes.entries()) {
                const pattern = this.watchedPatterns[index]

                try {
                    if (!regex.test(req.url)) {
                        continue
                    }

                    // 获取请求体（对非 GET 请求获取，如 POST、PUT、PATCH 等）
                    let requestBody;
                    if (req.method !== "GET") {
                        try {
                            const requestPostData = await Network.getRequestPostData({
                                requestId,
                            });
                            requestBody = requestPostData.postData;
                        } catch (requestError) {
                            // 静默处理：某些 POST 请求可能没有请求体数据，这是正常情况
                        }
                    }

                    // 获取响应体
                    let responseBody;
                    try {
                        responseBody = await Network.getResponseBody({requestId});
                    } catch (responseError) {
                        // 某些响应可能无法获取响应体（如二进制文件），记录但不中断处理
                        logger.debug(
                            `Could not get response body for ${requestId}:`,
                            responseError,
                        );
                        return;
                    }

                    // 解析响应
                    let parsedResponse = responseBody.body;
                    try {
                        if (responseBody.body && responseBody.body.trim()) {
                            parsedResponse = JSON.parse(responseBody.body);
                        }
                    } catch (parseError) {
                        logger.debug(
                            `Could not parse response as JSON for ${req.url}, using raw response:`,
                            parseError,
                        );
                    }

                    const timestamp = Date.now()

                    // 匹配成功，使用 pattern 作为缓存键
                    this.requestCache.set(pattern, [
                        {
                            url: req.url,
                            timestamp: timestamp,
                            response: parsedResponse,
                            request: requestBody,
                        },
                    ]);

                    logger.debug(
                        `[NetworkListener] Cached XHR response for pattern ${pattern}, URL: ${req.url}, timestamp: ${toLocaleTimeString(timestamp)}`,
                    );
                    break; // 只使用第一个匹配的 pattern
                } catch (error) {
                    logger.debug(`[NetworkListener] Invalid pattern: ${pattern}`, error);
                }
            }
        } catch (error: any) {
            logger.error(`Loading finished error: ${error}`, {url: req?.url});
        } finally {
            // 清理
            this.dumpMap.delete(requestId);
        }
    }

    private handleLoadingFailed(
        event: Protocol.Network.LoadingFailedEvent,
    ): void {
        // 如果监听器未启用，直接返回
        if (!this.enabled || this.watchedRegexes.length === 0) {
            return;
        }

        const {requestId, errorText, type} = event;

        // 只记录 XHR 请求的失败
        if (type !== "XHR") {
            return;
        }

        // 获取请求信息
        const req = this.dumpMap.get(requestId);
        if (!req || !req.url) {
            return;
        }

        logger.warn(`Network request failed: ${errorText}`, {requestId});
        this.dumpMap.delete(requestId);
    }

    // 获取指定 pattern 的缓存请求
    getCachedRequests(pattern: string): CachedRequest[] {
        return this.requestCache.get(pattern) || [];
    }

    // 清除指定 pattern 的缓存
    clearCache(pattern?: string): void {
        if (pattern) {
            this.requestCache.delete(pattern);
            logger.debug(`[NetworkListener] Cleared cache for pattern: ${pattern}`);
        } else {
            this.requestCache.clear();
            logger.debug(`[NetworkListener] Cleared all cache`);
        }
    }

    // 获取缓存统计信息
    getCacheStats(): Map<string, number> {
        const stats = new Map<string, number>();
        for (const [pattern, requests] of this.requestCache.entries()) {
            stats.set(pattern, requests.length);
        }
        return stats;
    }

    // 启用网络监听，可以指定多个 urlPattern
    enable(urlPatterns: string[] = []): void {
        this.enabled = true;
        this.watchedPatterns = urlPatterns;
        this.watchedRegexes = urlPatterns.map(pattern => wildcardToRegex(pattern));
        logger.debug(`[NetworkListener] NetworkListener enabled with patterns: ${urlPatterns.join(", ")}`);
    }

    // 禁用网络监听
    disable(): void {
        this.enabled = false;
        logger.debug("[NetworkListener] NetworkListener disabled");
    }

    // 检查监听器是否启用
    isEnabled(): boolean {
        return this.enabled;
    }

    // 等待网络空闲
    // idleTimeout: 空闲超时时间（毫秒），默认 500ms
    // maxInFlight: 最大允许的活跃请求数，默认 2
    // timeout: 总超时时间（毫秒），默认 10000ms
    async waitForNetworkIdle(
        idleTimeout: number = 500,
        maxInFlight: number = 2,
        timeout: number = 10000,
    ): Promise<void> {
        const startTime = Date.now();
        let lastBusyTime = Date.now();
        let resolved = false;

        logger.info(
            `[NetworkListener] waitForNetworkIdle: starting, idleTimeout=${idleTimeout}ms, maxInFlight=${maxInFlight}, timeout=${timeout}ms`,
        );

        return new Promise((resolve, reject) => {
            const checkIdle = () => {
                if (resolved) return;

                // 检查总超时
                if (Date.now() - startTime > timeout) {
                    resolved = true;
                    logger.warn(
                        `[NetworkListener] waitForNetworkIdle: timeout, in-flight requests: ${this.inFlightRequests.size}`,
                    );
                    resolve(); // 超时时也 resolve，避免阻塞
                    return;
                }

                // 检查是否达到空闲状态
                if (this.inFlightRequests.size <= maxInFlight) {
                    if (Date.now() - lastBusyTime >= idleTimeout) {
                        resolved = true;
                        logger.info(
                            `[NetworkListener] waitForNetworkIdle: achieved, in-flight requests: ${this.inFlightRequests.size}`,
                        );
                        resolve();
                        return;
                    }
                } else {
                    lastBusyTime = Date.now();
                }

                // 继续检查
                setTimeout(checkIdle, 100);
            };

            // 开始检查
            checkIdle();
        });
    }
}
