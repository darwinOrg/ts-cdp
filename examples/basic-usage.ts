import { launch, CDPClient, interceptApiData } from '../src';

async function basicExample() {
  console.log('=== Basic CDP Usage Example ===\n');

  // 1. Launch Chrome
  console.log('1. Launching Chrome...');
  const chrome = await launch({
    headless: false,
    startingUrl: 'https://example.com'
  });
  console.log(`   Chrome launched on port ${chrome.port}\n`);

  let client: CDPClient | null = null;

  try {
    // 2. Connect to CDP
    console.log('2. Connecting to CDP...');
    client = new CDPClient({
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

    // 7. Use API interceptor to capture network requests
    console.log('7. Using API interceptor to capture requests...');
    const apiResult = await interceptApiData(
      client!,
      'https://example.com',
      {
        timeout: 5000,
        maxAttempts: 2,
        triggerAction: async () => {
          console.log('   Triggering: reload page...');
          await client!.reload();
        }
      }
    );

    console.log(`   API Interceptor Result:`);
    console.log(`     Success: ${apiResult.success}`);
    console.log(`     Timestamp: ${apiResult.metadata?.timestamp}`);
    console.log(`     Attempt Count: ${apiResult.metadata?.attemptCount}`);

    if (apiResult.success && apiResult.data) {
      console.log(`     Data Length: ${apiResult.data.length} characters`);
      const data = JSON.parse(apiResult.data);
      console.log(`     Response Status: ${data.response?.status || 'N/A'}`);
    } else {
      console.log(`     Error: ${apiResult.error}`);
    }
    console.log();

    // 8. Get HAR log
    console.log('8. Getting HAR log...');
    const har = client.getHAR();
    console.log(`   HAR entries: ${har?.log.entries.length || 0}\n`);

    // Save HAR
    if (har) {
      fs.writeFileSync('network.har', JSON.stringify(har, null, 2));
      console.log('   HAR saved to network.har\n');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // 9. Cleanup
    console.log('9. Cleaning up...');
    if (client) {
      await client.close();
    }
    chrome.kill();
    console.log('    Cleanup complete\n');

    console.log('=== Example Complete ===');
  }
}

basicExample().catch(console.error);