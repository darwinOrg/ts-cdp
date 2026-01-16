import CDP from 'chrome-remote-interface';
import type Protocol from 'devtools-protocol/types/protocol.d';
import { getPureUrl } from '../utils/url';
import { createLogger } from '../utils/logger';
import type {
  NetworkCallback,
  NetworkListenerConfig,
  RequestData,
  HAR,
  NetworkRequestInfo,
} from '../types';

const logger = createLogger('NetworkListener');

export class NetworkListener {
  private client: CDP.Client;
  private callbacks: Map<string, NetworkCallback>;
  private requestIds: Map<string, RequestData>;
  private dumpMap: Map<string, NetworkRequestInfo>;
  private har: HAR;
  private config: NetworkListenerConfig;
  private responseReceivedCallbacks: Map<string, (body: string) => void>;
  private initialized: boolean;

  constructor(client: CDP.Client, config: NetworkListenerConfig = {}) {
    this.client = client;
    this.callbacks = new Map();
    this.requestIds = new Map();
    this.dumpMap = new Map();
    this.responseReceivedCallbacks = new Map();
    this.initialized = false;
    this.har = {
      log: {
        version: '1.2',
        creator: { name: 'ts-cdp', version: '1.0.0' },
        entries: []
      }
    };
    this.config = {
      watchUrls: config.watchUrls || [],
      enableHAR: config.enableHAR !== false
    };
  }

  async init(): Promise<void> {
    if (this.initialized) {
      logger.debug('NetworkListener already initialized');
      return;
    }

    const { Network } = this.client;
    
    Network.requestWillBeSent((event: Protocol.Network.RequestWillBeSentEvent) => {
      this.handleRequestWillBeSent(event);
    });

    Network.responseReceived(async (params) => {
      await this.handleResponseReceived(params);
    });

    Network.loadingFinished(async (event: Protocol.Network.LoadingFinishedEvent) => {
      await this.handleLoadingFinished(event);
    });

    Network.loadingFailed((event: Protocol.Network.LoadingFailedEvent) => {
      this.handleLoadingFailed(event);
    });

    this.initialized = true;
    logger.debug('NetworkListener initialized');
  }

  private handleRequestWillBeSent(event: Protocol.Network.RequestWillBeSentEvent): void {
    const { requestId, request, type, timestamp } = event;
    const { url, method } = request;
    const pureUrl = getPureUrl(url);

    // 检查是否是需要拦截的URL
    const callback = this.callbacks.get(pureUrl);
    if (typeof callback === 'function' && method !== 'OPTIONS') {
      // 只为非OPTIONS请求设置拦截
      this.requestIds.set(requestId, {
        pureUrl,
        params: callback.length
      });
    }

    // 只记录 XHR 请求用于监控（Fetch 请求通常是页面资源，不需要记录）
    if (type === 'XHR') {
      this.dumpMap.set(requestId, {
        requestId,
        url,
        method,
        headers: request.headers,
        type,
        timestamp
      });
      logger.debug(`[${type}] → ${method} ${url}`);
    }
  }

  private async handleResponseReceived(params: any): Promise<void> {
    const { requestId, response, timestamp, type } = params;

    // 只处理 XHR 请求，不处理 Fetch 请求（Fetch 请求通常是页面资源）
    if (type !== 'XHR') {
      return;
    }

    try {
      // 检查是否有 responseReceived 回调
      if (this.responseReceivedCallbacks.size > 0) {
        for (const [pattern, callback] of this.responseReceivedCallbacks) {
          const regex = new RegExp(pattern);
          if (regex.test(response.url)) {
            try {
              const { Network } = this.client;
              const res = await Network.getResponseBody({ requestId });
              callback(res.body);
              this.responseReceivedCallbacks.delete(pattern);
              logger.debug(`[responseReceivedCallback] ← ${response.status} ${response.url}`);
              break;
            } catch (getBodyError) {
              logger.debug(`Could not get response body for ${requestId} in responseReceived callback:`, getBodyError);
            }
          }
        }
      }

      // 处理 watchUrls
      if (this.config.watchUrls && this.config.watchUrls.length > 0) {
        const shouldWatch = this.config.watchUrls.some(watchUrl => response.url.includes(watchUrl));
        
        if (shouldWatch) {
          const req = this.dumpMap.get(requestId);

          try {
            const { Network } = this.client;
            const res = await Network.getResponseBody({ requestId });

            if (this.config.enableHAR) {
              this.har.log.entries.push({
                startedDateTime: new Date((req?.timestamp || timestamp) * 1000).toISOString(),
                time: (timestamp - (req?.timestamp || timestamp)) * 1000,
                request: {
                  method: req?.method || 'GET',
                  url: req?.url || response.url,
                  headers: req?.headers
                },
                response: {
                  status: response.status,
                  statusText: response.statusText,
                  mimeType: response.mimeType,
                  text: res.body
                }
              });
            }

            logger.debug(`[watchUrls] ← ${response.status} ${response.url}`);
          } catch (getBodyError) {
            logger.debug(`Could not get response body for HAR logging for ${requestId}:`, getBodyError);
          }
        }
      }
    } catch (error) {
      logger.error(`Response received error: ${error}`);
    }

    this.dumpMap.delete(requestId);
  }

