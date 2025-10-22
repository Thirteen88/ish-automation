#!/usr/bin/env node

/**
 * CLI Visualization Module for ISH Automation System
 *
 * Provides enhanced visibility for:
 * - Model selection
 * - User prompts
 * - System prompts
 * - Loading progress bars
 * - Real-time status updates
 */

const readline = require('readline');

// Create a simple chalk alternative for colorful terminal output
const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',
    strikethrough: '\x1b[9m',

    // Foreground colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

    // Background colors
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m'
};

// Simple chalk-like wrapper with proper method chaining
const chalk = {
    // Basic colors
    gray: (text) => `${colors.gray}${text}${colors.reset}`,
    cyan: (text) => `${colors.cyan}${text}${colors.reset}`,
    yellow: (text) => `${colors.yellow}${text}${colors.reset}`,
    white: (text) => `${colors.white}${text}${colors.reset}`,
    green: (text) => `${colors.green}${text}${colors.reset}`,
    red: (text) => `${colors.red}${text}${colors.reset}`,
    blue: (text) => `${colors.blue}${text}${colors.reset}`,
    magenta: (text) => `${colors.magenta}${text}${colors.reset}`,
    italic: (text) => `${colors.italic}${text}${colors.reset}`,

    // Nested styles for bold
    cyan: {
        bold: (text) => `${colors.cyan}${colors.bold}${text}${colors.reset}`
    },
    white: {
        bold: (text) => `${colors.white}${colors.bold}${text}${colors.reset}`
    },
    gray: {
        italic: (text) => `${colors.gray}${colors.italic}${text}${colors.reset}`,
        strikethrough: (text) => `${colors.gray}${colors.strikethrough}${text}${colors.reset}`
    },

    // Background colors with nested text colors
    bgBlue: {
        white: {
            bold: (text) => `${colors.bgBlue}${colors.white}${colors.bold}${text}${colors.reset}`
        }
    },
    bgGreen: {
        black: {
            bold: (text) => `${colors.bgGreen}${colors.black}${colors.bold}${text}${colors.reset}`
        }
    },
    bgMagenta: {
        white: {
            bold: (text) => `${colors.bgMagenta}${colors.white}${colors.bold}${text}${colors.reset}`
        }
    },
    bgYellow: {
        black: {
            bold: (text) => `${colors.bgYellow}${colors.black}${colors.bold}${text}${colors.reset}`
        }
    },
    bgRed: {
        white: {
            bold: (text) => `${colors.bgRed}${colors.white}${colors.bold}${text}${colors.reset}`
        }
    },
    bgCyan: {
        black: {
            bold: (text) => `${colors.bgCyan}${colors.black}${colors.bold}${text}${colors.reset}`
        }
    }
};

// Fix method overlap issues
chalk.cyan = Object.assign(
    (text) => `${colors.cyan}${text}${colors.reset}`,
    { bold: (text) => `${colors.cyan}${colors.bold}${text}${colors.reset}` }
);

chalk.white = Object.assign(
    (text) => `${colors.white}${text}${colors.reset}`,
    { bold: (text) => `${colors.white}${colors.bold}${text}${colors.reset}` }
);

chalk.gray = Object.assign(
    (text) => `${colors.gray}${text}${colors.reset}`,
    {
        italic: (text) => `${colors.gray}${colors.italic}${text}${colors.reset}`,
        strikethrough: (text) => `${colors.gray}${colors.strikethrough}${text}${colors.reset}`
    }
);

class CLIVisualizer {
    constructor() {
        this.currentLoadingBar = null;
        this.loadingInterval = null;
        this.spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.spinnerIndex = 0;
    }

    /**
     * Display a divider line
     */
    divider(char = '═', length = 80) {
        console.log(chalk.gray(char.repeat(length)));
    }

    /**
     * Display a section header
     */
    sectionHeader(title, icon = '📋') {
        this.divider();
        console.log(chalk.cyan.bold(`${icon} ${title}`));
        this.divider('─');
    }

