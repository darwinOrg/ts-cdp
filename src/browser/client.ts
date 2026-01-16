import CDP from 'chrome-remote-interface';
import { NetworkListener } from '../network/listener';
import { createLogger } from '../utils/logger';
import type {
  CDPClientOptions,
  CDPClientConfig,
  NetworkListenerConfig,
  LoginState,
  LoginCallback,
  DisconnectCallback
} from '../types';

const logger = createLogger('CDPClient');

export class CDPClient {
  private client: CDP.Client | null;
  private networkListener: NetworkListener | null;
  private config: CDPClientConfig;
  private options: CDPClientOptions;
  private currentUrl: string;

  constructor(config: CDPClientConfig, options: Partial<CDPClientOptions> = {}) {
    this.config = config;
    this.options = {
      host: '127.0.0.1',
      port: config.port,
      ...options
    };
    this.client = null;
    this.networkListener = null;
    this.currentUrl = '';
  }

  async connect(): Promise<CDP.Client> {
    try {
      this.client = await (CDP as any)({
        host: this.options.host!,
        port: this.options.port
      });

      if (!this.client) {
        throw new Error('Failed to create CDP client');
      }

      this.client.on('disconnect', () => {
        logger.info(`Disconnected from port ${this.options.port}`);
        if (this.config.disconnectCallback) {
          this.config.disconnectCallback();
        }
        this.client?.close();
      });

      this.client.on('ready', () => {
        logger.info(`Client ready: ${this.config.name || 'unnamed'}`);
      });

      const { Page, DOM, Network, Overlay } = this.client;
      await Promise.all([
        Page.enable(),
        Network.enable(),
        DOM.enable(),
        Overlay.enable()
      ]);

      this.currentUrl = await this.getCurrentUrl();

      await this.initNetworkListener();

      if (this.config.loginCallback && this.config.loginUrlPatterns) {
        await this.initLoginStatus();
      }

      return this.client;
    } catch (error) {
      logger.error('Failed to connect to CDP', error);
      throw error;
    }
  }

  getClient(): CDP.Client | null {
    return this.client;
  }

  async getPages(): Promise<any[]> {
    if (!this.client) return [];
    try {
      const targets = await this.client.Target.getTargets();
      return targets.targetInfos.filter((t: any) => t.type === 'page');
    } catch (error) {
      logger.error('Failed to get pages:', error);
      return [];
    }
  }

  private async getCurrentUrl(): Promise<string> {
    if (!this.client) return '';
    try {
      const frameTree = await this.client.Page.getFrameTree();
      return frameTree.frameTree.frame.url;
    } catch {
      return '';
    }
  }

  private async initNetworkListener(): Promise<void> {
    if (!this.client) return;

    const networkConfig: NetworkListenerConfig = {
      watchUrls: this.config.watchUrls,
      enableHAR: true
    };

    this.networkListener = new NetworkListener(this.client, networkConfig);
    await this.networkListener.init();
  }

  private async initLoginStatus(): Promise<void> {
    if (!this.client || !this.config.loginUrlPatterns || !this.config.loginCallback) return;

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

  private handleNavigation(newUrl: string, loginUrl: string, targetPrefix: string): void {
    const prevUrl = this.currentUrl;
    
    if (prevUrl.startsWith(targetPrefix) && !newUrl.startsWith(targetPrefix)) {
      logger.info('User logged out', { prevUrl, newUrl });
      this.config.loginCallback?.('logout');
    } else if (prevUrl === loginUrl && newUrl.startsWith(targetPrefix)) {
      logger.info('User logged in', { newUrl });
      this.config.loginCallback?.('login');
    }
    
    this.currentUrl = newUrl;
  }

  addNetworkCallback(url: string, callback: (response: any, request?: string) => void): void {
    this.networkListener?.addCallback(url, callback);
  }

  removeNetworkCallback(url: string): void {
    this.networkListener?.removeCallback(url);
  }

  getHAR() {
    return this.networkListener?.getHAR();
  }

  async navigate(url: string): Promise<void> {
    if (!this.client) throw new Error('Client not connected');
    await this.client.Page.navigate({ url });
  }

  async reload(): Promise<void> {
    if (!this.client) throw new Error('Client not connected');
    await this.client.Page.reload();
  }

  async executeScript(script: string): Promise<any> {
    if (!this.client) throw new Error('Client not connected');
    const result = await this.client.Runtime.evaluate({
      expression: script,
      returnByValue: true
    });
    return result.result?.value;
  }

  async getDOM(): Promise<string> {
    if (!this.client) throw new Error('Client not connected');
    const { DOM } = this.client;
    const { root } = await DOM.getDocument({ depth: -1 });
    const { outerHTML } = await DOM.getOuterHTML({ nodeId: root.nodeId });
    return outerHTML;
  }

  async screenshot(format: 'png' | 'jpeg' = 'png', quality?: number): Promise<string> {
    if (!this.client) throw new Error('Client not connected');
    const { Page } = this.client;
    const result = await Page.captureScreenshot({
      format,
      quality: format === 'jpeg' ? quality : undefined
    });
    return result.data;
  }

  async close(): Promise<void> {
    if (this.client) {
      this.networkListener?.clearCallbacks();
      await this.client.close();
      this.client = null;
      this.networkListener = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}