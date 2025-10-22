#!/usr/bin/env node

/**
 * Interactive ISH Automation CLI
 *
 * An interactive command-line interface for the ISH automation system
 * with enhanced visualization and user input capabilities.
 */

const readline = require('readline');
const { ISHEnhancedOrchestrator } = require('./orchestrator-enhanced');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n🤖 ISH> '
});

// Color codes for terminal
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    red: '\x1b[31m'
};

// Helper function to colorize text
const colorize = (text, color) => `${colors[color]}${text}${colors.reset}`;

// Display welcome banner
function displayBanner() {
    console.clear();
    console.log(colorize('═'.repeat(80), 'cyan'));
    console.log(colorize('                 ISH AUTOMATION SYSTEM - INTERACTIVE MODE', 'cyan'));
    console.log(colorize('═'.repeat(80), 'cyan'));
    console.log();
    console.log(colorize('Welcome to the ISH Automation System!', 'green'));
    console.log('This interactive CLI allows you to:');
    console.log('  • Send prompts to different AI models');
    console.log('  • Orchestrate multi-agent tasks');
    console.log('  • Customize system prompts and parameters');
    console.log();
    console.log(colorize('Available Commands:', 'yellow'));
    console.log('  ' + colorize('prompt', 'bright') + '   - Send a single prompt to ISH');
    console.log('  ' + colorize('task', 'bright') + '     - Orchestrate a multi-agent task');
    console.log('  ' + colorize('models', 'bright') + '   - List available AI models');
    console.log('  ' + colorize('agents', 'bright') + '   - List registered agents');
    console.log('  ' + colorize('config', 'bright') + '   - Configure settings');
    console.log('  ' + colorize('clear', 'bright') + '    - Clear the screen');
    console.log('  ' + colorize('help', 'bright') + '     - Show this help message');
    console.log('  ' + colorize('exit', 'bright') + '     - Exit the application');
    console.log();
    console.log(colorize('─'.repeat(80), 'cyan'));
}

// Display available models
function displayModels(orchestrator) {
    console.log('\n' + colorize('Available AI Models:', 'yellow'));
    console.log(colorize('─'.repeat(40), 'cyan'));

    const models = [
        { name: 'claude-3-opus', provider: 'Anthropic', best: 'Complex reasoning, creativity' },
        { name: 'claude-3-sonnet', provider: 'Anthropic', best: 'Code generation, analysis' },
        { name: 'gpt-4', provider: 'OpenAI', best: 'General tasks, research' },
        { name: 'gpt-4-turbo', provider: 'OpenAI', best: 'Vision, multimodal tasks' },
        { name: 'gemini-pro', provider: 'Google', best: 'Multimodal analysis' }
    ];

    models.forEach(model => {
        console.log(`  ${colorize(model.name, 'bright')} (${model.provider})`);
        console.log(`    Best for: ${model.best}`);
    });
}

// Display registered agents
function displayAgents(orchestrator) {
    console.log('\n' + colorize('Registered Agents:', 'yellow'));
    console.log(colorize('─'.repeat(40), 'cyan'));

    orchestrator.agents.forEach((agent, name) => {
        console.log(`  ${colorize(name, 'bright')} (${agent.model})`);
        console.log(`    Capabilities: ${agent.capabilities.join(', ')}`);
    });
}

// Get user input for a prompt
async function getPromptInput() {
    return new Promise((resolve) => {
        const config = {
            prompt: '',
            model: 'claude-3-opus',
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 2000
        };

        rl.question(colorize('\n📝 Enter your prompt: ', 'green'), (prompt) => {
            config.prompt = prompt;

            rl.question(colorize('🤖 Select model (default: claude-3-opus): ', 'yellow'), (model) => {
                if (model) config.model = model;

                rl.question(colorize('💭 System prompt (optional): ', 'magenta'), (systemPrompt) => {
                    if (systemPrompt) config.systemPrompt = systemPrompt;

                    rl.question(colorize('🌡️  Temperature (0-1, default: 0.7): ', 'blue'), (temp) => {
                        if (temp) config.temperature = parseFloat(temp);

                        rl.question(colorize('📊 Max tokens (default: 2000): ', 'blue'), (tokens) => {
                            if (tokens) config.maxTokens = parseInt(tokens);
                            resolve(config);
                        });
                    });
                });
            });
        });
    });
}

// Get user input for a task
async function getTaskInput() {
    return new Promise((resolve) => {
        rl.question(colorize('\n📋 Enter your task description: ', 'green'), (task) => {
            rl.question(colorize('📐 Strategy (sequential/parallel, default: sequential): ', 'yellow'), (strategy) => {
                resolve({
                    task: task,
                    strategy: strategy || 'sequential'
                });
            });
        });
    });
}

// Main interactive loop
async function main() {
    displayBanner();

    // Initialize orchestrator
    console.log(colorize('\nInitializing orchestrator...', 'yellow'));
    const orchestrator = new ISHEnhancedOrchestrator({
        headless: true,
        timeout: 30000
    });

    try {
        await orchestrator.initialize();
        console.log(colorize('✅ Orchestrator ready!\n', 'green'));
    } catch (error) {
        console.error(colorize('❌ Failed to initialize orchestrator:', 'red'), error.message);
        process.exit(1);
    }

    // Start interactive prompt
    rl.prompt();

    rl.on('line', async (line) => {
        const command = line.trim().toLowerCase();

        switch (command) {
            case 'prompt':
                try {
                    const config = await getPromptInput();
                    console.log('\n' + colorize('Processing...', 'yellow'));
                    await orchestrator.sendPromptToISH(config.prompt, {
                        model: config.model,
                        systemPrompt: config.systemPrompt,
                        temperature: config.temperature,
                        maxTokens: config.maxTokens
                    });
                } catch (error) {
                    console.error(colorize('❌ Error:', 'red'), error.message);
                }
                break;

            case 'task':
                try {
                    const taskConfig = await getTaskInput();
                    console.log('\n' + colorize('Orchestrating task...', 'yellow'));
                    await orchestrator.orchestrateTask(taskConfig.task, taskConfig.strategy);
                } catch (error) {
                    console.error(colorize('❌ Error:', 'red'), error.message);
                }
                break;

            case 'models':
                displayModels(orchestrator);
                break;

            case 'agents':
                displayAgents(orchestrator);
                break;

            case 'config':
                console.log('\n' + colorize('Current Configuration:', 'yellow'));
                console.log(`  Headless: ${orchestrator.config.headless}`);
                console.log(`  Timeout: ${orchestrator.config.timeout}ms`);
                console.log(`  Retry Count: ${orchestrator.config.retryCount}`);
                console.log(`  Retry Delay: ${orchestrator.config.retryDelay}ms`);
                break;

            case 'clear':
                console.clear();
                displayBanner();
                break;

            case 'help':
                displayBanner();
                break;

            case 'exit':
            case 'quit':
                console.log(colorize('\nShutting down...', 'yellow'));
                await orchestrator.cleanup();
                console.log(colorize('Goodbye! 👋', 'green'));
                process.exit(0);
                break;

            default:
                if (command) {
                    console.log(colorize(`Unknown command: ${command}`, 'red'));
                    console.log('Type "help" for available commands');
                }
                break;
        }

        rl.prompt();
    });

    rl.on('close', async () => {
        console.log(colorize('\n\nShutting down...', 'yellow'));
        await orchestrator.cleanup();
        console.log(colorize('Goodbye! 👋', 'green'));
        process.exit(0);
    });
}

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error(colorize('\n❌ Unhandled error:', 'red'), error.message);
    process.exit(1);
});

// Start the application
main().catch(console.error);