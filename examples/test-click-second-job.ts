import { CDPClient } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';
import * as fs from 'fs';

async function testClickSecondJob() {
  console.log('=== 点击第2个岗位节点并拦截指定接口 ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'click-second-job-example',
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
    console.log('等待 5 秒...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 查找职位卡片列表
    console.log('2. 查找职位卡片列表');

    const jobCards = await client.executeScript(`
      (function() {
        const cards = document.querySelectorAll('ul.position-job-list > li');
        return Array.from(cards).map((card, index) => {
          const titleElement = card.querySelector('.job-title');
          const salaryElement = card.querySelector('.salary');
          const linkElement = card.querySelector('a');
          return {
            index: index + 1,
            title: titleElement ? titleElement.textContent.trim() : '',
            salary: salaryElement ? salaryElement.textContent.trim() : '',
            href: linkElement ? linkElement.getAttribute('href') : '',
            class: card.className
          };
        });
      })()
    `);

    console.log('   找到的职位卡片:');
    if (Array.isArray(jobCards) && jobCards.length > 0) {
      jobCards.slice(0, 5).forEach((card: any) => {
        console.log(`     ${card.index}. ${card.title} - ${card.salary}`);
        console.log(`        href: ${card.href}`);
      });
      console.log();

      // 点击第2个职位卡片
      const secondJobSelector = 'ul.position-job-list > li:nth-of-type(2)';
      console.log(`3. 点击第2个职位卡片: ${secondJobSelector}`);
      console.log(`   第2个职位: ${jobCards[1].title}\n`);

      // 获取点击前的 HAR 记录数
      const networkListener = client.getNetworkListener();
      const harBefore = networkListener?.getHAR();
      const countBefore = harBefore?.log.entries.length || 0;

      // 点击第2个职位卡片
      await client.executeScript(`
        (function() {
          const element = document.querySelector('${secondJobSelector}');
          if (element) {
            console.log('找到元素，准备点击');
            element.click();
            console.log('点击完成');
            return true;
          } else {
            console.log('未找到元素');
            return false;
          }
        })()
      `);

      console.log('   ✓ 第2个职位卡片已点击\n');

      // 等待 5 秒收集请求
      console.log('等待 5 秒收集请求...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 获取点击后的 HAR 记录
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
      console.log('   没有找到职位卡片\n');
    }

    console.log('\n✓ 测试完成');

    await client.close();
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testClickSecondJob().catch(console.error);