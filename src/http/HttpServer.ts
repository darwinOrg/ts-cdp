import express, { Request, Response } from 'express';
import { CDPClient } from '../browser/client';
import { BrowserPage } from '../browser/page';
import { launch } from '../launcher';
import { createLogger } from '../utils/logger';

const logger = createLogger('HttpServer');

export interface BrowserSession {
  sessionId: string;
  chrome: any;
  client: CDPClient;
  pages: Map<string, BrowserPage>; // 支持多页面管理
  isExternal: boolean; // 标识是否连接到外部浏览器
}

export interface HttpServerOptions {
  port: number;
  host?: string;
}

export class BrowserHttpServer {
  private app: express.Application;
  private server: any;
  private clients: Map<string, BrowserSession>;
  private port: number;
  private host: string;

  constructor(options: HttpServerOptions) {
    this.port = options.port;
    this.host = options.host || '0.0.0.0';
    this.app = express();
    this.clients = new Map();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private setupRoutes(): void {
    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', sessions: this.clients.size });
    });

    // ========== 浏览器操作 ==========

    // 启动浏览器
    this.app.post('/api/browser/start', async (req: Request, res: Response) => {
      try {
        const { sessionId, headless = false } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        if (this.clients.has(sessionId)) {
          res.status(400).json({ success: false, error: 'Session already exists' });
          return;
        }

        const chrome = await launch({ headless });
        const client = new CDPClient({ port: chrome.port, name: sessionId });
        await client.connect();
        
        // 获取所有已存在的页面
        const targets = await client.getPages();
        const pages = new Map<string, BrowserPage>();
        
        // 包装已存在的页面
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const pageId = `page-${i + 1}`;
          const page = new BrowserPage(client, { name: pageId });
          pages.set(pageId, page);
          logger.debug(`Wrapped existing page ${pageId} for target ${target.targetId}`);
        }

        this.clients.set(sessionId, {
          sessionId,
          chrome,
          client,
          pages,
          isExternal: false
        });

        res.json({ 
          success: true, 
          sessionId,
          pages: Array.from(pages.keys())
        });
      } catch (error) {
        logger.error('Failed to start browser:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 停止浏览器
    this.app.post('/api/browser/stop', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        await session.client.close();
        if (session.chrome) {
          await session.chrome.close();
        }
        this.clients.delete(sessionId);

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to stop browser:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 连接到现有浏览器
    this.app.post('/api/browser/connect', async (req: Request, res: Response) => {
      try {
        const { sessionId, port = 9222 } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        if (this.clients.has(sessionId)) {
          res.status(400).json({ success: false, error: 'Session already exists' });
          return;
        }

        const client = new CDPClient({ port, name: sessionId });
        await client.connect();
        const page = new BrowserPage(client);

        this.clients.set(sessionId, {
          sessionId,
          chrome: null, // 连接到外部浏览器,不需要 chrome 实例
          client,
          pages: new Map([['default', page]]),
          isExternal: true
        });

        res.json({ success: true, sessionId, port });
      } catch (error) {
        logger.error('Failed to connect to browser:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // ========== 页面操作 ==========

    // 创建新页面
    this.app.post('/api/page/new', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        // 自动生成页面ID
        const pageId = `page-${Date.now()}`;
        const page = new BrowserPage(session.client, { name: pageId });
        
        // 初始化页面
        await page.init();
        
        session.pages.set(pageId, page);

        res.json({ success: true, pageId });
      } catch (error) {
        logger.error('Failed to create new page:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 关闭页面
    this.app.post('/api/page/close', async (req: Request, res: Response) => {
      try {
        const { sessionId, pageId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        if (!pageId) {
          res.status(400).json({ success: false, error: 'pageId is required' });
          return;
        }

        const page = session.pages.get(pageId);
        if (page) {
          await page.close();
          session.pages.delete(pageId);
        }

        res.json({ success: true, pageId });
      } catch (error) {
        logger.error('Failed to close page:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 导航到 URL
    this.app.post('/api/page/navigate', async (req: Request, res: Response) => {
      try {
        const { sessionId, url, pageId } = req.body;

        if (!sessionId || !url) {
          res.status(400).json({ success: false, error: 'sessionId and url are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        await page.navigate(url);

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to navigate:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 刷新页面
    this.app.post('/api/page/reload', async (req: Request, res: Response) => {
      try {
        const { sessionId, pageId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        await page.reload();

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to reload:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 执行 JavaScript
    this.app.post('/api/page/execute', async (req: Request, res: Response) => {
      try {
        const { sessionId, script, pageId } = req.body;

        if (!sessionId || !script) {
          res.status(400).json({ success: false, error: 'sessionId and script are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const result = await page.evaluate(script);

        res.json({ success: true, result });
      } catch (error) {
        logger.error('Failed to execute script:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取页面标题
    this.app.get('/api/page/title', async (req: Request, res: Response) => {
      try {
        const { sessionId, pageId } = req.query;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId as string);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId as string);
        const title = await page.getTitle();

        res.json({ success: true, data: { title } });
      } catch (error) {
        logger.error('Failed to get title:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取页面 URL
    this.app.get('/api/page/url', async (req: Request, res: Response) => {
      try {
        const { sessionId, pageId } = req.query;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId as string);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId as string);
        const pageUrl = await page.getUrl();

        res.json({ success: true, data: { url: pageUrl } });
      } catch (error) {
        logger.error('Failed to get URL:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 截图
    this.app.post('/api/page/screenshot', async (req: Request, res: Response) => {
      try {
        const { sessionId, format = 'png', pageId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const screenshot = await page.screenshot(format);

        res.setHeader('Content-Type', `image/${format}`);
        res.send(screenshot);
      } catch (error) {
        logger.error('Failed to take screenshot:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 带加载状态的导航
    this.app.post('/api/page/navigate-with-loaded-state', async (req: Request, res: Response) => {
      try {
        const { sessionId, url, pageId } = req.body;

        if (!sessionId || !url) {
          res.status(400).json({ success: false, error: 'sessionId and url are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        await page.navigateWithLoadedState(url);

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to navigate with loaded state:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 带加载状态的刷新
    this.app.post('/api/page/reload-with-loaded-state', async (req: Request, res: Response) => {
      try {
        const { sessionId, pageId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        await page.reloadWithLoadedState();

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to reload with loaded state:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 等待加载状态 load
    this.app.post('/api/page/wait-for-load-state-load', async (req: Request, res: Response) => {
      try {
        const { sessionId, pageId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        await page.waitForLoadStateLoad();

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to wait for load state:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 等待 DOM 内容加载
    this.app.post('/api/page/wait-for-dom-content-loaded', async (req: Request, res: Response) => {
      try {
        const { sessionId, pageId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        await page.waitForDomContentLoaded();

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to wait for DOM content loaded:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 等待选择器可见
    this.app.post('/api/page/wait-for-selector-visible', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, pageId } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        await page.waitForSelectorStateVisible(selector);

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to wait for selector visible:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // ========== 元素操作 ==========

    // 检查元素是否存在
    this.app.post('/api/element/exists', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, pageId } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const locator = page.locator(selector);
        const exists = await locator.exists();

        res.json({ success: true, data: { exists } });
      } catch (error) {
        logger.error('Failed to check element exists:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取元素文本
    this.app.post('/api/element/text', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, pageId } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const locator = page.locator(selector);
        const text = await locator.getText();

        res.json({ success: true, data: { text } });
      } catch (error) {
        logger.error('Failed to get element text:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 点击元素
    this.app.post('/api/element/click', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, pageId } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const locator = page.locator(selector);
        await locator.click();

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to click element:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 鼠标悬停
    this.app.post('/api/element/hover', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, pageId } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const locator = page.locator(selector);
        await locator.hover();

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to hover element:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 设置元素值
    this.app.post('/api/element/setValue', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, value, pageId } = req.body;

        if (!sessionId || !selector || value === undefined) {
          res.status(400).json({ success: false, error: 'sessionId, selector and value are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const locator = page.locator(selector);
        await locator.setValue(value);

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to set element value:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 等待元素
    this.app.post('/api/element/wait', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, timeout = 30000, pageId } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const locator = page.locator(selector);
        await page.waitForSelector(selector, { timeout });

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to wait for element:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取元素属性
    this.app.post('/api/element/attribute', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, attribute, pageId } = req.body;

        if (!sessionId || !selector || !attribute) {
          res.status(400).json({ success: false, error: 'sessionId, selector and attribute are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const locator = page.locator(selector);
        const value = await locator.getAttribute(attribute);

        res.json({ success: true, data: { value } });
      } catch (error) {
        logger.error('Failed to get element attribute:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取所有会话
    this.app.get('/api/sessions', (req: Request, res: Response) => {
      const sessions = Array.from(this.clients.keys());
      res.json({ success: true, sessions });
    });

    // ========== 新增的 Playwright 常用功能 ==========

    // 期望响应文本
    this.app.post('/api/page/expect-response-text', async (req: Request, res: Response) => {
      try {
        const { sessionId, urlOrPredicate, callback, pageId } = req.body;

        if (!sessionId || !urlOrPredicate) {
          res.status(400).json({ success: false, error: 'sessionId and urlOrPredicate are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const text = await page.expectResponseText(
          urlOrPredicate,
          async () => {
            if (callback) {
              await page.evaluate(callback);
            }
          }
        );

        res.json({ success: true, data: { text } });
      } catch (error) {
        logger.error('Failed to expect response text:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 强制获取 inner text
    this.app.post('/api/page/must-inner-text', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, pageId } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const text = await page.mustInnerText(selector);

        res.json({ success: true, data: { text } });
      } catch (error) {
        logger.error('Failed to get inner text:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 强制获取 text content
    this.app.post('/api/page/must-text-content', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, pageId } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const text = await page.mustTextContent(selector);

        res.json({ success: true, data: { text } });
      } catch (error) {
        logger.error('Failed to get text content:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 暂停
    // 释放
    this.app.post('/api/page/release', async (req: Request, res: Response) => {
      try {
        const { sessionId, pageId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        page.release();

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to release:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 关闭所有页面
    this.app.post('/api/page/close-all', async (req: Request, res: Response) => {
      try {
        const { sessionId, pageId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        await page.closeAll();

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to close all:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 期望外部页面
    this.app.post('/api/page/expect-ext-page', async (req: Request, res: Response) => {
      try {
        const { sessionId, callback, pageId } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const newPage = await page.expectExtPage(async () => {
          if (callback) {
            await page.evaluate(callback);
          }
        });
        
        const newPageId = `page-${Date.now()}`;
        session.pages.set(newPageId, newPage);

        res.json({ success: true, pageId: newPageId });
      } catch (error) {
        logger.error('Failed to expect ext page:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取页面 HTML
    this.app.get('/api/page/html', async (req: Request, res: Response) => {
      try {
        const { sessionId, pageId } = req.query;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId as string);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId as string);
        const html = await page.getHTML();

        res.json({ success: true, data: { html } });
      } catch (error) {
        logger.error('Failed to get HTML:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取所有匹配元素的文本
    this.app.post('/api/element/all-texts', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, pageId } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const locator = page.locator(selector);
const texts = await locator.getAllTexts();

        res.json({ success: true, data: { texts } });
      } catch (error) {
        logger.error('Failed to get all element texts:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取所有匹配元素的属性
    this.app.post('/api/element/all-attributes', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, attribute, pageId } = req.body;

        if (!sessionId || !selector || !attribute) {
          res.status(400).json({ success: false, error: 'sessionId, selector and attribute are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const locator = page.locator(selector);
        const attributes = await locator.mustAllGetAttributes(attribute);

        res.json({ success: true, data: { attributes } });
      } catch (error) {
        logger.error('Failed to get all element attributes:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取元素数量
    this.app.post('/api/element/count', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, pageId } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = this.getPage(session, pageId);
        const locator = page.locator(selector);
        const count = await locator.getCount();

        res.json({ success: true, data: { count } });
      } catch (error) {
        logger.error('Failed to get element count:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 404 处理
    this.app.use((req, res) => {
      res.status(404).json({ success: false, error: 'Not found' });
    });

    // 错误处理
    this.app.use((err: Error, req: Request, res: Response, next: any) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: err.message
      });
    });
  }

  // 辅助方法：获取页面(必须提供 pageId)
  private getPage(session: BrowserSession, pageId: string): BrowserPage {
    const page = session.pages.get(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }
    return page;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, this.host, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          logger.info(`HTTP Server listening on ${this.host}:${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 关闭所有浏览器会话
      for (const session of this.clients.values()) {
        // 关闭所有页面
        for (const [pageId, page] of session.pages) {
          page.close().catch((err: Error) => logger.error(`Error closing page ${pageId}:`, err));
        }
        
        session.client.close().catch((err: Error) => logger.error('Error closing client:', err));
        
        // 只有在启动的浏览器时才需要关闭 chrome
        if (session.chrome && !session.isExternal) {
          session.chrome.close().catch((err: Error) => logger.error('Error closing chrome:', err));
        }
      }
      this.clients.clear();

      if (this.server) {
        this.server.close((err?: Error) => {
          if (err) {
            reject(err);
          } else {
            logger.info('HTTP Server stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}