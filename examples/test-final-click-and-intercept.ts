import { CDPClient } from '../src';
import { injectAntiDetectScript } from '../src/utils/anti-detect';
import * as fs from 'fs';

async function testFinalClickAndIntercept() {
  console.log('=== 最终演示：点击元素并拦截 API 数据 ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'final-click-intercept-example'
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

    // 2. 检查目标元素
    const selector = 'ul.position-select-list > li:nth-of-type(2)';
    console.log(`2. 检查元素: ${selector}`);

    const exists = await client.executeScript(`
      (function() {
        const element = document.querySelector('${selector}');
        return element !== null;
      })()
    `);

    console.log(`   元素是否存在: ${exists}`);

    if (exists) {
      // 获取元素文本
      const text = await client.executeScript(`
        (function() {
          const element = document.querySelector('${selector}');
          return element.textContent.trim();
        })()
      `);
      console.log(`   元素文本: "${text}"\n`);

      // 获取所有职位列表项
      const allItems = await client.executeScript(`
        (function() {
          const items = document.querySelectorAll('ul.position-select-list > li');
          return Array.from(items).map((item, index) => {
            return {
              index: index + 1,
              text: item.textContent.trim(),
              class: item.className
            };
          });
        })()
      `);

      console.log('   所有职位列表项:');
      if (Array.isArray(allItems) && allItems.length > 0) {
        allItems.forEach((item: any) => {
          console.log(`     ${item.index}. ${item.text} (class: ${item.class})`);
        });
        console.log();
      }

      // 3. 拦截 API 响应并点击元素
      const apiUrl = 'https://www.zhipin.com/wapi/zpgeek/job/detail.json';
      console.log(`3. 开始拦截 API: ${apiUrl}**`);
      console.log(`4. 点击元素: ${selector}`);

      // 使用 NetworkListener 的回调机制
      const networkListener = client.getNetworkListener();
      const urlPattern = apiUrl.replace(/\*\*/g, '.*');

      return new Promise((resolve, reject) => {
        let listenerActive = false;
        let listenerCalled = false;

        const responseCallback = (body: string) => {
          listenerCalled = true;

          if (!listenerActive) {
            return;
          }

          listenerActive = false;

          if (body) {
            console.log('5. 拦截成功！\n');

            // 解析并显示结果
            const data = JSON.parse(body);
            console.log('拦截结果:');
            console.log(`  响应状态: ${data.code}`);
            console.log(`  响应消息: ${data.message}`);
            console.log(`  数据长度: ${body.length} 字符`);

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
            fs.writeFileSync('click-intercept-result.json', body);
            console.log('\n  ✓ 数据已保存到 click-intercept-result.json');

            resolve(body);
          } else {
            reject(new Error('Response body is empty'));
          }
        };

        // 添加回调
        if (networkListener) {
          networkListener.addResponseReceivedCallback(urlPattern, responseCallback);
        }

        // 点击元素
        client.executeScript(`
          (function() {
            const element = document.querySelector('${selector}');
            if (element) {
              element.click();
            }
          })()
        `).then(() => {
          console.log('   ✓ 元素已点击\n');
          // 激活监听器
          listenerActive = true;

          // 设置超时
          setTimeout(() => {
            if (listenerActive && !listenerCalled) {
              console.log('   ⚠ 超时：未收到响应');
              if (networkListener) {
                networkListener.removeResponseReceivedCallback(urlPattern);
              }
              reject(new Error('Timeout waiting for response'));
            }
          }, 10000);
        }).catch((err) => {
          console.error('   ✗ 点击失败:', err);
          reject(err);
        });
      }).then(async () => {
        await client.close();
        console.log('\n✓ 测试完成');
      }).catch(async (err) => {
        console.error('测试失败:', err);
        await client.close();
        throw err;
      });
    } else {
      console.log('   元素不存在，无法继续测试\n');
      await client.close();
    }
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testFinalClickAndIntercept().catch(console.error);