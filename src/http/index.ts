import {BrowserHttpServer} from "./HttpServer";

async function startServer() {
    const server = new BrowserHttpServer({
        port: 3000,
        host: "0.0.0.0",
    });

    await server.start();

    console.log(`
╔══════════════════════════════════════════════════════════╗
║           Browser Automation HTTP Server                 ║
╠══════════════════════════════════════════════════════════╣
║  🌐 Server running at: http://localhost:3000             ║
║  📚 API Documentation: HTTP_API.md                       ║
╚══════════════════════════════════════════════════════════╝

Press Ctrl+C to stop the server
  `);

    // 优雅关闭
    process.on("SIGINT", async () => {
        console.log("\n\nShutting down server...");
        await server.stop();
        process.exit(0);
    });

    process.on("SIGTERM", async () => {
        console.log("\n\nShutting down server...");
        await server.stop();
        process.exit(0);
    });
}

startServer().catch(console.error);
