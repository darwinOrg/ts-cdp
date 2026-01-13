import { BrowserHttpServer } from '../src/http/HttpServer';

async function testZhipinURL() {
  const server = new BrowserHttpServer({
    port: 3000,
    host: '0.0.0.0'
  });

  await server.start();

  console.log(`
╔══════════════════════════════════════════════════════════╗
║              BOSS直聘 URL 测试示例                        ║
╚══════════════════════════════════════════════════════════╝
  `);

  const sessionId = 'test-zhipin-session';
  const baseUrl = 'http://localhost:3000';
  const targetUrl = 'https://www.zhipin.com/gongsi/job/5d627415a46b4a750nJ9.html?ka=company-jobs';

  try {
    // ========== 步骤 1: 启动浏览器 ==========
    console.log('📌 步骤 1: 启动浏览器...');
    const startResponse = await fetch(`${baseUrl}/api/browser/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        headless: false  // 使用非无头模式，可以看到浏览器窗口
      })
    });

    const startData = await startResponse.json();
    console.log('✅ 浏览器启动成功:', startData);

    // 等待浏览器完全启动
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ========== 步骤 2: 导航到 BOSS直聘 ==========
    console.log(`\n📌 步骤 2: 导航到 BOSS直聘...`);
    console.log(`🔗 URL: ${targetUrl}`);
    
    const navigateResponse = await fetch(`${baseUrl}/api/page/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        url: targetUrl
      })
    });

    const navigateData = await navigateResponse.json();
    console.log('✅ 导航成功:', navigateData);

    // 等待页面加载（BOSS直聘可能需要更长时间）
    console.log('\n⏳ 等待页面加载...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // ========== 步骤 3: 获取页面标题 ==========
    console.log('\n📌 步骤 3: 获取页面标题...');
    const titleResponse = await fetch(`${baseUrl}/api/page/title?sessionId=${sessionId}`);
    const titleData: any = await titleResponse.json();
    console.log('✅ 页面标题:', titleData.title);

    // ========== 步骤 4: 获取页面 URL ==========
    console.log('\n📌 步骤 4: 获取页面 URL...');
    const urlResponse = await fetch(`${baseUrl}/api/page/url?sessionId=${sessionId}`);
    const urlData: any = await urlResponse.json();
    console.log('✅ 当前页面 URL:', urlData.url);

    // ========== 步骤 5: 检查页面 HTML ==========
    console.log('\n📌 步骤 5: 检查页面 HTML...');
    const htmlResponse = await fetch(`${baseUrl}/api/page/html?sessionId=${sessionId}`);
    const htmlData: any = await htmlResponse.json();
    console.log('✅ 页面 HTML 大小:', htmlData.html.length, '字符');
    
    // 检查是否包含关键内容
    const html = htmlData.html;
    const hasContent = html.includes('boss') || html.includes('zhipin') || html.includes('招聘');
    console.log('🔍 页面内容检查:', hasContent ? '✅ 包含招聘相关内容' : '⚠️ 未检测到预期内容');

    // ========== 步骤 6: 截图 ==========
    console.log('\n📌 步骤 6: 截图...');
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
      
      // 保存截图到文件
      const fs = require('fs');
      const screenshotPath = 'zhipin-screenshot.png';
      fs.writeFileSync(screenshotPath, Buffer.from(screenshotBuffer));
      console.log('💾 截图已保存到:', screenshotPath);
    }

    // ========== 步骤 7: 执行 JavaScript 检查页面状态 ==========
    console.log('\n📌 步骤 7: 执行 JavaScript 检查页面状态...');
    
    const checks = [
      {
        name: '页面标题',
        script: 'document.title'
      },
      {
        name: '页面 URL',
        script: 'window.location.href'
      },
      {
        name: '页面加载状态',
        script: 'document.readyState'
      },
      {
        name: '页面可见性',
        script: 'document.visibilityState'
      }
    ];

    for (const check of checks) {
      const scriptResponse = await fetch(`${baseUrl}/api/page/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          script: check.script
        })
      });

      const scriptData: any = await scriptResponse.json();
      console.log(`  ✅ ${check.name}:`, scriptData.result);
    }

    // ========== 步骤 8: 检查是否被识别为爬虫 ==========
    console.log('\n📌 步骤 8: 检查是否被识别为爬虫...');
    const antiBotCheckScript = `
      (function() {
        // 检查常见的反爬虫特征
        const checks = {
          hasWebDriver: !!navigator.webdriver,
          hasChrome: !!window.chrome,
          hasPermissions: !!navigator.permissions,
          hasPlugins: navigator.plugins.length > 0,
          languages: navigator.languages,
          userAgent: navigator.userAgent
        };
        return checks;
      })()
    `;

    const antiBotResponse = await fetch(`${baseUrl}/api/page/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        script: antiBotCheckScript
      })
    });

    const antiBotData: any = await antiBotResponse.json();
    console.log('✅ 反爬虫检测结果:', JSON.stringify(antiBotData.result, null, 2));

    // ========== 步骤 9: 随机等待 ==========
    console.log('\n📌 步骤 9: 随机等待（模拟真实用户行为）...');
    const randomWaitResponse = await fetch(`${baseUrl}/api/page/random-wait`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        duration: 'middle'  // 3-6秒
      })
    });

    const randomWaitData = await randomWaitResponse.json();
    console.log('✅ 随机等待完成:', randomWaitData);

    // ========== 步骤 10: 再次截图 ==========
    console.log('\n📌 步骤 10: 再次截图（等待后）...');
    const screenshotResponse2 = await fetch(`${baseUrl}/api/page/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        format: 'png'
      })
    });

    if (screenshotResponse2.ok) {
      const screenshotBuffer2 = await screenshotResponse2.arrayBuffer();
      const fs = require('fs');
      const screenshotPath2 = 'zhipin-screenshot-after-wait.png';
      fs.writeFileSync(screenshotPath2, Buffer.from(screenshotBuffer2));
      console.log('✅ 截图成功，大小:', screenshotBuffer2.byteLength, '字节');
      console.log('💾 截图已保存到:', screenshotPath2);
    }

    // ========== 步骤 11: 停止浏览器 ==========
    console.log('\n📌 步骤 11: 停止浏览器...');
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
testZhipinURL().catch(console.error);