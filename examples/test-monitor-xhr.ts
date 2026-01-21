import { CDPClient } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';

async function testMonitorXHR() {
  console.log('=== 监听 XHR 请求 ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'monitor-xhr-example'
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
    console.log('等待 3 秒...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 获取 NetworkListener
    const networkListener = client.getNetworkListener();

    // 监听所有 XHR 请求
    const xhrRequests: string[] = [];

    // 添加一个通配符回调来捕获所有 XHR 请求
    if (networkListener) {
      networkListener.addResponseReceivedCallback('.*', (body: string) => {
        console.log(`\n[XHR] 收到响应，长度: ${body.length} 字符`);
        console.log(`前 200 字符: ${body.substring(0, 200)}\n`);
        xhrRequests.push(body);
      });
    }

    // 点击元素
    const selector = 'ul.position-select-list > li:nth-of-type(2)';
    console.log(`点击元素: ${selector}`);

    await client.executeScript(`
      (function() {
        const element = document.querySelector('${selector}');
        if (element) {
          element.click();
        }
      })()
    `);

    console.log('✓ 元素已点击\n');

    // 等待 5 秒收集 XHR 请求
    console.log('等待 5 秒收集 XHR 请求...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log(`\n总共收到 ${xhrRequests.length} 个 XHR 响应`);

    // 清理回调
    if (networkListener) {
      networkListener.clearCallbacks();
    }

    await client.close();
    console.log('\n✓ 测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testMonitorXHR().catch(console.error);