    /**
     * Display model information
     */
    displayModel(modelName, details = {}) {
        console.log('\n' + chalk.bgBlue.white.bold(' MODEL SELECTED '));
        console.log(chalk.yellow('🤖 Model:'), chalk.white.bold(modelName));

        if (details.provider) {
            console.log(chalk.yellow('🏢 Provider:'), chalk.white(details.provider));
        }
        if (details.contextWindow) {
            console.log(chalk.yellow('📏 Context Window:'), chalk.white(`${details.contextWindow.toLocaleString()} tokens`));
        }
        if (details.capabilities) {
            console.log(chalk.yellow('💪 Capabilities:'), chalk.white(details.capabilities.join(', ')));
        }
        console.log();
    }

    /**
     * Display prompt information
     */
    displayPrompt(prompt, type = 'USER') {
        console.log('\n' + chalk.bgGreen.black.bold(` ${type} PROMPT `));
        console.log(chalk.green('─'.repeat(80)));

        // Word wrap long prompts
        const wrapped = this.wordWrap(prompt, 78);
        wrapped.forEach(line => {
            console.log(chalk.white(line));
        });

        console.log(chalk.green('─'.repeat(80)) + '\n');
    }

    /**
     * Display system prompt
     */
    displaySystemPrompt(systemPrompt) {
        console.log('\n' + chalk.bgMagenta.white.bold(' SYSTEM PROMPT '));
        console.log(chalk.magenta('─'.repeat(80)));

        const wrapped = this.wordWrap(systemPrompt, 78);
        wrapped.forEach(line => {
            console.log(chalk.gray(line));
        });

        console.log(chalk.magenta('─'.repeat(80)) + '\n');
    }

    /**
     * Display configuration details
     */
    displayConfig(config) {
        console.log(chalk.bgYellow.black.bold(' CONFIGURATION '));
        console.log(chalk.yellow('⚙️  Temperature:'), chalk.white(config.temperature || 0.7));
        console.log(chalk.yellow('📝 Max Tokens:'), chalk.white(config.maxTokens || 2000));

        if (config.timeout) {
            console.log(chalk.yellow('⏱️  Timeout:'), chalk.white(`${config.timeout}ms`));
        }

        console.log();
    }

    /**
     * Start a loading bar with percentage
     */
    startLoadingBar(label = 'Processing', total = 100) {
        this.currentLoadingBar = {
            label,
            current: 0,
            total,
            startTime: Date.now()
        };

        console.log('\n' + chalk.cyan.bold(label));
        this.updateLoadingBar(0);
    }

    /**
     * Update loading bar progress
     */
    updateLoadingBar(progress) {
        if (!this.currentLoadingBar) return;

        this.currentLoadingBar.current = progress;
        const percentage = Math.min(100, Math.round((progress / this.currentLoadingBar.total) * 100));
        const barLength = 40;
        const filled = Math.round((percentage / 100) * barLength);
        const empty = barLength - filled;

        // Clear line and redraw
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
        const elapsed = ((Date.now() - this.currentLoadingBar.startTime) / 1000).toFixed(1);

        process.stdout.write(
            `${bar} ${chalk.yellow(percentage + '%')} | ${chalk.gray(elapsed + 's')}`
        );
    }

    /**
     * Complete the loading bar
     */
    completeLoadingBar(message = 'Complete') {
        if (!this.currentLoadingBar) return;

        this.updateLoadingBar(this.currentLoadingBar.total);
        console.log(' ' + chalk.green('✅ ' + message));
        this.currentLoadingBar = null;
    }

