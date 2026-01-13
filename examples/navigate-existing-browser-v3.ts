import { CDPClient } from '../src/browser/client';
import { BrowserPage } from '../src/browser/page';

/**
 * 使用已存在的浏览器（9222端口）导航到指定URL
 * 不等待完整的 load 事件，只等待 DOMContentLoaded
 */
async function navigateToURL(url: string) {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          使用现有浏览器导航到指定 URL                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const client = new CDPClient({
    port: 9222,
    name: 'existing-browser'
  });

  try {
    // 连接到现有浏览器
    console.log('📌 连接到 9222 端口的浏览器...');
    await client.connect();
    console.log('✅ 连接成功\n');

    // 创建 BrowserPage 实例
    const page = new BrowserPage(client);
    
    // 获取当前页面信息
    const currentTitle = await page.getTitle();
    const currentURL = await page.getUrl();
    
    console.log(`📄 当前页面: ${currentTitle}`);
    console.log(`🔗 当前 URL: ${currentURL}\n`);

    console.log(`📌 导航到: ${url}`);
    
    // 直接执行导航，不等待 load 事件
    const cdp = client.getClient();
    if (!cdp) {
      throw new Error('CDP client not available');
    }
    
    await cdp.Page.navigate({ url });
    console.log('✅ 导航请求已发送');
    
    // 只等待 DOMContentLoaded，不等待完整的 load
    console.log('⏳ 等待 DOM 加载完成...');
    await page.waitForDOMContentLoaded(10000);
    console.log('✅ DOM 加载完成\n');

    // 再等待一点时间让页面渲染
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 获取新页面信息
    const newTitle = await page.getTitle();
    const newURL = await page.getUrl();
    
    console.log('📄 页面标题:', newTitle);
    console.log('🔗 当前 URL:', newURL);
    console.log('\n✅ 导航成功！');

  } catch (error) {
    console.error('\n❌ 导航失败:', error);
  } finally {
    await client.close();
  }
}

// 从命令行参数获取 URL
const url = process.argv[2];

if (!url) {
  console.log('用法: npx ts-node examples/navigate-existing-browser-v3.ts <URL>');
  console.log('示例: npx ts-node examples/navigate-existing-browser-v3.ts https://www.zhipin.com');
  process.exit(1);
}

navigateToURL(url).catch(console.error);