#!/usr/bin/env node

const { chromium } = require('playwright');

async function verify() {
    console.log('🔍 Verifying LMArena Models\n');
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log('📡 Navigating to LMArena...');
    await page.goto('https://lmarena.ai', { waitUntil: 'load', timeout: 60000 });
    
    console.log('⏳ Waiting for content...');
    await page.waitForTimeout(5000);
    
    // Get all text content
    const bodyText = await page.textContent('body');
    console.log('\n📄 Page loaded, text length:', bodyText.length);
    
    // Check for model names
    const models = [
        'GPT-4', 'GPT-3.5', 'ChatGPT',
        'Claude', 'Claude 3', 'Claude-3',
        'Gemini', 'Gemini Pro',
        'Llama', 'Mistral', 'Mixtral'
    ];
    
    console.log('\n🎯 Model Search Results:');
    models.forEach(model => {
        const found = bodyText.includes(model);
        console.log(`  ${found ? '✓' : '✗'} ${model}`);
    });
    
    // Get page title
    const title = await page.title();
    console.log('\n📌 Page Title:', title);
    
    // Check for "arena" or "chatbot" text
    console.log('\n🔍 Keywords:');
    const keywords = ['arena', 'model', 'chat', 'battle'];
    keywords.forEach(kw => {
        const count = (bodyText.match(new RegExp(kw, 'gi')) || []).length;
        console.log(`  "${kw}": ${count} occurrences`);
    });
    
    await page.screenshot({ path: 'selector-discovery/lmarena-full.png', fullPage: true });
    console.log('\n📸 Full screenshot: selector-discovery/lmarena-full.png');
    
    await browser.close();
}

verify().catch(console.error);
