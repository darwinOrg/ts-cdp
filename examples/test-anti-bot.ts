import { launch, CDPClient } from '../src';

async function testAntiBot() {
  console.log('=== BOSS直聘反爬虫测试 ===\n');

  const targetUrl = 'https://www.zhipin.com/gongsi/job/5d627415a46b4a750nJ9.html?ka=company-jobs';

  // 使用更真实的浏览器配置
  const chrome = await launch({
    headless: false,  // 使用有头模式，更容易通过检测
    startingUrl: 'https://www.zhipin.com',
    chromeFlags: [
      '--disable-blink-features=AutomationControlled',  // 禁用自动化检测特征
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--start-maximized',
      '--disable-infobars',
      '--window-size=1920,1080'
    ],
    prefs: {
      'profile.default_content_setting_values': {
        'notifications': 2
      }
    }
  });

  let client: CDPClient | null = null;

  try {
    console.log('1. 连接到 CDP...');
    client = new CDPClient({
      port: chrome.port,
      name: 'boss-zhipin-test'
    });
    await client.connect();
    console.log('   ✓ 连接成功\n');

    // 注入反检测脚本
    console.log('2. 注入反检测脚本...');
    await client.executeScript(`
      // 覆盖 navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // 覆盖 chrome 对象
      window.chrome = {
        runtime: {}
      };

      // 覆盖 permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // 覆盖 plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });

      // 覆盖 languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en']
      });

      console.log('Anti-detection script injected');
    `);
    console.log('   ✓ 反检测脚本注入完成\n');

    // 先访问首页
    console.log('3. 访问 BOSS直聘首页...');
    await client.navigate('https://www.zhipin.com');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('   ✓ 首页访问完成\n');

    // 获取页面标题
    console.log('4. 检查页面状态...');
    const title = await client.executeScript('document.title');
    console.log(`   当前页面标题: ${title}\n`);

    // 检查是否有验证码或拦截页面
    const hasCaptcha = await client.executeScript(`
      const captchaSelectors = [
        '.verify-captcha',
        '#captcha',
        '.geetest_holder',
        '.nc_wrapper',
        '[class*="captcha"]',
        '[class*="verify"]'
      ];
      return captchaSelectors.some(selector => document.querySelector(selector));
    `);

    if (hasCaptcha) {
      console.log('⚠️  检测到验证码页面\n');
    } else {
      console.log('✓ 未检测到验证码\n');
    }

    // 访问目标页面
    console.log('5. 访问目标页面...');
    console.log(`   URL: ${targetUrl}\n`);
    await client.navigate(targetUrl);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 再次检查页面状态
    console.log('6. 检查目标页面状态...');
    const finalTitle = await client.executeScript('document.title');
    console.log(`   页面标题: ${finalTitle}\n`);

    // 检查页面内容
    const pageContent = await client.executeScript(`
      const body = document.body.innerText;
      return {
        hasContent: body.length > 100,
        hasError: body.includes('验证') || body.includes('安全') || body.includes('访问异常'),
        contentLength: body.length,
        preview: body.substring(0, 200)
      };
    `);

    console.log('页面内容分析:');
    if (pageContent) {
      console.log(`   内容长度: ${pageContent.contentLength} 字符`);
      console.log(`   是否有内容: ${pageContent.hasContent ? '是' : '否'}`);
      console.log(`   是否被拦截: ${pageContent.hasError ? '是' : '否'}`);
      console.log(`   内容预览: ${pageContent.preview}...\n`);
    } else {
      console.log('   无法获取页面内容\n');
    }

    // 截图
    console.log('7. 截取页面截图...');
    const screenshot = await client.screenshot('png');
    const fs = require('fs');
    fs.writeFileSync('boss-zhipin-test.png', Buffer.from(screenshot, 'base64'));
    console.log('   ✓ 截图已保存到 boss-zhipin-test.png\n');

    // 获取完整 HTML
    console.log('8. 保存页面 HTML...');
    const html = await client.getDOM();
    fs.writeFileSync('boss-zhipin-test.html', html);
    console.log('   ✓ HTML 已保存到 boss-zhipin-test.html\n');

    // 最终判断
    console.log('=== 测试结果 ===');
    if (!pageContent) {
      console.log('⚠️  无法判断页面状态');
    } else if (pageContent.hasError) {
      console.log('❌ 页面被识别为爬虫，触发了安全验证');
    } else if (!pageContent.hasContent) {
      console.log('⚠️  页面内容为空，可能被拦截');
    } else {
      console.log('✓ 页面正常访问，未触发反爬虫检测');
    }

    console.log('\n浏览器将保持打开状态 30 秒，你可以手动检查页面...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('❌ 测试过程中出错:', error);
  } finally {
    console.log('\n清理资源...');
    if (client) {
      await client.close();
    }
    chrome.kill();
    console.log('✓ 测试完成');
  }
}

testAntiBot().catch(console.error);