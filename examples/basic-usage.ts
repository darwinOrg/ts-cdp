import { launch, CDPClient } from '../src';

async function basicExample() {
  console.log('=== Basic CDP Usage Example ===\n');

  // 1. Launch Chrome
  console.log('1. Launching Chrome...');
  const chrome = await launch({
    headless: false,
    startingUrl: 'https://example.com'
  });
  console.log(`   Chrome launched on port ${chrome.port}\n`);

  try {
    // 2. Connect to CDP
    console.log('2. Connecting to CDP...');
    const client = new CDPClient({
      port: chrome.port,
      name: 'example-client'
    });
    await client.connect();
    console.log('   Connected successfully\n');

    // 3. Navigate to a page
    console.log('3. Navigating to https://example.com...');
    await client.navigate('https://example.com');
    console.log('   Navigation complete\n');

    // 4. Execute JavaScript
    console.log('4. Executing JavaScript...');
    const title = await client.executeScript('document.title');
    console.log(`   Page title: ${title}\n`);

    // 5. Get page content
    console.log('5. Getting page content...');
    const dom = await client.getDOM();
    console.log(`   DOM length: ${dom.length} characters\n`);

    // 6. Take screenshot
    console.log('6. Taking screenshot...');
    const screenshot = await client.screenshot('png');
    console.log(`   Screenshot size: ${screenshot.length} bytes\n`);

    // Save screenshot
    const fs = require('fs');
    fs.writeFileSync('screenshot.png', Buffer.from(screenshot, 'base64'));
    console.log('   Screenshot saved to screenshot.png\n');

    // 7. Add network listener
    console.log('7. Adding network listener...');
    client.addNetworkCallback('https://example.com', (response, request) => {
      console.log(`   Network request captured: ${JSON.stringify(response).slice(0, 100)}...`);
    });

    // 8. Reload page
    console.log('8. Reloading page...');
    await client.reload();
    console.log('   Page reloaded\n');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 9. Get HAR log
    console.log('9. Getting HAR log...');
    const har = client.getHAR();
    console.log(`   HAR entries: ${har.log.entries.length}\n`);

    // Save HAR
    fs.writeFileSync('network.har', JSON.stringify(har, null, 2));
    console.log('   HAR saved to network.har\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // 10. Cleanup
    console.log('10. Cleaning up...');
    await client.close();
    chrome.kill();
    console.log('    Cleanup complete\n');

    console.log('=== Example Complete ===');
  }
}

basicExample().catch(console.error);