#!/usr/bin/env node

/**
 * Check what models are available on LMArena and ISH
 */

const { chromium } = require('playwright');

async function checkModels() {
    console.log('🔍 Checking Model Availability\n');
    
    const browser = await chromium.launch({ headless: true });
    
    // Check LMArena
    console.log('=' .repeat(70));
    console.log('📊 LMArena (lmarena.ai)');
    console.log('=' .repeat(70));
    
    try {
        const page1 = await browser.newPage();
        await page1.goto('https://lmarena.ai', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page1.waitForTimeout(3000);
        
        // Get page text to find model mentions
        const pageText = await page1.evaluate(() => document.body.innerText);
        
        // Common models to check
        const modelsToCheck = [
            'GPT-4', 'GPT-3.5', 'gpt-4', 'gpt-3.5',
            'Claude', 'claude-3', 'Claude 3',
            'Gemini', 'gemini-pro',
            'Llama', 'Mistral', 'Mixtral',
            'Command', 'Cohere'
        ];
        
        console.log('\n🎯 Model Detection:');
        const foundModels = [];
        modelsToCheck.forEach(model => {
            if (pageText.toLowerCase().includes(model.toLowerCase())) {
                foundModels.push(model);
                console.log(`  ✓ ${model} - FOUND`);
            }
        });
        
        // Try to find model selector
        console.log('\n🔍 Looking for model selectors...');
        const selectors = await page1.evaluate(() => {
            const selectElements = Array.from(document.querySelectorAll('select'));
            const results = [];
            
            selectElements.forEach((sel, i) => {
                const options = Array.from(sel.options).map(opt => opt.text);
                if (options.length > 0 && options.length < 200) {
                    results.push({
                        index: i,
                        id: sel.id,
                        optionCount: options.length,
                        options: options.slice(0, 10) // First 10 options
                    });
                }
            });
            
            return results;
        });
        
        if (selectors.length > 0) {
            console.log(`  Found ${selectors.length} select element(s):`);
            selectors.forEach(sel => {
                console.log(`\n  Select #${sel.index}:`);
                if (sel.id) console.log(`    ID: ${sel.id}`);
                console.log(`    Options (${sel.optionCount} total):`);
                sel.options.forEach(opt => console.log(`      - ${opt}`));
            });
        }
        
        await page1.screenshot({ path: 'selector-discovery/lmarena-models.png' });
        console.log('\n📸 Screenshot: selector-discovery/lmarena-models.png');
        
        await page1.close();
        
    } catch (error) {
        console.error('❌ Error checking LMArena:', error.message);
    }
    
    // Check ISH
    console.log('\n\n' + '=' .repeat(70));
    console.log('📊 ISH Platform (ish.junioralive.in)');
    console.log('=' .repeat(70));
    
    try {
        const page2 = await browser.newPage();
        await page2.goto('https://ish.junioralive.in', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page2.waitForTimeout(3000);
        
        const pageText = await page2.evaluate(() => document.body.innerText);
        
        const modelsToCheck = [
            'GPT-4', 'GPT-3.5', 'gpt-4', 'gpt-3.5',
            'Claude', 'claude-3', 'Claude 3',
            'Gemini', 'gemini-pro',
            'Llama', 'Mistral'
        ];
        
        console.log('\n🎯 Model Detection:');
        const foundModels = [];
        modelsToCheck.forEach(model => {
            if (pageText.toLowerCase().includes(model.toLowerCase())) {
                foundModels.push(model);
                console.log(`  ✓ ${model} - FOUND`);
            }
        });
        
        // Look for model selectors
        console.log('\n🔍 Looking for model selectors...');
        const ishSelectors = await page2.evaluate(() => {
            const selectElements = Array.from(document.querySelectorAll('select'));
            const results = [];
            
            selectElements.forEach((sel, i) => {
                const options = Array.from(sel.options).map(opt => opt.text);
                if (options.length > 0) {
                    results.push({
                        index: i,
                        id: sel.id,
                        optionCount: options.length,
                        options: options
                    });
                }
            });
            
            return results;
        });
        
        if (ishSelectors.length > 0) {
            console.log(`  Found ${ishSelectors.length} select element(s):`);
            ishSelectors.forEach(sel => {
                console.log(`\n  Select #${sel.index}:`);
                if (sel.id) console.log(`    ID: ${sel.id}`);
                console.log(`    Options (${sel.optionCount} total):`);
                sel.options.forEach(opt => console.log(`      - ${opt}`));
            });
        }
        
        await page2.screenshot({ path: 'selector-discovery/ish-models.png' });
        console.log('\n📸 Screenshot: selector-discovery/ish-models.png');
        
        await page2.close();
        
    } catch (error) {
        console.error('❌ Error checking ISH:', error.message);
    }
    
    await browser.close();
    
    console.log('\n\n' + '=' .repeat(70));
    console.log('📝 Summary');
    console.log('=' .repeat(70));
    console.log('\nBased on the findings above:');
    console.log('  • LMArena: Multi-model platform (100+ models)');
    console.log('  • ISH: Multi-model platform');
    console.log('\n💡 Recommendation:');
    console.log('  If both platforms offer GPT-4, Claude 3, and Gemini,');
    console.log('  you likely DON\'T need separate ChatGPT, Claude.ai, or');
    console.log('  Gemini integrations. Just use LMArena and ISH!\n');
}

checkModels().catch(console.error);
