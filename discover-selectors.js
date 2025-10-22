#!/usr/bin/env node

/**
 * Selector Discovery Tool
 *
 * Opens each platform and helps discover the correct selectors
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;

const platforms = [
    { name: 'Claude.ai', url: 'https://claude.ai/new', key: 'claude' },
    { name: 'ChatGPT', url: 'https://chat.openai.com', key: 'chatgpt' },
    { name: 'Gemini', url: 'https://gemini.google.com', key: 'gemini' },
    { name: 'LMArena', url: 'https://lmarena.ai/?arena', key: 'lmarena' },
    { name: 'ISH', url: 'https://ish.junioralive.in', key: 'ish' }
];

async function discoverSelectors() {
    console.log('🔍 Selector Discovery Tool\n');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    await fs.mkdir('selector-discovery', { recursive: true });

    for (const platform of platforms) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🌐 ${platform.name}`);
        console.log(`${'='.repeat(60)}\n`);

        const page = await context.newPage();

        try {
            console.log(`📡 Navigating to ${platform.url}...`);
            await page.goto(platform.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(3000);

            // Screenshot
            await page.screenshot({ path: `selector-discovery/${platform.key}.png` });
            console.log(`📸 Screenshot saved`);

            // Find inputs
            const inputs = await page.$$eval('input[type="text"], textarea, [contenteditable="true"]', els =>
                els.slice(0, 5).map((el, i) => ({
                    i,
                    tag: el.tagName,
                    id: el.id,
                    class: el.className,
                    placeholder: el.placeholder
                }))
            );

            console.log('\n📝 Input Elements:');
            inputs.forEach(el => {
                console.log(`  [${el.i}] ${el.tag}`);
                if (el.id) console.log(`      id="${el.id}"`);
                if (el.class) console.log(`      class="${el.class.substring(0, 60)}"`);
            });

            // Find buttons
            const buttons = await page.$$eval('button', els =>
                els.slice(0, 5).map((el, i) => ({
                    i,
                    text: el.textContent?.trim().substring(0, 30),
                    ariaLabel: el.getAttribute('aria-label')
                }))
            );

            console.log('\n🔘 Buttons:');
            buttons.forEach(el => {
                console.log(`  [${el.i}] "${el.text}"`);
                if (el.ariaLabel) console.log(`      aria-label="${el.ariaLabel}"`);
            });

            await page.close();

        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            await page.close();
        }
    }

    await browser.close();
    console.log('\n✅ Complete! Check selector-discovery/ folder.\n');
}

discoverSelectors().catch(console.error);
