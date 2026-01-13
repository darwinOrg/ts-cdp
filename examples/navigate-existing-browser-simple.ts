import { CDPClient } from '../src/browser/client';
import { BrowserPage } from '../src/browser/page';

/**
 * 使用已存在的浏览器（9222端口）导航到指定URL
 * 简化版本：发送导航请求后立即返回，不等待
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
    
    // 直接执行导航，不等待任何事件
    const cdp = client.getClient();
    if (!cdp) {
      throw new Error('CDP client not available');
    }
    
    await cdp.Page.navigate({ url });
    console.log('✅ 导航请求已发送\n');
    
    console.log('💡 提示: 页面正在后台加载，请稍等片刻后查看浏览器');
    console.log('   您可以在浏览器中看到页面正在导航');

  } catch (error) {
    console.error('\n❌ 导航失败:', error);
  } finally {
    await client.close();
  }
}

// 从命令行参数获取 URL
const url = process.argv[2];

if (!url) {
  console.log('用法: npx ts-node examples/navigate-existing-browser-simple.ts <URL>');
  console.log('示例: npx ts-node examples/navigate-existing-browser-simple.ts https://www.zhipin.com');
  process.exit(1);
}

navigateToURL(url).catch(console.error);