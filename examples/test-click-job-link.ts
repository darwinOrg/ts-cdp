import { CDPClient } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';
import * as fs from 'fs';

async function testClickJobLink() {
  console.log('=== 点击职位链接并拦截 API ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'click-job-link-example',
      watchUrls: ['zhipin.com']
    });
    await client.connect();

    console.log('✓ 已连接到现有浏览器\n');

    // 注入反检测脚本
    await injectAntiDetectScript(client);

    // 访问目标页面
    const targetUrl = 'https://www.zhipin.com/gongsi/job/480261c022ea03d81nV53tQ~.html?ka=company-jobs';
    console.log(`1. 访问页面: ${targetUrl}`);
    await client.navigate(targetUrl);
    console.log('   ✓ 页面加载完成\n');

    // 等待页面完全加载
    console.log('等待 3 秒...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 查找职位链接
    console.log('2. 查找职位链接');

    const jobLinks = await client.executeScript(`
      (function() {
        const links = document.querySelectorAll('ul.position-job-list > li a');
        return Array.from(links).map((link, index) => {
          return {
            index: index + 1,
            href: link.getAttribute('href'),
            text: link.textContent.trim().substring(0, 30)
          };
        });
      })()
    `);

    console.log('   找到的职位链接:');
    if (Array.isArray(jobLinks) && jobLinks.length > 0) {
      jobLinks.slice(0, 5).forEach((link: any) => {
        console.log(`     ${link.index}. ${link.text} - ${link.href}`);
      });
      console.log();

      // 获取第一个链接的 href
      const firstLinkHref = jobLinks[0].href;
      console.log(`3. 第一个链接的 href: ${firstLinkHref}\n`);

      // 获取当前的 HAR 记录数
      const networkListener = client.getNetworkListener();
      const harBefore = networkListener?.getHAR();
      const countBefore = harBefore?.log.entries.length || 0;

      // 点击第一个职位链接
      const firstLinkSelector = 'ul.position-job-list > li:nth-of-type(1) a';
      console.log(`4. 点击第一个职位链接: ${firstLinkSelector}`);

      await client.executeScript(`
        (function() {
          const element = document.querySelector('${firstLinkSelector}');
          if (element) {
            element.click();
          }
        })()
      `);

      console.log('   ✓ 职位链接已点击\n');

      // 等待 5 秒
      console.log('等待 5 秒...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 获取新的 HAR 记录
      const harAfter = networkListener?.getHAR();
      const countAfter = harAfter?.log.entries.length || 0;

      console.log(`HAR 记录数: ${countBefore} → ${countAfter}\n`);

      // 显示新增的请求
      if (countAfter > countBefore) {
        const newEntries = harAfter!.log.entries.slice(countBefore);
        console.log('新增的请求:');
        newEntries.forEach((entry: any, index: number) => {
          console.log(`  ${index + 1}. ${entry.request.method} ${entry.request.url}`);
          console.log(`     状态: ${entry.response.status}`);
          console.log();
        });

        // 检查是否有 job/detail.json 请求
        const detailRequest = newEntries.find((entry: any) =>
          entry.request.url.includes('job/detail.json')
        );

        if (detailRequest) {
          console.log('✓ 找到 job/detail.json 请求！');
          console.log(`  URL: ${detailRequest.request.url}`);
          console.log(`  响应状态: ${detailRequest.response.status}`);

          if (detailRequest.response.text) {
            const data = JSON.parse(detailRequest.response.text);
            console.log(`  响应状态: ${data.code}`);
            console.log(`  响应消息: ${data.message}`);

            // 保存数据
            fs.writeFileSync('click-intercept-result.json', detailRequest.response.text);
            console.log('\n  ✓ 数据已保存到 click-intercept-result.json');
          }
        } else {
          console.log('✗ 没有找到 job/detail.json 请求');
        }
      } else {
        console.log('没有新增的请求');
      }
    } else {
      console.log('   没有找到职位链接\n');
    }

    console.log('\n✓ 测试完成');

    await client.close();
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testClickJobLink().catch(console.error);