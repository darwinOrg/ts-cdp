import { CDPClient } from '../src';

async function testSimpleNavigate() {
  console.log('=== 测试简单的 navigate ===\n');

  try {
    // 连接到现有浏览器
    const client = new CDPClient({
      port: 9222,
      name: 'simple-navigate-test'
    });
    await client.connect();
    console.log('✓ 已连接到现有浏览器\n');

    // 获取 Page 对象
    const page = client.getClient()?.Page;
    if (!page) {
      console.error('Page 对象不存在');
      return;
    }

    // 直接使用 Page.navigate，不等待
    console.log('1. 访问页面（不等待）');
    await page.navigate({
      url: 'https://www.zhipin.com/gongsi/job/480261c022ea03d81nV53tQ~.html?ka=company-jobs'
    });
    console.log('✓ 导航命令已发送\n');

    // 等待 5 秒
    console.log('等待 5 秒...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 获取当前 URL
    const runtime = client.getClient()?.Runtime;
    const result = await runtime?.evaluate({
      expression: `window.location.href`
    });
    console.log(`当前 URL: ${result?.result?.value}\n`);

    await client.close();
    console.log('✓ 测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testSimpleNavigate().catch(console.error);