import CDP from "chrome-remote-interface";
import { NetworkListener } from "../network/listener";
import { createLogger } from "../utils/logger";
import type {
  CDPClientOptions,
  CDPClientConfig,
  NetworkListenerConfig,
  LoginState,
  LoginCallback,
  DisconnectCallback,
} from "../types";

const logger = createLogger("CDPClient");

export class CDPClient {
  private client: CDP.Client | null;
  private networkListener: NetworkListener | null;
  private config: CDPClientConfig;
  private options: CDPClientOptions;
  private currentUrl: string;
  private lastLoginStateChangeTime: number;
  private loginStateChangeTimeout: NodeJS.Timeout | null;
  private reconnectAttempts: number;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private isReconnecting: boolean;
  private heartbeatInterval: NodeJS.Timeout | null;
  private isClosed: boolean;
  private firstConnection: boolean;
  private connectionCount: number;
  private disconnectTime: number | null;
  private reconnectTimer: NodeJS.Timeout | null;

  constructor(
    config: CDPClientConfig,
    options: Partial<CDPClientOptions> = {},
  ) {
    this.config = config;
    this.options = {
      host: "127.0.0.1",
      port: config.port,
      ...options,
    };
    this.client = null;
    this.networkListener = null;
    this.currentUrl = "";
    this.lastLoginStateChangeTime = 0;
    this.loginStateChangeTimeout = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5; // 最大重连次数
    this.reconnectDelay = 3000; // 重连延迟（毫秒）
    this.isReconnecting = false;
    this.heartbeatInterval = null;
    this.isClosed = false;
    this.firstConnection = true;
    this.connectionCount = 0;
    this.disconnectTime = null;
    this.reconnectTimer = null;
  }

  async connect(): Promise<CDP.Client> {
    try {
      // 如果已经有客户端，先关闭它
      if (this.client) {
        logger.debug("Closing existing client before reconnect");
        try {
          this.client.close();
        } catch (error) {
          logger.debug("Error closing existing client:", error);
        }
        this.client = null;
      }

      this.client = await (CDP as any)({
        host: this.options.host!,
        port: this.options.port,
      });

      if (!this.client) {
        throw new Error("Failed to create CDP client");
      }

      this.client.on("disconnect", () => {
        logger.info(`Disconnected from port ${this.options.port}`);
        this.disconnectTime = Date.now();
        
        if (this.config.disconnectCallback) {
          this.config.disconnectCallback();
        }
        this.stopHeartbeat();
        
        // 如果不是手动关闭，尝试自动重连
        if (!this.isClosed && !this.isReconnecting) {
          this.scheduleReconnect();
        }
        
        // 注意：不要在这里调用 this.client.close()
        // 因为 disconnect 事件通常是因为连接已经断开才触发的
        // 再次 close 可能会报错或导致问题
        // 客户端会在下一次 connect 时被重新创建
      });

      this.client.on("ready", () => {
        // 防止 ready 事件被多次处理
        if (!this.isReconnecting && !this.firstConnection) {
          logger.debug("Ready event fired but not reconnecting, skipping");
          return;
        }

        this.connectionCount++;
        
        if (this.firstConnection) {
          logger.info(`Client ready: ${this.config.name || "unnamed"} (first connection)`);
          this.firstConnection = false;
        } else {
          // 重连成功，记录日志
          const timeSinceDisconnect = this.disconnectTime 
            ? Date.now() - this.disconnectTime 
            : 0;
          
          logger.info(
            `Client reconnected: ${this.config.name || "unnamed"} ` +
            `(connection #${this.connectionCount}, ` +
            `disconnected for ${timeSinceDisconnect}ms ago)`
          );
        }
        
        // 重置重连计数器
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        this.disconnectTime = null;
        
        // 启动心跳检测
        this.startHeartbeat();
      });

      const { Page, DOM, Network, Overlay } = this.client;
      await Promise.all([
        Page.enable(),
        Network.enable(),
        DOM.enable(),
        Overlay.enable(),
      ]);

      this.currentUrl = await this.getCurrentUrl();

      await this.initNetworkListener();

      if (this.config.loginCallback && this.config.loginUrlPatterns) {
        await this.initLoginStatus();
      }

      return this.client;
    } catch (error) {
      logger.error("Failed to connect to CDP", error);
      throw error;
    }
  }

  private scheduleReconnect(): void {
    // 如果已经手动关闭，停止重连
    if (this.isClosed) {
      logger.debug("Connection is closed, skipping reconnect");
      return;
    }

    // 清除之前的重连定时器（去抖动）
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(
        `Max reconnect attempts (${this.maxReconnectAttempts}) reached. ` +
        `Total connections: ${this.connectionCount}. Giving up.`
      );
      return;
    }

    this.reconnectAttempts++;
    this.isReconnecting = true;

