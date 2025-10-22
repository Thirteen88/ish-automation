const { chromium } = require('playwright');

async function discoverISHSelectors() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    console.log('🌐 Navigating to ISH...');
    await page.goto('https://ish.junioralive.in', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ path: 'selector-discovery/ish-interface.png', fullPage: true });
    
    // Discover selectors
    const selectors = await page.evaluate(() => {
        const result = {
            textareas: [],
            inputs: [],
            buttons: [],
            selectMenus: []
        };
        
        // Find textareas
        document.querySelectorAll('textarea').forEach((el, i) => {
            result.textareas.push({
                index: i,
                id: el.id,
                className: el.className,
                placeholder: el.placeholder,
                disabled: el.disabled,
                selector: el.id ? `#${el.id}` : `.${el.className.split(' ')[0]}`
            });
        });
        
        // Find inputs
        document.querySelectorAll('input[type="text"]').forEach((el, i) => {
            result.inputs.push({
                index: i,
                id: el.id,
                className: el.className,
                placeholder: el.placeholder
            });
        });
        
        // Find buttons
        document.querySelectorAll('button').forEach((el, i) => {
            result.buttons.push({
                index: i,
                text: el.textContent.trim(),
                className: el.className,
                ariaLabel: el.getAttribute('aria-label')
            });
        });
        
        // Find selects (for model selection)
        document.querySelectorAll('select').forEach((el, i) => {
            const options = Array.from(el.options).map(opt => opt.value);
            result.selectMenus.push({
                index: i,
                id: el.id,
                className: el.className,
                options: options
            });
        });
        
        return result;
    });
    
    console.log('\n📋 ISH Selectors Discovery:\n');
    console.log(JSON.stringify(selectors, null, 2));
    
    await browser.close();
}

discoverISHSelectors().catch(console.error);
