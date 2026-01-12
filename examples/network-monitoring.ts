import { launch, CDPClient } from '../src';

async function networkMonitoringExample() {
  console.log('=== Network Monitoring Example ===\n');

  // Launch Chrome
  const chrome = await launch({
    headless: false,
    startingUrl: 'https://httpbin.org'
  });

  try {
    // Connect to CDP
    const client = new CDPClient({
      port: chrome.port,
      name: 'network-monitor',
      watchUrls: [
        'https://httpbin.org/get',
        'https://httpbin.org/post',
        'https://httpbin.org/json'
      ]
    });
    await client.connect();

    console.log('1. Setting up network callbacks...\n');

    // Add callback for GET requests
    client.addNetworkCallback('https://httpbin.org/get', (response, request) => {
      console.log('✓ GET request captured:');
      console.log(`  Response: ${JSON.stringify(response).slice(0, 150)}...`);
      console.log(`  Request body: ${request || 'none'}\n`);
    });

    // Add callback for POST requests
    client.addNetworkCallback('https://httpbin.org/post', (response, request) => {
      console.log('✓ POST request captured:');
      console.log(`  Response: ${JSON.stringify(response).slice(0, 150)}...`);
      console.log(`  Request body: ${request?.slice(0, 100)}...\n`);
    });

    // Add callback for JSON requests
    client.addNetworkCallback('https://httpbin.org/json', (response, request) => {
      console.log('✓ JSON request captured:');
      console.log(`  Response keys: ${Object.keys(response).join(', ')}\n`);
    });

    console.log('2. Navigating to httpbin.org/get...');
    await client.navigate('https://httpbin.org/get');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('3. Triggering POST request via JavaScript...');
    await client.executeScript(`
      fetch('https://httpbin.org/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data', timestamp: Date.now() })
      });
    `);
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('4. Navigating to httpbin.org/json...');
    await client.navigate('https://httpbin.org/json');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('5. Getting complete HAR log...');
    const har = client.getHAR();
    console.log(`   Total entries: ${har.log.entries.length}`);
    console.log(`   XHR/Fetch requests: ${har.log.entries.filter(e => 
      e.request.url.includes('httpbin')
    ).length}\n`);

    // Save HAR
    const fs = require('fs');
    fs.writeFileSync('network-monitoring.har', JSON.stringify(har, null, 2));
    console.log('✓ HAR saved to network-monitoring.har\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    chrome.kill();
    console.log('=== Example Complete ===');
  }
}

networkMonitoringExample().catch(console.error);