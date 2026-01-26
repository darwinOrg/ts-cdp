import type {CDPClient} from "./client";
import {createLogger} from "../utils/logger";
import {getLocalTimeString, toLocaleTimeString, wildcardToRegex} from "../utils/tools";
import {BrowserLocator} from "./locator";
import type {CachedRequest} from "../types";
import CDP from "chrome-remote-interface";

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
    private readonly client: CDP.Client | null;
    private readonly page: any;
    private readonly runtime: any;
    private options: PageOptions;
    private initialized: boolean;

    constructor(cdpClient: CDPClient, options: PageOptions = {}) {
        this.cdpClient = cdpClient;
        this.client = cdpClient.getClient();
        this.page = this.client?.Page;
        this.runtime = this.client?.Runtime;
        this.options = {
            timeout: 10000,
            ...options,
        };
        this.initialized = false;
    }

    // 检查连接是否仍然有效
    private isConnectionValid(): boolean {
        return this.cdpClient.isConnected() && this.client !== null;
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
        await this.page.navigate({url});
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
            let readyStateChecked = false;
            let checkCount = 0;

            const checkState = async () => {
                if (Date.now() - startTime > timeoutMs) {
                    reject(new Error(`Timeout waiting for ${state}`));
                    return;
                }

                checkCount++;

                try {
                    // 只在第一次和每 3 秒检查一次 document.readyState
                    // 其他时间使用简单的延迟，减少对 Runtime.evaluate 的调用
                    if (!readyStateChecked || checkCount % 6 === 0) {
                        readyStateChecked = true;

                        const result = await this.runtime?.evaluate({
                            expression: `document.readyState`,
                        });

                        const readyState = result?.result?.value;

                        if (
                            state === "domcontentloaded" &&
                            (readyState === "interactive" || readyState === "complete")
                        ) {
                            logger.info(`waitForLoadState: resolving for domcontentloaded`);
                            resolve();
                            return;
                        } else if (state === "load" && readyState === "complete") {
                            logger.info(
                                `waitForLoadState: resolving for load, readyState=${readyState}`,
                            );
                            resolve();
                            return;
                        } else if (state === "networkidle") {
                            // 使用 NetworkListener 的 waitForNetworkIdle 方法
                            const networkListener = this.cdpClient.getNetworkListener();
                            if (!networkListener) {
                                logger.warn("waitForLoadState: NetworkListener not initialized");
                                resolve();
                                return;
                            }

                            logger.info(
                                `waitForLoadState: using NetworkListener.waitForNetworkIdle, timeout=${timeoutMs}ms`,
                            );

                            try {
                                await networkListener.waitForNetworkIdle(500, 0, timeoutMs);
                                logger.info(`waitForLoadState: networkidle achieved`);
                                resolve();
                            } catch (error) {
                                logger.error(`waitForLoadState: error waiting for networkidle: ${error}`);
                                resolve(); // 即使出错也 resolve，避免阻塞
                            }
                            return;
                        }
                        logger.debug(
                            `waitForLoadState: state=${state}, readyState=${readyState}, waiting...`
                        );
                    } else {
                        logger.debug(`waitForLoadState: waiting... (check #${checkCount})`);
                    }

                    // 继续等待
                    setTimeout(checkState, 500);
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
                    // 转义 selector 中的单引号
                    const escapedSelector = selector.replace(/'/g, "\\'");
                    const result = await this.runtime?.evaluate({
                        expression: `document.querySelector('${escapedSelector}') !== null`,
                    });

                    const elementExists = result?.result?.value;

                    if (elementExists) {
                        if (options.state === "visible") {
                            const escapedSelector = selector.replace(/'/g, "\\'");
                            const visible = await this.runtime?.evaluate({
                                expression: `
                                  (function() {
                                    const el = document.querySelector('${escapedSelector}');
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
        // 检查连接状态
        if (!this.isConnectionValid() || !this.runtime) {
            logger.warn("Cannot execute script: connection is closed or invalid");
            return null;
        }

        try {
            const result = await this.runtime.evaluate({
                expression: script,
                returnByValue: true,
            });

            return result?.result?.value;
        } catch (error) {
            // 检查是否是 WebSocket 关闭错误
            if (error instanceof Error && error.message.includes("WebSocket is not open")) {
                logger.warn(`Failed to execute script: WebSocket connection is closed`);
                return null;
            }
            logger.error(`Failed to execute script: ${script}`, error);
            return null;
        }
    }

    async evaluate<T>(script: string): Promise<T> {
        return await this.executeScript(script) as Promise<T>;
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
        // 检查连接状态
        if (!this.isConnectionValid() || !this.runtime) {
            logger.warn("Cannot get HTML: connection is closed or invalid");
            return "";
        }

        try {
            const result = await this.runtime.evaluate({
                expression: "document.documentElement.outerHTML",
            });

            return result?.result?.value || "";
        } catch (error) {
            // 检查是否是 WebSocket 关闭错误
            if (error instanceof Error && error.message.includes("WebSocket is not open")) {
                logger.warn(`Failed to get HTML: WebSocket connection is closed`);
                return "";
            }
            logger.error(`Failed to get HTML:`, error);
            return "";
        }
    }

    async screenshot(format: "png" | "jpeg" | "webp" = "png"): Promise<string> {
        if (!this.page) throw new Error("Page not initialized");

        const result = await this.page.captureScreenshot({
            format,
        });

        return result.data;
    }

    async getTitle(): Promise<string> {
        // 检查连接状态
        if (!this.isConnectionValid() || !this.runtime) {
            logger.warn("Cannot get title: connection is closed or invalid");
            return "";
        }

        try {
            const result = await this.runtime.evaluate({
                expression: "document.title",
            });
            return result?.result?.value || "";
        } catch (error) {
            // 检查是否是 WebSocket 关闭错误
            if (error instanceof Error && error.message.includes("WebSocket is not open")) {
                logger.warn(`Failed to get title: WebSocket connection is closed`);
                return "";
            }
            logger.error(`Failed to get title:`, error);
            return "";
        }
    }

    async getUrl(): Promise<string> {
        // 检查连接状态
        if (!this.isConnectionValid() || !this.runtime) {
            logger.warn("Cannot get URL: connection is closed or invalid");
            return "";
        }

        try {
            const result = await this.runtime.evaluate({
                expression: "window.location.href",
            });
            return result?.result?.value || "";
        } catch (error) {
            // 检查是否是 WebSocket 关闭错误
            if (error instanceof Error && error.message.includes("WebSocket is not open")) {
                logger.warn(`Failed to get URL: WebSocket connection is closed`);
                return "";
            }
            logger.error(`Failed to get URL:`, error);
            return "";
        }
    }

    async close(): Promise<void> {
        await this.cdpClient.close();
    }

    // ExpectResponseText - 等待特定响应
    async expectResponseText(
        urlOrPredicate: string,
        callback: () => Promise<void>,
        timeout: number = 10000,
    ): Promise<string> {
        // 支持 Playwright 风格的 URL 匹配规则
        // 1. 字符串匹配：完全匹配
        // 2. * 通配符：匹配任意字符（不包括路径分隔符 /）
        // 3. ** 通配符：匹配任意字符（包括路径分隔符 /）
        const urlRegex = wildcardToRegex(urlOrPredicate);

        logger.debug(
            `expectResponseText: starting for ${urlOrPredicate}`,
        );
        // 获取网络监听器
        const networkListener = this.cdpClient.getNetworkListener();
        if (!networkListener) {
            throw new Error("NetworkListener not initialized");
        }

        // 启用网络监听器（确保监听器处于启用状态）
        if (!networkListener.isEnabled()) {
            networkListener.enable();
            logger.debug(
                `expectResponseText: enabled network listener`,
            );
        }

        // 执行回调（触发页面操作）
        await callback();
        logger.debug(
            `expectResponseText: callback completed, starting to poll cache at ${getLocalTimeString()}`,
        );

        // 轮询检查缓存，直到找到匹配的数据或超时
        const startTime = Date.now();
        const pollInterval = 100; // 每 100ms 检查一次

        return new Promise((resolve, reject) => {
            const poll = () => {
                const elapsed = Date.now() - startTime;

                if (elapsed > timeout) {
                    logger.warn(
                        `expectResponseText: no response received within ${timeout}ms for ${urlOrPredicate}`,
                    );
                    // 打印调试信息
                    const cacheStats = networkListener.getCacheStats();
                    logger.debug(
                        `expectResponseText: cache stats at timeout: ${cacheStats.size} cached URLs`,
                    );
                    for (const [url] of cacheStats) {
                        logger.debug(`  Cached URL: ${url}`);
                    }
                    reject(
                        new Error(`Timeout waiting for response: ${urlOrPredicate}`),
                    );
                    return;
                }

                // 检查缓存中是否有匹配的请求
                const cacheStats = networkListener.getCacheStats();
                const matchedRequests: { url: string; request: CachedRequest }[] = [];

                for (const [url] of cacheStats) {
                    // 检查 URL 是否匹配 urlOrPredicate
                    const isMatch = urlRegex.test(url);
                    if (isMatch) {
                        const cachedRequests = networkListener.getCachedRequests(url);
                        if (cachedRequests.length > 0) {
                            // 使用最新的缓存请求
                            const latestRequest = cachedRequests[cachedRequests.length - 1];
                            logger.debug(
                                `expectResponseText: found cached request for ${urlOrPredicate} in cached URL ${url}, timestamp: ${toLocaleTimeString(latestRequest.timestamp)}`,
                            );
                            matchedRequests.push({url, request: latestRequest});
                        }
                    }
                }

                // 如果找到了匹配的请求
                if (matchedRequests.length > 0) {
                    const latestMatched = matchedRequests.reduce((latest, current) => {
                        return current.request.timestamp > latest.request.timestamp ? current : latest;
                    });

                    logger.debug(
                        `expectResponseText: selected latest cached request from URL ${latestMatched.url}, timestamp: ${toLocaleTimeString(latestMatched.request.timestamp)}`,
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

                // 继续轮询
                setTimeout(poll, pollInterval);
            };

            // 开始轮询
            poll();
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
            await this.page.navigate({url});
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

    // waitForNetworkIdle - 等待 网络 空闲
    async waitForNetworkIdle(): Promise<void> {
        await this.waitForLoadState("networkidle");
    }

    // WaitForSelectorStateVisible - 等待元素可见
    async waitForSelectorStateVisible(selector: string): Promise<void> {
        await this.waitForSelector(selector, {state: "visible"});
    }

}

export {BrowserLocator} from "./locator";
