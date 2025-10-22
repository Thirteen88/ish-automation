#!/usr/bin/env node

/**
 * ISH Enhanced Orchestrator with CLI Visualization
 *
 * Features:
 * - Clear visibility of model selection
 * - Display of user prompts and system prompts
 * - Loading bars and progress indicators
 * - Real-time agent activity display
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const CLIVisualizer = require('./cli-visualizer');

class ISHEnhancedAgent {
    constructor(name, config = {}) {
        this.name = name;
        this.model = config.model || 'claude-3-opus';
        this.systemPrompt = config.systemPrompt || '';
        this.temperature = config.temperature || 0.7;
        this.maxTokens = config.maxTokens || 2000;
        this.capabilities = config.capabilities || [];
        this.history = [];
        this.visualizer = new CLIVisualizer();
    }

    async process(prompt, context = {}, showDetails = true) {
        if (showDetails) {
            // Display model and prompt information
            this.visualizer.displayModel(this.model, {
                provider: this.getProvider(this.model),
                capabilities: this.capabilities
            });

            // Display the user prompt
            this.visualizer.displayPrompt(prompt, 'USER');

            // Display system prompt if exists
            if (this.systemPrompt) {
                this.visualizer.displaySystemPrompt(this.systemPrompt);
            }

            // Display configuration
            this.visualizer.displayConfig({
                temperature: this.temperature,
                maxTokens: this.maxTokens
            });
        }

        // Start processing with loading bar
        this.visualizer.startLoadingBar(`${this.name} processing with ${this.model}`, 100);

        // Store the interaction
        this.history.push({
            timestamp: new Date().toISOString(),
            prompt: prompt,
            context: context,
            model: this.model,
            systemPrompt: this.systemPrompt
        });

        // Simulate processing with progress updates
        for (let i = 0; i <= 100; i += 20) {
            await new Promise(resolve => setTimeout(resolve, 200));
            this.visualizer.updateLoadingBar(i);
        }

        this.visualizer.completeLoadingBar(`${this.name} completed`);

        // Simulated response
        const response = {
            agent: this.name,
            model: this.model,
            response: `[Response from ${this.model}] Task processed successfully.`,
            metadata: {
                temperature: this.temperature,
                maxTokens: this.maxTokens,
                systemPrompt: this.systemPrompt
            }
        };

        // Display the response
        if (showDetails) {
            this.visualizer.displayResponse(response.response, true);
        }

        return response;
    }

    getProvider(model) {
        const providers = {
            'claude-3-opus': 'Anthropic',
            'claude-3-sonnet': 'Anthropic',
            'gpt-4': 'OpenAI',
            'gpt-4-turbo': 'OpenAI',
            'gemini-pro': 'Google',
            'llama-3-70b': 'Meta'
        };
        return providers[model] || 'Unknown';
    }
}

class ISHEnhancedOrchestrator {
    constructor(config = {}) {
        this.agents = new Map();
        this.browser = null;
        this.page = null;
        this.config = {
            headless: config.headless !== false,
            timeout: config.timeout || 60000,
            retryCount: config.retryCount || 3,
            retryDelay: config.retryDelay || 2000,
            ...config
        };
        this.conversationHistory = [];
        this.modelRegistry = this.initializeModelRegistry();
        this.visualizer = new CLIVisualizer();
    }

    initializeModelRegistry() {
        return {
            'claude-3-opus': {
                family: 'claude',
                capabilities: ['reasoning', 'coding', 'analysis', 'creative'],
                contextWindow: 200000,
                provider: 'Anthropic'
            },
            'claude-3-sonnet': {
                family: 'claude',
                capabilities: ['reasoning', 'coding', 'analysis'],
                contextWindow: 200000,
                provider: 'Anthropic'
            },
            'gpt-4': {
                family: 'gpt',
                capabilities: ['reasoning', 'coding', 'analysis', 'creative'],
                contextWindow: 128000,
                provider: 'OpenAI'
            },
            'gpt-4-turbo': {
                family: 'gpt',
                capabilities: ['reasoning', 'coding', 'analysis', 'vision'],
                contextWindow: 128000,
                provider: 'OpenAI'
            },
            'gemini-pro': {
                family: 'gemini',
                capabilities: ['reasoning', 'analysis', 'multimodal'],
                contextWindow: 32000,
                provider: 'Google'
            }
        };
    }

    async initialize() {
        this.visualizer.sectionHeader('Initializing ISH Enhanced Orchestrator', '🚀');

        this.visualizer.startSpinner('Setting up browser environment...');

        try {
            // Initialize browser
            this.browser = await chromium.launch({
                headless: this.config.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            this.page = await this.browser.newPage();
            await this.page.setViewportSize({ width: 1280, height: 800 });

            this.visualizer.stopSpinner('Browser initialized successfully');

            // Register default agents with visualization
            this.registerDefaultAgents();

            this.visualizer.displaySuccess('Orchestrator initialized successfully', {
                'Browser': 'Chromium',
                'Mode': this.config.headless ? 'Headless' : 'GUI',
                'Timeout': `${this.config.timeout}ms`,
                'Agents': this.agents.size
            });

            return true;
        } catch (error) {
            this.visualizer.stopSpinner();
            this.visualizer.displayError(error, 'Failed to initialize orchestrator');
            return false;
        }
    }

    registerDefaultAgents() {
        const agents = [
            {
                name: 'StrategyAgent',
                config: {
                    model: 'claude-3-opus',
                    systemPrompt: 'You are a strategic planning AI that breaks down complex tasks.',
                    capabilities: ['planning', 'analysis', 'coordination']
                }
            },
            {
                name: 'ResearchAgent',
                config: {
                    model: 'gpt-4',
                    systemPrompt: 'You are a research specialist that gathers and analyzes information.',
                    capabilities: ['research', 'analysis', 'summarization']
                }
            },
            {
                name: 'CodeAgent',
                config: {
                    model: 'claude-3-sonnet',
                    systemPrompt: 'You are an expert programmer that writes clean, efficient code.',
                    capabilities: ['coding', 'debugging', 'optimization']
                }
            },
            {
                name: 'ReviewAgent',
                config: {
                    model: 'gpt-4-turbo',
                    systemPrompt: 'You are a quality assurance specialist that reviews and validates work.',
                    capabilities: ['review', 'validation', 'feedback']
                }
            },
            {
                name: 'CreativeAgent',
                config: {
                    model: 'claude-3-opus',
                    systemPrompt: 'You are a creative AI that generates innovative solutions.',
                    capabilities: ['creative', 'ideation', 'storytelling']
                }
            }
        ];

        agents.forEach(({ name, config }) => {
            this.registerAgent(new ISHEnhancedAgent(name, config));
        });
    }

    registerAgent(agent) {
        this.agents.set(agent.name, agent);
        this.visualizer.displayInfo(`Registered agent: ${agent.name} (${agent.model})`);
    }

    async sendPromptToISH(prompt, config = {}) {
        const {
            model = 'claude-3-opus',
            systemPrompt = null,
            temperature = 0.7,
            maxTokens = 2000
        } = config;

        this.visualizer.sectionHeader('Sending Prompt to ISH', '📤');

        // Display model information
        const modelInfo = this.modelRegistry[model];
        this.visualizer.displayModel(model, modelInfo);

        // Display the prompt
        this.visualizer.displayPrompt(prompt);

        // Display system prompt if provided
        if (systemPrompt) {
            this.visualizer.displaySystemPrompt(systemPrompt);
        }

        // Display configuration
        this.visualizer.displayConfig({ temperature, maxTokens, timeout: this.config.timeout });

        // Start loading animation
        this.visualizer.startLoadingBar('Connecting to ISH platform', 100);

        try {
            // Simulate connection and processing
            for (let i = 0; i <= 100; i += 10) {
                await new Promise(resolve => setTimeout(resolve, 300));
                this.visualizer.updateLoadingBar(i);
            }

            this.visualizer.completeLoadingBar('Response received');

            const response = {
                model: model,
                prompt: prompt,
                systemPrompt: systemPrompt,
                response: `[ISH Response using ${model}]\n\nI've processed your request with the following configuration:\n- Model: ${model}\n- Temperature: ${temperature}\n- Max Tokens: ${maxTokens}\n\nThe task has been completed successfully.`,
                timestamp: new Date().toISOString(),
                metadata: {
                    temperature: temperature,
                    maxTokens: maxTokens
                }
            };

            // Store in history
            this.conversationHistory.push(response);

            // Display the response
            this.visualizer.displayResponse(response.response);

            // Display metrics
            this.visualizer.displayMetrics({
                duration: '2.3 seconds',
                tokensUsed: Math.floor(Math.random() * 1000 + 500).toLocaleString(),
                model: model,
                temperature: temperature
            });

            return response;
        } catch (error) {
            this.visualizer.displayError(error, 'Failed to send prompt to ISH');
            return null;
        }
    }

    async orchestrateTask(task, strategy = 'sequential') {
        this.visualizer.clear();
        this.visualizer.sectionHeader('Multi-Agent Task Orchestration', '🎭');

        this.visualizer.displayInfo(`Task: ${task}`);
        this.visualizer.displayInfo(`Strategy: ${strategy}`);

        // Display all participating agents
        const agentList = Array.from(this.agents.values()).map(agent => ({
            name: agent.name,
            model: agent.model,
            role: agent.capabilities.join(', ')
        }));

        this.visualizer.displayOrchestration(agentList);

        const results = {
            task: task,
            strategy: strategy,
            startTime: new Date().toISOString(),
            agents: {},
            summary: null
        };

        // Create task list for tracking
        const tasks = [
            { name: 'Strategy planning', completed: false },
            { name: 'Research and analysis', completed: false },
            { name: 'Implementation', completed: false },
            { name: 'Quality review', completed: false }
        ];

        this.visualizer.displayTaskList(tasks);

        try {
            // Step 1: Strategy Agent
            this.visualizer.displayAgentActivity('StrategyAgent', 'Creating execution plan...', 'active');
            const strategyAgent = this.agents.get('StrategyAgent');
            const plan = await strategyAgent.process(
                `Create an execution plan for: ${task}`,
                { task: task },
                false
            );
            results.agents['StrategyAgent'] = plan;
            tasks[0].completed = true;
            this.visualizer.displayTaskList(tasks);
            this.visualizer.displayAgentActivity('StrategyAgent', 'Planning complete', 'complete');

            // Step 2: Research Agent
            this.visualizer.displayAgentActivity('ResearchAgent', 'Gathering information...', 'active');
            const researchAgent = this.agents.get('ResearchAgent');
            const research = await researchAgent.process(
                `Research requirements for: ${task}`,
                { task: task, plan: plan },
                false
            );
            results.agents['ResearchAgent'] = research;
            tasks[1].completed = true;
            this.visualizer.displayTaskList(tasks);
            this.visualizer.displayAgentActivity('ResearchAgent', 'Research complete', 'complete');

            // Step 3: Implementation
            if (task.toLowerCase().includes('code') || task.toLowerCase().includes('implement')) {
                this.visualizer.displayAgentActivity('CodeAgent', 'Implementing solution...', 'active');
                const codeAgent = this.agents.get('CodeAgent');
                const implementation = await codeAgent.process(
                    `Implement: ${task}`,
                    { task: task, plan: plan, research: research },
                    false
                );
                results.agents['CodeAgent'] = implementation;
                this.visualizer.displayAgentActivity('CodeAgent', 'Implementation complete', 'complete');
            } else {
                this.visualizer.displayAgentActivity('CreativeAgent', 'Creating solution...', 'active');
                const creativeAgent = this.agents.get('CreativeAgent');
                const creative = await creativeAgent.process(
                    `Create: ${task}`,
                    { task: task, plan: plan, research: research },
                    false
                );
                results.agents['CreativeAgent'] = creative;
                this.visualizer.displayAgentActivity('CreativeAgent', 'Creation complete', 'complete');
            }
            tasks[2].completed = true;
            this.visualizer.displayTaskList(tasks);

            // Step 4: Review
            this.visualizer.displayAgentActivity('ReviewAgent', 'Reviewing outputs...', 'active');
            const reviewAgent = this.agents.get('ReviewAgent');
            const review = await reviewAgent.process(
                `Review the outputs for: ${task}`,
                { task: task, results: results.agents },
                false
            );
            results.agents['ReviewAgent'] = review;
            tasks[3].completed = true;
            this.visualizer.displayTaskList(tasks);
            this.visualizer.displayAgentActivity('ReviewAgent', 'Review complete', 'complete');

            results.endTime = new Date().toISOString();
            results.summary = this.generateSummary(results);

            // Display final metrics
            this.visualizer.displayMetrics({
                duration: `${((new Date(results.endTime) - new Date(results.startTime)) / 1000).toFixed(1)} seconds`,
                agentsUsed: Object.keys(results.agents).length.toString(),
                modelsUsed: results.summary.modelsUsed.join(', '),
                status: results.summary.status
            });

            this.visualizer.displaySuccess('Task orchestration completed successfully!', {
                'Total agents': results.summary.totalAgents,
                'Status': results.summary.status
            });

            return results;
        } catch (error) {
            this.visualizer.displayError(error, 'Task orchestration failed');
            throw error;
        }
    }

    generateSummary(results) {
        return {
            totalAgents: Object.keys(results.agents).length,
            modelsUsed: [...new Set(Object.values(results.agents).map(a => a.model))],
            status: 'completed',
            duration: new Date(results.endTime) - new Date(results.startTime)
        };
    }

    async cleanup() {
        this.visualizer.displayInfo('Cleaning up resources...');

        if (this.browser) {
            await this.browser.close();
            this.visualizer.displayInfo('Browser closed');
        }

        // Save conversation history
        try {
            await fs.writeFile(
                'conversation-history.json',
                JSON.stringify(this.conversationHistory, null, 2)
            );
            this.visualizer.displayInfo('Conversation history saved');
        } catch (error) {
            this.visualizer.displayWarning('Failed to save conversation history');
        }

        this.visualizer.displaySuccess('Cleanup completed');
    }
}

// Export the enhanced classes
module.exports = {
    ISHEnhancedOrchestrator,
    ISHEnhancedAgent,
    CLIVisualizer
};

// Example usage if run directly
if (require.main === module) {
    async function main() {
        const orchestrator = new ISHEnhancedOrchestrator({
            headless: true,
            timeout: 30000
        });

        try {
            // Initialize the orchestrator
            await orchestrator.initialize();

            // Send a single prompt
            console.log('\n');
            await orchestrator.sendPromptToISH(
                'Create a Python script for web scraping',
                {
                    model: 'claude-3-sonnet',
                    systemPrompt: 'You are an expert Python developer specializing in web scraping.',
                    temperature: 0.7,
                    maxTokens: 2000
                }
            );

            // Orchestrate a complex task
            console.log('\n');
            await orchestrator.orchestrateTask(
                'Build a REST API for a todo application'
            );

        } catch (error) {
            console.error('Error:', error);
        } finally {
            await orchestrator.cleanup();
        }
    }

    main().catch(console.error);
}