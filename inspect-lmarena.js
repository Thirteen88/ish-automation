#!/usr/bin/env node
const { chromium } = require('playwright');

async function inspect() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('🔍 Inspecting LMArena...\n');

    await page.goto('https://lmarena.ai/?arena', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);

    // Get all textareas with detailed info
    const textareas = await page.$$eval('textarea', els =>
        els.map((el, i) => ({
            index: i,
            id: el.id,
            name: el.name,
            placeholder: el.placeholder,
            class: el.className,
            visible: el.offsetParent !== null,
            disabled: el.disabled
        }))
    );

    console.log('📝 All Textareas:', JSON.stringify(textareas, null, 2));

    // Find main input
    console.log('\n🎯 Looking for main input...');
    const mainInput = await page.$('textarea:not([disabled])');
    if (mainInput) {
        const box = await mainInput.boundingBox();
        console.log('✅ Found textarea:', box);
    }

    await page.screenshot({ path: 'selector-discovery/lmarena-inspect.png', fullPage: true });
    console.log('\n📸 Screenshot: selector-discovery/lmarena-inspect.png');

    await browser.close();
}

inspect().catch(console.error);
