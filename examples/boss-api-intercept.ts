import { launch, CDPClient, interceptMultipleApis } from '../src';
import * as fs from 'fs';

async function interceptBossAPI() {
  console.log('=== BOSS直聘 API 拦截示例 (使用通用拦截工具) ===\n');

  // BOSS直聘职位详情页面
  const targetUrl = 'https://www.zhipin.com/gongsi/job/5d627415a46b4a750nJ9.html?ka=company-jobs';

  // 要拦截的 API 接口
  const apiEndpoints = [
    'https://www.zhipin.com/wapi/zpgeek/job/detail.json',
    'https://www.zhipin.com/wapi/zpCommon/actionLog/common.json',
    'https://www.zhipin.com/web/common/data/geek-job/flag-list.json',
    'https://www.zhipin.com/wapi/zpCommon/toggle/all'
  ];

  const chrome = await launch({
    headless: false,
    startingUrl: 'https://www.zhipin.com',
    chromeFlags: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--start-maximized',
      '--disable-infobars',
      '--window-size=1920,1080'
    ]
  });

  let client: CDPClient | null = null;

  try {
    console.log('1. 连接到 CDP...');
    client = new CDPClient({
      port: chrome.port,
      name: 'boss-api-intercept'
    });
    await client.connect();
    console.log('   ✓ 连接成功\n');

    // 注入反检测脚本
    console.log('2. 注入反检测脚本...');
    await client.executeScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      window.chrome = { runtime: {} };
    `);
    console.log('   ✓ 反检测脚本注入完成\n');

    console.log('3. 设置 API 拦截...\n');
    console.log('   监控的接口:');
    apiEndpoints.forEach((endpoint, index) => {
      console.log(`   ${index + 1}. ${endpoint}`);
    });
    console.log();

    // 使用通用拦截工具批量拦截 API
    console.log('4. 拦截 API 数据...');
    const results = await interceptMultipleApis(
      client,
      apiEndpoints,
      {
        timeout: 10000,
        maxAttempts: 3,
        triggerAction: async () => {
          console.log('   触发操作: 访问目标页面...');
          await client.navigate(targetUrl);

          console.log('   等待页面加载...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    );

    console.log('\n5. 拦截结果统计:\n');

    let successCount = 0;
    const interceptedData: { [key: string]: any } = {};

    results.forEach((result, url) => {
      const apiName = url.split('/').pop() || url;
      const status = result.success ? '✓' : '✗';
      console.log(`   ${status} ${apiName}`);

      if (result.success && result.data) {
        successCount++;
        interceptedData[apiName] = {
          timestamp: result.metadata?.timestamp,
          attemptCount: result.metadata?.attemptCount,
          data: JSON.parse(result.data)
        };
        console.log(`     尝试次数: ${result.metadata?.attemptCount}`);
        console.log(`     数据长度: ${result.data.length} 字符`);
      } else {
        console.log(`     错误: ${result.error}`);
      }
      console.log();
    });

    console.log(`   总计: ${successCount}/${results.size} 个接口成功拦截\n`);

    // 保存拦截的数据
    console.log('6. 保存拦截数据...');
    fs.writeFileSync('boss-api-intercepted-data.json', JSON.stringify(interceptedData, null, 2));
    console.log('   ✓ 数据已保存到 boss-api-intercepted-data.json\n');

    // 获取完整的 HAR 日志
    console.log('7. 获取完整 HAR 日志...');
    const har = client.getHAR();
    if (har) {
      const harFile = 'boss-api-intercept.har';
      fs.writeFileSync(harFile, JSON.stringify(har, null, 2));
      console.log(`   ✓ HAR 已保存到 ${harFile}`);
      console.log(`   总条目数: ${har.log.entries.length}\n`);
    }

    // 分析职位详情 API 数据
    console.log('8. 分析职位详情数据...');
    const jobDetailData = interceptedData['job/detail.json'];
    if (jobDetailData) {
      console.log('   职位详情数据:');
      const response = jobDetailData.data.response;
      console.log(`     响应状态码: ${response.code}`);
      console.log(`     响应消息: ${response.message}`);
      if (response.zpData) {
        console.log(`     zpData 字段数: ${Object.keys(response.zpData).length}`);
      }
      console.log();
    } else {
      console.log('   ⚠️  未捕获到职位详情数据\n');
    }

    // 截图
    console.log('9. 截取页面截图...');
    const screenshot = await client.screenshot('png');
    fs.writeFileSync('boss-api-intercept.png', Buffer.from(screenshot, 'base64'));
    console.log('   ✓ 截图已保存到 boss-api-intercept.png\n');

    console.log('=== 拦截完成 ===');
    console.log('\n浏览器将保持打开状态 10 秒，你可以手动检查页面...');
    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error) {
    console.error('❌ 拦截过程中出错:', error);
  } finally {
    console.log('\n清理资源...');
    if (client) {
      await client.close();
    }
    chrome.kill();
    console.log('✓ 测试完成');
  }
}

interceptBossAPI().catch(console.error);