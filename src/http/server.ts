import { BrowserHttpServer } from './HttpServer';

async function startServer() {
  const server = new BrowserHttpServer({
    port: 3000,
    host: '0.0.0.0'
  });

  await server.start();

  console.log(`
╔══════════════════════════════════════════════════════════╗
║           Browser Automation HTTP Server                ║
╠══════════════════════════════════════════════════════════╣
║  🌐 Server running at: http://localhost:3000             ║
║  📚 API Documentation:                                  ║
║     POST /api/browser/start  - Start browser session     ║
║     POST /api/browser/stop   - Stop browser session      ║
║     POST /api/page/navigate  - Navigate to URL          ║
║     POST /api/page/reload    - Reload page              ║
║     POST /api/page/execute   - Execute JavaScript        ║
║     GET  /api/page/title     - Get page title           ║
║     GET  /api/page/url       - Get page URL             ║
║     POST /api/page/screenshot - Take screenshot          ║
║     POST /api/element/exists - Check element exists     ║
║     POST /api/element/text   - Get element text         ║
║     POST /api/element/click  - Click element            ║
║     POST /api/element/setValue - Set element value      ║
║     POST /api/element/wait    - Wait for element         ║
║     POST /api/element/attribute - Get element attribute ║
╚══════════════════════════════════════════════════════════╝

Press Ctrl+C to stop the server
  `);

  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down server...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nShutting down server...');
    await server.stop();
    process.exit(0);
  });
}

startServer().catch(console.error);