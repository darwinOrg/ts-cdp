import type { CDPClient } from './client';
import { BrowserPage, type PageOptions } from './page';
import { createLogger } from '../utils/logger';
import { launch, type ChromeInstance } from '../launcher';

const logger = createLogger('BrowserContext');

export interface BrowserContextOptions {
  userDataDir?: string;
  headless?: boolean;
  remoteDebuggingPort?: number;
  browserPath?: string;
}

export class BrowserContext {
  private cdpClient: CDPClient | null;
  private chrome: ChromeInstance | null;
  private pages: BrowserPage[];
  private options: BrowserContextOptions;

  constructor(cdpClient: CDPClient | null, chrome: ChromeInstance | null, options: BrowserContextOptions = {}) {
    this.cdpClient = cdpClient;
    this.chrome = chrome;
    this.pages = [];
    this.options = options;
  }

  /**
   * 创建新的浏览器上下文（启动浏览器）
   */
  static async create(options: BrowserContextOptions = {}): Promise<BrowserContext> {
    const chrome = await launch({
      chromePath: options.browserPath,
      userDataDir: options.userDataDir,
      port: options.remoteDebuggingPort,
      headless: options.headless
    });

    const CDPClientClass = (await import('./client')).CDPClient;
    const cdpClient = new CDPClientClass({
      port: chrome.port,
      name: `browser-context-${Date.now()}`
    });

    await cdpClient.connect();

    return new BrowserContext(cdpClient, chrome, options);
  }

  /**
   * 连接到现有的浏览器上下文
   */
  static async connect(port: number): Promise<BrowserContext> {
    const CDPClientClass = (await import('./client')).CDPClient;
    const cdpClient = new CDPClientClass({
      port: port,
      name: `browser-context-${Date.now()}`
    });

    await cdpClient.connect();

    return new BrowserContext(cdpClient, null, { remoteDebuggingPort: port });
  }

  /**
   * 获取或创建新页面（复用未锁定的页面）
   */
  async getOrNewPage(options: PageOptions = {}): Promise<BrowserPage> {
    // 清理已关闭的页面
    this.pages = this.pages.filter(page => !page.isClosed());

    // 查找未锁定的页面
    for (const page of this.pages) {
      if (!page.isLocked()) {
        page.lock();
        return page;
      }
    }

    // 没有可用的页面，创建新页面
    return this.newPage(options);
  }

  /**
   * 创建新页面
   */
  async newPage(options: PageOptions = {}): Promise<BrowserPage> {
    if (!this.cdpClient) {
      throw new Error('CDP client not initialized');
    }

    const page = new BrowserPage(this.cdpClient, {
      ...options,
      name: options.name || `page-${Date.now()}`
    });

    await page.init();
    page.lock();

    this.pages.push(page);

    return page;
  }

  /**
   * 构建扩展页面（用于从现有页面创建）
   */
  buildPage(page: BrowserPage): BrowserPage {
    if (!this.pages.includes(page)) {
      page.lock();
      this.pages.push(page);
    }
    return page;
  }

  /**
   * 关闭浏览器上下文
   */
  async close(): Promise<void> {
    // 关闭所有页面
    for (const page of this.pages) {
      try {
        await page.close();
      } catch (error) {
        logger.error(`Failed to close page: ${error}`);
      }
    }

    this.pages = [];

    // 关闭 CDP 连接
    if (this.cdpClient) {
      this.cdpClient.close();
      this.cdpClient = null;
    }

    // 关闭 Chrome 进程
    if (this.chrome) {
      this.chrome.kill();
      this.chrome = null;
    }
  }

  /**
   * 获取所有页面
   */
  getPages(): BrowserPage[] {
    return this.pages.filter(page => !page.isClosed());
  }

  /**
   * 获取 CDP 客户端
   */
  getClient(): CDPClient | null {
    return this.cdpClient;
  }

  /**
   * 获取 Chrome 实例
   */
  getChrome(): ChromeInstance | null {
    return this.chrome;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.cdpClient !== null;
  }
}