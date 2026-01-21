import { launch, CDPClient, BrowserPage } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';
import * as fs from 'fs';

async function testClickAndIntercept() {
  console.log('=== 演示：点击元素并拦截 API 数据 ===\n');

  const chrome = await launch({
    headless: false
  });

  try {
    const client = new CDPClient({
      port: chrome.port,
      name: 'click-intercept-example'
    });
    await client.connect();

    // 注入反检测脚本
    await injectAntiDetectScript(client);

    // 创建页面对象
    const page = new BrowserPage(client, { name: 'test-page' });
    await page.init();

    // 1. 访问目标页面
    const targetUrl = 'https://www.zhipin.com/gongsi/job/480261c022ea03d81nV53tQ~.html?ka=company-jobs';
    console.log(`1. 访问页面: ${targetUrl}`);
    await page.navigate(targetUrl);
    console.log('   ✓ 页面加载完成\n');

    // 2. 等待目标元素可见
    const selector = 'ul.position-select-list > li:nth-of-type(2)';
    console.log(`2. 等待元素可见: ${selector}`);
    await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
    console.log('   ✓ 元素已可见\n');

    // 3. 拦截 API 响应并点击元素
    const apiUrl = 'https://www.zhipin.com/wapi/zpgeek/job/detail.json';
    console.log(`3. 开始拦截 API: ${apiUrl}**`);
    console.log(`4. 点击元素: ${selector}`);

    const responseText = await page.expectResponseText(apiUrl, async () => {
      await page.click(selector);
      console.log('   ✓ 元素已点击\n');
    });

    console.log('5. 拦截成功！\n');

    // 6. 解析并显示结果
    const data = JSON.parse(responseText);
    console.log('拦截结果:');
    console.log(`  响应状态: ${data.code}`);
    console.log(`  响应消息: ${data.message}`);
    console.log(`  数据长度: ${responseText.length} 字符`);

    if (data.zpData) {
      console.log(`  zpData 字段数: ${Object.keys(data.zpData).length}`);
      
      // 显示部分数据
      if (data.zpData.jobInfo) {
        console.log(`\n  职位信息:`);
        console.log(`    职位名称: ${data.zpData.jobInfo.jobName || 'N/A'}`);
        console.log(`    薪资: ${data.zpData.jobInfo.salaryDesc || 'N/A'}`);
        console.log(`    城市: ${data.zpData.jobInfo.cityName || 'N/A'}`);
      }
    }

    // 保存数据
    fs.writeFileSync('click-intercept-result.json', responseText);
    console.log('\n  ✓ 数据已保存到 click-intercept-result.json');

    await client.close();
  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    chrome.kill();
  }
}

testClickAndIntercept().catch(console.error);