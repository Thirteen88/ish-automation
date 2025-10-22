#!/usr/bin/env node

// Send query to the multi-modal orchestrator
const { exec } = require('child_process');

const query = "give me information on MHS dentists in Essex";

console.log('📝 Sending query to Multi-Modal AI Orchestrator...');
console.log(`Query: "${query}"`);
console.log('\nThis will be auto-detected as a TEXT request and routed to:');
console.log('• LMArena (27+ models)');
console.log('• Claude Direct');
console.log('• ChatGPT');
console.log('• Gemini');
console.log('• Poe\n');

// Send to the orchestrator via echo
exec(`echo "${query}" | nc localhost 3000`, (error, stdout, stderr) => {
    if (error) {
        console.log('Note: Direct connection not available. Please type the following in the Multi-Modal> prompt:');
        console.log(`\n${query}\n`);
        console.log('The system will:');
        console.log('1. Auto-detect this as a text query');
        console.log('2. Route to all text AI platforms in parallel');
        console.log('3. Query LMArena, Claude, GPT-4, Gemini, and Poe simultaneously');
        console.log('4. Show results from all platforms (~3 seconds)');
        return;
    }
    console.log(stdout);
});