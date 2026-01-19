import type { CDPClient } from "./client";
import { createLogger } from "../utils/logger";
import {
  getBeijingTimeISOString,
  toBeijingTimeISOString,
} from "../utils/url";
import { BrowserLocator } from "./locator";
import type { CachedRequest } from "../types";

const logger = createLogger("BrowserPage");

export interface PageOptions {
  name?: string;
  timeout?: number;
}

export interface NavigateOptions {
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
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
  private pendingPages: BrowserPage[];
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
      ...options,
    };
    this.pendingPages = [];
    this.initialized = false;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Page、Runtime、DOM、Network 已经在 CDPClient 中启用，不需要再次启用
      // 这些领域在 CDP 客户端连接时就已经启用了

      this.initialized = true;
    } catch (error) {
      logger.error(`Failed to initialize page: ${error}`);
      throw error;
    }
  }

  async navigate(url: string, options: NavigateOptions = {}): Promise<void> {
    const opts = {
      waitUntil: "load" as const,
      timeout: this.options.timeout,
      ...options,
    };

    if (!this.page) throw new Error("Page not initialized");

    logger.info(`Navigating to ${url} with waitUntil=${opts.waitUntil}`);
    await this.page.navigate({ url });
    logger.info(`Navigation to ${url} completed`);

    // 使用 waitForLoadState 等待页面加载完成
    await this.waitForLoadState(opts.waitUntil, opts.timeout);
  }

  async reload(options: NavigateOptions = {}): Promise<void> {
    const opts = {
      waitUntil: "load" as const,
      timeout: this.options.timeout,
      ...options,
    };

    if (!this.page) throw new Error("Page not initialized");

    await this.page.reload();

    // 使用 waitForLoadState 等待页面加载完成
    await this.waitForLoadState(opts.waitUntil, opts.timeout);
  }

  async waitForLoadState(
    state: "load" | "domcontentloaded" | "networkidle",
    timeout?: number,
  ): Promise<void> {
    const timeoutMs = timeout || this.options.timeout || 10000;
    const startTime = Date.now();

    logger.info(
      `waitForLoadState: waiting for ${state}, timeout=${timeoutMs}ms`,
    );

    return new Promise((resolve, reject) => {
      const checkState = async () => {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Timeout waiting for ${state}`));
          return;
        }

        try {
          // 使用 Runtime.evaluate 检查 document.readyState
          const result = await this.runtime?.evaluate({
            expression: `document.readyState`,
          });

          const readyState = result?.result?.value;
          logger.info(
            `waitForLoadState: state=${state}, readyState=${readyState}, waiting for ${state}`,
          );

          if (
            state === "domcontentloaded" &&
            (readyState === "interactive" || readyState === "complete")
          ) {
            logger.info(`waitForLoadState: resolving for domcontentloaded`);
            resolve();
          } else if (state === "load" && readyState === "complete") {
            logger.info(
              `waitForLoadState: resolving for load, readyState=${readyState}`,
            );
            resolve();
          } else if (state === "networkidle") {
            // 简化的 networkidle 检查
            resolve();
          } else {
            logger.info(`waitForLoadState: not ready yet, waiting...`);
            setTimeout(checkState, 500);
          }
        } catch (error) {
          logger.warn(`waitForLoadState: error checking readyState: ${error}`);
          setTimeout(checkState, 500);
        }
      };

      checkState();
    });
  }

  async waitForDOMContentLoaded(timeout?: number): Promise<void> {
    await this.waitForLoadState("domcontentloaded", timeout);
  }

  async waitForSelector(
    selector: string,
    options: {
      timeout?: number;
      state?: "visible" | "hidden" | "attached";
    } = {},
  ): Promise<void> {
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
            expression: `document.querySelector('${selector}') !== null`,
          });

          const elementExists = result?.result?.value;

          if (elementExists) {
            if (options.state === "visible") {
              const visible = await this.runtime?.evaluate({
                expression: `
                  (function() {
                    const el = document.querySelector('${selector}');
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
                  })()
                `,
              });

              const isVisible = visible?.result?.value;

              if (isVisible) {
                resolve();
              } else {
                setTimeout(checkSelector, 500);
              }
            } else {
              resolve();
            }
          } else {
            setTimeout(checkSelector, 500);
          }
        } catch (error) {
          setTimeout(checkSelector, 500);
        }
      };

      checkSelector();
    });
  }

  async executeScript(script: string): Promise<any> {
    if (!this.runtime) throw new Error("Runtime not initialized");

    const result = await this.runtime.evaluate({
      expression: script,
      returnByValue: true,
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
        expression: `document.querySelector('${selector}') !== null`,
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
    if (!this.runtime) throw new Error("Runtime not initialized");

    const result = await this.runtime.evaluate({
      expression: "document.documentElement.outerHTML",
    });

    return result?.result?.value || "";
  }

  async screenshot(format: "png" | "jpeg" | "webp" = "png"): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");

    const result = await this.page.captureScreenshot({
      format,
    });

    return result.data;
  }

  async getTitle(): Promise<string> {
    const result = await this.runtime?.evaluate({
      expression: "document.title",
    });
    return result?.result?.value || "";
  }

  async getUrl(): Promise<string> {
    const result = await this.runtime?.evaluate({
      expression: "window.location.href",
    });
    return result?.result?.value || "";
  }

  async close(): Promise<void> {
    await this.cdpClient.close();
  }

  // expectNewPage - 等待新页面打开
  async expectNewPage(callback: () => Promise<void>): Promise<BrowserPage> {
    return new Promise((resolve, reject) => {
      let listenerActive = true;

      // 监听新页面
      const targetCreatedListener = (params: any) => {
        if (!listenerActive) return;

        if (params.type === "page" && params.targetInfo.url !== "about:blank") {
          listenerActive = false;

          // 创建新的 BrowserPage
          const newPage = new BrowserPage(this.cdpClient, {
            name: `page-${Date.now()}`,
          });

          this.pendingPages.push(newPage);
          resolve(newPage);
        }
      };

      this.client.Target.on("targetCreated", targetCreatedListener);

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
  async expectResponseText(
    urlOrPredicate: string,
    callback: () => Promise<void>,
    timeout: number = 30000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // 支持 Playwright 风格的 URL 匹配规则
      // 1. 字符串匹配：完全匹配
      // 2. * 通配符：匹配任意字符（不包括路径分隔符 /）
      // 3. ** 通配符：匹配任意字符（包括路径分隔符 /）
      let urlPattern = urlOrPredicate;

      // 处理 ** 通配符（匹配任意字符，包括路径分隔符）
      urlPattern = urlPattern.replace(/\*\*/g, "DOUBLE_WILDCARD");

      // 处理 * 通配符（匹配任意字符，不包括路径分隔符）
      urlPattern = urlPattern.replace(/(?<!\*)\*(?!\*)/g, "SINGLE_WILDCARD");

      // 转义其他正则特殊字符（不包括 /）
      urlPattern = urlPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

      // 将占位符替换为正则表达式
      urlPattern = urlPattern.replace(/DOUBLE_WILDCARD/g, ".*");
      urlPattern = urlPattern.replace(/SINGLE_WILDCARD/g, "[^/]*");

      let listenerActive = false; // 初始状态为不活跃
      let listenerCalled = false; // 标记监听器是否被调用

      logger.debug(
        `expectResponseText: starting for ${urlOrPredicate} (pattern: ${urlPattern})`,
      );

      const responseCallback = (response: any, request?: string) => {
        listenerCalled = true;
        logger.debug(
          `expectResponseText: response callback triggered for ${urlOrPredicate}`,
        );

        if (!listenerActive) {
          return;
        }

        listenerActive = false;

        // 将响应转换为字符串
        let body: string;
        if (typeof response === "string") {
          body = response;
        } else if (typeof response === "object") {
          body = JSON.stringify(response);
        } else {
          body = String(response);
        }

        if (body) {
          logger.debug(
            `expectResponseText: matched ${urlOrPredicate} at ${getBeijingTimeISOString()}, body length: ${body.length}`,
          );
          resolve(body);
        } else {
          logger.error(`expectResponseText: response body is empty`);
          reject(new Error("Response body is empty"));
        }
      };

      // 使用 NetworkListener 的回调机制（在 loadingFinished 中调用）
      const networkListener = this.cdpClient.getNetworkListener();
      if (networkListener) {
        // 先检查缓存中是否已经有匹配的请求
        // 遍历所有缓存的 URL，找到匹配的请求
        const cacheStats = networkListener.getCacheStats();
        logger.debug(
          `expectResponseText: checking cache. Total cached URLs: ${cacheStats.size}`,
        );
        for (const [url] of cacheStats) {
          logger.debug(`  Cached URL: ${url}`);
        }

        // 在所有匹配的URL中找到时间戳最新的请求
        const matchedRequests: { url: string; request: CachedRequest }[] = [];

        for (const [url] of cacheStats) {
          // 检查 URL 是否匹配 urlOrPredicate（使用转换后的 pattern）
          const regex = new RegExp(urlPattern);
          const isMatch = regex.test(url);
          logger.debug(
            `expectResponseText: checking cached URL ${url} against pattern ${urlPattern}: ${isMatch}`,
          );
          if (isMatch) {
            const cachedRequests = networkListener.getCachedRequests(url);
            if (cachedRequests.length > 0) {
              // 使用最新的缓存请求
              const latestRequest = cachedRequests[cachedRequests.length - 1];
              logger.debug(
                `expectResponseText: found cached request for ${urlOrPredicate} in cached URL ${url}, timestamp: ${toBeijingTimeISOString(latestRequest.timestamp)}`,
              );
              matchedRequests.push({ url, request: latestRequest });
            }
          }
        }

        // 在所有匹配的请求中，找到时间戳最新的那个
        if (matchedRequests.length > 0) {
          const latestMatched = matchedRequests.reduce((latest, current) => {
            return current.request.timestamp > latest.request.timestamp ? current : latest;
          });

          logger.debug(
            `expectResponseText: selected latest cached request from URL ${latestMatched.url}, timestamp: ${toBeijingTimeISOString(latestMatched.request.timestamp)}`,
          );

          // 将响应转换为字符串
          let body: string;
          if (typeof latestMatched.request.response === "string") {
            body = latestMatched.request.response;
          } else if (typeof latestMatched.request.response === "object") {
            body = JSON.stringify(latestMatched.request.response);
          } else {
            body = String(latestMatched.request.response);
          }

          if (body) {
            // 清除已获取的缓存，避免下次重复获取
            networkListener.clearCache(latestMatched.url);
            logger.debug(
              `expectResponseText: cleared cache for URL ${latestMatched.url}`,
            );
            resolve(body);
            return;
          }
        }

        // 没有缓存，添加 callback 等待新请求
        networkListener.addCallback(urlPattern, responseCallback);
        logger.debug(
          `expectResponseText: added callback for pattern ${urlPattern}`,
        );
      } else {
        reject(new Error("NetworkListener not initialized"));
        return;
      }

      // 执行回调
      callback()
        .then(() => {
          // 回调完成后，激活监听器
          listenerActive = true;
          logger.debug(
            `expectResponseText: callback completed, listener activated at ${getBeijingTimeISOString()}`,
          );

          // 设置超时检查（最多等待 timeout 毫秒，如果有结果马上返回）
          setTimeout(() => {
            if (listenerActive && !listenerCalled) {
              logger.warn(
                `expectResponseText: no response received within ${timeout}ms for ${urlOrPredicate}`,
              );
              // 清理回调
              if (networkListener) {
                networkListener.removeCallback(urlPattern);
              }
              reject(
                new Error(`Timeout waiting for response: ${urlOrPredicate}`),
              );
            }
          }, timeout);
        })
        .catch((err: any) => {
          logger.error(`expectResponseText: callback failed: ${err}`);
          // 清理回调
          if (networkListener) {
            networkListener.removeCallback(urlPattern);
          }
          reject(err);
        });
    });
  }

  // InnerText - 获取内部文本
  async innerText(selector: string): Promise<string> {
    const locator = this.locator(selector);
    return locator.getText();
  }

  // TextContent - 获取文本内容
  async textContent(selector: string): Promise<string> {
    const locator = this.locator(selector);
    return locator.getTextContent();
  }

  // NavigateWithLoadedState - 导航并等待加载完成
  async navigateWithLoadedState(url: string): Promise<void> {
    try {
      await this.page.navigate({ url });
      // 等待页面加载完成
      await this.waitForLoadState("load");
    } catch (error) {
      logger.error("NavigateWithLoadedState error:", error);
      throw error;
    }
  }

  // ReloadWithLoadedState - 刷新并等待加载完成
  async reloadWithLoadedState(): Promise<void> {
    try {
      await this.page.reload();
      // 等待页面加载完成
      await this.waitForLoadState("load");
    } catch (error) {
      logger.error("ReloadWithLoadedState error:", error);
      throw error;
    }
  }

  // WaitForLoadStateLoad - 等待页面加载完成
  async waitForLoadStateLoad(): Promise<void> {
    await this.waitForLoadState("load");
  }

  // WaitForDomContentLoaded - 等待 DOM 加载完成
  async waitForDomContentLoaded(): Promise<void> {
    await this.waitForLoadState("domcontentloaded");
  }

  // WaitForSelectorStateVisible - 等待元素可见
  async waitForSelectorStateVisible(selector: string): Promise<void> {
    await this.waitForSelector(selector, { state: "visible" });
  }

}
export { BrowserLocator } from "./locator";
