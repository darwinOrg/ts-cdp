import type { CDPClient } from './client';
import { createLogger } from '../utils/logger';
import { BrowserLocator } from './locator';

const logger = createLogger('BrowserPage');

export interface PageOptions {
  name?: string;
  timeout?: number;
}

export interface NavigateOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export class BrowserPage {
  private cdpClient: CDPClient;
  private client: any;
  private page: any;
  private runtime: any;
  private dom: any;
  private network: any;
  private options: PageOptions;
  private locked: boolean;
  private pendingPages: BrowserPage[];
  private responseListeners: Map<string, (response: any) => void>;
  private initialized: boolean;

  constructor(cdpClient: CDPClient, options: PageOptions = {}) {
    this.cdpClient = cdpClient;
    this.client = cdpClient.getClient();
    this.page = this.client?.Page;
    this.runtime = this.client?.Runtime;
    this.dom = this.client?.DOM;
    this.network = this.client?.Network;
    this.options = {
      timeout: 10000,
      ...options
    };
    this.locked = false;
    this.pendingPages = [];
    this.responseListeners = new Map();
    this.initialized = false;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      if (this.page) await this.page.enable();
      if (this.runtime) await this.runtime.enable();
      if (this.dom) await this.dom.enable();
      if (this.network) await this.network.enable();
      
      // 初始化全局响应监听器
      this.network.responseReceived((params: any) => {
        const { response, type, requestId } = params;
        
        // 只处理 XHR 请求
        if (type !== 'XHR') return;
        
        // 检查是否有等待的监听器
        for (const [pattern, callback] of this.responseListeners) {
          const regex = new RegExp(pattern);
          if (regex.test(response.url)) {
            // 获取响应体
            this.network.getResponseBody({ requestId })
              .then((result: any) => {
                callback(result.body);
              })
              .catch((error: any) => {
                logger.error('Failed to get response body:', error);
                callback({ error });
              });
            // 移除监听器
            this.responseListeners.delete(pattern);
            break;
          }
        }
      });
      
      this.initialized = true;
    } catch (error) {
      logger.error(`Failed to initialize page: ${error}`);
      throw error;
    }
  }

  async navigate(url: string, options: NavigateOptions = {}): Promise<void> {
    const opts = {
      waitUntil: 'load' as const,
      timeout: this.options.timeout,
      ...options
    };

    if (!this.page) throw new Error('Page not initialized');

    // 确保 Page 领域已启用
    try {
      await this.page.enable();
      logger.info(`Page.enable() called for ${this.options.name}`);
    } catch (error) {
      // 忽略错误，可能已经启用
      logger.info(`Page.enable() failed (may already be enabled): ${error}`);
    }

    logger.info(`Navigating to ${url} with waitUntil=${opts.waitUntil}`);
    await this.page.navigate({ url });
    logger.info(`Navigation to ${url} completed`);

    if (opts.waitUntil === 'domcontentloaded') {
      logger.info(`Waiting for DOMContentLoaded`);
      await this.waitForDOMContentLoaded(opts.timeout);
      logger.info(`DOMContentLoaded received`);
    } else if (opts.waitUntil === 'networkidle') {
      await this.waitForNetworkIdle(opts.timeout);
    } else {
      await this.waitForLoadState('load', opts.timeout);
    }
  }

  async reload(options: NavigateOptions = {}): Promise<void> {
    const opts = {
      waitUntil: 'load' as const,
      timeout: this.options.timeout,
      ...options
    };

    if (!this.page) throw new Error('Page not initialized');

    await this.page.reload();
    
    if (opts.waitUntil === 'domcontentloaded') {
      await this.waitForDOMContentLoaded(opts.timeout);
    } else if (opts.waitUntil === 'networkidle') {
      await this.waitForNetworkIdle(opts.timeout);
    } else {
      await this.waitForLoadState('load', opts.timeout);
    }
  }

  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle', timeout?: number): Promise<void> {
    const timeoutMs = timeout || this.options.timeout || 10000;
    const startTime = Date.now();

    logger.info(`waitForLoadState: waiting for ${state}, timeout=${timeoutMs}ms`);

    return new Promise((resolve, reject) => {
      const checkState = async () => {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Timeout waiting for ${state}`));
          return;
        }

        try {
          // 使用 Runtime.evaluate 检查 document.readyState
          const result = await this.runtime?.evaluate({
            expression: `document.readyState`
          });

          const readyState = result?.result?.value;
          logger.info(`waitForLoadState: state=${state}, readyState=${readyState}, waiting for ${state}`);

          if (state === 'domcontentloaded' && (readyState === 'interactive' || readyState === 'complete')) {
            logger.info(`waitForLoadState: resolving for domcontentloaded`);
            resolve();
          } else if (state === 'load' && readyState === 'complete') {
            logger.info(`waitForLoadState: resolving for load, readyState=${readyState}`);
            resolve();
          } else if (state === 'networkidle') {
            // 简化的 networkidle 检查
            resolve();
          } else {
            logger.info(`waitForLoadState: not ready yet, waiting...`);
            setTimeout(checkState, 100);
          }
        } catch (error) {
          logger.warn(`waitForLoadState: error checking readyState: ${error}`);
          setTimeout(checkState, 100);
        }
      };

      checkState();
    });
  }

  async waitForDOMContentLoaded(timeout?: number): Promise<void> {
    await this.waitForLoadState('domcontentloaded', timeout || this.options.timeout || 10000);
  }

  async waitForSelector(selector: string, options: { timeout?: number; state?: 'visible' | 'hidden' | 'attached' } = {}): Promise<void> {
    const timeoutMs = options.timeout || this.options.timeout || 10000;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkSelector = async () => {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Timeout waiting for selector: ${selector}`));
          return;
        }

        try {
          const result = await this.runtime?.evaluate({
            expression: `document.querySelector('${selector}') !== null`
          });

          const elementExists = result?.result?.value;
          logger.debug(`waitForSelector: selector=${selector}, elementExists=${elementExists}, result=${JSON.stringify(result)}`);

          if (elementExists) {
            if (options.state === 'visible') {
              const visible = await this.runtime?.evaluate({
                expression: `
                  (function() {
                    const el = document.querySelector('${selector}');
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
                  })()
                `
              });

              const isVisible = visible?.result?.value;
              logger.debug(`waitForSelector: selector=${selector}, isVisible=${isVisible}, visibleResult=${JSON.stringify(visible)}`);

              if (isVisible) {
                resolve();
              } else {
                setTimeout(checkSelector, 100);
              }
            } else {
              resolve();
            }
          } else {
            setTimeout(checkSelector, 100);
          }
        } catch (error) {
          logger.error(`waitForSelector: selector=${selector}, error=${error}`);
          setTimeout(checkSelector, 100);
        }
      };

      checkSelector();
    });
  }

  async waitForNetworkIdle(timeout?: number): Promise<void> {
    const timeoutMs = timeout || this.options.timeout || 10000;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      let lastNetworkActivity = Date.now();
      let networkListener: any;

      const checkIdle = () => {
        if (Date.now() - lastNetworkActivity > 500) {
          if (networkListener) {
            this.client?.Network?.removeAllListeners();
          }
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          if (networkListener) {
            this.client?.Network?.removeAllListeners();
          }
          reject(new Error('Timeout waiting for network idle'));
        } else {
          setTimeout(checkIdle, 100);
        }
      };

      networkListener = this.client?.Network?.requestWillBeSent(() => {
        lastNetworkActivity = Date.now();
      });

      checkIdle();
    });
  }

  async executeScript(script: string): Promise<any> {
    if (!this.runtime) throw new Error('Runtime not initialized');

    const result = await this.runtime.evaluate({
      expression: script,
      returnByValue: true
    });

    return result?.result?.value;
  }

  async evaluate<T>(script: string): Promise<T> {
    return this.executeScript(script) as Promise<T>;
  }

  locator(selector: string): BrowserLocator {
    return new BrowserLocator(this, selector);
  }

  async exists(selector: string): Promise<boolean> {
    try {
      const result = await this.runtime?.evaluate({
        expression: `document.querySelector('${selector}') !== null`
      });
      return result?.result?.value || false;
    } catch {
      return false;
    }
  }

  async click(selector: string): Promise<void> {
    const locator = this.locator(selector);
    if (await locator.exists()) {
      await locator.click();
    }
  }

  async getText(selector: string): Promise<string> {
    const locator = this.locator(selector);
    return locator.getText();
  }

  async getHTML(): Promise<string> {
    if (!this.runtime) throw new Error('Runtime not initialized');

    const result = await this.runtime.evaluate({
      expression: 'document.documentElement.outerHTML'
    });

    return result?.result?.value || '';
  }

  async screenshot(format: 'png' | 'jpeg' | 'webp' = 'png'): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');

    const result = await this.page.captureScreenshot({
      format
    });

    return result.data;
  }

  async getTitle(): Promise<string> {
    const result = await this.runtime?.evaluate({
      expression: 'document.title'
    });
    return result?.result?.value || '';
  }

  async getUrl(): Promise<string> {
    const result = await this.runtime?.evaluate({
      expression: 'window.location.href'
    });
    return result?.result?.value || '';
  }

  lock(): void {
    this.locked = true;
  }

  unlock(): void {
    this.locked = false;
  }

  isLocked(): boolean {
    return this.locked;
  }

  async close(): Promise<void> {
    await this.cdpClient.close();
  }

  // ========== Go Playwright 对应的功能 ==========

  // ExpectExtPage - 等待新页面打开
  async expectNewPage(callback: () => Promise<void>): Promise<BrowserPage> {
    return new Promise((resolve, reject) => {
      const targetUrlPattern = '**';
      let listenerActive = true;
      
      // 监听新页面
      const targetCreatedListener = (params: any) => {
        if (!listenerActive) return;
        
        if (params.type === 'page' && params.targetInfo.url !== 'about:blank') {
          listenerActive = false;
          
          // 创建新的 BrowserPage
          const newPage = new BrowserPage(this.cdpClient, { 
            name: `page-${Date.now()}` 
          });
          
          this.pendingPages.push(newPage);
          resolve(newPage);
        }
      };
      
      this.client.Target.on('targetCreated', targetCreatedListener);
      
      // 执行回调
      callback()
        .then(() => {
          // 标记监听器为非活跃状态
          listenerActive = false;
        })
        .catch(reject);
    });
  }

  // ExpectResponseText - 等待特定响应
  async expectResponseText(urlOrPredicate: string, callback: () => Promise<void>): Promise<string> {
    const urlPattern = urlOrPredicate;
    const pattern = urlPattern.replace(/\*\*/g, '.*');
    
    logger.debug(`expectResponseText: starting for ${urlPattern}, pattern: ${pattern}`);
    
    return new Promise(async (resolve, reject) => {
      // 添加监听器到全局管理器
      this.responseListeners.set(pattern, (data: any) => {
        if (data && data.error) {
          reject(data.error);
        } else if (data) {
          logger.debug(`expectResponseText: matched ${urlPattern}, text length: ${data.length}`);
          resolve(data);
        } else {
          reject(new Error('Response body is empty'));
        }
      });
      
      try {
        // 执行回调
        await callback();
        logger.debug(`expectResponseText: callback completed, waiting for response`);
        
        // 设置超时
        setTimeout(() => {
          if (this.responseListeners.has(pattern)) {
            this.responseListeners.delete(pattern);
            logger.warn(`expectResponseText: timeout waiting for ${urlPattern}`);
            reject(new Error(`Timeout waiting for response: ${urlPattern}`));
          }
        }, 10000);
      } catch (error) {
        this.responseListeners.delete(pattern);
        logger.error(`expectResponseText: callback failed: ${error}`);
        reject(error);
      }
    });
  }

  // ReNewPageByError - 错误时恢复页面
  async renewPageByError(error: any): Promise<void> {
    const errorMessage = error?.message || '';
    if (errorMessage.includes('target closed') || errorMessage.includes('Session closed')) {
      console.warn('Page closed, renewing...');
      await this.close();
      
      // 等待并重试
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 重新初始化页面 - 注意：这需要重新连接到 CDP
      logger.warn('Page recovery not fully implemented');
    }
  }

  // GetOrNewExtPage - 获取或新建页面
  async getOrNewPage(): Promise<BrowserPage> {
    return this;
  }

  // Release - 释放页面锁定
  release(): void {
    this.locked = false;
  }

  // ExtContext - 获取浏览器上下文
  get extContext(): any {
    return this.cdpClient;
  }

  // MustInnerText - 获取内部文本（确保存在）
  async mustInnerText(selector: string): Promise<string> {
    const locator = this.locator(selector);
    return locator.getText();
  }

  // MustTextContent - 获取文本内容（确保存在）
  async mustTextContent(selector: string): Promise<string> {
    const locator = this.locator(selector);
    return locator.getTextContent();
  }

  // NavigateWithLoadedState - 导航并等待加载完成
  async navigateWithLoadedState(url: string): Promise<void> {
    try {
      await this.page.navigate({ url });
      await this.waitForLoadState('load');
    } catch (error) {
      logger.error('NavigateWithLoadedState error:', error);
      await this.renewPageByError(error);
      throw error;
    }
  }

  // ReloadWithLoadedState - 刷新并等待加载完成
  async reloadWithLoadedState(): Promise<void> {
    
    try {
      await this.page.reload();
      await this.waitForLoadState('load');
    } catch (error) {
      logger.error('ReloadWithLoadedState error:', error);
      await this.renewPageByError(error);
      throw error;
    }
  }

  // WaitForLoadStateLoad - 等待页面加载完成
  async waitForLoadStateLoad(): Promise<void> {
    await this.waitForLoadState('load');
  }

  // WaitForDomContentLoaded - 等待 DOM 加载完成
  async waitForDomContentLoaded(): Promise<void> {
    await this.waitForLoadState('domcontentloaded');
  }

  // WaitForSelectorStateVisible - 等待元素可见
  async waitForSelectorStateVisible(selector: string): Promise<void> {
    await this.waitForSelector(selector, { state: 'visible' });
  }

  // CloseAll - 关闭页面和浏览器
  async closeAll(): Promise<void> {
    await this.close();
    await this.cdpClient.close();
  }

  // ExpectExtPage - 等待新页面
  async expectExtPage(callback: () => Promise<void>): Promise<BrowserPage> {
    return this.expectNewPage(callback);
  }

  // IsClosed - 检查页面是否已关闭
  isClosed(): boolean {
    try {
      return !this.client || !this.client.Page;
    } catch {
      return true;
    }
  }
}export { BrowserLocator } from './locator';
