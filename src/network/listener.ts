import CDP from 'chrome-remote-interface';
import type Protocol from 'devtools-protocol/types/protocol.d';
import { getPureUrl } from '../utils/url';
import { createLogger } from '../utils/logger';
import type {
  NetworkCallback,
  NetworkListenerConfig,
  RequestData,
  HARLogEntry,
  HAR,
  NetworkRequestInfo,
  NetworkResponseInfo
} from '../types';

const logger = createLogger('NetworkListener');

export class NetworkListener {
  private client: CDP.Client;
  private callbacks: Map<string, NetworkCallback>;
  private requestIds: Map<string, RequestData>;
  private dumpMap: Map<string, NetworkRequestInfo>;
  private har: HAR;
  private config: NetworkListenerConfig;

  constructor(client: CDP.Client, config: NetworkListenerConfig = {}) {
    this.client = client;
    this.callbacks = new Map();
    this.requestIds = new Map();
    this.dumpMap = new Map();
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
  }

  private handleRequestWillBeSent(event: Protocol.Network.RequestWillBeSentEvent): void {
    const { requestId, request, type, timestamp } = event;
    const { url, method } = request;
    const pureUrl = getPureUrl(url);
    
    const callback = this.callbacks.get(pureUrl);
    if (typeof callback === 'function' && method !== 'OPTIONS') {
      this.requestIds.set(requestId, {
        pureUrl,
        params: callback.length
      });
    }

    if (type === 'Fetch' || type === 'XHR') {
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
    
    if (type !== 'Fetch' && type !== 'XHR') return;

    try {
      if (this.config.watchUrls && this.config.watchUrls.includes(response.url)) {
        const req = this.dumpMap.get(requestId);
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
        
        logger.debug(`[response] ← ${response.status} ${response.url}`);
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
        const requestBody = params === 2 
          ? await Network.getRequestPostData({ requestId }) 
          : undefined;
        const responseBody = await Network.getResponseBody({ requestId });
        const callback = this.callbacks.get(pureUrl);
        
        if (typeof callback === 'function') {
          callback(JSON.parse(responseBody.body), requestBody?.postData);
        }
        
        this.requestIds.delete(requestId);
      } catch (error: any) {
        logger.error(`Loading finished error: ${error}`, { url: pureUrl });
      }
    }
  }

  private handleLoadingFailed(event: Protocol.Network.LoadingFailedEvent): void {
    const { requestId, errorText, type } = event;
    
    if (type === 'Fetch' || type === 'XHR') {
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
    this.requestIds.clear();
  }
}