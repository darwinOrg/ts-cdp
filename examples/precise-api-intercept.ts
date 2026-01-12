import { launch, CDPClient, interceptApiData } from '../src';

async function preciseApiIntercept() {
  console.log('=== Precise API Interception Example (Using API Interceptor) ===\n');

  // Target API
  const targetApi = 'https://www.zhipin.com/wapi/zpCommon/toggle/all';

  const chrome = await launch({
    headless: false,
    startingUrl: 'https://www.zhipin.com',
    chromeFlags: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--start-maximized',
      '--disable-infobars',
      '--window-size=1920,1080'
    ]
  });

  let client: CDPClient | null = null;

  try {
    console.log('1. Connecting to CDP...');
    client = new CDPClient({
      port: chrome.port,
      name: 'precise-intercept'
    });
    await client.connect();
    console.log('   ✓ Connected\n');

    // Inject anti-detection script
    console.log('2. Injecting anti-detection script...');
    await client.executeScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      window.chrome = { runtime: {} };
    `);
    console.log('   ✓ Anti-detection script injected\n');

    console.log(`3. Intercepting API: ${targetApi}\n`);

    // Use API interceptor to capture the latest data
    const result = await interceptApiData(
      client,
      targetApi,
      {
        timeout: 10000,
        maxAttempts: 3,
        triggerAction: async () => {
          console.log('   Triggering: navigate to target page...');
          const targetUrl = 'https://www.zhipin.com/gongsi/job/5d627415a46b4a750nJ9.html?ka=company-jobs';
          if (client) {
            await client.navigate(targetUrl);

            console.log('   Triggering: reload page...');
            await client.reload();
          }
        }
      }
    );

    console.log('4. Interception Result:\n');
    console.log(`   Success: ${result.success}`);
    console.log(`   Timestamp: ${result.metadata?.timestamp}`);
    console.log(`   Attempt Count: ${result.metadata?.attemptCount}`);
    console.log();

    if (result.success && result.data) {
      console.log('5. Data Analysis:\n');
      console.log(`   Data Length: ${result.data.length} characters`);

      // Parse and analyze the data
      const data = JSON.parse(result.data);
      console.log(`   Request URL: ${data.requestUrl}`);
      console.log(`   Capture Time: ${data.timestamp}`);
      console.log(`   Request Body: ${data.request ? data.request.substring(0, 100) + '...' : 'None'}`);
      console.log();

      console.log('   Response Structure:');
      console.log(`     Response Code: ${data.response.code}`);
      console.log(`     Response Message: ${data.response.message}`);
      console.log(`     zpData Fields Count: ${Object.keys(data.response.zpData || {}).length}`);

      if (data.response.zpData) {
        const zpDataKeys = Object.keys(data.response.zpData);
        console.log(`     zpData First 5 Fields: ${zpDataKeys.slice(0, 5).join(', ')}`);
      }
      console.log();

      // Save the data
      const fs = require('fs');
      fs.writeFileSync('latest-api-data.json', result.data);
      console.log('✓ Latest data saved to latest-api-data.json\n');

    } else {
      console.log('5. Error Information:\n');
      console.log(`   Error: ${result.error}`);
      console.log(`   Metadata: ${JSON.stringify(result.metadata, null, 2)}\n`);
    }

    // Get HAR log
    console.log('6. Getting complete HAR log...');
    const har = client.getHAR();
    if (har) {
      const targetEntries = har.log.entries.filter(entry =>
        entry.request.url.includes('/zpCommon/toggle/all')
      );

      console.log(`   HAR Entries Found: ${targetEntries.length}`);
      if (targetEntries.length > 0) {
        const latestEntry = targetEntries[targetEntries.length - 1];
        console.log(`   Latest Request Time: ${latestEntry.startedDateTime}`);
        console.log(`   Latest Request Duration: ${latestEntry.time}ms`);
      }

      const fs = require('fs');
      fs.writeFileSync('precise-intercept.har', JSON.stringify(har, null, 2));
      console.log('✓ HAR saved to precise-intercept.har\n');
    }

    console.log('=== Interception Complete ===');
    console.log(`\n📊 Statistics:`);
    console.log(`   Total Attempts: ${result.metadata?.attemptCount || 0}`);
    console.log(`   Success: ${result.success ? 'Yes' : 'No'}`);
    console.log(`   Data Available: ${result.success ? 'Yes' : 'No'}`);

    console.log('\nBrowser will stay open for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    console.error('❌ Error during interception:', error);
  } finally {
    console.log('\nCleaning up...');
    if (client) {
      await client.close();
    }
    chrome.kill();
    console.log('✓ Test complete');
  }
}

preciseApiIntercept().catch(console.error);