    /**
     * Start an animated spinner
     */
    startSpinner(message = 'Loading') {
        this.stopSpinner(); // Stop any existing spinner

        this.loadingInterval = setInterval(() => {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);

            const spinner = this.spinnerFrames[this.spinnerIndex];
            this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;

            process.stdout.write(chalk.cyan(spinner) + ' ' + chalk.white(message));
        }, 100);
    }

    /**
     * Stop the spinner
     */
    stopSpinner(finalMessage = '') {
        if (this.loadingInterval) {
            clearInterval(this.loadingInterval);
            this.loadingInterval = null;

            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);

            if (finalMessage) {
                console.log(chalk.green('✅ ' + finalMessage));
            }
        }
    }

    /**
     * Display agent activity
     */
    displayAgentActivity(agentName, activity, status = 'active') {
        const statusIcons = {
            active: '🔄',
            complete: '✅',
            error: '❌',
            waiting: '⏳'
        };

        const statusColors = {
            active: chalk.cyan,
            complete: chalk.green,
            error: chalk.red,
            waiting: chalk.yellow
        };

        const icon = statusIcons[status] || '📌';
        const color = statusColors[status] || chalk.white;

        console.log(color(`${icon} [${agentName}] ${activity}`));
    }

    /**
     * Display multi-agent orchestration
     */
    displayOrchestration(agents) {
        console.log('\n' + chalk.bgCyan.black.bold(' MULTI-AGENT ORCHESTRATION '));
        console.log(chalk.cyan('─'.repeat(80)));

        agents.forEach((agent, index) => {
            const number = chalk.yellow(`${index + 1}.`);
            const name = chalk.white.bold(agent.name);
            const model = chalk.gray(`(${agent.model})`);
            const role = chalk.italic(agent.role || '');

            console.log(`  ${number} ${name} ${model} ${role}`);
        });

        console.log(chalk.cyan('─'.repeat(80)) + '\n');
    }

    /**
     * Display response preview
     */
    displayResponse(response, truncate = true) {
        console.log('\n' + chalk.bgGreen.black.bold(' RESPONSE '));
        console.log(chalk.green('─'.repeat(80)));

        let displayText = response;
        if (truncate && response.length > 500) {
            displayText = response.substring(0, 497) + '...';
            console.log(chalk.gray.italic('(Response truncated for display)'));
        }

        const wrapped = this.wordWrap(displayText, 78);
        wrapped.forEach(line => {
            console.log(chalk.white(line));
        });

        console.log(chalk.green('─'.repeat(80)) + '\n');
    }

    /**
     * Display metrics and statistics
     */
    displayMetrics(metrics) {
        console.log('\n' + chalk.bgBlue.white.bold(' EXECUTION METRICS '));
        console.log(chalk.blue('─'.repeat(80)));

        if (metrics.duration) {
            console.log(chalk.yellow('⏱️  Duration:'), chalk.white(metrics.duration));
        }
        if (metrics.tokensUsed) {
            console.log(chalk.yellow('🔤 Tokens Used:'), chalk.white(metrics.tokensUsed));
        }
        if (metrics.cost) {
            console.log(chalk.yellow('💰 Estimated Cost:'), chalk.white(metrics.cost));
        }
        if (metrics.agentsUsed) {
            console.log(chalk.yellow('🤖 Agents Used:'), chalk.white(metrics.agentsUsed));
        }

        console.log(chalk.blue('─'.repeat(80)) + '\n');
    }

    /**
     * Display error message
     */
    displayError(error, context = '') {
        console.log('\n' + chalk.bgRed.white.bold(' ERROR '));
        console.log(chalk.red('─'.repeat(80)));

        if (context) {
            console.log(chalk.yellow('Context:'), chalk.white(context));
        }

        console.log(chalk.red('Error:'), chalk.white(error.message || error));

        if (error.stack && process.env.DEBUG) {
            console.log(chalk.gray('\nStack trace:'));
            console.log(chalk.gray(error.stack));
        }

        console.log(chalk.red('─'.repeat(80)) + '\n');
    }

    /**
     * Display success message
     */
    displaySuccess(message, details = {}) {
        console.log('\n' + chalk.bgGreen.black.bold(' SUCCESS '));
        console.log(chalk.green('✅ ' + message));

        if (Object.keys(details).length > 0) {
            Object.entries(details).forEach(([key, value]) => {
                console.log(chalk.gray(`   ${key}:`), chalk.white(value));
            });
        }

        console.log();
    }

    /**
     * Display warning message
     */
    displayWarning(message) {
        console.log(chalk.yellow('⚠️  Warning:'), chalk.white(message));
    }

    /**
     * Display info message
     */
    displayInfo(message) {
        console.log(chalk.blue('ℹ️  Info:'), chalk.white(message));
    }

    /**
     * Word wrap text to specified width
     */
    wordWrap(text, width) {
        const lines = [];
        const words = text.split(' ');
        let currentLine = '';

        words.forEach(word => {
            if ((currentLine + ' ' + word).length <= width) {
                currentLine = currentLine ? currentLine + ' ' + word : word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        });

        if (currentLine) lines.push(currentLine);
        return lines;
    }

    /**
     * Create an ASCII progress bar
     */
    createProgressBar(progress, total, width = 40) {
        const percentage = Math.min(100, Math.round((progress / total) * 100));
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;

        return {
            bar: '█'.repeat(filled) + '░'.repeat(empty),
            percentage: percentage
        };
    }

    /**
     * Display a task list with checkboxes
     */
    displayTaskList(tasks) {
        console.log('\n' + chalk.bgBlue.white.bold(' TASK LIST '));

        tasks.forEach(task => {
            const checkbox = task.completed ? chalk.green('☑') : chalk.gray('☐');
            const text = task.completed ? chalk.gray.strikethrough(task.name) : chalk.white(task.name);
            console.log(`  ${checkbox} ${text}`);
        });

        console.log();
    }

    /**
     * Clear the console
     */
    clear() {
        console.clear();
    }
}

