import { CDPClient } from '../src/browser/client';

/**
 * 使用已存在的浏览器（9222端口）导航到指定URL
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

    // 获取当前页面
    const cdp = client.getClient();
    if (!cdp) {
      console.error('❌ 无法获取 CDP 客户端');
      return;
    }
    
    const targets = await cdp.Target.getTargets();
    
    // 找到第一个非系统页面
    const pageTarget = targets.targetInfos.find(t => 
      t.type === 'page' && !t.url.startsWith('chrome://')
    );

    if (!pageTarget) {
      console.error('❌ 未找到可用的页面');
      return;
    }

    console.log(`📄 当前页面: ${pageTarget.title}`);
    console.log(`🔗 当前 URL: ${pageTarget.url}\n`);

    // 连接到页面
    const { targetId } = pageTarget;
    const { sessionId } = await cdp.Target.attachToTarget({ targetId, flatten: true });
    const session = cdp.session(sessionId);
    
    if (!session) {
      console.error('❌ 无法连接到页面');
      return;
    }
    
    const page = session.Page;
    const runtime = session.Runtime;

    // 启用 Page 和 Runtime 域
    await page.enable();
    await runtime.enable();

    console.log(`📌 导航到: ${url}`);
    
    // 导航到指定 URL
    await page.navigate({ url });
    
    console.log('⏳ 等待页面加载...');
    
    // 等待页面加载完成
    await new Promise((resolve) => {
      page.loadEventFired(() => {
        console.log('✅ 页面加载完成\n');
        resolve(null);
      });
    });

    // 获取页面标题
    const result = await runtime.evaluate({
      expression: 'document.title'
    });
    const title = result.result.value;
    
    console.log('📄 页面标题:', title);
    console.log('🔗 当前 URL:', url);
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
  console.log('用法: npx ts-node examples/navigate-existing-browser.ts <URL>');
  console.log('示例: npx ts-node examples/navigate-existing-browser.ts https://www.zhipin.com');
  process.exit(1);
}

navigateToURL(url).catch(console.error);