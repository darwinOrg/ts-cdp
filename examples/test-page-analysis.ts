import { launch, CDPClient, BrowserPage } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';

async function testPageAnalysis() {
  console.log('=== 分析页面元素和 API ===\n');

  const chrome = await launch({
    headless: false
  });

  try {
    const client = new CDPClient({
      port: chrome.port,
      name: 'page-analysis-example'
    });
    await client.connect();

    // 注入反检测脚本
    await injectAntiDetectScript(client);

    // 创建页面对象
    const page = new BrowserPage(client, { name: 'test-page' });
    await page.init();

    // 访问目标页面
    const targetUrl = 'https://www.zhipin.com/gongsi/job/480261c022ea03d81nV53tQ~.html?ka=company-jobs';
    console.log(`访问页面: ${targetUrl}`);
    await page.navigate(targetUrl);
    console.log('页面加载完成\n');

    // 等待页面完全加载
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 检查目标选择器
    const selector = 'ul.position-select-list > li:nth-of-type(2)';
    console.log(`检查选择器: ${selector}`);

    const exists = await page.exists(selector);
    console.log(`元素是否存在: ${exists}`);

    if (exists) {
      const text = await page.getText(selector);
      console.log(`元素文本: ${text}`);

      // 获取所有 li 元素
      const allLiText = await page.executeScript(`
        const items = document.querySelectorAll('ul.position-select-list > li');
        return Array.from(items).map((item, index) => {
          return {
            index: index + 1,
            text: item.textContent?.trim(),
            class: item.className
          };
        });
      `);

      console.log('\n所有职位列表项:');
      if (Array.isArray(allLiText)) {
        allLiText.forEach((item: any) => {
          console.log(`  ${item.index}. ${item.text} (class: ${item.class})`);
        });
      } else {
        console.log('  没有找到职位列表项');
      }
    } else {
      console.log('元素不存在，检查其他选择器...');

      // 查找所有 ul 和 li 元素
      const allLists = await page.executeScript(`
        const uls = document.querySelectorAll('ul');
        return Array.from(uls).map((ul, index) => {
          const lis = ul.querySelectorAll('li');
          return {
            index: index + 1,
            class: ul.className,
            liCount: lis.length,
            firstLiText: lis[0]?.textContent?.trim() || ''
          };
        });
      `);

      console.log('\n所有列表:');
      allLists.forEach((list: any) => {
        if (list.liCount > 0) {
          console.log(`  列表 ${list.index}: class="${list.class}", ${list.liCount} 项, 第一项: ${list.firstLiText}`);
        }
      });
    }

    // 等待用户观察页面
    console.log('\n等待 10 秒以便观察页面...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    await client.close();
  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    chrome.kill();
  }
}

testPageAnalysis().catch(console.error);