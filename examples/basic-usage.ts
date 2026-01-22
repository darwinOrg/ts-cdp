import {CDPClient, launch} from '../src';

async function loginMonitoringExample() {
    console.log('=== Login Status Monitoring Example ===\n');

    // Launch Chrome
    const chrome = await launch({
        headless: false,
        startingUrl: 'https://github.com'
    });

    let client: CDPClient | null = null;

    try {
        // Connect to CDP with login monitoring
        client = new CDPClient({
            port: chrome.port,
            name: 'login-monitor',
            loginCallback: (state) => {
                console.log(`\n🔐 Login state changed: ${state.toUpperCase()}`);
                if (state === 'login') {
                    console.log('   User is now logged in');
                } else {
                    console.log('   User is now logged out');
                }
            },
            loginUrlPatterns: {
                loginUrl: 'https://github.com/login',
                targetPrefix: 'https://github.com'
            }
        });
        await client.connect();

        console.log('1. Starting at GitHub homepage...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('2. Navigating to login page...');
        console.log('   (This should trigger logout detection)\n');
        await client.navigate('https://github.com/login');
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('3. Simulating login by navigating to dashboard...');
        console.log('   (This should trigger login detection)\n');
        await client.navigate('https://github.com');
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('4. Monitoring login state...');
        console.log('   Try logging in/out manually to see the callbacks\n');

        // Keep monitoring for 30 seconds
        console.log('   Monitoring for 30 seconds...');
        await new Promise(resolve => setTimeout(resolve, 30000));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (client) {
            await client.close();
        }
        chrome.kill();
        console.log('\n=== Example Complete ===');
    }
}

loginMonitoringExample().catch(console.error);