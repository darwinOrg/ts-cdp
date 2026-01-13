import express, { Request, Response } from 'express';
import { CDPClient } from '../browser/client';
import { BrowserPage } from '../browser/page';
import { createLogger } from '../utils/logger';

const logger = createLogger('BrowserController');

export interface BrowserControllerOptions {
  port?: number;
  host?: string;
  chromePort?: number;
}

export class BrowserController {
  private app: express.Application;
  private server: any;
  private port: number;
  private host: string;
  private chromePort: number;
  private client: CDPClient | null;
  private page: BrowserPage | null;

  constructor(options: BrowserControllerOptions = {}) {
    this.port = options.port || 3001;
    this.host = options.host || '0.0.0.0';
    this.chromePort = options.chromePort || 9222;
    this.client = null;
    this.page = null;
    this.app = express();
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
      res.json({ 
        status: 'ok', 
        connected: this.client !== null,
        chromePort: this.chromePort 
      });
    });

    // 连接到浏览器
    this.app.post('/api/connect', async (req: Request, res: Response) => {
      try {
        if (this.client) {
          await this.client.close();
          this.client = null;
          this.page = null;
        }

        const { port } = req.body;
        const chromePort = port || this.chromePort;

        this.client = new CDPClient({ 
          port: chromePort, 
          name: 'browser-controller' 
        });
        
        await this.client.connect();
        this.page = new BrowserPage(this.client);

        res.json({ 
          success: true, 
          message: 'Connected to browser',
          chromePort 
        });
      } catch (error) {
        logger.error('Failed to connect to browser:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 断开连接
    this.app.post('/api/disconnect', async (req: Request, res: Response) => {
      try {
        if (this.client) {
          await this.client.close();
          this.client = null;
          this.page = null;
        }

        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to disconnect:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 导航到 URL
    this.app.post('/api/navigate', async (req: Request, res: Response) => {
      try {
        if (!this.client || !this.page) {
          res.status(400).json({ success: false, error: 'Not connected to browser' });
          return;
        }

        const { url } = req.body;

        if (!url) {
          res.status(400).json({ success: false, error: 'URL is required' });
          return;
        }

        // 获取当前页面信息
        const currentTitle = await this.page.getTitle();
        const currentURL = await this.page.getUrl();

        // 执行导航
        const cdp = this.client.getClient();
        if (!cdp) {
          throw new Error('CDP client not available');
        }

        await cdp.Page.navigate({ url });

        res.json({ 
          success: true, 
          message: 'Navigation request sent',
          previous: {
            title: currentTitle,
            url: currentURL
          },
          target: url
        });
      } catch (error) {
        logger.error('Failed to navigate:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取页面标题
    this.app.get('/api/title', async (req: Request, res: Response) => {
      try {
        if (!this.client || !this.page) {
          res.status(400).json({ success: false, error: 'Not connected to browser' });
          return;
        }

        const title = await this.page.getTitle();
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
    this.app.get('/api/url', async (req: Request, res: Response) => {
      try {
        if (!this.client || !this.page) {
          res.status(400).json({ success: false, error: 'Not connected to browser' });
          return;
        }

        const url = await this.page.getUrl();
        res.json({ success: true, url });
      } catch (error) {
        logger.error('Failed to get URL:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 获取页面 HTML
    this.app.get('/api/html', async (req: Request, res: Response) => {
      try {
        if (!this.client || !this.page) {
          res.status(400).json({ success: false, error: 'Not connected to browser' });
          return;
        }

        const html = await this.page.getHTML();
        res.json({ success: true, html });
      } catch (error) {
        logger.error('Failed to get HTML:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 执行 JavaScript
    this.app.post('/api/execute', async (req: Request, res: Response) => {
      try {
        if (!this.client || !this.page) {
          res.status(400).json({ success: false, error: 'Not connected to browser' });
          return;
        }

        const { script } = req.body;

        if (!script) {
          res.status(400).json({ success: false, error: 'Script is required' });
          return;
        }

        const result = await this.page.evaluate(script);
        res.json({ success: true, result });
      } catch (error) {
        logger.error('Failed to execute script:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 截图
    this.app.post('/api/screenshot', async (req: Request, res: Response) => {
      try {
        if (!this.client || !this.page) {
          res.status(400).json({ success: false, error: 'Not connected to browser' });
          return;
        }

        const { format = 'png' } = req.body;
        const screenshot = await this.page.screenshot(format);

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

    // 复合操作：连接 -> 导航 -> 断开
    this.app.post('/api/open-url', async (req: Request, res: Response) => {
      try {
        const { url, port } = req.body;

        if (!url) {
          res.status(400).json({ success: false, error: 'URL is required' });
          return;
        }

        const chromePort = port || this.chromePort;

        // 步骤 1: 连接到浏览器
        logger.info(`Connecting to browser on port ${chromePort}...`);
        
        if (this.client) {
          await this.client.close();
        }

        this.client = new CDPClient({ 
          port: chromePort, 
          name: 'browser-controller' 
        });
        
        await this.client.connect();
        this.page = new BrowserPage(this.client);

        // 获取当前页面信息（导航前）
        const beforeTitle = await this.page.getTitle();
        const beforeURL = await this.page.getUrl();

        // 步骤 2: 在新标签页中打开 URL
        logger.info(`Opening new tab with URL: ${url}`);
        
        const cdp = this.client.getClient();
        if (!cdp) {
          throw new Error('CDP client not available');
        }

        // 创建新标签页
        const { targetId } = await cdp.Target.createTarget({ url });
        logger.info(`Created new tab with targetId: ${targetId}`);

        // 连接到新标签页
        await cdp.Target.attachToTarget({ targetId });
        logger.info(`Attached to new tab`);

        // 等待页面加载
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 步骤 3: 等待页面加载
        logger.info('Waiting for page to load...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 获取导航后的页面信息
        const afterTitle = await this.page.getTitle();
        const afterURL = await this.page.getUrl();

        // 步骤 4: 断开连接
        logger.info('Disconnecting from browser...');
        await this.client.close();
        this.client = null;
        this.page = null;

        res.json({ 
          success: true, 
          message: 'URL opened successfully',
          chromePort,
          url,
          before: {
            title: beforeTitle,
            url: beforeURL
          },
          after: {
            title: afterTitle,
            url: afterURL
          }
        });
      } catch (error) {
        logger.error('Failed to open URL:', error);
        
        // 尝试清理
        if (this.client) {
          this.client.close().catch(err => logger.error('Error during cleanup:', err));
          this.client = null;
          this.page = null;
        }

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
          logger.info(`Browser Controller listening on ${this.host}:${this.port}`);
          logger.info(`Chrome port: ${this.chromePort}`);
          resolve();
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.client) {
        this.client.close().catch(err => logger.error('Error closing client:', err));
        this.client = null;
        this.page = null;
      }

      if (this.server) {
        this.server.close((err?: Error) => {
          if (err) {
            reject(err);
          } else {
            logger.info('Browser Controller stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}