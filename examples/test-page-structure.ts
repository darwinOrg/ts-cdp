import { CDPClient, BrowserPage } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';

async function testPageStructure() {
  console.log('=== 分析页面结构 ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'page-structure-example'
    });
    await client.connect();

    console.log('✓ 已连接到现有浏览器\n');

    // 注入反检测脚本
    await injectAntiDetectScript(client);

    // 创建页面对象
    const page = new BrowserPage(client, { name: 'test-page' });
    await page.init();

    // 访问目标页面
    const targetUrl = 'https://www.zhipin.com/gongsi/job/480261c022ea03d81nV53tQ~.html?ka=company-jobs';
    console.log(`访问页面: ${targetUrl}`);
    await page.navigate(targetUrl);
    console.log('✓ 页面加载完成\n');

    // 等待页面完全加载
    console.log('等待 5 秒...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 获取页面标题
    const title = await page.getTitle();
    console.log(`页面标题: ${title}\n`);

    // 检查是否有职位列表
    const hasPositionList = await page.executeScript(`
      const uls = document.querySelectorAll('ul');
      return Array.from(uls).some(ul => {
        const lis = ul.querySelectorAll('li');
        return lis.length > 0 && ul.className.includes('position');
      });
    `);

    console.log(`是否有职位列表: ${hasPositionList}\n`);

    // 获取所有包含 position 的 ul 元素
    const positionLists = await page.executeScript(`
      const uls = document.querySelectorAll('ul');
      return Array.from(uls)
        .filter(ul => ul.className.includes('position') || ul.className.includes('job'))
        .map((ul, index) => {
          const lis = ul.querySelectorAll('li');
          return {
            index: index + 1,
            className: ul.className,
            liCount: lis.length,
            firstLiText: lis[0]?.textContent?.trim().substring(0, 30) || '',
            secondLiText: lis[1]?.textContent?.trim().substring(0, 30) || ''
          };
        });
    `);

    console.log('职位列表元素:');
    if (Array.isArray(positionLists) && positionLists.length > 0) {
      positionLists.forEach((list: any) => {
        console.log(`  列表 ${list.index}:`);
        console.log(`    class="${list.className}"`);
        console.log(`    数量: ${list.liCount} 项`);
        console.log(`    第1项: ${list.firstLiText}`);
        console.log(`    第2项: ${list.secondLiText}`);
        console.log();
      });
    } else {
      console.log('  没有找到职位列表\n');
    }

    // 检查是否有职位卡片
    const jobCards = await page.executeScript(`
      const cards = document.querySelectorAll('[class*="job"]');
      return Array.from(cards).slice(0, 5).map((card, index) => {
        return {
          index: index + 1,
          className: card.className,
          text: card.textContent?.trim().substring(0, 50) || ''
        };
      });
    `);

    console.log('职位卡片 (前5个):');
    if (Array.isArray(jobCards) && jobCards.length > 0) {
      jobCards.forEach((card: any) => {
        console.log(`  卡片 ${card.index}:`);
        console.log(`    class="${card.className}"`);
        console.log(`    文本: ${card.text}`);
        console.log();
      });
    } else {
      console.log('  没有找到职位卡片\n');
    }

    // 检查是否被风控拦截
    const isBlocked = await page.executeScript(`
      const blocked = document.body.textContent.includes('验证') ||
                      document.body.textContent.includes('安全') ||
                      document.body.textContent.includes('风险') ||
                      document.body.textContent.includes('检测');
      return blocked;
    `);

    console.log(`是否被风控拦截: ${isBlocked}\n`);

    // 获取页面 HTML 的前 2000 个字符
    const htmlSnippet = await page.executeScript(`
      return document.body.outerHTML.substring(0, 2000);
    `);

    console.log('页面 HTML 片段:');
    console.log(htmlSnippet);

    await client.close();
    console.log('\n✓ 测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testPageStructure().catch(console.error);