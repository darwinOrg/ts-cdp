import { CDPClient } from '../src';

async function testScriptExecution() {
  console.log('=== 测试脚本执行 ===\n');

  try {
    // 连接到现有的 Chrome 浏览器（端口 9222）
    const client = new CDPClient({
      port: 9222,
      name: 'script-execution-example'
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

    // 测试 1: 简单的脚本
    console.log('测试 1: 简单的脚本');
    const test1 = await client.executeScript('1 + 1');
    console.log(`  1 + 1 = ${test1}\n`);

    // 测试 2: 获取标题
    console.log('测试 2: 获取标题');
    const test2 = await client.executeScript('document.title');
    console.log(`  document.title = "${test2}"\n`);

    // 测试 3: 获取 URL
    console.log('测试 3: 获取 URL');
    const test3 = await client.executeScript('window.location.href');
    console.log(`  window.location.href = "${test3}"\n`);

    // 测试 4: 简单的 querySelector
    console.log('测试 4: 简单的 querySelector');
    const test4 = await client.executeScript('document.querySelector("body") !== null');
    console.log(`  document.querySelector("body") !== null = ${test4}\n`);

    // 测试 5: querySelectorAll
    console.log('测试 5: querySelectorAll');
    const test5 = await client.executeScript('document.querySelectorAll("ul").length');
    console.log(`  document.querySelectorAll("ul").length = ${test5}\n`);

    // 测试 6: 更复杂的脚本
    console.log('测试 6: 更复杂的脚本');
    const test6 = await client.executeScript(`
      (function() {
        const uls = document.querySelectorAll('ul');
        return uls.length;
      })()
    `);
    console.log(`  (function() { return document.querySelectorAll('ul').length; })() = ${test6}\n`);

    // 测试 7: 使用 IIFE
    console.log('测试 7: 使用 IIFE');
    const test7 = await client.executeScript(`
      (function() {
        const uls = document.querySelectorAll('ul');
        return Array.from(uls).map(ul => ul.className);
      })()
    `);
    console.log(`  Array.from(document.querySelectorAll('ul')).map(ul => ul.className) = ${test7}\n`);

    await client.close();
    console.log('✓ 测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testScriptExecution().catch(console.error);