import { BrowserHttpServer } from '../src/http/HttpServer';

async function testZhipinSimple() {
  const server = new BrowserHttpServer({
    port: 3000,
    host: '0.0.0.0'
  });

  await server.start();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║              BOSS直聘 URL 简单测试                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const sessionId = 'test-zhipin-simple';
  const baseUrl = 'http://localhost:3000';
  const targetUrl = 'https://www.zhipin.com/gongsi/job/5d627415a46b4a750nJ9.html?ka=company-jobs';

  try {
    // 1. 启动浏览器
    console.log('📌 步骤 1: 启动浏览器...');
    const startResponse = await fetch(`${baseUrl}/api/browser/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        headless: true
      })
    });
    const startData: any = await startResponse.json();
    console.log('✅ 浏览器启动成功:', startData.success);

    // 等待启动
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. 导航到 BOSS直聘
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
    const navigateData: any = await navigateResponse.json();
    console.log('✅ 导航结果:', navigateData.success ? '成功' : '失败');
    if (!navigateData.success) {
      console.log('❌ 错误:', navigateData.error);
    }

    // 等待页面加载
    console.log('\n⏳ 等待页面加载...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. 获取页面信息
    console.log('\n📌 步骤 3: 获取页面信息...');
    
    const titleResponse = await fetch(`${baseUrl}/api/page/title?sessionId=${sessionId}`);
    const titleData: any = await titleResponse.json();
    console.log('📄 页面标题:', titleData.title || 'N/A');

    const urlResponse = await fetch(`${baseUrl}/api/page/url?sessionId=${sessionId}`);
    const urlData: any = await urlResponse.json();
    console.log('🔗 当前 URL:', urlData.url || 'N/A');

    // 4. 停止浏览器
    console.log('\n📌 步骤 4: 停止浏览器...');
    const stopResponse = await fetch(`${baseUrl}/api/browser/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    const stopData: any = await stopResponse.json();
    console.log('✅ 浏览器已停止');

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                  测试完成 ✅                            ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
  } finally {
    await server.stop();
    process.exit(0);
  }
}

testZhipinSimple().catch(console.error);