  private async handleLoadingFinished(event: Protocol.Network.LoadingFinishedEvent): Promise<void> {
    const { requestId } = event;

    if (this.requestIds.has(requestId)) {
      const { pureUrl, params } = this.requestIds.get(requestId)!;
      const { Network } = this.client;

      try {
        // 获取请求体
        let requestBody;
        if (params === 2) {
          try {
            const requestPostData = await Network.getRequestPostData({ requestId });
            requestBody = requestPostData.postData;
          } catch (requestError) {
            // 某些请求可能无法获取请求体，记录但不中断处理
            logger.debug(`Could not get request body for ${requestId}:`, requestError);
          }
        }

        // 获取响应体
        let responseBody;
        try {
          responseBody = await Network.getResponseBody({ requestId });
        } catch (responseError) {
          // 某些响应可能无法获取响应体（如二进制文件），记录但不中断处理
          logger.debug(`Could not get response body for ${requestId}:`, responseError);
          this.requestIds.delete(requestId);
          return;
        }

        const callback = this.callbacks.get(pureUrl);

        if (typeof callback === 'function') {
          let parsedResponse = responseBody.body;

          // 尝试解析JSON，如果失败则使用原始字符串
          try {
            if (responseBody.body && responseBody.body.trim()) {
              parsedResponse = JSON.parse(responseBody.body);
            }
          } catch (parseError) {
            logger.debug(`Could not parse response as JSON for ${pureUrl}, using raw response:`, parseError);
            // 不中断处理，使用原始响应体
          }

          callback(parsedResponse, requestBody);
        }

        this.requestIds.delete(requestId);
      } catch (error: any) {
        logger.error(`Loading finished error: ${error}`, { url: pureUrl });
        // 确保即使出现错误也要删除requestId，避免内存泄漏
        this.requestIds.delete(requestId);
      }
    }
  }

  private handleLoadingFailed(event: Protocol.Network.LoadingFailedEvent): void {
    const { requestId, errorText, type } = event;

    // 只记录 XHR 请求的失败
    if (type === 'XHR') {
      logger.warn(`Network request failed: ${errorText}`, { requestId });
    }

    this.dumpMap.delete(requestId);
    this.requestIds.delete(requestId);
  }

  addCallback(url: string, callback: NetworkCallback): void {
    const pureUrl = getPureUrl(url);
    this.callbacks.set(pureUrl, callback);
    logger.debug(`Added callback for: ${pureUrl}`);
  }

  removeCallback(url: string): void {
    const pureUrl = getPureUrl(url);
    this.callbacks.delete(pureUrl);
    logger.debug(`Removed callback for: ${pureUrl}`);
  }

  getHAR(): HAR {
    return this.har;
  }

  clearHAR(): void {
    this.har.log.entries = [];
  }

  clearCallbacks(): void {
    this.callbacks.clear();
    this.responseReceivedCallbacks.clear();
  }

  addResponseReceivedCallback(pattern: string, callback: (body: string) => void): void {
    this.responseReceivedCallbacks.set(pattern, callback);
    logger.debug(`Added responseReceived callback for: ${pattern}`);
  }

  removeResponseReceivedCallback(pattern: string): void {
    this.responseReceivedCallbacks.delete(pattern);
    logger.debug(`Removed responseReceived callback for: ${pattern}`);
  }

  clear(): void {
    this.callbacks.clear();
    this.responseReceivedCallbacks.clear();
    this.requestIds.clear();
    this.dumpMap.clear();
  }
}