import { BrowserContext } from '../src/browser/context';

async function testMultiLevelLocator() {
  console.log('🚀 测试多级 Locator 功能...\n');

  // 连接到现有浏览器
  const context = await BrowserContext.connect(9222);
  const page = await context.getOrNewPage();

  try {
    // 导航到测试页面
    console.log('📌 导航到示例页面...');
    await page.navigate('https://example.com');
    await page.waitForLoadState('load');

    // 测试多级 locator
    console.log('\n📌 测试多级 locator...\n');

    // 1. 单级 locator
    console.log('1️⃣ 单级 locator:');
    const h1Locator = page.locator('h1');
    console.log(`   选择器: ${h1Locator.getSelectors().join(' -> ')}`);
    const h1Text = await h1Locator.getText();
    console.log(`   文本: ${h1Text}\n`);

    // 2. 二级 locator
    console.log('2️⃣ 二级 locator:');
    const bodyLocator = page.locator('body');
    const pLocator = bodyLocator.extLocator('p');
    console.log(`   选择器链: ${pLocator.getSelectors().join(' -> ')}`);
    console.log(`   最终选择器: ${pLocator['selector']}`);
    const pText = await pLocator.getText();
    console.log(`   文本: ${pText}\n`);

    // 3. 三级 locator
    console.log('3️⃣ 三级 locator:');
    const divLocator = page.locator('div');
    const pLocator2 = divLocator.extLocator('p');
    const aLocator = pLocator2.extLocator('a');
    console.log(`   选择器链: ${aLocator.getSelectors().join(' -> ')}`);
    console.log(`   最终选择器: ${aLocator['selector']}`);
    const aExists = await aLocator.exists();
    console.log(`   存在: ${aExists}\n`);

    // 4. 测试 extAll 和多级 locator 结合
    console.log('4️⃣ extAll + 多级 locator:');
    const allLocators = await divLocator.extAll();
    console.log(`   找到 ${allLocators.length} 个 div 元素`);
    if (allLocators.length > 0) {
      const firstDiv = allLocators[0];
      const firstDivP = firstDiv.extLocator('p');
      const firstDivSelectors = firstDivP.getSelectors();
      console.log(`   第一个 div -> p 的选择器链: ${firstDivSelectors.join(' -> ')}`);
    }

    console.log('\n✅ 多级 locator 测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    await context.close();
  }
}

testMultiLevelLocator().catch(console.error);