// Export for use in other modules
module.exports = CLIVisualizer;

// Example usage if run directly
if (require.main === module) {
    const visualizer = new CLIVisualizer();

    // Demo the visualizer
    async function demo() {
        visualizer.clear();

        visualizer.sectionHeader('ISH Automation System Demo', '🚀');

        // Display model selection
        visualizer.displayModel('claude-3-opus', {
            provider: 'Anthropic',
            contextWindow: 200000,
            capabilities: ['reasoning', 'coding', 'analysis', 'creative']
        });

        // Display prompts
        visualizer.displayPrompt('Create a comprehensive web application for task management with real-time collaboration features.');

        visualizer.displaySystemPrompt('You are an expert software architect specializing in scalable web applications. Focus on clean code, best practices, and modern design patterns.');

        // Display configuration
        visualizer.displayConfig({
            temperature: 0.7,
            maxTokens: 4000,
            timeout: 60000
        });

        // Show orchestration
        visualizer.displayOrchestration([
            { name: 'StrategyAgent', model: 'claude-3-opus', role: 'Planning & Coordination' },
            { name: 'ResearchAgent', model: 'gpt-4', role: 'Requirements Analysis' },
            { name: 'CodeAgent', model: 'claude-3-sonnet', role: 'Implementation' },
            { name: 'ReviewAgent', model: 'gpt-4-turbo', role: 'Quality Assurance' }
        ]);

        // Simulate loading
        visualizer.startLoadingBar('Processing request', 100);

        for (let i = 0; i <= 100; i += 10) {
            await new Promise(resolve => setTimeout(resolve, 200));
            visualizer.updateLoadingBar(i);
        }

        visualizer.completeLoadingBar('Request processed successfully');

        // Show agent activities
        visualizer.displayAgentActivity('StrategyAgent', 'Analyzing task requirements...', 'active');
        await new Promise(resolve => setTimeout(resolve, 1000));
        visualizer.displayAgentActivity('StrategyAgent', 'Task planning complete', 'complete');

        // Display response
        visualizer.displayResponse('The task has been successfully orchestrated. Here is a comprehensive plan for building your web application with real-time collaboration features...');

        // Display metrics
        visualizer.displayMetrics({
            duration: '3.7 seconds',
            tokensUsed: '2,456',
            cost: '$0.12',
            agentsUsed: '4'
        });

        // Task list
        visualizer.displayTaskList([
            { name: 'Initialize project', completed: true },
            { name: 'Setup database', completed: true },
            { name: 'Implement authentication', completed: false },
            { name: 'Add real-time features', completed: false }
        ]);

        visualizer.displaySuccess('Demo completed successfully!', {
            'Total time': '5.2 seconds',
            'Agents used': '4',
            'Status': 'Ready for production'
        });
    }

    demo().catch(console.error);
}