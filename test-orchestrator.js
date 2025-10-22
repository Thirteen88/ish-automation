#!/usr/bin/env node

/**
 * Test Script for Multi-Modal AI Orchestrator
 * Sends test prompts to demonstrate each capability
 */

const { spawn } = require('child_process');

// Start the interactive system
const orchestrator = spawn('node', ['multi-modal-interactive.js'], {
    stdio: 'pipe'
});

let testIndex = 0;
const tests = [
    { prompt: 'Explain how neural networks learn', type: 'text' },
    { prompt: 'Generate an image of a robot artist painting', type: 'image' },
    { prompt: 'Create a video about renewable energy', type: 'video' },
    { prompt: 'Convert to speech: Welcome to the future of AI', type: 'voice' },
    { prompt: 'Create a flowchart for user authentication process', type: 'design' }
];

// Handle output
orchestrator.stdout.on('data', (data) => {
    console.log(data.toString());

    // Check if system is ready for input
    if (data.toString().includes('Multi-Modal>')) {
        if (testIndex < tests.length) {
            const test = tests[testIndex];
            console.log(`\n📝 Testing ${test.type.toUpperCase()}: "${test.prompt}"\n`);

            // Send the test prompt
            orchestrator.stdin.write(test.prompt + '\n');
            testIndex++;

            // Wait before next test
            setTimeout(() => {
                if (testIndex < tests.length) {
                    orchestrator.stdin.write('\n');
                } else {
                    console.log('\n✅ All tests completed!');
                    orchestrator.stdin.write('exit\n');
                }
            }, 5000);
        }
    }
});

orchestrator.stderr.on('data', (data) => {
    console.error(`Error: ${data}`);
});

orchestrator.on('close', (code) => {
    console.log(`System exited with code ${code}`);
    process.exit(0);
});

console.log('🚀 Starting Multi-Modal AI Orchestrator Test...\n');