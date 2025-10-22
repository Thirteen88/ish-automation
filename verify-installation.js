#!/usr/bin/env node

/**
 * Verification Script
 * Checks that all components are properly installed and configured
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  Production Browser Automation - System Verification      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const checks = {
    '✓ Files': [
        'production-browser-automation.js',
        'selectors-config.json',
        'session-manager.js',
        'enhanced-orchestrator-example.js',
        'test-browser-automation.js',
        'BROWSER_AUTOMATION_README.md',
        'QUICK_REFERENCE.md',
        'IMPLEMENTATION_SUMMARY.md',
        '.gitignore'
    ],
    '✓ Directories': [
        'cookies',
        'sessions',
        'cache',
        'screenshots',
        'downloads'
    ]
};

let allPassed = true;

// Check files
console.log('Checking Core Files:\n');
checks['✓ Files'].forEach(file => {
    const exists = fs.existsSync(file);
    const status = exists ? '✓' : '✗';
    const color = exists ? '\x1b[32m' : '\x1b[31m';
    console.log(`  ${color}${status}\x1b[0m ${file}`);
    if (!exists) allPassed = false;
});

// Check directories
console.log('\nChecking Directories:\n');
checks['✓ Directories'].forEach(dir => {
    const exists = fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    const status = exists ? '✓' : '✗';
    const color = exists ? '\x1b[32m' : '\x1b[31m';
    console.log(`  ${color}${status}\x1b[0m ${dir}/`);
    if (!exists) allPassed = false;
});

// Check dependencies
console.log('\nChecking Dependencies:\n');

const dependencies = ['playwright'];
dependencies.forEach(dep => {
    try {
        require.resolve(dep);
        console.log(`  \x1b[32m✓\x1b[0m ${dep}`);
    } catch (e) {
        console.log(`  \x1b[31m✗\x1b[0m ${dep} - NOT INSTALLED`);
        console.log(`    Run: npm install ${dep}`);
        allPassed = false;
    }
});

// Check configuration
console.log('\nChecking Configuration:\n');

try {
    const config = require('./selectors-config.json');
    const platformCount = Object.keys(config.platforms || {}).length;
    console.log(`  \x1b[32m✓\x1b[0m selectors-config.json - ${platformCount} platforms configured`);
} catch (e) {
    console.log(`  \x1b[31m✗\x1b[0m selectors-config.json - Invalid JSON`);
    allPassed = false;
}

// Check modules can be loaded
console.log('\nChecking Module Loading:\n');

const modules = [
    './production-browser-automation.js',
    './session-manager.js',
    './enhanced-orchestrator-example.js'
];

modules.forEach(mod => {
    try {
        require(mod);
        console.log(`  \x1b[32m✓\x1b[0m ${path.basename(mod)}`);
    } catch (e) {
        console.log(`  \x1b[31m✗\x1b[0m ${path.basename(mod)} - ${e.message}`);
        allPassed = false;
    }
});

// File size check
console.log('\nFile Sizes:\n');

checks['✓ Files'].forEach(file => {
    if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        const sizeKB = (stats.size / 1024).toFixed(1);
        console.log(`  ${file.padEnd(40)} ${sizeKB} KB`);
    }
});

// Summary
console.log('\n' + '═'.repeat(60));

if (allPassed) {
    console.log('\n\x1b[32m✓ All checks passed! System is ready to use.\x1b[0m\n');
    console.log('Next steps:');
    console.log('  1. npm install playwright');
    console.log('  2. npx playwright install chromium');
    console.log('  3. node test-browser-automation.js');
    console.log('  4. Read BROWSER_AUTOMATION_README.md for usage\n');
} else {
    console.log('\n\x1b[31m✗ Some checks failed. Please review the errors above.\x1b[0m\n');
    process.exit(1);
}

console.log('═'.repeat(60) + '\n');
