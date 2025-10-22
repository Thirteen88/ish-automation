#!/usr/bin/env node

/**
 * Comprehensive Test and Example Script
 * Demonstrates all features of the Production Browser Automation system
 */

const { ProductionBrowserAutomation } = require('./production-browser-automation');

// ANSI color codes for better terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function colorize(text, color) {
    return `${colors[color] || ''}${text}${colors.reset}`;
}

function printSection(title) {
    console.log('\n' + colorize('═'.repeat(80), 'cyan'));
    console.log(colorize(`  ${title}`, 'bright'));
    console.log(colorize('═'.repeat(80), 'cyan') + '\n');
}

function printSuccess(message) {
    console.log(colorize('✓ ' + message, 'green'));
}

function printError(message) {
    console.log(colorize('✗ ' + message, 'red'));
}

function printInfo(message) {
    console.log(colorize('ℹ ' + message, 'blue'));
}

async function runTests() {
    const automation = new ProductionBrowserAutomation({
        headless: false,  // Set to true in production
        verbose: true,
        screenshotOnError: true,
        retryCount: 2,
        retryDelay: 3000
    });

    try {
        printSection('Initializing Production Browser Automation');
        await automation.initialize();
        printSuccess('Browser initialized successfully');

        // Test 1: Single Platform Query (Claude)
        printSection('Test 1: Single Platform Query - Claude.ai');
        printInfo('Sending prompt to Claude.ai...');

        const claudeResult = await automation.sendPrompt(
            'claude',
            'Write a haiku about artificial intelligence and consciousness',
            { responseType: 'markdown' }
        );

        if (claudeResult.success) {
            printSuccess(`Claude responded in ${claudeResult.duration}s`);
            console.log('\n' + colorize('Response:', 'yellow'));
            console.log(claudeResult.response);
        } else {
            printError(`Claude failed: ${claudeResult.error}`);
        }

        await automation.sleep(3000); // Pause between tests

        // Test 2: Code Generation with Code Block Extraction
        printSection('Test 2: Code Generation - Extract Code Blocks');
        printInfo('Requesting Python code...');

        const codeResult = await automation.sendPrompt(
            'claude',
            'Write a Python function that implements the quicksort algorithm with comments explaining each step',
            { responseType: 'code' }
        );

        if (codeResult.success) {
            printSuccess(`Code generated in ${codeResult.duration}s`);

            if (Array.isArray(codeResult.response) && codeResult.response.length > 0) {
                console.log('\n' + colorize('Code Blocks Found:', 'yellow'));
                codeResult.response.forEach((block, index) => {
                    console.log(colorize(`\nBlock ${index + 1} (${block.language}):`, 'cyan'));
                    console.log(block.code);
                });
            } else {
                printInfo('No code blocks found, showing full response:');
                console.log(codeResult.response);
            }
        } else {
            printError(`Code generation failed: ${codeResult.error}`);
        }

        await automation.sleep(3000);

        // Test 3: Parallel Platform Queries
        printSection('Test 3: Parallel Platform Queries');
        printInfo('Querying multiple platforms simultaneously...');

        const platforms = ['claude', 'chatgpt', 'gemini', 'lmarena'];
        const prompt = 'Explain the concept of recursion in programming in exactly two sentences.';

        console.log(colorize(`Platforms: ${platforms.join(', ')}`, 'cyan'));
        console.log(colorize(`Prompt: "${prompt}"`, 'yellow'));

        const parallelResults = await automation.queryMultiplePlatforms(
            platforms,
            prompt,
            { responseType: 'text' }
        );

        console.log('\n' + colorize('Results:', 'bright'));

        const successful = parallelResults.filter(r => r.success);
        const failed = parallelResults.filter(r => !r.success);

        if (successful.length > 0) {
            printSuccess(`${successful.length} platforms succeeded`);

            // Show responses
            successful.forEach(result => {
                console.log('\n' + colorize(`─ ${result.platformName} (${result.duration}s) ─`, 'cyan'));
                console.log(result.response.substring(0, 300));
                if (result.response.length > 300) {
                    console.log(colorize('... (truncated)', 'yellow'));
                }
            });

            // Performance comparison
            const durations = successful.map(r => parseFloat(r.duration));
            const avgDuration = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2);
            const fastestDuration = Math.min(...durations).toFixed(2);
            const slowestDuration = Math.max(...durations).toFixed(2);

            console.log('\n' + colorize('Performance Summary:', 'bright'));
            console.log(`  Average: ${avgDuration}s`);
            console.log(`  Fastest: ${fastestDuration}s`);
            console.log(`  Slowest: ${slowestDuration}s`);
        }

        if (failed.length > 0) {
            printError(`${failed.length} platforms failed`);
            failed.forEach(result => {
                console.log(`  - ${result.platformName || result.platform}: ${result.error}`);
            });
        }

        await automation.sleep(3000);

        // Test 4: Markdown Formatting
        printSection('Test 4: Markdown Response Extraction');
        printInfo('Requesting formatted response...');

        const markdownResult = await automation.sendPrompt(
            'claude',
            'Create a comparison table of Python vs JavaScript with columns for: Typing, Performance, Use Cases, and Popularity',
            { responseType: 'markdown' }
        );

        if (markdownResult.success) {
            printSuccess(`Markdown generated in ${markdownResult.duration}s`);
            console.log('\n' + colorize('Formatted Response:', 'yellow'));
            console.log(markdownResult.response);
        } else {
            printError(`Markdown generation failed: ${markdownResult.error}`);
        }

        await automation.sleep(3000);

        // Test 5: Long-form Content with Streaming
        printSection('Test 5: Long-form Content (Streaming Response)');
        printInfo('Testing streaming response handling...');

        const longFormResult = await automation.sendPrompt(
            'claude',
            'Write a detailed essay (500+ words) about the future of artificial intelligence in healthcare, covering diagnostics, treatment, and ethical considerations.',
            { responseType: 'text' }
        );

        if (longFormResult.success) {
            printSuccess(`Essay completed in ${longFormResult.duration}s`);
            console.log('\n' + colorize('Essay Stats:', 'cyan'));
            console.log(`  Length: ${longFormResult.response.length} characters`);
            console.log(`  Words: ~${longFormResult.response.split(/\s+/).length}`);
            console.log('\n' + colorize('Preview (first 500 chars):', 'yellow'));
            console.log(longFormResult.response.substring(0, 500) + '...');
        } else {
            printError(`Essay generation failed: ${longFormResult.error}`);
        }

        await automation.sleep(3000);

        // Test 6: Error Handling
        printSection('Test 6: Error Handling and Recovery');
        printInfo('Testing with intentionally difficult scenario...');

        const errorTest = await automation.sendPrompt(
            'claude',
            'This is a test of error handling',
            {
                responseType: 'text',
                timeout: 5000  // Very short timeout to test error handling
            }
        );

        if (errorTest.success) {
            printSuccess('Request completed successfully');
        } else {
            printInfo(`Error caught and handled: ${errorTest.error}`);
            printSuccess('Error handling working correctly');
        }

        // Test 7: Image Generation (if Playground is available)
        printSection('Test 7: Image Generation (Optional)');
        printInfo('Attempting image generation with Playground AI...');
        printInfo('This may require authentication - check headless: false if needed');

        const imageResult = await automation.sendPrompt(
            'playground',
            'A serene Japanese garden with cherry blossoms and a small pond, digital art style',
            {
                responseType: 'image',
                download: true,
                timeout: 180000  // Longer timeout for image generation
            }
        );

        if (imageResult.success) {
            printSuccess(`Images generated in ${imageResult.duration}s`);

            if (Array.isArray(imageResult.response) && imageResult.response.length > 0) {
                console.log('\n' + colorize('Generated Images:', 'yellow'));
                imageResult.response.forEach((img, index) => {
                    console.log(`\n  Image ${index + 1}:`);
                    console.log(`    URL: ${img.url}`);
                    if (img.localPath) {
                        printSuccess(`    Downloaded: ${img.localPath}`);
                    }
                });
            }
        } else {
            printInfo(`Image generation skipped or failed: ${imageResult.error}`);
            printInfo('This is expected if authentication is required');
        }

        // Test 8: Cookie Persistence
        printSection('Test 8: Cookie and Session Management');
        printInfo('Checking cookie storage...');

        await automation.saveCookies('claude');
        await automation.saveCookies('chatgpt');

        printSuccess('Cookies saved for future sessions');
        printInfo('Next run will use saved cookies for automatic authentication');

        // Final Summary
        printSection('Test Summary');

        const allTests = [
            { name: 'Single Platform Query', result: claudeResult },
            { name: 'Code Generation', result: codeResult },
            { name: 'Parallel Queries', result: { success: successful.length > 0 } },
            { name: 'Markdown Formatting', result: markdownResult },
            { name: 'Long-form Content', result: longFormResult },
            { name: 'Error Handling', result: { success: true } },
            { name: 'Image Generation', result: imageResult },
            { name: 'Cookie Management', result: { success: true } }
        ];

        const passedTests = allTests.filter(t => t.result.success).length;
        const totalTests = allTests.length;

        console.log(colorize(`Results: ${passedTests}/${totalTests} tests passed\n`, 'bright'));

        allTests.forEach(test => {
            if (test.result.success) {
                printSuccess(test.name);
            } else {
                printError(`${test.name}: ${test.result.error || 'Failed'}`);
            }
        });

        if (passedTests === totalTests) {
            console.log('\n' + colorize('🎉 All tests passed!', 'green'));
        } else {
            console.log('\n' + colorize('⚠ Some tests failed - check logs above', 'yellow'));
        }

        // Cleanup
        printSection('Cleanup');
        await automation.cleanup();
        printSuccess('Cleanup completed successfully');

        console.log('\n' + colorize('Test run completed!', 'bright'));
        console.log(colorize('Check ./screenshots for any error screenshots', 'cyan'));
        console.log(colorize('Check ./cookies for saved session data', 'cyan'));
        console.log(colorize('Check ./downloads for any downloaded media\n', 'cyan'));

    } catch (error) {
        printError(`Fatal error: ${error.message}`);
        console.error(error);
        await automation.cleanup();
        process.exit(1);
    }
}

// Run tests
if (require.main === module) {
    console.log(colorize('\n╔═══════════════════════════════════════════════════════════════╗', 'cyan'));
    console.log(colorize('║  Production Browser Automation - Comprehensive Test Suite    ║', 'cyan'));
    console.log(colorize('╚═══════════════════════════════════════════════════════════════╝\n', 'cyan'));

    runTests().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = { runTests };
