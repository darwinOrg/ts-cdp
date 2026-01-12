import { launch, CDPClient, interceptMultipleApis } from '../src';

async function networkMonitoringExample() {
  console.log('=== Network Monitoring Example (Using API Interceptor) ===\n');

  // Launch Chrome
  const chrome = await launch({
    headless: false,
    startingUrl: 'https://httpbin.org'
  });

  let client: CDPClient | null = null;

  try {
    // Connect to CDP
    client = new CDPClient({
      port: chrome.port,
      name: 'network-monitor'
    });
    await client.connect();

    console.log('1. Setting up API interception...\n');

    // Define APIs to monitor
    const apiUrls = [
      'https://httpbin.org/get',
      'https://httpbin.org/post',
      'https://httpbin.org/json'
    ];

    console.log('   Monitoring APIs:');
    apiUrls.forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`);
    });
    console.log();

    // Use API interceptor to capture multiple APIs
    console.log('2. Capturing API requests...');
    const results = await interceptMultipleApis(
      client,
      apiUrls,
      {
        timeout: 10000,
        maxAttempts: 2,
        triggerAction: async () => {
          console.log('   Triggering: navigate and interact...');
          if (client) {
            await client.navigate('https://httpbin.org');

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Trigger GET request
            await client.executeScript(`
              fetch('https://httpbin.org/get?test=123')
            `);

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Trigger POST request
            await client.executeScript(`
              fetch('https://httpbin.org/post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test: 'data', timestamp: Date.now() })
              });
            `);

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Navigate to JSON endpoint
            await client.navigate('https://httpbin.org/json');
          }
        }
      }
    );

    console.log('\n3. Interception Results:\n');

    let successCount = 0;
    results.forEach((result, url) => {
      const apiName = url.split('/').pop() || url;
      const status = result.success ? '✓' : '✗';
      console.log(`   ${status} ${apiName}`);

      if (result.success && result.data) {
        successCount++;
        console.log(`     Attempts: ${result.metadata?.attemptCount}`);
        console.log(`     Data Length: ${result.data.length} chars`);

        // Parse and show some data
        try {
          const data = JSON.parse(result.data);
          if (data.response?.args) {
            console.log(`     Query Params: ${JSON.stringify(data.response.args)}`);
          }
          if (data.response?.json) {
            console.log(`     JSON Data: ${JSON.stringify(data.response.json).substring(0, 50)}...`);
          }
        } catch (e) {
          // Ignore parse errors
        }
      } else {
        console.log(`     Error: ${result.error}`);
      }
      console.log();
    });

    console.log(`   Summary: ${successCount}/${results.size} APIs captured\n`);

    // Save results
    const fs = require('fs');
    const allResults: any = {};
    results.forEach((result, url) => {
      const apiName = url.split('/').pop() || url;
      allResults[apiName] = result;
    });
    fs.writeFileSync('network-monitoring-results.json', JSON.stringify(allResults, null, 2));
    console.log('✓ Results saved to network-monitoring-results.json\n');

    // Get HAR log
    console.log('4. Getting complete HAR log...');
    const har = client.getHAR();
    if (har) {
      console.log(`   Total entries: ${har.log.entries.length}`);
      console.log(`   XHR/Fetch requests: ${har.log.entries.filter(e =>
        e.request.url.includes('httpbin')
      ).length}`);

      fs.writeFileSync('network-monitoring.har', JSON.stringify(har, null, 2));
      console.log('✓ HAR saved to network-monitoring.har\n');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (client) {
      await client.close();
    }
    chrome.kill();
    console.log('=== Example Complete ===');
  }
}

networkMonitoringExample().catch(console.error);