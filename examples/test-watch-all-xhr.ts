import { CDPClient } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';

async function testWatchAllXHR() {
  console.log('=== 监听所有 XHR 请求 ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'watch-all-xhr-example',
      watchUrls: [] // 空数组表示不预先指定要监听的 URL
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

    // 获取 HAR 记录
    const har = networkListener?.getHAR();
    console.log(`HAR 记录数: ${har?.log.entries.length}\n`);

    // 显示最近的 XHR 请求
    console.log('最近的 XHR 请求:');
    if (har && har.log.entries.length > 0) {
      const xhrEntries = har.log.entries.filter((entry: any) => {
        return entry.request.url.includes('zhipin.com') &&
               (entry.request.url.includes('json') || entry.request.url.includes('wapi'));
      });

      xhrEntries.slice(-5).forEach((entry: any, index: number) => {
        console.log(`  ${index + 1}. ${entry.request.method} ${entry.request.url}`);
        console.log(`     状态: ${entry.response.status}`);
        console.log();
      });
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

    // 等待 5 秒
    console.log('等待 5 秒...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 再次获取 HAR 记录
    const har2 = networkListener?.getHAR();
    console.log(`HAR 记录数: ${har2?.log.entries.length}\n`);

    // 显示新增的 XHR 请求
    console.log('新增的 XHR 请求:');
    if (har2 && har2.log.entries.length > 0) {
      const xhrEntries = har2.log.entries.filter((entry: any) => {
        return entry.request.url.includes('zhipin.com') &&
               (entry.request.url.includes('json') || entry.request.url.includes('wapi'));
      });

      xhrEntries.slice(-5).forEach((entry: any, index: number) => {
        console.log(`  ${index + 1}. ${entry.request.method} ${entry.request.url}`);
        console.log(`     状态: ${entry.response.status}`);
        console.log();
      });
    }

    console.log('✓ 测试完成');

    await client.close();
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testWatchAllXHR().catch(console.error);