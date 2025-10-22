#!/usr/bin/env node

/**
 * Quick Prompt Sender - Send prompts to multiple AI models
 */

const readline = require('readline');
const CLIVisualizer = require('./cli-visualizer');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const visualizer = new CLIVisualizer();

async function sendPrompt() {
    visualizer.clear();
    visualizer.sectionHeader('ISH + LMArena Prompt System', '🚀');

    console.log('\n' + colorize('Available Models:', 'yellow'));
    console.log('  🎭 Claude-3 (Opus, Sonnet, Haiku)');
    console.log('  🚀 GPT-4 (Turbo, Standard)');
    console.log('  💎 Gemini (Pro, 1.5 Pro, Flash)');
    console.log('  🦙 Llama-3 (70B, 8B)');
    console.log('  🌀 Mixtral (8x22B, 8x7B)');
    console.log('  And 20+ more models via LMArena!');
    console.log();

    // Get user's prompt
    rl.question(colorize('\n📝 Enter your prompt (or "exit" to quit): ', 'green'), async (prompt) => {
        if (prompt.toLowerCase() === 'exit') {
            console.log(colorize('\nGoodbye! 👋', 'green'));
            process.exit(0);
        }

        // Optional system prompt
        rl.question(colorize('💭 System prompt (optional, press Enter to skip): ', 'magenta'), async (systemPrompt) => {

            // Show what will be sent
            console.log();
            visualizer.displayPrompt(prompt, 'YOUR PROMPT');

            if (systemPrompt) {
                visualizer.displaySystemPrompt(systemPrompt);
            }

            // Select models to query
            console.log(colorize('\nSelect mode:', 'yellow'));
            console.log('  1. Fast (5 fastest models)');
            console.log('  2. Quality (5 best models)');
            console.log('  3. Balanced (7 mixed models)');
            console.log('  4. Comprehensive (15 models)');
            console.log('  5. Custom (choose specific models)');

            rl.question(colorize('\nChoice (1-5, default 3): ', 'cyan'), async (choice) => {
                const mode = choice || '3';

                let selectedModels = [];
                switch(mode) {
                    case '1':
                        selectedModels = [
                            'gpt-3.5-turbo', 'claude-3-haiku',
                            'gemini-flash', 'llama-3-8b', 'mistral-medium'
                        ];
                        break;
                    case '2':
                        selectedModels = [
                            'claude-3-opus', 'gpt-4', 'gemini-1.5-pro',
                            'command-r-plus', 'mixtral-8x22b'
                        ];
                        break;
                    case '3':
                        selectedModels = [
                            'claude-3-sonnet', 'gpt-4-turbo', 'gemini-pro',
                            'llama-3-70b', 'mixtral-8x7b', 'command-r', 'reka-core'
                        ];
                        break;
                    case '4':
                        selectedModels = [
                            'claude-3-opus', 'claude-3-sonnet', 'gpt-4', 'gpt-4-turbo',
                            'gemini-1.5-pro', 'gemini-pro', 'llama-3-70b', 'llama-3-8b',
                            'mixtral-8x22b', 'mixtral-8x7b', 'command-r-plus', 'command-r',
                            'qwen1.5-110b', 'deepseek-coder-v2', 'wizardlm-2'
                        ];
                        break;
                    case '5':
                        console.log(colorize('\nEnter model names separated by commas:', 'yellow'));
                        const customModels = await new Promise(resolve => {
                            rl.question('Models: ', resolve);
                        });
                        selectedModels = customModels.split(',').map(m => m.trim());
                        break;
                }

                // Start parallel execution
                console.log();
                visualizer.sectionHeader('Executing Parallel Query', '⚡');

                console.log(colorize('Querying Models:', 'cyan'));
                selectedModels.forEach(m => console.log(`  • ${m}`));
                console.log();

                visualizer.startLoadingBar('Sending to all models', 100);

                // Simulate sending to models (in production, this would actually query the models)
                const startTime = Date.now();
                const responses = [];

                for (let i = 0; i < selectedModels.length; i++) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    visualizer.updateLoadingBar(((i + 1) / selectedModels.length) * 100);

                    responses.push({
                        model: selectedModels[i],
                        time: ((Date.now() - startTime) / 1000).toFixed(2),
                        response: `[${selectedModels[i]}]: Response would appear here...`
                    });
                }

                visualizer.completeLoadingBar('All models responded');

                // Display results
                console.log();
                visualizer.sectionHeader('Responses', '📊');

                responses.forEach(r => {
                    console.log(colorize(`\n${r.model} (${r.time}s):`, 'bright'));
                    console.log(`${r.response.substring(0, 100)}...`);
                });

                // Summary
                const avgTime = (responses.reduce((sum, r) => sum + parseFloat(r.time), 0) / responses.length).toFixed(2);

                visualizer.displayMetrics({
                    duration: `${avgTime}s average`,
                    modelsQueried: responses.length.toString(),
                    status: 'Success'
                });

                // Ask if they want to send another prompt
                console.log();
                rl.question(colorize('Send another prompt? (y/n): ', 'yellow'), (answer) => {
                    if (answer.toLowerCase() === 'y') {
                        sendPrompt();
                    } else {
                        console.log(colorize('\nThank you for using ISH + LMArena! 👋', 'green'));
                        process.exit(0);
                    }
                });
            });
        });
    });
}

function colorize(text, color) {
    const colors = {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        cyan: '\x1b[36m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        magenta: '\x1b[35m'
    };
    return `${colors[color] || ''}${text}${colors.reset}`;
}

// Start the prompt system
console.log(colorize('\n🚀 ISH + LMArena Prompt System Ready!', 'green'));
console.log(colorize('You can now send prompts to multiple AI models in parallel.\n', 'cyan'));

sendPrompt();