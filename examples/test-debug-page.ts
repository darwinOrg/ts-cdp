import { CDPClient, BrowserPage } from '../src';

async function testDebugPage() {
  console.log('=== 调试页面加载 ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'debug-page-example'
    });
    await client.connect();

    console.log('✓ 已连接到现有浏览器\n');

    // 创建页面对象
    const page = new BrowserPage(client, { name: 'test-page' });
    await page.init();

    // 获取当前 URL
    const currentUrl = await page.getUrl();
    console.log(`当前 URL: ${currentUrl}\n`);

    // 访问目标页面
    const targetUrl = 'https://www.zhipin.com/gongsi/job/480261c022ea03d81nV53tQ~.html?ka=company-jobs';
    console.log(`访问页面: ${targetUrl}`);
    await page.navigate(targetUrl);
    console.log('✓ 导航命令已发送\n');

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 再次获取 URL
    const newUrl = await page.getUrl();
    console.log(`当前 URL: ${newUrl}\n`);

    // 检查页面标题
    const title = await page.getTitle();
    console.log(`页面标题: ${title}\n`);

    // 检查页面内容
    const bodyText = await page.executeScript(`
      return document.body.textContent.substring(0, 500);
    `);

    console.log('页面内容 (前500字符):');
    console.log(bodyText);
    console.log();

    // 检查是否有错误
    const hasError = await page.executeScript(`
      return document.body.textContent.includes('错误') ||
             document.body.textContent.includes('无法访问') ||
             document.body.textContent.includes('404') ||
             document.body.textContent.includes('验证') ||
             document.body.textContent.includes('安全');
    `);

    console.log(`是否有错误/验证: ${hasError}\n`);

    // 获取页面 HTML
    const html = await page.getHTML();
    console.log(`页面 HTML 长度: ${html.length} 字符\n`);

    // 检查是否有职位相关的元素
    const hasJobElements = await page.executeScript(`
      const jobElements = document.querySelectorAll('[class*="job"], [class*="position"]');
      return jobElements.length > 0;
    `);

    console.log(`是否有职位相关元素: ${hasJobElements}\n`);

    await client.close();
    console.log('✓ 测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testDebugPage().catch(console.error);