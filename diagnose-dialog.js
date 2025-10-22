#!/usr/bin/env node

/**
 * Diagnostic script to understand why the Terms dialog can't be dismissed
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

async function diagnoseDialog() {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
        console.log('Navigating to LMArena...');
        await page.goto('https://lmarena.ai', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        console.log('Waiting for page to settle...');
        await page.waitForTimeout(5000);

        // Diagnose dialog
        const dialogInfo = await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]');
            if (!dialog) return { exists: false };

            // Find all buttons in dialog
            const buttons = Array.from(dialog.querySelectorAll('button'));
            const buttonInfo = buttons.map(btn => ({
                text: btn.textContent.trim(),
                visible: btn.offsetParent !== null,
                enabled: !btn.disabled,
                className: btn.className,
                id: btn.id,
                type: btn.type,
                boundingBox: btn.getBoundingClientRect()
            }));

            // Check if dialog is in iframe
            const inIframe = window.self !== window.top;

            // Check for shadow DOM
            const hasShadowRoot = dialog.shadowRoot !== null;

            return {
                exists: true,
                inIframe,
                hasShadowRoot,
                buttons: buttonInfo,
                dialogHTML: dialog.outerHTML.substring(0, 500)
            };
        });

        console.log('\n=== Dialog Diagnosis ===');
        console.log(JSON.stringify(dialogInfo, null, 2));

        // Try clicking with detailed logging
        console.log('\n=== Attempting Click ===');
        try {
            const agreeButton = page.locator('button').filter({ hasText: 'Agree' }).first();
            console.log('Locator created');

            await agreeButton.waitFor({ state: 'visible', timeout: 5000 });
            console.log('Button is visible');

            await agreeButton.waitFor({ state: 'attached', timeout: 5000 });
            console.log('Button is attached');

            await agreeButton.click({ timeout: 5000 });
            console.log('Click executed');

            await page.waitForTimeout(2000);

            const stillExists = await page.evaluate(() => {
                return document.querySelector('[role="dialog"]') !== null;
            });

            console.log('Dialog still exists:', stillExists);
        } catch (error) {
            console.log('Click failed:', error.message);

            // Try alternative: Focus and press Enter
            console.log('\n=== Trying Focus + Enter ===');
            try {
                await page.focus('button:has-text("Agree")');
                await page.keyboard.press('Enter');
                await page.waitForTimeout(2000);

                const stillExists = await page.evaluate(() => {
                    return document.querySelector('[role="dialog"]') !== null;
                });
                console.log('Dialog still exists after Enter:', stillExists);
            } catch (e2) {
                console.log('Focus + Enter failed:', e2.message);
            }
        }

        console.log('\n=== Taking Screenshot ===');
        await page.screenshot({ path: '/tmp/dialog-diagnosis.png', fullPage: true });
        console.log('Screenshot saved to /tmp/dialog-diagnosis.png');

        console.log('\nPress Ctrl+C to exit (keeping browser open for inspection)...');
        await page.waitForTimeout(60000);

    } finally {
        await browser.close();
    }
}

diagnoseDialog().catch(console.error);
