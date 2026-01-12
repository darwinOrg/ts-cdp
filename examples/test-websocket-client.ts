import WebSocket from 'ws';

class BrowserWebSocketClient {
  private ws: WebSocket;
  private sessionId: string;
  private messageHandlers: Map<string, (data: any) => void>;
  private requestHandlers: Map<string, (response: any) => void>;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.ws = new WebSocket(`ws://localhost:3001?sessionId=${sessionId}`);
    this.messageHandlers = new Map();
    this.requestHandlers = new Map();

    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    this.ws.on('open', () => {
      console.log('✓ WebSocket connected');
    });

    this.ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('✗ WebSocket disconnected');
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  private handleMessage(message: any): void {
    // 处理请求响应
    if (message.requestId && this.requestHandlers.has(message.requestId)) {
      const handler = this.requestHandlers.get(message.requestId)!;
      handler(message);
      this.requestHandlers.delete(message.requestId);
      return;
    }

    // 处理事件推送
    if (message.type === 'page_event') {
      console.log(`📡 Event: ${message.data.event} on page ${message.data.pageId}`);
      const handler = this.messageHandlers.get(message.data.event);
      if (handler) {
        handler(message.data);
      }
    }

    // 处理其他消息
    console.log(`📨 Message: ${message.type}`, message.data || '');
  }

  private send(type: string, pageId: string | undefined, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random()}`;
      
      const message = {
        type,
        pageId,
        data: {
          ...data,
          requestId
        }
      };

      // 设置响应处理器
      this.requestHandlers.set(requestId, (response: any) => {
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Request failed'));
        }
      });

      // 设置超时
      const timeout = setTimeout(() => {
        this.requestHandlers.delete(requestId);
        reject(new Error('Request timeout'));
      }, 30000);

      this.ws.send(JSON.stringify(message));
    });
  }

  async startBrowser(options: any = {}): Promise<any> {
    return this.send('start_browser', undefined, options);
  }

  async stopBrowser(): Promise<any> {
    return this.send('stop_browser', undefined, {});
  }

  async newPage(pageId?: string): Promise<any> {
    return this.send('new_page', undefined, { pageId });
  }

  async closePage(pageId: string): Promise<any> {
    return this.send('close_page', pageId, {});
  }

  async navigate(pageId: string, url: string, options?: any): Promise<any> {
    return this.send('navigate', pageId, { url, options });
  }

  async reload(pageId: string, options?: any): Promise<any> {
    return this.send('reload', pageId, { options });
  }

  async executeScript(pageId: string, script: string): Promise<any> {
    return this.send('execute_script', pageId, { script });
  }

  async getTitle(pageId: string): Promise<string> {
    const result = await this.send('get_title', pageId, {});
    return result.title;
  }

  async getUrl(pageId: string): Promise<string> {
    const result = await this.send('get_url', pageId, {});
    return result.url;
  }

  async screenshot(pageId: string, format: 'png' | 'jpeg' = 'png'): Promise<string> {
    const result = await this.send('screenshot', pageId, { format });
    return result.data;
  }

  async elementExists(pageId: string, selector: string): Promise<boolean> {
    const result = await this.send('element_exists', pageId, { selector });
    return result.exists;
  }

  async elementText(pageId: string, selector: string): Promise<string> {
    const result = await this.send('element_text', pageId, { selector });
    return result.text;
  }

  async elementClick(pageId: string, selector: string): Promise<void> {
    await this.send('element_click', pageId, { selector });
  }

  async elementSetValue(pageId: string, selector: string, value: string): Promise<void> {
    await this.send('element_set_value', pageId, { selector, value });
  }

  async elementWait(pageId: string, selector: string, options?: any): Promise<void> {
    await this.send('element_wait', pageId, { selector, options });
  }

  async elementAttribute(pageId: string, selector: string, attribute: string): Promise<string> {
    const result = await this.send('element_attribute', pageId, { selector, attribute });
    return result.value;
  }

  on(event: string, handler: (data: any) => void): void {
    this.messageHandlers.set(event, handler);
  }

  close(): void {
    this.ws.close();
  }
}

// 使用示例
async function testWebSocketClient() {
  console.log('=== Testing WebSocket Client ===\n');

  const client = new BrowserWebSocketClient('test-session');

  // 等待连接建立
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // 1. 启动浏览器
    console.log('1. Starting browser...');
    await client.startBrowser({
      headless: false
    });
    console.log('   ✓ Browser started\n');

    // 2. 创建新页面
    console.log('2. Creating new page...');
    const pageResult = await client.newPage('page-1');
    const pageId = pageResult.pageId;
    console.log(`   ✓ Page created: ${pageId}\n`);

    // 3. 导航到 URL
    console.log('3. Navigating to example.com...');
    await client.navigate(pageId, 'https://example.com');
    console.log('   ✓ Navigate successful\n');

    // 4. 获取标题
    console.log('4. Getting page title...');
    const title = await client.getTitle(pageId);
    console.log(`   ✓ Title: ${title}\n`);

    // 5. 获取 URL
    console.log('5. Getting page URL...');
    const url = await client.getUrl(pageId);
    console.log(`   ✓ URL: ${url}\n`);

    // 6. 检查元素
    console.log('6. Checking element exists...');
    const exists = await client.elementExists(pageId, 'h1');
    console.log(`   ✓ H1 exists: ${exists}\n`);

    // 7. 获取元素文本
    console.log('7. Getting element text...');
    const text = await client.elementText(pageId, 'h1');
    console.log(`   ✓ H1 text: ${text}\n`);

    // 8. 截图
    console.log('8. Taking screenshot...');
    const screenshot = await client.screenshot(pageId, 'png');
    console.log(`   ✓ Screenshot size: ${screenshot.length} bytes\n`);

    console.log('=== All tests passed! ===\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('Cleaning up...');
    client.close();
    console.log('✓ Cleanup complete\n');
  }
}

testWebSocketClient().catch(console.error);