    // 指数退避：每次重连延迟加倍，最大 30 秒
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    logger.info(
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      
      // 再次检查是否已经手动关闭
      if (this.isClosed) {
        logger.debug("Connection is closed, canceling reconnect attempt");
        this.isReconnecting = false;
        return;
      }
      
      try {
        logger.info(`Attempting to reconnect (attempt ${this.reconnectAttempts})...`);
        await this.connect();
        logger.info("Reconnect successful!");
      } catch (error) {
        logger.error(`Reconnect attempt ${this.reconnectAttempts} failed:`, error);
        // 继续尝试重连（如果还没有达到最大次数）
        if (this.reconnectAttempts < this.maxReconnectAttempts && !this.isClosed) {
          this.scheduleReconnect();
        } else {
          this.isReconnecting = false;
        }
      }
    }, delay);
  }

  private startHeartbeat(): void {
    // 如果已经有心跳在运行，不要重复启动
    if (this.heartbeatInterval) {
      logger.debug("Heartbeat already running, skipping");
      return;
    }
    
    this.heartbeatInterval = setInterval(async () => {
      if (!this.client || this.isClosed) {
        this.stopHeartbeat();
        return;
      }

      // 如果正在重连，跳过心跳检查
      if (this.isReconnecting) {
        logger.debug("Skipping heartbeat check while reconnecting");
        return;
      }

      try {
        // 发送一个简单的命令来检查连接是否正常
        await this.client.Page.getNavigationHistory();
        // 心跳成功，不需要记录日志
      } catch (error) {
        // 只在连续失败时才记录日志，避免误报
        if (error instanceof Error && error.message.includes("WebSocket is not open")) {
          logger.warn("Heartbeat check failed: WebSocket connection is closed");
          // 心跳失败，连接可能已断开，disconnect 事件会触发重连
          // 但为了保险起见，如果 disconnect 事件没有触发，主动触发重连
          if (!this.isReconnecting && !this.isClosed) {
            logger.info("Heartbeat failed, triggering reconnect...");
            this.scheduleReconnect();
          }
        } else {
          // 其他错误可能是暂时的，不记录为警告
          logger.debug("Heartbeat check failed (temporary):", error);
        }
      }
    }, 30000); // 每30秒检查一次
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  getClient(): CDP.Client | null {
    return this.client;
  }

  getNetworkListener(): any {
    return this.networkListener;
  }

  private async getCurrentUrl(): Promise<string> {
    if (!this.client) return "";
    try {
      const frameTree = await this.client.Page.getFrameTree();
      return frameTree.frameTree.frame.url;
    } catch {
      return "";
    }
  }

  private async initNetworkListener(): Promise<void> {
    if (!this.client) return;

    const networkConfig: NetworkListenerConfig = {
      watchUrls: this.config.watchUrls,
      enableHAR: true,
    };

    this.networkListener = new NetworkListener(this.client, networkConfig);
    await this.networkListener.init();
  }

  private async initLoginStatus(): Promise<void> {
    if (
      !this.client ||
      !this.config.loginUrlPatterns ||
      !this.config.loginCallback
    )
      return;

    const { Page } = this.client;
    const { loginUrl, targetPrefix } = this.config.loginUrlPatterns;

    Page.frameNavigated((params: any) => {
      if (!params.frame.parentId) {
        this.handleNavigation(params.frame.url, loginUrl, targetPrefix);
      }
    });

    Page.navigatedWithinDocument((params: any) => {
      this.handleNavigation(params.url, loginUrl, targetPrefix);
    });
  }

  private handleNavigation(
    newUrl: string,
    loginUrl: string,
    targetPrefix: string,
  ): void {
    const prevUrl = this.currentUrl;
    const currentTime = Date.now();

    // 防止相同URL的重复处理
    if (prevUrl === newUrl) {
      this.currentUrl = newUrl;
      return;
    }

    // 防抖动：如果距离上次状态变更不到1秒，则忽略
    if (currentTime - this.lastLoginStateChangeTime < 1000) {
      logger.debug("Skipping navigation due to debounce", {
        prevUrl,
        newUrl,
        timeDiff: currentTime - this.lastLoginStateChangeTime,
      });
      this.currentUrl = newUrl;
      return;
    }

    // 检查是否是从目标页面导航离开（表示登出）
    if (
      prevUrl.startsWith(targetPrefix) &&
      !newUrl.startsWith(targetPrefix) &&
      newUrl !== loginUrl
    ) {
      logger.info("User logged out", { prevUrl, newUrl });

      // 更新最后状态变更时间
      this.lastLoginStateChangeTime = currentTime;

      // 添加一个小延迟，防止立即的页面跳转造成干扰
      if (this.loginStateChangeTimeout) {
        clearTimeout(this.loginStateChangeTimeout);
      }
      this.loginStateChangeTimeout = setTimeout(() => {
        this.config.loginCallback?.("logout");
      }, 100);
    }
    // 检查是否从登录页面导航到目标页面（表示登录）
    else if (prevUrl === loginUrl && newUrl.startsWith(targetPrefix)) {
      logger.info("User logged in", { newUrl });

      // 更新最后状态变更时间
      this.lastLoginStateChangeTime = currentTime;

      // 添加一个小延迟，防止立即的页面跳转造成干扰
      if (this.loginStateChangeTimeout) {
        clearTimeout(this.loginStateChangeTimeout);
      }
      this.loginStateChangeTimeout = setTimeout(() => {
        this.config.loginCallback?.("login");
      }, 100);
    }
    // 检查是否从非登录页直接跳转到目标页面（可能是已经登录的情况）
    else if (
      !prevUrl.startsWith(loginUrl) &&
      newUrl.startsWith(targetPrefix) &&
      prevUrl !== newUrl
    ) {
      // 可能是直接导航到目标页面，不一定是登录
      logger.debug("Navigated to target page", { prevUrl, newUrl });
    }

    this.currentUrl = newUrl;
  }

  addNetworkCallback(
    url: string,
    callback: (response: any, request?: string) => void,
  ): void {
    this.networkListener?.addCallback(url, callback);
  }

  removeNetworkCallback(url: string): void {
    this.networkListener?.removeCallback(url);
  }

  getHAR() {
    return this.networkListener?.getHAR();
  }

  async navigate(url: string): Promise<void> {
    if (!this.client) {
      logger.error("Client not connected, cannot navigate");
      throw new Error("Client not connected");
    }
    try {
      await this.client.Page.navigate({ url });
    } catch (error) {
      logger.error(`Failed to navigate to ${url}:`, error);
      throw error;
    }
  }

  async reload(): Promise<void> {
    if (!this.client) {
      logger.error("Client not connected, cannot reload");
      throw new Error("Client not connected");
    }
    try {
      await this.client.Page.reload();
    } catch (error) {
      logger.error("Failed to reload:", error);
      throw error;
    }
  }

  async executeScript(script: string): Promise<any> {
    if (!this.client) {
      logger.error("Client not connected, cannot execute script");
      return null;
    }
    try {
      const result = await this.client.Runtime.evaluate({
        expression: script,
        returnByValue: true,
      });
      return result.result?.value;
    } catch (error) {
      logger.error(`Failed to execute script: ${script}`, error);
      return null;
    }
  }

  async getDOM(): Promise<string> {
    if (!this.client) {
      logger.error("Client not connected, cannot get DOM");
      return "";
    }
    try {
      const { DOM } = this.client;
      const { root } = await DOM.getDocument({ depth: -1 });
      const { outerHTML } = await DOM.getOuterHTML({ nodeId: root.nodeId });
      return outerHTML;
    } catch (error) {
      logger.error("Failed to get DOM:", error);
      return "";
    }
  }

  async screenshot(
    format: "png" | "jpeg" = "png",
    quality?: number,
  ): Promise<string> {
    if (!this.client) {
      logger.error("Client not connected, cannot take screenshot");
      return "";
    }
    try {
      const { Page } = this.client;
      const result = await Page.captureScreenshot({
        format,
        quality: format === "jpeg" ? quality : undefined,
      });
      return result.data;
    } catch (error) {
      logger.error("Failed to take screenshot:", error);
      return "";
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      // 标记为手动关闭
      this.isClosed = true;
      this.isReconnecting = false;
      
      // 清除重连定时器
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      
      // 停止心跳检测
      this.stopHeartbeat();
      
      // 禁用网络监听器（如果开启了的话）
      if (this.networkListener && this.networkListener.isEnabled()) {
        this.networkListener.disable();
        logger.debug("[CDPClient] NetworkListener disabled on close");
      }
      this.networkListener?.clearCallbacks();
      if (this.loginStateChangeTimeout) {
        clearTimeout(this.loginStateChangeTimeout);
        this.loginStateChangeTimeout = null;
      }
      
      logger.info(
        `Closing connection: ${this.config.name || "unnamed"} ` +
        `(total connections: ${this.connectionCount})`
      );
      
      await this.client.close();
      this.client = null;
      this.networkListener = null;
    }
  }

  isConnected(): boolean {
      return this.client !== null && !this.isClosed;
    }
  
    getConnectionStats(): {
      connectionCount: number;
      reconnectAttempts: number;
      isReconnecting: boolean;
      isClosed: boolean;
      disconnectTime: number | null;
    } {
      return {
        connectionCount: this.connectionCount,
        reconnectAttempts: this.reconnectAttempts,
        isReconnecting: this.isReconnecting,
        isClosed: this.isClosed,
        disconnectTime: this.disconnectTime,
      };
    }
}
