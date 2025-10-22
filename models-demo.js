#!/usr/bin/env node

/**
 * ISH Models Demo
 *
 * Demonstrates the available AI models in the ISH automation system
 */

const { ISHEnhancedOrchestrator } = require('./orchestrator-enhanced');

// Color codes for terminal
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
    gray: '\x1b[90m'
};

const colorize = (text, color) => `${colors[color]}${text}${colors.reset}`;

async function demonstrateModels() {
    console.clear();
    console.log(colorize('═'.repeat(80), 'cyan'));
    console.log(colorize('              ISH AUTOMATION - AVAILABLE AI MODELS', 'cyan'));
    console.log(colorize('═'.repeat(80), 'cyan'));
    console.log();

    // Display available models with detailed information
    const models = [
        {
            name: 'claude-3-opus',
            provider: 'Anthropic',
            contextWindow: 200000,
            strengths: ['Complex reasoning', 'Creative writing', 'Strategic planning'],
            bestFor: 'High-level analysis, creative tasks, and complex problem-solving',
            icon: '🎭'
        },
        {
            name: 'claude-3-sonnet',
            provider: 'Anthropic',
            contextWindow: 200000,
            strengths: ['Code generation', 'Technical analysis', 'Fast processing'],
            bestFor: 'Programming tasks, debugging, and technical documentation',
            icon: '💻'
        },
        {
            name: 'gpt-4',
            provider: 'OpenAI',
            contextWindow: 128000,
            strengths: ['General intelligence', 'Research', 'Multi-domain knowledge'],
            bestFor: 'Research, general Q&A, and broad knowledge tasks',
            icon: '🧠'
        },
        {
            name: 'gpt-4-turbo',
            provider: 'OpenAI',
            contextWindow: 128000,
            strengths: ['Vision capabilities', 'Multimodal', 'Fast responses'],
            bestFor: 'Image analysis, multimodal tasks, and quick iterations',
            icon: '👁️'
        },
        {
            name: 'gemini-pro',
            provider: 'Google',
            contextWindow: 32000,
            strengths: ['Multimodal processing', 'Mathematical reasoning', 'Data analysis'],
            bestFor: 'Data analysis, mathematical problems, and multimodal content',
            icon: '💎'
        }
    ];

    console.log(colorize('Available AI Models:', 'yellow'));
    console.log(colorize('─'.repeat(80), 'gray'));
    console.log();

    models.forEach((model, index) => {
        console.log(`${model.icon} ${colorize(model.name.toUpperCase(), 'bright')}`);
        console.log(`   ${colorize('Provider:', 'blue')} ${model.provider}`);
        console.log(`   ${colorize('Context Window:', 'blue')} ${model.contextWindow.toLocaleString()} tokens`);
        console.log(`   ${colorize('Strengths:', 'green')}`);
        model.strengths.forEach(strength => {
            console.log(`     • ${strength}`);
        });
        console.log(`   ${colorize('Best For:', 'magenta')} ${model.bestFor}`);

        if (index < models.length - 1) {
            console.log();
        }
    });

    console.log();
    console.log(colorize('─'.repeat(80), 'gray'));
    console.log();

    // Now demonstrate using different models
    console.log(colorize('DEMONSTRATION: Using Different Models', 'yellow'));
    console.log(colorize('═'.repeat(80), 'cyan'));
    console.log();

    // Initialize orchestrator
    const orchestrator = new ISHEnhancedOrchestrator({
        headless: true,
        timeout: 30000
    });

    try {
        await orchestrator.initialize();

        // Example 1: Code generation with Claude-3-Sonnet
        console.log(colorize('\n📝 Example 1: Code Generation with Claude-3-Sonnet', 'green'));
        console.log(colorize('─'.repeat(60), 'gray'));

        await orchestrator.sendPromptToISH(
            'Create a Python function to calculate fibonacci numbers',
            {
                model: 'claude-3-sonnet',
                systemPrompt: 'You are an expert Python developer. Write clean, efficient code.',
                temperature: 0.3,
                maxTokens: 1000
            }
        );

        // Example 2: Creative writing with Claude-3-Opus
        console.log(colorize('\n📝 Example 2: Creative Writing with Claude-3-Opus', 'green'));
        console.log(colorize('─'.repeat(60), 'gray'));

        await orchestrator.sendPromptToISH(
            'Write a haiku about artificial intelligence',
            {
                model: 'claude-3-opus',
                systemPrompt: 'You are a creative poet. Write beautiful, meaningful poetry.',
                temperature: 0.9,
                maxTokens: 500
            }
        );

        // Show agent-model mapping
        console.log();
        console.log(colorize('═'.repeat(80), 'cyan'));
        console.log(colorize('AGENT-MODEL MAPPING', 'yellow'));
        console.log(colorize('─'.repeat(80), 'gray'));
        console.log();

        const agentModelMapping = [
            { agent: 'StrategyAgent', model: 'claude-3-opus', purpose: 'Strategic planning and task decomposition' },
            { agent: 'ResearchAgent', model: 'gpt-4', purpose: 'Information gathering and analysis' },
            { agent: 'CodeAgent', model: 'claude-3-sonnet', purpose: 'Code generation and implementation' },
            { agent: 'ReviewAgent', model: 'gpt-4-turbo', purpose: 'Quality assurance and validation' },
            { agent: 'CreativeAgent', model: 'claude-3-opus', purpose: 'Creative solutions and innovation' }
        ];

        console.log(colorize('Default Agent Assignments:', 'blue'));
        console.log();

        agentModelMapping.forEach(mapping => {
            console.log(`  ${colorize(mapping.agent, 'bright')} → ${colorize(mapping.model, 'yellow')}`);
            console.log(`  ${colorize('Purpose:', 'gray')} ${mapping.purpose}`);
            console.log();
        });

        console.log(colorize('═'.repeat(80), 'cyan'));
        console.log(colorize('✅ Model demonstration complete!', 'green'));
        console.log();

        // Cleanup
        await orchestrator.cleanup();

    } catch (error) {
        console.error(colorize('❌ Error:', 'red'), error.message);
    }
}

// Run the demonstration
demonstrateModels().catch(console.error);