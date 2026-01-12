import { launch } from '../src/launcher';
import { CDPClient } from '../src/browser/client';
import { BrowserPage } from '../src/browser/page';

async function testBrowserPage() {
  console.log('=== Testing BrowserPage API ===\n');

  // 启动 Chrome
  console.log('1. Launching Chrome...');
  const chrome = await launch({
    headless: false,
    startingUrl: 'about:blank'
  });
  console.log(`   ✓ Chrome launched on port ${chrome.port}\n`);

  let client: CDPClient | null = null;

  try {
    // 连接 CDP
    console.log('2. Connecting to CDP...');
    client = new CDPClient({
      port: chrome.port,
      name: 'test-page'
    });
    await client.connect();
    console.log('   ✓ Connected\n');

    // 创建 BrowserPage
    console.log('3. Creating BrowserPage...');
    const page = new BrowserPage(client, { name: 'test-page' });
    console.log('   ✓ BrowserPage created\n');

    // 测试导航（不等待加载状态）
    console.log('4. Testing navigate...');
    await page['page'].navigate({ url: 'https://example.com' });
    await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
    console.log('   ✓ Navigate successful\n');

    // 测试获取标题
    console.log('5. Testing getTitle...');
    const title = await page.getTitle();
    console.log(`   ✓ Title: ${title}\n`);

    // 测试获取 URL
    console.log('6. Testing getUrl...');
    const url = await page.getUrl();
    console.log(`   ✓ URL: ${url}\n`);

    // 测试执行脚本
    console.log('7. Testing executeScript...');
    const result = await page.executeScript('document.title');
    console.log(`   ✓ Result: ${result}\n`);

    // 测试 Locator
    console.log('8. Testing Locator...');
    const locator = page.locator('h1');
    const text = await locator.getText();
    console.log(`   ✓ H1 text: ${text}\n`);

    // 测试元素存在性
    console.log('9. Testing exists...');
    const exists = await page.exists('h1');
    console.log(`   ✓ H1 exists: ${exists}\n`);

    // 测试截图
    console.log('10. Testing screenshot...');
    const screenshot = await page.screenshot('png');
    console.log(`   ✓ Screenshot size: ${screenshot.length} bytes\n`);

    console.log('=== All tests passed! ===\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('Cleaning up...');
    if (client) {
      await client.close();
    }
    chrome.kill();
    console.log('✓ Cleanup complete\n');
  }
}

testBrowserPage().catch(console.error);