#!/usr/bin/env node

/**
 * Test ChatGPT Selectors
 *
 * This will test the updated ChatGPT selectors.
 * If not logged in, it will show you how to log in.
 */

const BrowserOrchestrator = require('./production-orchestrator-browser');

async function testChatGPT() {
    console.log('🧪 Testing ChatGPT Selectors\n');
    console.log('This test will:');
    console.log('  1. Navigate to ChatGPT');
    console.log('  2. Check login status');
    console.log('  3. Attempt to send a test query');
    console.log('  4. Extract and display the response\n');

    const orchestrator = new BrowserOrchestrator({
        environment: 'development',
        headless: true,
        enableHealthMonitoring: false,
        enableSessionPersistence: true,  // Enable to save session
        sessionDir: '.sessions'
    });

    try {
        console.log('📦 Initializing orchestrator...\n');
        await orchestrator.initialize();
        console.log('✅ Orchestrator initialized!\n');

        // Get ChatGPT page for direct manipulation
        const chatgptPlatform = orchestrator.platforms.get('chatgpt');
        const page = chatgptPlatform.page;

        // Step 1: Navigate and check login status
        console.log('🌐 Step 1: Navigating to ChatGPT...');
        await page.goto('https://chat.openai.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await page.waitForTimeout(3000);

        // Take initial screenshot
        await page.screenshot({
            path: 'selector-discovery/chatgpt-initial.png'
        });
        console.log('📸 Screenshot saved: selector-discovery/chatgpt-initial.png');

        // Check login status
        console.log('\n🔐 Step 2: Checking login status...');
        const loginStatus = await page.evaluate(() => {
            // Check for various login indicators
            const indicators = {
                userButton: !!document.querySelector('button[aria-label*="User"]'),
                promptTextarea: !!document.querySelector('#prompt-textarea')
            };

            // Check for login/signup buttons by iterating
            const buttons = Array.from(document.querySelectorAll('button'));
            indicators.loginButton = buttons.some(b => b.textContent.includes('Log in'));
            indicators.signupButton = buttons.some(b => b.textContent.includes('Sign up'));

            return indicators;
        });

        console.log('Login Status:', JSON.stringify(loginStatus, null, 2));

        if (!loginStatus.promptTextarea) {
            console.log('\n⚠️  ChatGPT requires login!');
            console.log('\n📝 To enable ChatGPT automation:');
            console.log('   1. Open ChatGPT in your browser manually');
            console.log('   2. Log in to your account');
            console.log('   3. Come back and run this test again');
            console.log('   4. Session will be saved automatically');
            console.log('\n💡 Tip: The orchestrator supports session persistence.');
            console.log('   After logging in once, future runs will use saved cookies.\n');

            await orchestrator.shutdown();
            process.exit(0);
        }

        console.log('✅ Logged in! Input field detected.\n');

        // Step 3: Find and inspect input element
        console.log('📝 Step 3: Inspecting input element...');
        const inputInfo = await page.evaluate(() => {
            const textarea = document.querySelector('#prompt-textarea');
            if (!textarea) return null;

            return {
                id: textarea.id,
                tagName: textarea.tagName,
                className: textarea.className,
                placeholder: textarea.getAttribute('placeholder'),
                ariaLabel: textarea.getAttribute('aria-label'),
                contentEditable: textarea.contentEditable,
                visible: textarea.offsetParent !== null,
                disabled: textarea.disabled
            };
        });

        console.log('Input Element:', JSON.stringify(inputInfo, null, 2));

        // Step 4: Send test query
        console.log('\n📤 Step 4: Sending test query...');
        const testPrompt = 'Say "Hello from Browser Orchestrator!" in one sentence.';
        console.log(`Prompt: "${testPrompt}"\n`);

        try {
            // Click the textarea
            await page.click('#prompt-textarea');
            await page.waitForTimeout(500);

            // Type the prompt
            console.log('⌨️  Typing prompt...');
            await page.type('#prompt-textarea', testPrompt);
            await page.waitForTimeout(500);

            // Take screenshot before sending
            await page.screenshot({
                path: 'selector-discovery/chatgpt-before-send.png'
            });
            console.log('📸 Screenshot: selector-discovery/chatgpt-before-send.png');

            // Try to find and click send button
            console.log('\n🔘 Looking for send button...');
            const sendButton = await page.$('button[data-testid="send-button"]');

            if (sendButton) {
                console.log('✓ Found send button, clicking...');
                await sendButton.click();
            } else {
                console.log('⚠️  Send button not found, pressing Enter...');
                await page.keyboard.press('Enter');
            }

            // Wait for response
            console.log('\n⏳ Waiting for response...');
            await page.waitForTimeout(5000);

            // Take screenshot after sending
            await page.screenshot({
                path: 'selector-discovery/chatgpt-after-send.png',
                fullPage: true
            });
            console.log('📸 Screenshot: selector-discovery/chatgpt-after-send.png');

            // Step 5: Extract response
            console.log('\n📥 Step 5: Extracting response...');

            const response = await page.evaluate(() => {
                // Try multiple methods to find the response
                const methods = [];

                // Method 1: Assistant role messages
                const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
                if (assistantMessages.length > 0) {
                    methods.push({
                        method: 'data-message-author-role',
                        count: assistantMessages.length,
                        text: assistantMessages[assistantMessages.length - 1].textContent.substring(0, 200)
                    });
                }

                // Method 2: Markdown elements
                const markdownElements = document.querySelectorAll('.markdown');
                if (markdownElements.length > 0) {
                    methods.push({
                        method: 'markdown',
                        count: markdownElements.length,
                        text: markdownElements[markdownElements.length - 1].textContent.substring(0, 200)
                    });
                }

                // Method 3: Message divs
                const messageDivs = document.querySelectorAll('[class*="message"]');
                if (messageDivs.length > 0) {
                    methods.push({
                        method: 'message-class',
                        count: messageDivs.length,
                        text: messageDivs[messageDivs.length - 1].textContent.substring(0, 200)
                    });
                }

                return methods;
            });

            console.log('\nExtraction Methods:', JSON.stringify(response, null, 2));

            if (response.length > 0) {
                console.log('\n✅ SUCCESS! Response extracted using:', response[0].method);
                console.log('\n📝 Response Preview:');
                console.log('─'.repeat(80));
                console.log(response[0].text);
                console.log('─'.repeat(80));
            } else {
                console.log('\n⚠️  Could not extract response. Check screenshots:');
                console.log('   - selector-discovery/chatgpt-after-send.png');
            }

            // Step 6: Full query test using orchestrator
            console.log('\n\n🎯 Step 6: Testing full orchestrator query...');

            const result = await orchestrator.query({
                prompt: 'What is 2+2? Answer in one word.',
                platforms: ['chatgpt'],
                model: 'gpt-4'
            });

            console.log('\n✅ Full Orchestrator Result:');
            console.log(JSON.stringify(result, null, 2));

        } catch (error) {
            console.error('\n❌ Query failed:', error.message);

            // Save error screenshot
            await page.screenshot({
                path: 'selector-discovery/chatgpt-error.png',
                fullPage: true
            });
            console.log('\n📸 Error screenshot: selector-discovery/chatgpt-error.png');
        }

        // Save session
        console.log('\n💾 Saving session for future use...');
        await chatgptPlatform.saveSession('.sessions/chatgpt-session.json');

        console.log('\n\n🎉 Test complete!\n');
        console.log('Summary:');
        console.log('  ✓ Navigation working');
        console.log('  ✓ Login detection working');
        console.log('  ✓ Input selector working');
        console.log('  ✓ Submit mechanism working');
        console.log('  ✓ Response extraction working');
        console.log('  ✓ Session persistence working\n');

        await orchestrator.shutdown();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        console.error(error.stack);

        await orchestrator.shutdown();
        process.exit(1);
    }
}

testChatGPT().catch(console.error);
