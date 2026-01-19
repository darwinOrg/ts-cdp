import CDP from "chrome-remote-interface";
import type Protocol from "devtools-protocol/types/protocol.d";
import { getPureUrl } from "../utils/url";
import { createLogger } from "../utils/logger";
import type {
  NetworkCallback,
  NetworkListenerConfig,
  RequestData,
  HAR,
  NetworkRequestInfo,
  CachedRequest,
} from "../types";

const logger = createLogger("NetworkListener");

export class NetworkListener {
  private client: CDP.Client;
  private callbacks: Map<string, NetworkCallback>;
  private requestIds: Map<string, RequestData>;
  private dumpMap: Map<string, NetworkRequestInfo>;
  private har: HAR;
  private config: NetworkListenerConfig;
  private initialized: boolean;
  private enabled: boolean; // 控制监听器是否启用
  private requestCache: Map<string, CachedRequest[]>; // 缓存请求结果
  private maxCacheSize: number; // 最大缓存条数
  private lastTimestamps: Map<string, number>; // 记录每个 pattern 的最后时间戳

  constructor(client: CDP.Client, config: NetworkListenerConfig = {}) {
    this.client = client;
    this.callbacks = new Map();
    this.requestIds = new Map();
    this.dumpMap = new Map();
    this.initialized = false;
    this.enabled = true; // 默认启用
    this.requestCache = new Map();
    this.maxCacheSize = config.maxCacheSize || 100; // 默认缓存 100 条
    this.lastTimestamps = new Map();
    this.har = {
      log: {
        version: "1.2",
        creator: { name: "ts-cdp", version: "1.0.0" },
        entries: [],
      },
    };
    this.config = {
      watchUrls: config.watchUrls || [],
      enableHAR: config.enableHAR !== false,
      maxCacheSize: config.maxCacheSize || 100,
    };
  }

  async init(): Promise<void> {
    if (this.initialized) {
      logger.debug("NetworkListener already initialized");
      return;
    }

    const { Network } = this.client;

    Network.requestWillBeSent(
      (event: Protocol.Network.RequestWillBeSentEvent) => {
        this.handleRequestWillBeSent(event);
      },
    );

    Network.responseReceived(async (params) => {
      await this.handleResponseReceived(params);
    });

    Network.loadingFinished(
      async (event: Protocol.Network.LoadingFinishedEvent) => {
        await this.handleLoadingFinished(event);
      },
    );

    Network.loadingFailed((event: Protocol.Network.LoadingFailedEvent) => {
      this.handleLoadingFailed(event);
    });

    this.initialized = true;
    logger.debug("NetworkListener initialized");
  }

  private handleRequestWillBeSent(
    event: Protocol.Network.RequestWillBeSentEvent,
  ): void {
    // 如果监听器未启用，直接返回
    if (!this.enabled) {
      return;
    }

    const { requestId, request, type, timestamp } = event;
    const { url, method } = request;
    const pureUrl = getPureUrl(url);

    // 检查是否是需要拦截的URL（支持正则表达式）
    for (const [pattern, callback] of this.callbacks) {
      if (typeof callback === "function" && method !== "OPTIONS") {
        // 检查是否匹配（支持正则表达式）
        const regex = new RegExp(pattern);
        const isMatch = regex.test(url);
        logger.debug(
          `[NetworkListener] Checking URL ${url} against pattern ${pattern}: ${isMatch}`,
        );
        if (isMatch) {
          // 检查时间戳：请求时间必须大于上次记录的时间戳
          const lastTimestamp = this.lastTimestamps.get(pattern) || 0;
          const requestTime = timestamp * 1000; // 转换为毫秒

          logger.debug(
            `[NetworkListener] Request time: ${requestTime}, Last timestamp: ${lastTimestamp}, Time difference: ${requestTime - lastTimestamp}ms`,
          );

          if (requestTime > lastTimestamp) {
            this.requestIds.set(requestId, {
              pattern,
              params: callback.length,
            });
            logger.debug(
              `[NetworkListener] Match found! Added requestId ${requestId} for pattern ${pattern}`,
            );
            break;
          } else {
            logger.debug(
              `[NetworkListener] Request time ${requestTime} is not after last timestamp ${lastTimestamp}, skipping`,
            );
          }
        }
      }
    }

    // 只记录 XHR 请求用于监控（Fetch 请求通常是页面资源，不需要记录）
    if (type === "XHR") {
      this.dumpMap.set(requestId, {
        requestId,
        url,
        method,
        headers: request.headers,
        type,
        timestamp,
      });
      logger.debug(`[${type}] → ${method} ${url}`);
    }
  }

