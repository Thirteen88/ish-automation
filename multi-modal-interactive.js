#!/usr/bin/env node

/**
 * ISH Multi-Modal Interactive System
 *
 * Automatically routes to appropriate AI platforms based on request type:
 * - Text → LLM platforms
 * - Image → Image generation
 * - Video → Video creation
 * - Voice → Text-to-speech
 * - Design → Architecture diagrams
 */

const { MultiModalOrchestrator } = require('./multi-modal-orchestrator');
const readline = require('readline');

// Color codes
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

const colorize = (text, color) => `${colors[color]}${text}${colors.reset}`;

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n🌈 Multi-Modal> '
});

// Display banner
function displayBanner() {
    console.clear();
    console.log(colorize('═'.repeat(80), 'cyan'));
    console.log(colorize('        MULTI-MODAL AI ORCHESTRATOR - INTELLIGENT ROUTING', 'cyan'));
    console.log(colorize('═'.repeat(80), 'cyan'));
    console.log();

    console.log(colorize('🤖 TEXT AI:', 'yellow'));
    console.log('   LMArena, Claude, GPT-4, Gemini, Poe (7+ platforms)');

    console.log(colorize('\n🎨 IMAGE AI:', 'yellow'));
    console.log('   Playground AI, Stable Diffusion, DALL-E 3, Craiyon (5+ platforms)');

    console.log(colorize('\n🎬 VIDEO AI:', 'yellow'));
    console.log('   VEED.io, Synthesia, Lumen5, Giz.ai (4+ platforms)');

    console.log(colorize('\n🎙️ VOICE AI:', 'yellow'));
    console.log('   ElevenLabs, Murf AI, NoteGPT, PlayAI (4+ platforms)');

    console.log(colorize('\n📐 DESIGN AI:', 'yellow'));
    console.log('   Eraser.io, Visily, Edraw.AI, Miro (4+ platforms)');

    console.log();
    console.log(colorize('Features:', 'bright'));
    console.log('  • ' + colorize('Auto-Detection', 'green') + ' - Automatically detects task type');
    console.log('  • ' + colorize('Parallel Execution', 'green') + ' - Query multiple platforms simultaneously');
    console.log('  • ' + colorize('Smart Fallback', 'green') + ' - Automatic failover to backup platforms');
    console.log('  • ' + colorize('Direct Access', 'green') + ' - Uses platforms without API keys');

    console.log();
    console.log(colorize('Commands:', 'yellow'));
    console.log('  ' + colorize('auto', 'bright') + '     - Auto-detect and route (default)');
    console.log('  ' + colorize('text', 'bright') + '     - Force text generation');
    console.log('  ' + colorize('image', 'bright') + '    - Force image generation');
    console.log('  ' + colorize('video', 'bright') + '    - Force video generation');
    console.log('  ' + colorize('voice', 'bright') + '    - Force voice synthesis');
    console.log('  ' + colorize('design', 'bright') + '   - Force diagram creation');
    console.log('  ' + colorize('parallel', 'bright') + ' - Query all platforms in parallel');
    console.log('  ' + colorize('status', 'bright') + '   - Show platform status');
    console.log('  ' + colorize('help', 'bright') + '     - Show this help');
    console.log('  ' + colorize('exit', 'bright') + '     - Exit application');
    console.log();
    console.log(colorize('─'.repeat(80), 'cyan'));
}

// Show platform status
function showPlatformStatus(orchestrator) {
    console.log('\n' + colorize('📊 PLATFORM STATUS', 'yellow'));
    console.log(colorize('═'.repeat(60), 'cyan'));

    const categories = [
        { name: 'Text Generation', key: 'text', icon: '🤖' },
        { name: 'Image Generation', key: 'image', icon: '🎨' },
        { name: 'Video Creation', key: 'video', icon: '🎬' },
        { name: 'Voice Synthesis', key: 'voice', icon: '🎙️' },
        { name: 'Design/Diagrams', key: 'design', icon: '📐' }
    ];

    categories.forEach(cat => {
        console.log(`\n${cat.icon} ${colorize(cat.name, 'bright')}:`);
        const platforms = orchestrator.platforms[cat.key];

        if (platforms.primary) {
            console.log(colorize('  Primary:', 'green'));
            platforms.primary.forEach(p => {
                console.log(`    ${p.icon} ${p.name} - ${p.url.substring(0, 40)}...`);
            });
        }

        if (platforms.fallback && platforms.fallback.length > 0) {
            console.log(colorize('  Fallback:', 'yellow'));
            platforms.fallback.forEach(p => {
                console.log(`    ${p.icon} ${p.name} - ${p.url.substring(0, 40)}...`);
            });
        }
    });

    console.log('\n' + colorize('Total Platforms: ' + orchestrator.countAllPlatforms(), 'green'));
}

