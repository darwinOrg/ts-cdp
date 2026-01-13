import { BrowserHttpServer } from '../src/http/HttpServer';

async function testNavigateAPI() {
  const server = new BrowserHttpServer({
    port: 3000,
    host: '0.0.0.0'
  });

  await server.start();

  console.log(`
╔══════════════════════════════════════════════════════════╗
║              HTTP API 导航测试示例                        ║
╚══════════════════════════════════════════════════════════╝
  `);

  const sessionId = 'test-navigate-session';
  const baseUrl = 'http://localhost:3000';

  try {
    // ========== 步骤 1: 启动浏览器 ==========
    console.log('📌 步骤 1: 启动浏览器...');
    const startResponse = await fetch(`${baseUrl}/api/browser/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        headless: true
      })
    });

    const startData = await startResponse.json();
    console.log('✅ 浏览器启动成功:', startData);

    // ========== 步骤 2: 导航到百度 ==========
    console.log('\n📌 步骤 2: 导航到百度...');
    const navigateResponse1 = await fetch(`${baseUrl}/api/page/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        url: 'https://www.baidu.com'
      })
    });

    const navigateData1 = await navigateResponse1.json();
    console.log('✅ 导航到百度成功:', navigateData1);

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ========== 步骤 3: 获取页面标题 ==========
    console.log('\n📌 步骤 3: 获取页面标题...');
    const titleResponse1 = await fetch(`${baseUrl}/api/page/title?sessionId=${sessionId}`);
    const titleData1 = await titleResponse1.json();
    console.log('✅ 页面标题:', titleData1.title);

    // ========== 步骤 4: 导航到GitHub ==========
    console.log('\n📌 步骤 4: 导航到 GitHub...');
    const navigateResponse2 = await fetch(`${baseUrl}/api/page/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        url: 'https://github.com'
      })
    });

    const navigateData2 = await navigateResponse2.json();
    console.log('✅ 导航到 GitHub 成功:', navigateData2);

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ========== 步骤 5: 获取页面 URL ==========
    console.log('\n📌 步骤 5: 获取页面 URL...');
    const urlResponse = await fetch(`${baseUrl}/api/page/url?sessionId=${sessionId}`);
    const urlData = await urlResponse.json();
    console.log('✅ 当前页面 URL:', urlData.url);

    // ========== 步骤 6: 获取页面标题 ==========
    console.log('\n📌 步骤 6: 获取页面标题...');
    const titleResponse2 = await fetch(`${baseUrl}/api/page/title?sessionId=${sessionId}`);
    const titleData2 = await titleResponse2.json();
    console.log('✅ 页面标题:', titleData2.title);

    // ========== 步骤 7: 截图 ==========
    console.log('\n📌 步骤 7: 截图...');
    const screenshotResponse = await fetch(`${baseUrl}/api/page/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        format: 'png'
      })
    });

    if (screenshotResponse.ok) {
      const screenshotBuffer = await screenshotResponse.arrayBuffer();
      const base64 = Buffer.from(screenshotBuffer).toString('base64');
      console.log('✅ 截图成功，大小:', screenshotBuffer.byteLength, '字节');
      console.log('📸 截图数据 (base64 前100字符):', base64.substring(0, 100) + '...');
    }

    // ========== 步骤 8: 获取页面 HTML ==========
    console.log('\n📌 步骤 8: 获取页面 HTML...');
    const htmlResponse = await fetch(`${baseUrl}/api/page/html?sessionId=${sessionId}`);
    const htmlData = await htmlResponse.json();
    console.log('✅ 页面 HTML 大小:', htmlData.html.length, '字符');
    console.log('📄 HTML 前200字符:', htmlData.html.substring(0, 200) + '...');

    // ========== 步骤 9: 执行 JavaScript ==========
    console.log('\n📌 步骤 9: 执行 JavaScript...');
    const scriptResponse = await fetch(`${baseUrl}/api/page/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        script: 'document.location.href'
      })
    });

    const scriptData = await scriptResponse.json();
    console.log('✅ 执行结果:', scriptData.result);

    // ========== 步骤 10: 停止浏览器 ==========
    console.log('\n📌 步骤 10: 停止浏览器...');
    const stopResponse = await fetch(`${baseUrl}/api/browser/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });

    const stopData = await stopResponse.json();
    console.log('✅ 浏览器已停止:', stopData);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                  测试完成 ✅                            ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);

    // 尝试清理
    try {
      await fetch(`${baseUrl}/api/browser/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    } catch (cleanupError) {
      console.error('清理失败:', cleanupError);
    }
  } finally {
    await server.stop();
    process.exit(0);
  }
}

// 运行测试
testNavigateAPI().catch(console.error);