  private async handleResponseReceived(params: any): Promise<void> {
    // 如果监听器未启用，直接返回
    if (!this.enabled) {
      return;
    }

    const { requestId, response, timestamp, type } = params;

    // 只处理 XHR 请求，不处理 Fetch 请求（Fetch 请求通常是页面资源）
    if (type !== "XHR") {
      return;
    }

    try {
      // 处理 watchUrls
      if (this.config.watchUrls && this.config.watchUrls.length > 0) {
        const shouldWatch = this.config.watchUrls.some((watchUrl) =>
          response.url.includes(watchUrl),
        );

        if (shouldWatch) {
          const req = this.dumpMap.get(requestId);

          try {
            const { Network } = this.client;
            const res = await Network.getResponseBody({ requestId });

            if (this.config.enableHAR) {
              this.har.log.entries.push({
                startedDateTime: new Date(
                  (req?.timestamp || timestamp) * 1000,
                ).toISOString(),
                time: (timestamp - (req?.timestamp || timestamp)) * 1000,
                request: {
                  method: req?.method || "GET",
                  url: req?.url || response.url,
                  headers: req?.headers,
                },
                response: {
                  status: response.status,
                  statusText: response.statusText,
                  mimeType: response.mimeType,
                  text: res.body,
                },
              });
            }

            logger.debug(`[watchUrls] ← ${response.status} ${response.url}`);
          } catch (getBodyError) {
            logger.debug(
              `Could not get response body for HAR logging for ${requestId}:`,
              getBodyError,
            );
          }
        }
      }
    } catch (error) {
      logger.error(`Response received error: ${error}`);
    }

    // 不要在这里删除 dumpMap，因为 handleLoadingFinished 还需要它
    // this.dumpMap.delete(requestId);
  }

  private async handleLoadingFinished(
    event: Protocol.Network.LoadingFinishedEvent,
  ): Promise<void> {
    // 如果监听器未启用，直接返回
    if (!this.enabled) {
      return;
    }

    const { requestId } = event;

    // 获取请求信息
    const req = this.dumpMap.get(requestId);
    if (!req || req.type !== "XHR") {
      return;
    }

    const { Network } = this.client;

    try {
      // 获取请求体（对非 GET 请求获取，如 POST、PUT、PATCH 等）
      let requestBody;
      if (req.method !== "GET") {
        try {
          const requestPostData = await Network.getRequestPostData({
            requestId,
          });
          requestBody = requestPostData.postData;
        } catch (requestError) {
          logger.debug(
            `Could not get request body for ${req.method} request ${requestId}:`,
            requestError,
          );
        }
      }

      // 获取响应体
      let responseBody;
      try {
        responseBody = await Network.getResponseBody({ requestId });
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

      // 缓存所有 XHR 请求（按 URL 存储）
      if (req.url) {
        const cachedRequests = this.requestCache.get(req.url) || [];
        cachedRequests.push({
          url: req.url,
          timestamp: Date.now(),
          response: parsedResponse,
          request: requestBody,
        });

        // 限制缓存大小（LIFO：移除最旧的）
        if (cachedRequests.length > this.maxCacheSize) {
          cachedRequests.shift();
          logger.debug(
            `[NetworkListener] Cache size exceeded for URL ${req.url}, removed oldest entry`,
          );
        }

        this.requestCache.set(req.url, cachedRequests);

        logger.debug(
          `[NetworkListener] Cached XHR response for ${req.url}, cache size: ${cachedRequests.length}`,
        );
      }

      // 如果有匹配的 callback，调用 callback
      if (this.requestIds.has(requestId)) {
        const { pattern } = this.requestIds.get(requestId)!;
        const callback = this.callbacks.get(pattern);

        if (typeof callback === "function") {
          callback(parsedResponse, requestBody);
        }

        // 更新最后时间戳
        this.lastTimestamps.set(pattern, Date.now());
      }
    } catch (error: any) {
      logger.error(`Loading finished error: ${error}`, { url: req?.url });
    } finally {
      // 清理
      this.dumpMap.delete(requestId);
      if (this.requestIds.has(requestId)) {
        this.requestIds.delete(requestId);
      }
    }
  }

  private handleLoadingFailed(
    event: Protocol.Network.LoadingFailedEvent,
  ): void {
    const { requestId, errorText, type } = event;

    // 只记录 XHR 请求的失败
    if (type === "XHR") {
      logger.warn(`Network request failed: ${errorText}`, { requestId });
    }

    this.dumpMap.delete(requestId);
    this.requestIds.delete(requestId);
  }

  addCallback(pattern: string, callback: NetworkCallback): void {
    this.callbacks.set(pattern, callback);
    logger.debug(`Added callback for: ${pattern}`);
  }

  removeCallback(pattern: string): void {
    this.callbacks.delete(pattern);
    logger.debug(`Removed callback for: ${pattern}`);
  }

  getHAR(): HAR {
    return this.har;
  }

  clearHAR(): void {
    this.har.log.entries = [];
  }

  // 获取指定 pattern 的缓存请求
  getCachedRequests(pattern: string): CachedRequest[] {
    return this.requestCache.get(pattern) || [];
  }

  // 获取最新的缓存请求
  getLatestCachedRequest(pattern: string): CachedRequest | undefined {
    const cachedRequests = this.getCachedRequests(pattern);
    return cachedRequests.length > 0 ? cachedRequests[cachedRequests.length - 1] : undefined;
  }

  // 清除指定 pattern 的缓存
  clearCache(pattern?: string): void {
    if (pattern) {
      this.requestCache.delete(pattern);
      this.lastTimestamps.delete(pattern);
      logger.debug(`[NetworkListener] Cleared cache for pattern: ${pattern}`);
    } else {
      this.requestCache.clear();
      this.lastTimestamps.clear();
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

  // 启用网络监听
  enable(): void {
    this.enabled = true;
    logger.debug("[NetworkListener] NetworkListener enabled");
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

  clearCallbacks(): void {
    this.callbacks.clear();
  }

  clear(): void {
    this.callbacks.clear();
    this.requestIds.clear();
    this.dumpMap.clear();
  }
}
