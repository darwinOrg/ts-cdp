import { CDPClient, BrowserPage } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';
import * as fs from 'fs';

async function testClickAndIntercept() {
  console.log('=== 演示：点击元素并拦截 API 数据 (连接现有浏览器) ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'click-intercept-example'
    });
    await client.connect();

    console.log('✓ 已连接到现有浏览器\n');

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

    // 2. 等待页面完全加载
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. 检查目标元素
    const selector = 'ul.position-select-list > li:nth-of-type(2)';
    console.log(`2. 检查元素: ${selector}`);

    const exists = await page.exists(selector);
    console.log(`   元素是否存在: ${exists}`);

    if (exists) {
      const text = await page.getText(selector);
      console.log(`   元素文本: "${text}"\n`);

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

      console.log('   所有职位列表项:');
      if (Array.isArray(allLiText) && allLiText.length > 0) {
        allLiText.forEach((item: any) => {
          console.log(`     ${item.index}. ${item.text} (class: ${item.class})`);
        });
        console.log();
      }
    } else {
      console.log('   元素不存在\n');
    }

    // 4. 拦截 API 响应并点击元素
    if (exists) {
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
    }

    await client.close();
    console.log('\n✓ 测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testClickAndIntercept().catch(console.error);