// Get user input for a query
async function getQueryInput(defaultType = null) {
    return new Promise((resolve) => {
        const typePrompt = defaultType ?
            `\n📝 Enter your ${defaultType} prompt: ` :
            '\n📝 Enter your prompt (auto-detects type): ';

        rl.question(colorize(typePrompt, 'green'), (prompt) => {
            if (!defaultType) {
                rl.question(colorize('🎯 Force type? (text/image/video/voice/design/auto): ', 'yellow'), (type) => {
                    const validTypes = ['text', 'image', 'video', 'voice', 'design', 'auto', ''];
                    const selectedType = type.toLowerCase() === 'auto' || type === '' ? null : type.toLowerCase();

                    if (selectedType && !validTypes.includes(selectedType)) {
                        console.log(colorize('Invalid type, using auto-detection', 'red'));
                    }

                    rl.question(colorize('⚡ Run in parallel? (y/n, default y): ', 'blue'), (parallel) => {
                        resolve({
                            prompt,
                            type: selectedType,
                            parallel: parallel.toLowerCase() !== 'n',
                            useFallback: true
                        });
                    });
                });
            } else {
                resolve({
                    prompt,
                    type: defaultType,
                    parallel: true,
                    useFallback: true
                });
            }
        });
    });
}

// Show example prompts
function showExamples() {
    console.log('\n' + colorize('💡 EXAMPLE PROMPTS', 'yellow'));
    console.log(colorize('═'.repeat(60), 'cyan'));

    const examples = [
        { type: 'Text', prompt: 'Explain quantum computing', icon: '🤖' },
        { type: 'Image', prompt: 'Generate an image of a cyberpunk city', icon: '🎨' },
        { type: 'Video', prompt: 'Create a video about climate change', icon: '🎬' },
        { type: 'Voice', prompt: 'Convert to speech: Welcome to our podcast', icon: '🎙️' },
        { type: 'Design', prompt: 'Create a system architecture diagram for microservices', icon: '📐' }
    ];

    examples.forEach(ex => {
        console.log(`\n${ex.icon} ${colorize(ex.type, 'bright')}:`);
        console.log(`   "${ex.prompt}"`);
    });
}

// Main application
async function main() {
    displayBanner();

    // Initialize orchestrator
    const orchestrator = new MultiModalOrchestrator({
        parallel: true,
        autoRoute: true,
        headless: true
    });

    console.log(colorize('Initializing multi-modal orchestrator...', 'yellow'));

    try {
        await orchestrator.initialize();
        console.log(colorize('✅ Ready! All platforms configured for intelligent routing.\n', 'green'));
    } catch (error) {
        console.error(colorize('❌ Failed to initialize:', 'red'), error.message);
        process.exit(1);
    }

    // Start command loop
    rl.prompt();

    rl.on('line', async (line) => {
        const command = line.trim().toLowerCase();

        switch (command) {
            case 'auto':
            case '':
                try {
                    const config = await getQueryInput();
                    console.log('\n' + colorize('🔄 Processing request...', 'yellow'));
                    const results = await orchestrator.routeRequest(config.prompt, config);
                    orchestrator.displayResults(results, orchestrator.detectTaskType(config.prompt));
                } catch (error) {
                    console.error(colorize('❌ Error:', 'red'), error.message);
                }
                break;

            case 'text':
            case 'image':
            case 'video':
            case 'voice':
            case 'design':
                try {
                    const config = await getQueryInput(command);
                    console.log('\n' + colorize(`🔄 Processing ${command} request...`, 'yellow'));
                    const results = await orchestrator.routeRequest(config.prompt, config);
                    orchestrator.displayResults(results, command);
                } catch (error) {
                    console.error(colorize('❌ Error:', 'red'), error.message);
                }
                break;

            case 'parallel':
                try {
                    console.log(colorize('\n⚡ PARALLEL MODE - Query all platforms simultaneously', 'yellow'));
                    const config = await getQueryInput();
                    config.queryAll = true;
                    config.parallel = true;
                    console.log('\n' + colorize('🔄 Executing parallel queries...', 'yellow'));
                    const results = await orchestrator.routeRequest(config.prompt, config);
                    orchestrator.displayResults(results, orchestrator.detectTaskType(config.prompt));
                } catch (error) {
                    console.error(colorize('❌ Error:', 'red'), error.message);
                }
                break;

            case 'status':
                showPlatformStatus(orchestrator);
                break;

            case 'examples':
                showExamples();
                break;

            case 'clear':
                displayBanner();
                break;

            case 'help':
                displayBanner();
                showExamples();
                break;

            case 'exit':
            case 'quit':
                console.log(colorize('\n🔄 Shutting down orchestrator...', 'yellow'));
                await orchestrator.cleanup();
                console.log(colorize('Goodbye! 👋', 'green'));
                process.exit(0);
                break;

            default:
                if (command) {
                    // Try to process as a direct query
                    console.log(colorize('\n🔄 Auto-detecting and processing...', 'yellow'));
                    try {
                        const results = await orchestrator.routeRequest(command, {
                            parallel: true,
                            useFallback: true
                        });
                        orchestrator.displayResults(results, orchestrator.detectTaskType(command));
                    } catch (error) {
                        console.error(colorize('❌ Error:', 'red'), error.message);
                    }
                }
                break;
        }

        rl.prompt();
    });

    rl.on('close', async () => {
        console.log(colorize('\n\nShutting down...', 'yellow'));
        await orchestrator.cleanup();
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