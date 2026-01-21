import { CDPClient } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';
import * as fs from 'fs';

async function testVisitJobDetail() {
  console.log('=== 访问职位详情页面并拦截 API ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'visit-job-detail-example',
      watchUrls: ['zhipin.com']
    });
    await client.connect();

    console.log('✓ 已连接到现有浏览器\n');

    // 注入反检测脚本
    await injectAntiDetectScript(client);

    // 访问职位详情页面
    const targetUrl = 'https://www.zhipin.com/job_detail/80f10929be7d53b43n1_09y-EFA~.html';
    console.log(`1. 访问职位详情页面: ${targetUrl}`);
    await client.navigate(targetUrl);
    console.log('   ✓ 页面加载完成\n');

    // 等待页面完全加载
    console.log('等待 5 秒...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 获取 HAR 记录
    const networkListener = client.getNetworkListener();
    const har = networkListener?.getHAR();
    console.log(`HAR 记录数: ${har?.log.entries.length}\n`);

    // 显示所有请求
    console.log('所有请求:');
    if (har && har.log.entries.length > 0) {
      har.log.entries.forEach((entry: any, index: number) => {
        console.log(`  ${index + 1}. ${entry.request.method} ${entry.request.url}`);
        console.log(`     状态: ${entry.response.status}`);
        console.log();
      });
    }

    // 检查是否有 job/detail.json 请求
    const detailRequest = har?.log.entries.find((entry: any) =>
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
        fs.writeFileSync('click-intercept-result.json', detailRequest.response.text);
        console.log('\n  ✓ 数据已保存到 click-intercept-result.json');
      }
    } else {
      console.log('✗ 没有找到 job/detail.json 请求');
    }

    console.log('\n✓ 测试完成');

    await client.close();
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testVisitJobDetail().catch(console.error);