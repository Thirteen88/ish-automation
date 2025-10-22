#!/usr/bin/env node

/**
 * ISH Automation System - Quick Start Example
 *
 * This example demonstrates how to use the ISH automation system
 * to interact with the Infinite Story Hackathon platform.
 */

const { chromium } = require('playwright');

class ISHAutomation {
    constructor() {
        this.browser = null;
        this.page = null;
        this.currentModel = 'claude-3-opus';
        this.conversationHistory = [];
    }

    async initialize() {
        console.log('🚀 Initializing ISH Automation System...');

        // Launch browser in headless mode
        this.browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        this.page = await this.browser.newPage();

        // Set viewport and user agent
        await this.page.setViewportSize({ width: 1920, height: 1080 });
        await this.page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });

        console.log('✅ Browser initialized successfully');
    }

    async navigateToISH() {
        console.log('🌐 Navigating to ISH platform...');

        try {
            await this.page.goto('https://ish.junioralive.in/', {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // Wait for the main interface to load
            await this.page.waitForSelector('body', { timeout: 10000 });

            console.log('✅ Successfully connected to ISH platform');

            // Take a screenshot for debugging
            await this.page.screenshot({
                path: 'ish-automation/screenshots/initial-load.png',
                fullPage: true
            });

            return true;
        } catch (error) {
            console.error('❌ Failed to navigate to ISH:', error.message);
            return false;
        }
    }

    async selectModel(modelName) {
        console.log(`🤖 Selecting model: ${modelName}`);

        try {
            // Look for model selector on the page
            // This would need to be adapted based on actual ISH UI
            const modelSelector = await this.page.$('[data-model-selector]');
            if (modelSelector) {
                await modelSelector.click();
                await this.page.click(`[data-model="${modelName}"]`);
                this.currentModel = modelName;
                console.log(`✅ Model switched to: ${modelName}`);
            }
        } catch (error) {
            console.error('❌ Failed to select model:', error.message);
        }
    }

    async sendPrompt(prompt, systemPrompt = null) {
        console.log('📝 Sending prompt to ISH...');

        try {
            // Set system prompt if provided
            if (systemPrompt) {
                const systemPromptField = await this.page.$('[data-system-prompt]');
                if (systemPromptField) {
                    await systemPromptField.fill(systemPrompt);
                }
            }

            // Find and fill the main prompt input
            // This selector would need to be updated based on actual ISH UI
            const promptInput = await this.page.$('textarea[placeholder*="Enter"], input[type="text"]');

            if (promptInput) {
                await promptInput.fill(prompt);

                // Submit the prompt (adapt based on actual UI)
                await this.page.keyboard.press('Enter');

                // Or click submit button
                const submitButton = await this.page.$('button[type="submit"], button:has-text("Send")');
                if (submitButton) {
                    await submitButton.click();
                }

                // Wait for response
                await this.page.waitForTimeout(2000);

                // Get the response (adapt selector based on actual UI)
                const response = await this.page.$eval('.response, .output, [data-response]',
                    el => el.textContent);

                // Store in history
                this.conversationHistory.push({
                    timestamp: new Date().toISOString(),
                    model: this.currentModel,
                    prompt: prompt,
                    systemPrompt: systemPrompt,
                    response: response
                });

                console.log('✅ Response received');
                return response;
            }

            throw new Error('Could not find prompt input field');

        } catch (error) {
            console.error('❌ Failed to send prompt:', error.message);
            return null;
        }
    }

    async extractAvailableModels() {
        console.log('🔍 Extracting available models...');

        try {
            // This would need to be adapted based on actual ISH UI
            const models = await this.page.$$eval('[data-model-option], .model-option',
                elements => elements.map(el => el.textContent));

            console.log(`✅ Found ${models.length} available models:`, models);
            return models;
        } catch (error) {
            console.error('❌ Failed to extract models:', error.message);
            return [];
        }
    }

    async runAgent(agentConfig) {
        console.log(`🤖 Running agent: ${agentConfig.name}`);

        // Select appropriate model for the agent
        if (agentConfig.preferredModel) {
            await this.selectModel(agentConfig.preferredModel);
        }

        // Send prompt with agent's system prompt
        const response = await this.sendPrompt(
            agentConfig.prompt,
            agentConfig.systemPrompt
        );

        // Process response based on agent type
        if (agentConfig.processResponse) {
            return agentConfig.processResponse(response);
        }

        return response;
    }

    async orchestrateAgents(task) {
        console.log('🎭 Orchestrating multiple agents for task...');

        const agents = [
            {
                name: 'Strategy Agent',
                preferredModel: 'claude-3-opus',
                systemPrompt: 'You are a strategic planning agent. Break down complex tasks into actionable steps.',
                prompt: `Plan the following task: ${task}`
            },
            {
                name: 'Research Agent',
                preferredModel: 'gpt-4',
                systemPrompt: 'You are a research agent. Gather relevant information and context.',
                prompt: `Research requirements for: ${task}`
            },
            {
                name: 'Implementation Agent',
                preferredModel: 'claude-3-sonnet',
                systemPrompt: 'You are an implementation agent. Execute tasks based on plans.',
                prompt: `Implement the following: ${task}`
            },
            {
                name: 'Review Agent',
                preferredModel: 'gpt-4-turbo',
                systemPrompt: 'You are a review agent. Analyze and validate outputs.',
                prompt: `Review the implementation of: ${task}`
            }
        ];

        const results = {};

        for (const agent of agents) {
            const result = await this.runAgent(agent);
            results[agent.name] = result;

            // Add delay between agents
            await this.page.waitForTimeout(1000);
        }

        console.log('✅ Agent orchestration complete');
        return results;
    }

    async cleanup() {
        console.log('🧹 Cleaning up...');

        if (this.browser) {
            await this.browser.close();
        }

        // Save conversation history
        const fs = require('fs');
        fs.writeFileSync(
            'ish-automation/conversation-history.json',
            JSON.stringify(this.conversationHistory, null, 2)
        );

        console.log('✅ Cleanup complete');
    }
}

// Main execution
async function main() {
    const automation = new ISHAutomation();

    try {
        // Initialize the system
        await automation.initialize();

        // Connect to ISH platform
        const connected = await automation.navigateToISH();

        if (!connected) {
            throw new Error('Failed to connect to ISH platform');
        }

        // Extract available models
        const models = await automation.extractAvailableModels();

        // Example 1: Simple prompt
        console.log('\n📌 Example 1: Simple Prompt');
        const response1 = await automation.sendPrompt(
            'Write a short story about a robot learning to paint'
        );
        console.log('Response:', response1);

        // Example 2: With system prompt
        console.log('\n📌 Example 2: With System Prompt');
        const response2 = await automation.sendPrompt(
            'Explain quantum computing',
            'You are a physics professor. Explain concepts in simple terms.'
        );
        console.log('Response:', response2);

        // Example 3: Multi-agent orchestration
        console.log('\n📌 Example 3: Multi-Agent Orchestration');
        const orchestrationResults = await automation.orchestrateAgents(
            'Create a web application for task management'
        );
        console.log('Orchestration Results:', orchestrationResults);

    } catch (error) {
        console.error('❌ Error during execution:', error);
    } finally {
        await automation.cleanup();
    }
}

// Run the example
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ISHAutomation };