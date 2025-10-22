const { chromium } = require('playwright');

async function testISH() {
    console.log('Testing ISH platform...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        console.log('Navigating to ISH platform...');
        await page.goto('https://ish.junioralive.in', { timeout: 30000 });
        await page.waitForTimeout(5000);

        // Take screenshot
        await page.screenshot({ path: '/tmp/ish-screenshot.png', fullPage: true });
        console.log('Screenshot saved to /tmp/ish-screenshot.png');

        // Check for common elements
        const hasInput = await page.$('input, textarea');
        const hasDialog = await page.$('[role="dialog"]');
        const hasButton = await page.$('button');

        console.log('\n=== Element Detection ===');
        console.log('Has input field:', !!hasInput);
        console.log('Has dialog:', !!hasDialog);
        console.log('Has button:', !!hasButton);

        // Get page title and content
        const title = await page.title();
        console.log('\n=== Page Info ===');
        console.log('Page title:', title);

        // Check for Cloudflare
        const bodyText = await page.textContent('body');
        const hasCloudflare = bodyText.includes('Cloudflare') || bodyText.includes('Just a moment');
        console.log('Has Cloudflare:', hasCloudflare);

        // Try to find specific UI elements
        console.log('\n=== UI Analysis ===');

        // Look for text inputs
        const textareas = await page.$$('textarea');
        console.log('Number of textareas:', textareas.length);

        const inputs = await page.$$('input');
        console.log('Number of inputs:', inputs.length);

        // Look for common chat UI elements
        const chatContainer = await page.$('[class*="chat"], [id*="chat"]');
        console.log('Has chat container:', !!chatContainer);

        // Look for model selector
        const selects = await page.$$('select');
        console.log('Number of select dropdowns:', selects.length);

        // Check for Terms dialog
        const dialogText = await page.$$eval('[role="dialog"]', els => els.map(el => el.textContent));
        if (dialogText.length > 0) {
            console.log('\n=== Dialog Content ===');
            dialogText.forEach((text, i) => {
                console.log(`Dialog ${i + 1}:`, text.substring(0, 200));
            });
        }

        // Get all visible text
        const visibleText = await page.evaluate(() => {
            const body = document.querySelector('body');
            return body ? body.innerText : '';
        });
        console.log('\n=== Visible Page Text (first 500 chars) ===');
        console.log(visibleText.substring(0, 500));

        await page.waitForTimeout(3000);
        await browser.close();
        console.log('\n✅ Test complete - check /tmp/ish-screenshot.png');
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
        await browser.close();
    }
}

testISH();
