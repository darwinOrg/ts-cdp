import { launch, CDPClient, interceptApiData, interceptMultipleApis } from '../src';
import * as fs from 'fs';

async function example1_SingleApi() {
  console.log('=== 示例 1: 拦截单个 API ===\n');

  const chrome = await launch({
    headless: false,
    chromeFlags: ['--disable-blink-features=AutomationControlled']
  });

  try {
    const client = new CDPClient({
      port: chrome.port,
      name: 'single-api-example'
    });
    await client.connect();

    // 注入反检测脚本
    await client.executeScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    `);

    // 使用通用方法拦截 API
    const result = await interceptApiData(
      client,
      'https://www.zhipin.com/wapi/zpCommon/toggle/all',
      {
        timeout: 10000,
        maxAttempts: 3,
        triggerAction: async () => {
          console.log('触发操作: 访问 BOSS直聘页面...');
          await client.navigate('https://www.zhipin.com/gongsi/job/5d627415a46b4a750nJ9.html?ka=company-jobs');
        }
      }
    );

    console.log('\n拦截结果:');
    console.log(`  成功: ${result.success}`);
    console.log(`  时间戳: ${result.metadata?.timestamp}`);
    console.log(`  尝试次数: ${result.metadata?.attemptCount}`);

    if (result.success) {
      console.log(`  数据长度: ${result.data?.length} 字符`);

      // 保存数据
      fs.writeFileSync('single-api-result.json', result.data!);
      console.log('  ✓ 数据已保存到 single-api-result.json');

      // 解析并显示部分数据
      const data = JSON.parse(result.data!);
      console.log(`\n  响应状态: ${data.response.code}`);
      console.log(`  响应消息: ${data.response.message}`);
      console.log(`  zpData 字段数: ${Object.keys(data.response.zpData || {}).length}`);
    } else {
      console.log(`  错误: ${result.error}`);
    }

    await client.close();
  } finally {
    chrome.kill();
  }
}

async function example2_MultipleApis() {
  console.log('\n\n=== 示例 2: 批量拦截多个 API ===\n');

  const chrome = await launch({
    headless: false,
    chromeFlags: ['--disable-blink-features=AutomationControlled']
  });

  try {
    const client = new CDPClient({
      port: chrome.port,
      name: 'multiple-apis-example'
    });
    await client.connect();

    // 注入反检测脚本
    await client.executeScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    `);

    // 定义要拦截的 API 列表
    const apiUrls = [
      'https://www.zhipin.com/wapi/zpCommon/toggle/all',
      'https://www.zhipin.com/wapi/zpCommon/actionLog/common.json',
      'https://www.zhipin.com/web/common/data/geek-job/flag-list.json'
    ];

    // 使用通用方法批量拦截
    const results = await interceptMultipleApis(
      client,
      apiUrls,
      {
        timeout: 10000,
        maxAttempts: 2,
        triggerAction: async () => {
          console.log('触发操作: 访问 BOSS直聘页面...');
          await client.navigate('https://www.zhipin.com/gongsi/job/5d627415a46b4a750nJ9.html?ka=company-jobs');
        }
      }
    );

    console.log('\n批量拦截结果:');
    let successCount = 0;
    results.forEach((result, url) => {
      const apiName = url.split('/').pop();
      const status = result.success ? '✓ 成功' : '✗ 失败';
      console.log(`  ${apiName}: ${status}`);
      if (result.success) {
        successCount++;
        console.log(`    尝试次数: ${result.metadata?.attemptCount}`);
        console.log(`    数据长度: ${result.data?.length} 字符`);
      } else {
        console.log(`    错误: ${result.error}`);
      }
    });

    console.log(`\n总计: ${successCount}/${results.size} 成功`);

    // 保存所有结果
    const allResults: any = {};
    results.forEach((result, url) => {
      const apiName = url.split('/').pop() || url;
      allResults[apiName] = result;
    });
    fs.writeFileSync('multiple-apis-result.json', JSON.stringify(allResults, null, 2));
    console.log('✓ 所有结果已保存到 multiple-apis-result.json');

    await client.close();
  } finally {
    chrome.kill();
  }
}

async function example3_WithErrorHandling() {
  console.log('\n\n=== 示例 3: 完整的错误处理 ===\n');

  const chrome = await launch({
    headless: false,
    chromeFlags: ['--disable-blink-features=AutomationControlled']
  });

  try {
    const client = new CDPClient({
      port: chrome.port,
      name: 'error-handling-example'
    });
    await client.connect();

    // 注入反检测脚本
    await client.executeScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    `);

    // 测试不存在的 API（应该失败）
    const result = await interceptApiData(
      client,
      'https://www.zhipin.com/wapi/zpgeek/job/non-existent-api.json',
      {
        timeout: 5000,
        maxAttempts: 2,
        triggerAction: async () => {
          console.log('触发操作: 访问页面...');
          await client.navigate('https://www.zhipin.com');
        }
      }
    );

    console.log('\n拦截结果:');
    console.log(`  成功: ${result.success}`);

    if (result.success) {
      console.log('  数据:', result.data?.substring(0, 100) + '...');
    } else {
      console.log('  错误:', result.error);
      console.log('  元数据:', JSON.stringify(result.metadata, null, 2));
    }

    // 保存结果（包括错误信息）
    fs.writeFileSync('error-handling-result.json', JSON.stringify(result, null, 2));
    console.log('\n✓ 结果已保存到 error-handling-result.json');

    await client.close();
  } finally {
    chrome.kill();
  }
}

// 运行所有示例
async function runAllExamples() {
  try {
    await example1_SingleApi();
    await example2_MultipleApis();
    await example3_WithErrorHandling();
  } catch (error) {
    console.error('示例运行失败:', error);
  }
}

// 运行单个示例（注释掉其他示例）
// runAllExamples();
example1_SingleApi().catch(console.error);