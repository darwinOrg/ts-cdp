import { BrowserController } from './BrowserController';

async function startController() {
  const controller = new BrowserController({
    port: 3001,
    host: '0.0.0.0',
    chromePort: 9222
  });

  await controller.start();

  console.log(`
╔══════════════════════════════════════════════════════════╗
║           Browser Controller Server                       ║
╠══════════════════════════════════════════════════════════╣
║  🌐 Server running at: http://localhost:3001             ║
║  🔗 Chrome port: 9222                                     ║
╠══════════════════════════════════════════════════════════╣
║  📚 API Endpoints:                                        ║
║    POST   /api/connect      - Connect to browser          ║
║    POST   /api/disconnect   - Disconnect from browser     ║
║    POST   /api/navigate     - Navigate to URL            ║
║    POST   /api/open-url     - Connect + Navigate + Disconnect ⭐ ║
║    GET    /api/title        - Get page title             ║
║    GET    /api/url          - Get page URL               ║
║    GET    /api/html         - Get page HTML              ║
║    POST   /api/execute      - Execute JavaScript         ║
║    POST   /api/screenshot   - Take screenshot            ║
║    GET    /health           - Health check               ║
╚══════════════════════════════════════════════════════════╝

Press Ctrl+C to stop the server
  `);

  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down controller...');
    await controller.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nShutting down controller...');
    await controller.stop();
    process.exit(0);
  });
}

startController().catch(console.error);