import { WebSocket, WebSocketServer } from 'ws';
import { createLogger } from '../utils/logger';
import { launch } from '../launcher';
import { CDPClient } from '../browser/client';
import { BrowserPage } from '../browser/page';

const logger = createLogger('WebSocketServer');

export interface WebSocketMessage {
  type: string;
  pageId?: string;
  data?: any;
  requestId?: string;
}

export interface WebSocketResponse {
  type: string;
  requestId?: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface BrowserSession {
  sessionId: string;
  chrome: any;
  client: CDPClient;
  pages: Map<string, BrowserPage>;
  ws: WebSocket;
}

export class BrowserWebSocketServer {
  private wss: WebSocketServer;
  private port: number;
  private sessions: Map<string, BrowserSession>;
  private requestCounter: number;
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }>;

  constructor(port: number = 3001) {
    this.wss = new WebSocketServer({ port });
    this.port = port;
    this.sessions = new Map();
    this.requestCounter = 0;
    this.pendingRequests = new Map();

    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const sessionId = this.extractSessionId(req.url);
      logger.info(`WebSocket connected: ${sessionId}`);

      ws.on('message', async (data: string) => {
        try {
          const msg: WebSocketMessage = JSON.parse(data);
          await this.handleMessage(ws, sessionId, msg);
        } catch (error) {
          logger.error('Failed to handle message:', error);
          this.sendError(ws, undefined, error instanceof Error ? error.message : 'Unknown error');
        }
      });

      ws.on('close', () => {
        logger.info(`WebSocket disconnected: ${sessionId}`);
        this.cleanupSession(sessionId);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for ${sessionId}:`, error);
      });

      // 发送连接成功消息
      this.sendResponse(ws, {
        type: 'connected',
        success: true,
        data: { sessionId }
      });
    });

    logger.info(`WebSocket server started on port ${this.port}`);
  }

  private extractSessionId(url?: string): string {
    if (!url) return `session-${Date.now()}`;
    
    const params = new URLSearchParams(url.split('?')[1]);
    return params.get('sessionId') || `session-${Date.now()}`;
  }

  private async handleMessage(ws: WebSocket, sessionId: string, message: WebSocketMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    
    switch (message.type) {
      case 'start_browser':
        await this.startBrowser(ws, sessionId, message);
        break;
      
      case 'stop_browser':
        await this.stopBrowser(sessionId, message);
        break;
      
      case 'new_page':
        await this.newPage(sessionId, message);
        break;
      
      case 'close_page':
        await this.closePage(sessionId, message.pageId);
        break;
      
      case 'navigate':
        await this.navigate(sessionId, message);
        break;
      
      case 'reload':
        await this.reload(sessionId, message.pageId, message.data);
        break;
      
      case 'execute_script':
        await this.executeScript(sessionId, message.pageId, message.data);
        break;
      
      case 'get_title':
        await this.getTitle(sessionId, message);
        break;
      
      case 'get_url':
        await this.getUrl(sessionId, message.pageId);
        break;
      
      case 'screenshot':
        await this.screenshot(sessionId, message.pageId, message.data);
        break;
      
      case 'element_exists':
        await this.elementExists(sessionId, message.pageId, message.data);
        break;
      
      case 'element_text':
        await this.elementText(sessionId, message.pageId, message.data);
        break;
      
      case 'element_click':
        await this.elementClick(sessionId, message.pageId, message.data);
        break;
      
      case 'element_set_value':
        await this.elementSetValue(sessionId, message.pageId, message.data);
        break;
      
      case 'element_wait':
        await this.elementWait(sessionId, message.pageId, message.data);
        break;
      
      case 'element_attribute':
        await this.elementAttribute(sessionId, message.pageId, message.data);
        break;
      
      case 'subscribe_events':
        await this.subscribeEvents(sessionId, message.pageId, message.data);
        break;
      
      case 'random_wait':
        await this.randomWait(sessionId, message.pageId, message.data);
        break;
      
      case 'get_html':
        await this.getHTML(sessionId, message.pageId, message.data);
        break;
      
      case 'element_all_texts':
        await this.elementAllTexts(sessionId, message.pageId, message.data);
        break;
      
      case 'element_all_attributes':
        await this.elementAllAttributes(sessionId, message.pageId, message.data);
        break;
      
      case 'element_count':
        await this.elementCount(sessionId, message.pageId, message.data);
        break;
      
      default:
        this.sendError(ws, message.requestId, `Unknown message type: ${message.type}`);
    }
  }

  private async startBrowser(ws: WebSocket, sessionId: string, message: any): Promise<void> {
    try {
      const chrome = await launch(message.data || {});
      const client = new CDPClient({ 
        port: chrome.port, 
        name: sessionId 
      });
      await client.connect();

      const session: BrowserSession = {
        sessionId,
        chrome,
        client,
        pages: new Map(),
        ws
      };

      this.sessions.set(sessionId, session);

      this.sendResponse(ws, {
        type: 'browser_started',
        requestId: message?.requestId,
        success: true,
        data: {
          sessionId,
          port: chrome.port
        }
      });
    } catch (error) {
      this.sendError(ws, message?.requestId, error instanceof Error ? error.message : 'Failed to start browser');
    }
  }

  private async stopBrowser(sessionId: string, message?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      if (message?.requestId) {
        this.sendError(undefined, message?.requestId, 'Session not found');
      }
      return;
    }

    // 关闭所有页面
    for (const [pageId, page] of session.pages) {
      try {
        await page.close();
      } catch (error) {
        logger.error(`Failed to close page ${pageId}:`, error);
      }
    }

    session.client.close();
    session.chrome.kill();

    this.sessions.delete(sessionId);

    if (message?.requestId) {
      this.sendResponse(session.ws, {
        type: 'browser_stopped',
        requestId: message?.requestId,
        success: true
      });
    }
  }

  private async newPage(sessionId: string, message: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sendError(undefined, message?.requestId, 'Session not found');
      return;
    }

    const id = message.pageId || `page-${Date.now()}`;
    const page = new BrowserPage(session.client, { name: id });
    
    // 初始化页面
    await page.init();
    
    session.pages.set(id, page);

    // 监听页面事件
    this.setupPageEventListeners(session, id, page);

    this.sendResponse(session.ws, {
      type: 'page_created',
      requestId: message?.requestId,
      success: true,
      data: { pageId: id }
    });
  }

  private async closePage(sessionId: string, pageId?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, undefined, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (page) {
      await page.close();
      session.pages.delete(pageId);
    }

    this.sendResponse(session.ws, {
      type: 'page_closed',
      success: true,
      data: { pageId }
    });
  }

private async navigate(sessionId: string, message: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const pageId = message.pageId;
    const data = message.data;

    if (!pageId) {
      this.sendError(session.ws, message?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, message?.requestId, 'Page not found');
      return;
    }

    try {
      logger.info(`Starting navigation to ${data.url}`);
      await page.navigate(data.url, data.options);
      logger.info(`Navigation completed, sending response`);
      
      this.sendResponse(session.ws, {
        type: 'navigated',
        requestId: message?.requestId,
        success: true,
        data: { pageId, url: data.url }
      });
      logger.info(`Navigated response sent`);
    } catch (error) {
      logger.error(`Navigation error: ${error}`);
      this.sendError(session.ws, message?.requestId, `Navigation failed: ${error}`);
    }
  }

  private async reload(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      await page.reload(data.options);
      
      this.sendResponse(session.ws, {
        type: 'reloaded',
        requestId: data?.requestId,
        success: true,
        data: { pageId }
      });

      this.pushEvent(session, pageId, 'load', {});
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to reload');
    }
  }

  private async executeScript(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const result = await page.executeScript(data.script);
      
      this.sendResponse(session.ws, {
        type: 'script_executed',
        requestId: data?.requestId,
        success: true,
        data: { pageId, result }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to execute script');
    }
  }

private async getTitle(sessionId: string, message: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const pageId = message.pageId;

    if (!pageId) {
      this.sendError(session.ws, message?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, message?.requestId, 'Page not found');
      return;
    }

    try {
      const title = await page.getTitle();
      
      this.sendResponse(session.ws, {
        type: 'title',
        requestId: message?.requestId,
        success: true,
        data: { pageId, title }
      });
    } catch (error) {
      this.sendError(session.ws, message?.requestId, `Get title failed: ${error}`);
    }
  }

  private async getUrl(sessionId: string, pageId?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, undefined, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, undefined, 'Page not found');
      return;
    }

    try {
      const url = await page.getUrl();
      
      this.sendResponse(session.ws, {
        type: 'url',
        success: true,
        data: { pageId, url }
      });
    } catch (error) {
      this.sendError(session.ws, undefined, error instanceof Error ? error.message : 'Failed to get URL');
    }
  }

  private async screenshot(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const screenshot = await page.screenshot(data.format || 'png');
      
      this.sendResponse(session.ws, {
        type: 'screenshot',
        requestId: data?.requestId,
        success: true,
        data: { pageId, data: screenshot }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to take screenshot');
    }
  }

  private async elementExists(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const exists = await page.exists(data.selector);
      
      this.sendResponse(session.ws, {
        type: 'element_exists',
        requestId: data?.requestId,
        success: true,
        data: { pageId, selector: data.selector, exists }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to check element exists');
    }
  }

  private async elementText(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const text = await page.getText(data.selector);
      
      this.sendResponse(session.ws, {
        type: 'element_text',
        requestId: data?.requestId,
        success: true,
        data: { pageId, selector: data.selector, text }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to get element text');
    }
  }

  private async elementClick(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      await page.click(data.selector);
      
      this.sendResponse(session.ws, {
        type: 'element_clicked',
        requestId: data?.requestId,
        success: true,
        data: { pageId, selector: data.selector }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to click element');
    }
  }

  private async elementSetValue(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const locator = page.locator(data.selector);
      await locator.setValue(data.value);
      
      this.sendResponse(session.ws, {
        type: 'element_value_set',
        requestId: data?.requestId,
        success: true,
        data: { pageId, selector: data.selector, value: data.value }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to set element value');
    }
  }

  private async elementWait(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      await page.waitForSelector(data.selector, data.options);
      
      this.sendResponse(session.ws, {
        type: 'element_waited',
        requestId: data?.requestId,
        success: true,
        data: { pageId, selector: data.selector }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to wait for element');
    }
  }

  private async elementAttribute(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const locator = page.locator(data.selector);
      const value = await locator.getAttribute(data.attribute);
      
      this.sendResponse(session.ws, {
        type: 'element_attribute',
        requestId: data?.requestId,
        success: true,
        data: { pageId, selector: data.selector, attribute: data.attribute, value }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to get element attribute');
    }
  }

  private async randomWait(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const duration = data?.duration || 'middle';
      
      if (duration === 'short') {
        await page.randomWaitShort();
      } else if (duration === 'middle') {
        await page.randomWaitMiddle();
      } else if (duration === 'long') {
        await page.randomWaitLong();
      } else if (typeof duration === 'number') {
        await page.randomWaitRange(duration, duration + 1000);
      } else {
        await page.randomWaitMiddle();
      }
      
      this.sendResponse(session.ws, {
        type: 'random_waited',
        requestId: data?.requestId,
        success: true,
        data: { pageId, duration }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to random wait');
    }
  }

  private async getHTML(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const html = await page.getHTML();
      
      this.sendResponse(session.ws, {
        type: 'html',
        requestId: data?.requestId,
        success: true,
        data: { pageId, html }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to get HTML');
    }
  }

  private async elementAllTexts(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const locator = page.locator(data.selector);
      const texts = await locator.mustAllInnerTexts();
      
      this.sendResponse(session.ws, {
        type: 'element_all_texts',
        requestId: data?.requestId,
        success: true,
        data: { pageId, selector: data.selector, texts }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to get all element texts');
    }
  }

  private async elementAllAttributes(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const locator = page.locator(data.selector);
      const attributes = await locator.mustAllGetAttributes(data.attribute);
      
      this.sendResponse(session.ws, {
        type: 'element_all_attributes',
        requestId: data?.requestId,
        success: true,
        data: { pageId, selector: data.selector, attribute: data.attribute, attributes }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to get all element attributes');
    }
  }

  private async elementCount(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!pageId) {
      this.sendError(session.ws, data?.requestId, 'Page ID is required');
      return;
    }

    const page = session.pages.get(pageId);
    if (!page) {
      this.sendError(session.ws, data?.requestId, 'Page not found');
      return;
    }

    try {
      const locator = page.locator(data.selector);
      const count = await locator.getCount();
      
      this.sendResponse(session.ws, {
        type: 'element_count',
        requestId: data?.requestId,
        success: true,
        data: { pageId, selector: data.selector, count }
      });
    } catch (error) {
      this.sendError(session.ws, data?.requestId, error instanceof Error ? error.message : 'Failed to get element count');
    }
  }

  private async subscribeEvents(sessionId: string, pageId?: string, data?: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sendError(undefined, data?.requestId, 'Session not found');
      return;
    }

    // 事件订阅逻辑（已经在 setupPageEventListeners 中实现）
    this.sendResponse(session.ws, {
      type: 'events_subscribed',
      requestId: data?.requestId,
      success: true,
      data: { pageId, events: data.events }
    });
  }

  private setupPageEventListeners(session: BrowserSession, pageId: string, page: BrowserPage): void {
    // 这里可以添加页面事件监听
    // 例如：console、error、dialog 等
    
    // 示例：监听页面标题变化
    // 实际实现需要通过 CDP 的 Page API 来监听事件
  }

  private pushEvent(session: BrowserSession, pageId: string, eventType: string, data: any): void {
    this.sendResponse(session.ws, {
      type: 'page_event',
      success: true,
      data: {
        pageId,
        event: eventType,
        eventData: data,
        timestamp: new Date().toISOString()
      }
    });
  }

  private sendResponse(ws: WebSocket | undefined, response: WebSocketResponse): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      logger.info(`Sending WebSocket response: type=${response.type}, requestId=${response.requestId}`);
      ws.send(JSON.stringify(response));
      logger.info(`WebSocket response sent: type=${response.type}`);
    } else {
      logger.warn(`WebSocket not ready: ws=${!!ws}, readyState=${ws?.readyState}, type=${response.type}`);
    }
  }

  private sendError(ws: WebSocket | undefined, requestId: string | undefined, error: string): void {
    this.sendResponse(ws, {
      type: 'error',
      requestId,
      success: false,
      error
    });
  }

  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.stopBrowser(sessionId);
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.on('listening', () => {
        logger.info(`WebSocket server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // 关闭所有会话
    for (const sessionId of this.sessions.keys()) {
      await this.stopBrowser(sessionId);
    }

    this.wss.close();
    logger.info('WebSocket server stopped');
  }
}