import { CDPClient } from '../src';

async function testFindElements() {
  console.log('=== 查找页面元素 ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'find-elements-example'
    });
    await client.connect();

    console.log('✓ 已连接到现有浏览器\n');

    // 访问目标页面
    const targetUrl = 'https://www.zhipin.com/gongsi/job/480261c022ea03d81nV53tQ~.html?ka=company-jobs';
    console.log(`访问页面: ${targetUrl}`);
    await client.navigate(targetUrl);
    console.log('✓ 导航命令已发送\n');

    // 等待页面加载
    console.log('等待 5 秒...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 获取页面标题
    const title = await client.executeScript('document.title');
    console.log(`页面标题: ${title}\n`);

    // 测试 1: 查找所有 ul 元素
    const allUls = await client.executeScript(`
      const uls = document.querySelectorAll('ul');
      return uls.length;
    `);
    console.log(`所有 ul 元素数量: ${allUls}\n`);

    // 测试 2: 查找所有 li 元素
    const allLis = await client.executeScript(`
      const lis = document.querySelectorAll('li');
      return lis.length;
    `);
    console.log(`所有 li 元素数量: ${allLis}\n`);

    // 测试 3: 查找包含 position 的 ul 元素
    const positionUls = await client.executeScript(`
      const uls = document.querySelectorAll('ul');
      const filtered = Array.from(uls).filter(ul => ul.className.includes('position'));
      return filtered.length;
    `);
    console.log(`包含 position 的 ul 元素数量: ${positionUls}\n`);

    // 测试 4: 查找包含 job 的 ul 元素
    const jobUls = await client.executeScript(`
      const uls = document.querySelectorAll('ul');
      const filtered = Array.from(uls).filter(ul => ul.className.includes('job'));
      return filtered.length;
    `);
    console.log(`包含 job 的 ul 元素数量: ${jobUls}\n`);

    // 测试 5: 获取所有 ul 的 class 名称
    const ulClasses = await client.executeScript(`
      const uls = document.querySelectorAll('ul');
      return Array.from(uls).map(ul => ul.className);
    `);
    console.log('所有 ul 的 class 名称:');
    if (Array.isArray(ulClasses)) {
      ulClasses.forEach((className: string, index: number) => {
        console.log(`  ${index + 1}. ${className}`);
      });
    } else {
      console.log(`  结果: ${ulClasses}`);
    }
    console.log();

    // 测试 6: 查找目标选择器
    const targetSelector = 'ul.position-select-list > li:nth-of-type(2)';
    const targetExists = await client.executeScript(`
      const selector = '${targetSelector}';
      const element = document.querySelector(selector);
      return element !== null;
    `);
    console.log(`目标选择器 "${targetSelector}" 是否存在: ${targetExists}\n`);

    // 测试 7: 查找所有 position-select-list
    const positionSelectLists = await client.executeScript(`
      const uls = document.querySelectorAll('ul.position-select-list');
      return Array.from(uls).map(ul => {
        const lis = ul.querySelectorAll('li');
        return {
          liCount: lis.length,
          liTexts: Array.from(lis).map(li => li.textContent?.trim().substring(0, 30))
        };
      });
    `);
    console.log('所有 position-select-list:');
    if (Array.isArray(positionSelectLists)) {
      positionSelectLists.forEach((list: any, index: number) => {
        console.log(`  列表 ${index + 1}: ${list.liCount} 项`);
        list.liTexts.forEach((text: string, liIndex: number) => {
          console.log(`    ${liIndex + 1}. ${text}`);
        });
      });
    } else {
      console.log(`  结果: ${positionSelectLists}`);
    }

    await client.close();
    console.log('\n✓ 测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testFindElements().catch(console.error);