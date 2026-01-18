import { CDPClient, BrowserPage } from '../src';

async function testWaitForLoadState() {
  console.log('=== 测试 waitForLoadState ===\n');

  try {
    // 连接到现有浏览器
    const client = new CDPClient({
      port: 9222,
      name: 'waitforloadstate-test'
    });
    await client.connect();
    console.log('✓ 已连接到现有浏览器\n');

    // 创建 BrowserPage
    const page = new BrowserPage(client, { name: 'test-page' });
    await page.init();
    console.log('✓ BrowserPage 已初始化\n');

    // 使用 navigate 方法（会调用 waitForLoadState）
    console.log('1. 使用 navigate 方法（会调用 waitForLoadState）');
    await page.navigate('https://www.zhipin.com/gongsi/job/480261c022ea03d81nV53tQ~.html?ka=company-jobs');
    console.log('✓ 导航完成\n');

    // 获取当前 URL
    const url = await page.getUrl();
    console.log(`当前 URL: ${url}\n`);

    await client.close();
    console.log('✓ 测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testWaitForLoadState().catch(console.error);