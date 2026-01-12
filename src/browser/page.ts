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
  private suspended: boolean;
  private pendingPages: BrowserPage[];
  private responseListeners: Map<string, (response: any) => void>;

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
    this.suspended = false;
    this.pendingPages = [];
    this.responseListeners = new Map();
  }

  async navigate(url: string, options: NavigateOptions = {}): Promise<void> {
    this.checkSuspend();
    
    const opts = {
      waitUntil: 'load' as const,
      timeout: this.options.timeout,
      ...options
    };

    if (!this.page) throw new Error('Page not initialized');

    await this.page.navigate({ url });
    
    if (opts.waitUntil === 'domcontentloaded') {
      await this.waitForDOMContentLoaded(opts.timeout);
    } else if (opts.waitUntil === 'networkidle') {
      await this.waitForNetworkIdle(opts.timeout);
    } else {
      await this.waitForLoadState('load', opts.timeout);
    }
  }

  async reload(options: NavigateOptions = {}): Promise<void> {
    this.checkSuspend();
    
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

    return new Promise((resolve, reject) => {
      const checkState = async () => {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Timeout waiting for ${state}`));
          return;
        }

        try {
          const metric = await this.page?.getMetrics();
          if (!metric) {
            setTimeout(checkState, 100);
            return;
          }

          if (state === 'domcontentloaded' && metric.DomContentLoaded > 0) {
            resolve();
          } else if (state === 'load' && metric.Load > 0) {
            resolve();
          } else if (state === 'networkidle') {
            // 简化的 networkidle 检查
            resolve();
          } else {
            setTimeout(checkState, 100);
          }
        } catch (error) {
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

          if (result?.result?.value) {
            if (options.state === 'visible') {
              const visible = await this.runtime?.evaluate({
                expression: `
                  const el = document.querySelector('${selector}');
                  const style = window.getComputedStyle(el);
                  return style.display !== 'none' && style.visibility !== 'hidden';
                `
              });
              
              if (visible?.result?.value) {
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
    this.checkSuspend();
    
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

  randomWaitShort(): Promise<void> {
    return this.randomWaitRange(100, 1000);
  }

  randomWaitMiddle(): Promise<void> {
    return this.randomWaitRange(3000, 6000);
  }

  randomWaitLong(): Promise<void> {
    return this.randomWaitRange(10000, 20000);
  }

  async randomWaitRange(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min)) + min;
    logger.debug(`等待 ${delay} 毫秒`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  suspend(): void {
    this.suspended = true;
  }

  continue(): void {
    this.suspended = false;
  }

  async checkSuspend(): Promise<void> {
    while (this.suspended) {
      await this.randomWaitMiddle();
    }
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
    this.checkSuspend();
    
    return new Promise((resolve, reject) => {
      const targetUrlPattern = '**';
      
      // 监听新页面
      const targetCreatedListener = (params: any) => {
        if (params.type === 'page' && params.targetInfo.url !== 'about:blank') {
          this.client.Target.targetCreated(targetCreatedListener);
          
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
          // 移除监听器
          this.client.Target.removeListener('targetCreated', targetCreatedListener);
        })
        .catch(reject);
    });
  }

  // ExpectResponseText - 等待特定响应
  async expectResponseText(urlOrPredicate: string, callback: () => Promise<void>): Promise<string> {
    this.checkSuspend();
    
    return new Promise((resolve, reject) => {
      const urlPattern = urlOrPredicate;
      const responseListener = (params: any) => {
        if (params.type === 'Network.responseReceived') {
          const response = params.response;
          
          if (response.url.includes(urlPattern)) {
            this.client.Network.responseReceived.removeListener(responseListener);
            
            // 获取响应体
            this.client.Network.getResponseBody({ requestId: params.requestId })
              .then((result: any) => {
                const text = result.body;
                if (text) {
                  resolve(text);
                } else {
                  reject(new Error('Response body is empty'));
                }
              })
              .catch(reject);
          }
        }
      };
      
      this.client.Network.on('responseReceived', responseListener);
      
      // 执行回调
      callback()
        .then(() => {
          // 移除监听器
          this.client.Network.removeListener('responseReceived', responseListener);
        })
        .catch(reject);
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
    this.checkSuspend();
    
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
    this.checkSuspend();
    
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
}