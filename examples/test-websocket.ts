import { BrowserWebSocketServer } from '../src/websocket/server';
import WebSocket from 'ws';

async function testWebSocket() {
  console.log('=== Testing WebSocket Server ===\n');

  // 1. 启动 WebSocket 服务器
  console.log('1. Starting WebSocket server...');
  const server = new BrowserWebSocketServer(3001);
  await server.start();
  console.log('   ✓ WebSocket server started\n');

  // 2. 等待服务器就绪
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 3. 创建 WebSocket 客户端
  console.log('2. Connecting WebSocket client...');
  const ws = new WebSocket('ws://localhost:3001?sessionId=test-session');

  await new Promise((resolve) => {
    ws.on('open', () => {
      console.log('   ✓ WebSocket connected\n');
      resolve(undefined);
    });
  });

  // 4. 测试消息处理
  console.log('3. Testing message handling...\n');

  // 启动浏览器
  console.log('   3.1 Starting browser...');
  ws.send(JSON.stringify({
    type: 'start_browser',
    data: { headless: false }
  }));

  // 创建页面
  console.log('   3.2 Creating page...');
  ws.send(JSON.stringify({
    type: 'new_page',
    data: { pageId: 'page-1' }
  }));

  // 导航
  console.log('   3.3 Navigating to example.com...');
  ws.send(JSON.stringify({
    type: 'navigate',
    pageId: 'page-1',
    data: { url: 'https://example.com' }
  }));

  // 等待操作完成
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 5. 关闭
  console.log('\n4. Cleaning up...');
  ws.send(JSON.stringify({
    type: 'stop_browser'
  }));

  await new Promise(resolve => setTimeout(resolve, 1000));

  ws.close();
  await server.stop();

  console.log('   ✓ All tests completed\n');
  console.log('=== WebSocket Test Complete ===\n');
}

testWebSocket().catch(console.error);