import { CDPClient } from '../src';

async function testSimpleScript() {
  console.log('=== 测试简单的脚本执行 ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'simple-script-example'
    });
    await client.connect();

    console.log('✓ 已连接到现有浏览器\n');

    // 获取当前 URL
    const currentUrl = await client.executeScript('window.location.href');
    console.log(`当前 URL: ${currentUrl}\n`);

    // 获取页面标题
    const title = await client.executeScript('document.title');
    console.log(`页面标题: ${title}\n`);

    // 访问目标页面
    const targetUrl = 'https://www.zhipin.com/gongsi/job/480261c022ea03d81nV53tQ~.html?ka=company-jobs';
    console.log(`访问页面: ${targetUrl}`);
    await client.navigate(targetUrl);
    console.log('✓ 导航命令已发送\n');

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 再次获取 URL
    const newUrl = await client.executeScript('window.location.href');
    console.log(`当前 URL: ${newUrl}\n`);

    // 获取页面标题
    const newTitle = await client.executeScript('document.title');
    console.log(`页面标题: ${newTitle}\n`);

    // 获取页面内容
    const bodyText = await client.executeScript('document.body.textContent.substring(0, 200)');
    console.log('页面内容 (前200字符):');
    console.log(bodyText);
    console.log();

    // 检查是否有职位列表
    const hasPositionList = await client.executeScript(`
      const uls = document.querySelectorAll('ul');
      return Array.from(uls).some(ul => {
        const lis = ul.querySelectorAll('li');
        return lis.length > 0 && (ul.className.includes('position') || ul.className.includes('job'));
      });
    `);

    console.log(`是否有职位列表: ${hasPositionList}\n`);

    // 获取所有职位列表
    const positionLists = await client.executeScript(`
      const uls = document.querySelectorAll('ul');
      return Array.from(uls)
        .filter(ul => ul.className.includes('position') || ul.className.includes('job'))
        .map((ul, index) => {
          const lis = ul.querySelectorAll('li');
          return {
            index: index + 1,
            className: ul.className,
            liCount: lis.length,
            firstLiText: lis[0]?.textContent?.trim().substring(0, 30) || ''
          };
        });
    `);

    console.log('职位列表:');
    if (Array.isArray(positionLists) && positionLists.length > 0) {
      positionLists.forEach((list: any) => {
        console.log(`  列表 ${list.index}: ${list.liCount} 项, 第1项: ${list.firstLiText}`);
      });
    } else {
      console.log('  没有找到职位列表');
    }

    await client.close();
    console.log('\n✓ 测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testSimpleScript().catch(console.error);