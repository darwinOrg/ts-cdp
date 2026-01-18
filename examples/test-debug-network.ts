import { CDPClient } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';

async function testDebugNetwork() {
  console.log('=== 调试网络监听 ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'debug-network-example'
    });
    await client.connect();

    console.log('✓ 已连接到现有浏览器\n');

    // 注入反检测脚本
    await injectAntiDetectScript(client);

    // 访问目标页面
    const targetUrl = 'https://www.zhipin.com/gongsi/job/480261c022ea03d81nV53tQ~.html?ka=company-jobs';
    console.log(`访问页面: ${targetUrl}`);
    await client.navigate(targetUrl);
    console.log('✓ 页面加载完成\n');

    // 等待页面完全加载
    console.log('等待 5 秒...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 获取 NetworkListener
    const networkListener = client.getNetworkListener();

    // 添加一个回调来捕获所有包含 "job" 的 XHR 请求
    if (networkListener) {
      const callback = (body: string) => {
        console.log('\n=== 收到响应 ===');
        console.log(`响应长度: ${body.length} 字符`);
        console.log(`前 300 字符: ${body.substring(0, 300)}\n`);
      };

      // 添加多个模式来测试
      networkListener.addResponseReceivedCallback('https://www.zhipin.com/wapi/zpgeek/job/detail.json', callback);
      networkListener.addResponseReceivedCallback('https://www.zhipin.com/wapi/zpgeek/job/detail.json.*', callback);
      networkListener.addResponseReceivedCallback('.*job.*detail.*json.*', callback);

      console.log('已添加 3 个回调模式:\n');
      console.log('1. https://www.zhipin.com/wapi/zpgeek/job/detail.json');
      console.log('2. https://www.zhipin.com/wapi/zpgeek/job/detail.json.*');
      console.log('3. .*job.*detail.*json.*\n');
    }

    // 点击职位卡片
    const selector = 'ul.position-job-list > li:nth-of-type(1)';
    console.log(`点击职位卡片: ${selector}`);

    await client.executeScript(`
      (function() {
        const element = document.querySelector('${selector}');
        if (element) {
          element.click();
        }
      })()
    `);

    console.log('✓ 职位卡片已点击\n');

    // 等待 10 秒收集响应
    console.log('等待 10 秒收集响应...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\n✓ 测试完成');

    // 清理回调
    if (networkListener) {
      networkListener.clearCallbacks();
    }

    await client.close();
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testDebugNetwork().catch(console.error);