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
  page: BrowserPage;
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
        const { sessionId, headless = true } = req.body;

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
        const page = new BrowserPage(client);

        this.clients.set(sessionId, { sessionId, chrome, client, page });

        res.json({ success: true, sessionId });
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
        await session.chrome.close();
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

    // ========== 页面操作 ==========

    // 导航到 URL
    this.app.post('/api/page/navigate', async (req: Request, res: Response) => {
      try {
        const { sessionId, url } = req.body;

        if (!sessionId || !url) {
          res.status(400).json({ success: false, error: 'sessionId and url are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        await session.page.navigate(url);

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

        await session.page.reload();

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
        const { sessionId, script } = req.body;

        if (!sessionId || !script) {
          res.status(400).json({ success: false, error: 'sessionId and script are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const result = await session.page.evaluate(script);

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
        const { sessionId } = req.query;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId as string);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const title = await session.page.getTitle();

        res.json({ success: true, title });
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
        const { sessionId } = req.query;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId as string);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const url = await session.page.getUrl();

        res.json({ success: true, url });
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
        const { sessionId, format = 'png' } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const screenshot = await session.page.screenshot(format);

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

    // ========== 元素操作 ==========

    // 检查元素是否存在
    this.app.post('/api/element/exists', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const locator = session.page.locator(selector);
        const exists = await locator.exists();

        res.json({ success: true, exists });
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
        const { sessionId, selector } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const locator = session.page.locator(selector);
        const text = await locator.getText();

        res.json({ success: true, text });
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
        const { sessionId, selector } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const locator = session.page.locator(selector);
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

    // 设置元素值
    this.app.post('/api/element/setValue', async (req: Request, res: Response) => {
      try {
        const { sessionId, selector, value } = req.body;

        if (!sessionId || !selector || value === undefined) {
          res.status(400).json({ success: false, error: 'sessionId, selector and value are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const locator = session.page.locator(selector);
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
        const { sessionId, selector, timeout = 30000 } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const locator = session.page.locator(selector);
        await session.page.waitForSelector(selector, { timeout });

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
        const { sessionId, selector, attribute } = req.body;

        if (!sessionId || !selector || !attribute) {
          res.status(400).json({ success: false, error: 'sessionId, selector and attribute are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const locator = session.page.locator(selector);
        const value = await locator.getAttribute(attribute);

        res.json({ success: true, value });
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

    // 随机等待
    this.app.post('/api/page/random-wait', async (req: Request, res: Response) => {
      try {
        const { sessionId, duration } = req.body;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const page = session.page;
        
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

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to random wait:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取页面 HTML
    this.app.get('/api/page/html', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.query;

        if (!sessionId) {
          res.status(400).json({ success: false, error: 'sessionId is required' });
          return;
        }

        const session = this.clients.get(sessionId as string);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const html = await session.page.getHTML();

        res.json({ success: true, html });
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
        const { sessionId, selector } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const locator = session.page.locator(selector);
        const texts = await locator.mustAllInnerTexts();

        res.json({ success: true, texts });
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
        const { sessionId, selector, attribute } = req.body;

        if (!sessionId || !selector || !attribute) {
          res.status(400).json({ success: false, error: 'sessionId, selector and attribute are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const locator = session.page.locator(selector);
        const attributes = await locator.mustAllGetAttributes(attribute);

        res.json({ success: true, attributes });
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
        const { sessionId, selector } = req.body;

        if (!sessionId || !selector) {
          res.status(400).json({ success: false, error: 'sessionId and selector are required' });
          return;
        }

        const session = this.clients.get(sessionId);
        if (!session) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }

        const locator = session.page.locator(selector);
        const count = await locator.getCount();

        res.json({ success: true, count });
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
        session.client.close().catch((err: Error) => logger.error('Error closing client:', err));
        session.chrome.close().catch((err: Error) => logger.error('Error closing chrome:', err));
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