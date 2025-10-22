#!/usr/bin/env node

/**
 * ISH Parallel Orchestrator - Always Parallel Execution
 *
 * Enhanced orchestrator that runs all models in parallel by default
 * for maximum efficiency and comprehensive results
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const CLIVisualizer = require('./cli-visualizer');

class ParallelOrchestrator {
    constructor(config = {}) {
        this.visualizer = new CLIVisualizer();
        this.browser = null;
        this.page = null;
        this.config = {
            headless: config.headless !== false,
            timeout: config.timeout || 60000,
            retryCount: config.retryCount || 3,
            retryDelay: config.retryDelay || 2000,
            parallel: config.parallel !== false, // Parallel by default
            models: config.models || ['claude-3-opus', 'claude-3-sonnet', 'gpt-4', 'gpt-4-turbo', 'gemini-pro'],
            ...config
        };

        this.modelRegistry = {
            'claude-3-opus': {
                provider: 'Anthropic',
                contextWindow: 200000,
                capabilities: ['reasoning', 'coding', 'analysis', 'creative'],
                strengths: 'Complex reasoning, creative tasks',
                icon: '🎭'
            },
            'claude-3-sonnet': {
                provider: 'Anthropic',
                contextWindow: 200000,
                capabilities: ['reasoning', 'coding', 'analysis'],
                strengths: 'Fast code generation, technical tasks',
                icon: '💻'
            },
            'gpt-4': {
                provider: 'OpenAI',
                contextWindow: 128000,
                capabilities: ['reasoning', 'coding', 'analysis', 'creative'],
                strengths: 'General knowledge, research',
                icon: '🧠'
            },
            'gpt-4-turbo': {
                provider: 'OpenAI',
                contextWindow: 128000,
                capabilities: ['reasoning', 'coding', 'analysis', 'vision'],
                strengths: 'Multimodal, fast responses',
                icon: '👁️'
            },
            'gemini-pro': {
                provider: 'Google',
                contextWindow: 32000,
                capabilities: ['reasoning', 'analysis', 'multimodal'],
                strengths: 'Data analysis, mathematical reasoning',
                icon: '💎'
            }
        };

        this.results = [];
        this.conversationHistory = [];
    }

    async initialize() {
        this.visualizer.clear();
        this.visualizer.sectionHeader('Initializing Parallel Orchestrator', '🚀');

        this.visualizer.displayInfo(`Parallel Mode: ${this.config.parallel ? 'ENABLED' : 'DISABLED'}`);
        this.visualizer.displayInfo(`Models to query: ${this.config.models.length}`);

        try {
            this.browser = await chromium.launch({
                headless: this.config.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            this.page = await this.browser.newPage();
            await this.page.setViewportSize({ width: 1280, height: 800 });

            // Display active models
            console.log('\n' + this.colorize('Active Models:', 'yellow'));
            this.config.models.forEach(modelName => {
                const model = this.modelRegistry[modelName];
                if (model) {
                    console.log(`  ${model.icon} ${this.colorize(modelName, 'bright')} - ${model.strengths}`);
                }
            });

            this.visualizer.displaySuccess('Parallel Orchestrator ready!', {
                'Mode': 'Parallel Execution',
                'Models': this.config.models.join(', '),
                'Browser': 'Chromium'
            });

            return true;
        } catch (error) {
            this.visualizer.displayError(error, 'Failed to initialize');
            return false;
        }
    }

    async queryModel(modelName, prompt, config = {}) {
        const model = this.modelRegistry[modelName];
        if (!model) {
            throw new Error(`Unknown model: ${modelName}`);
        }

        const startTime = Date.now();

        // Show model is processing
        this.visualizer.displayAgentActivity(
            `${model.icon} ${modelName}`,
            'Processing query...',
            'active'
        );

        try {
            // Simulate API call (in production, this would be real API calls)
            await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1500));

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            // Mark as complete
            this.visualizer.displayAgentActivity(
                `${model.icon} ${modelName}`,
                `Completed in ${duration}s`,
                'complete'
            );

            return {
                model: modelName,
                provider: model.provider,
                duration: duration,
                response: `[${modelName} Response]\n\nProcessed: "${prompt}"\n\n` +
                         `This is a simulated response from ${modelName}. ` +
                         `In production, this would contain the actual AI response.\n` +
                         `Model strengths: ${model.strengths}`,
                timestamp: new Date().toISOString(),
                config: config
            };
        } catch (error) {
            this.visualizer.displayAgentActivity(
                `${model.icon} ${modelName}`,
                `Failed: ${error.message}`,
                'error'
            );
            throw error;
        }
    }

    async executeParallel(prompt, config = {}) {
        this.visualizer.sectionHeader('Parallel Execution', '⚡');

        // Display prompt
        this.visualizer.displayPrompt(prompt, 'USER');

        // Display system prompt if provided
        if (config.systemPrompt) {
            this.visualizer.displaySystemPrompt(config.systemPrompt);
        }

        // Display configuration
        this.visualizer.displayConfig({
            temperature: config.temperature || 0.7,
            maxTokens: config.maxTokens || 2000,
            parallel: 'ENABLED',
            models: this.config.models.length
        });

        // Show all models that will be queried
        this.visualizer.displayOrchestration(
            this.config.models.map(modelName => {
                const model = this.modelRegistry[modelName];
                return {
                    name: modelName,
                    model: model.provider,
                    role: model.strengths
                };
            })
        );

        console.log('\n');
        this.visualizer.startLoadingBar('Executing parallel queries', 100);

        // Execute all queries in parallel
        const queryPromises = this.config.models.map(modelName =>
            this.queryModel(modelName, prompt, config)
        );

        // Update progress bar as queries complete
        let completed = 0;
        queryPromises.forEach(promise => {
            promise.then(() => {
                completed++;
                this.visualizer.updateLoadingBar((completed / this.config.models.length) * 100);
            });
        });

        try {
            // Wait for all queries
            this.results = await Promise.all(queryPromises);
            this.visualizer.completeLoadingBar('All models completed');

            // Store in history
            this.conversationHistory.push({
                timestamp: new Date().toISOString(),
                prompt: prompt,
                config: config,
                results: this.results
            });

            return this.results;
        } catch (error) {
            this.visualizer.completeLoadingBar('Some models failed');
            throw error;
        }
    }

    async sendPrompt(prompt, config = {}) {
        if (this.config.parallel) {
            // Always run in parallel
            const results = await this.executeParallel(prompt, config);
            this.displayParallelResults(results);
            return results;
        } else {
            // Sequential mode (legacy)
            return await this.executeSequential(prompt, config);
        }
    }

    displayParallelResults(results) {
        this.visualizer.sectionHeader('Parallel Results', '📊');

        // Summary statistics
        const avgTime = (results.reduce((sum, r) => sum + parseFloat(r.duration), 0) / results.length).toFixed(2);
        const fastestModel = results.reduce((min, r) => parseFloat(r.duration) < parseFloat(min.duration) ? r : min);
        const slowestModel = results.reduce((max, r) => parseFloat(r.duration) > parseFloat(max.duration) ? r : max);

        console.log('\n' + this.colorize('Performance Summary:', 'yellow'));
        console.log(`  ⚡ Fastest: ${fastestModel.model} (${fastestModel.duration}s)`);
        console.log(`  🐢 Slowest: ${slowestModel.model} (${slowestModel.duration}s)`);
        console.log(`  📊 Average: ${avgTime}s`);
        console.log(`  🔄 Total models: ${results.length}`);
        console.log();

        // Individual model responses
        console.log(this.colorize('Model Responses:', 'cyan'));
        console.log(this.colorize('═'.repeat(80), 'cyan'));

        results.forEach(result => {
            const model = this.modelRegistry[result.model];
            console.log(`\n${model.icon} ${this.colorize(result.model.toUpperCase(), 'bright')} (${result.provider})`);
            console.log(`⏱️  Response time: ${result.duration}s`);
            console.log(this.colorize('─'.repeat(60), 'gray'));

            // Truncate response for display
            const responsePreview = result.response.length > 200
                ? result.response.substring(0, 200) + '...'
                : result.response;
            console.log(responsePreview);
        });

        // Comparison benefits
        console.log('\n' + this.colorize('═'.repeat(80), 'cyan'));
        console.log(this.colorize('✨ Parallel Execution Benefits:', 'green'));
        console.log(`  • ${this.colorize('Time saved:', 'bright')} Running in parallel took ${avgTime}s average`);
        console.log(`  • ${this.colorize('Sequential time:', 'bright')} Would have taken ~${(results.reduce((sum, r) => sum + parseFloat(r.duration), 0)).toFixed(2)}s`);
        console.log(`  • ${this.colorize('Efficiency gain:', 'bright')} ${((results.length - 1) * 100).toFixed(0)}% faster`);
        console.log(`  • ${this.colorize('Multiple perspectives:', 'bright')} ${results.length} different AI models consulted`);

        this.visualizer.displayMetrics({
            duration: `${avgTime}s average`,
            modelsUsed: results.length.toString(),
            executionType: 'Parallel',
            efficiency: `${results.length}x faster than sequential`
        });
    }

    async compareResponses(prompt, config = {}) {
        // Special method for detailed comparison
        this.visualizer.sectionHeader('Model Comparison Mode', '🔍');

        const results = await this.executeParallel(prompt, config);

        // Analyze differences
        console.log('\n' + this.colorize('Response Analysis:', 'yellow'));
        console.log(this.colorize('═'.repeat(80), 'cyan'));

        // Group by consensus
        const consensusMap = new Map();
        results.forEach(result => {
            // In production, this would use NLP to find consensus
            // For now, we'll use a simple grouping
            const key = result.provider;
            if (!consensusMap.has(key)) {
                consensusMap.set(key, []);
            }
            consensusMap.get(key).push(result.model);
        });

        console.log(this.colorize('Provider Distribution:', 'bright'));
        consensusMap.forEach((models, provider) => {
            console.log(`  • ${provider}: ${models.join(', ')}`);
        });

        return results;
    }

    async cleanup() {
        this.visualizer.displayInfo('Cleaning up resources...');

        if (this.browser) {
            await this.browser.close();
        }

        // Save conversation history
        try {
            await fs.writeFile(
                'parallel-conversation-history.json',
                JSON.stringify(this.conversationHistory, null, 2)
            );
            this.visualizer.displayInfo('Conversation history saved');
        } catch (error) {
            this.visualizer.displayWarning('Failed to save conversation history');
        }

        this.visualizer.displaySuccess('Cleanup completed');
    }

    // Helper method for coloring
    colorize(text, color) {
        const colors = {
            reset: '\x1b[0m',
            bright: '\x1b[1m',
            cyan: '\x1b[36m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            gray: '\x1b[90m'
        };
        return `${colors[color] || ''}${text}${colors.reset}`;
    }
}

// Export for use in other modules
module.exports = { ParallelOrchestrator };

// Demo if run directly
if (require.main === module) {
    async function demo() {
        const orchestrator = new ParallelOrchestrator({
            parallel: true, // Always parallel
            models: ['claude-3-opus', 'claude-3-sonnet', 'gpt-4', 'gpt-4-turbo', 'gemini-pro']
        });

        try {
            await orchestrator.initialize();

            // Example 1: Simple query
            console.log('\n' + orchestrator.colorize('Example 1: Simple Query', 'green'));
            await orchestrator.sendPrompt(
                'What are the best practices for API design?',
                {
                    systemPrompt: 'You are an expert software architect.',
                    temperature: 0.7,
                    maxTokens: 1000
                }
            );

            // Example 2: Code generation
            console.log('\n' + orchestrator.colorize('Example 2: Code Generation', 'green'));
            await orchestrator.sendPrompt(
                'Create a Python function for binary search',
                {
                    systemPrompt: 'You are an expert programmer. Write clean, efficient code.',
                    temperature: 0.3,
                    maxTokens: 500
                }
            );

            await orchestrator.cleanup();
        } catch (error) {
            console.error('Error:', error);
            await orchestrator.cleanup();
        }
    }

    demo().catch(console.error);
}