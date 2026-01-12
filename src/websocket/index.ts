import { BrowserWebSocketServer } from './server';

async function startWebSocketServer() {
  const server = new BrowserWebSocketServer(3001);

  await server.start();

  console.log(`
╔══════════════════════════════════════════════════════════╗
║        Browser Automation WebSocket Server              ║
╠══════════════════════════════════════════════════════════╣
║  🌐 WebSocket server running on ws://localhost:3001      ║
║  📚 WebSocket Documentation:                            ║
║     Connect: ws://localhost:3001?sessionId=xxx           ║
║                                                          ║
║  消息格式:                                               ║
║  {                                                       ║
║    "type": "navigate",                                  ║
║    "pageId": "page-123",                                ║
║    "data": { "url": "https://example.com" }            ║
║  }                                                       ║
║                                                          ║
║  支持的操作类型:                                         ║
║    - start_browser: 启动浏览器                           ║
║    - stop_browser: 停止浏览器                            ║
║    - new_page: 创建新页面                                ║
║    - close_page: 关闭页面                                ║
║    - navigate: 导航到 URL                                ║
║    - reload: 刷新页面                                    ║
║    - execute_script: 执行 JavaScript                    ║
║    - get_title: 获取页面标题                              ║
║    - get_url: 获取页面 URL                               ║
║    - screenshot: 截图                                    ║
║    - element_exists: 检查元素存在                        ║
║    - element_text: 获取元素文本                          ║
║    - element_click: 点击元素                             ║
║    - element_set_value: 设置元素值                       ║
║    - element_wait: 等待元素                              ║
║    - element_attribute: 获取元素属性                     ║
║    - subscribe_events: 订阅事件                          ║
╚══════════════════════════════════════════════════════════╝

Press Ctrl+C to stop the server
  `);

  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down WebSocket server...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nShutting down WebSocket server...');
    await server.stop();
    process.exit(0);
  });
}

startWebSocketServer().catch(console.error);