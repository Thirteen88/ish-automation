#!/usr/bin/env node

/**
 * Send test query to the Multi-Modal Orchestrator
 */

const { spawn } = require('child_process');

console.log('🚀 Sending test query to Multi-Modal Orchestrator...\n');
console.log('Query: "give me information on MHS dentists in Essex"\n');
console.log('This will be auto-detected as TEXT and sent to:');
console.log('  • LMArena (27+ models)');
console.log('  • Claude Direct (3 models)');
console.log('  • ChatGPT (3 models)');
console.log('  • Gemini (2 models)');
console.log('  • Poe (multiple models)');
console.log('\nTotal: ~35+ AI models in parallel!\n');
console.log('═'.repeat(80));

// Create a child process that writes to stdin
const echo = spawn('echo', ['give me information on MHS dentists in Essex']);
const orchestrator = spawn('node', ['multi-modal-interactive.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
});

// Pipe the echo output to the orchestrator
echo.stdout.pipe(orchestrator.stdin);

// Handle orchestrator output
orchestrator.stdout.on('data', (data) => {
    process.stdout.write(data);
});

orchestrator.stderr.on('data', (data) => {
    process.stderr.write(data);
});

orchestrator.on('close', (code) => {
    console.log(`\nOrchestrator exited with code ${code}`);
});

// Set a timeout to exit after seeing results
setTimeout(() => {
    orchestrator.stdin.write('exit\n');
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}, 15000);