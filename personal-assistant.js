#!/usr/bin/env node

/**
 * Personal Assistant Agent System
 *
 * A production-ready multi-agent personal assistant that leverages
 * the ISH platform for intelligent task automation and management.
 */

const { ISHOrchestrator, ISHAgent } = require('./orchestrator');
const fs = require('fs').promises;
const path = require('path');

class PersonalAssistant {
    constructor(config = {}) {
        this.name = config.name || 'ARIA'; // Adaptive Reasoning Intelligence Assistant
        this.orchestrator = new ISHOrchestrator(config.orchestratorConfig || {});
        this.userProfile = config.userProfile || {};
        this.memory = {
            shortTerm: [],
            longTerm: new Map(),
            preferences: new Map(),
            routines: new Map(),
            contacts: new Map(),
            skills: new Map()
        };
        this.integrations = new Map();
        this.activeContexts = new Set();
        this.initialized = false;
    }

    async initialize() {
        console.log(`🚀 Initializing ${this.name} Personal Assistant...`);

        // Initialize base orchestrator
        await this.orchestrator.initialize();

        // Setup specialized assistant agents
        this.setupAssistantAgents();

        // Load user preferences and memory
        await this.loadUserData();

        // Initialize integrations
        await this.setupIntegrations();

        this.initialized = true;
        console.log(`✅ ${this.name} is ready to assist!`);

        // Greet user
        await this.greetUser();
    }

    setupAssistantAgents() {
        // Executive Agent - High-level decision making
        this.orchestrator.registerAgent(new ISHAgent('ExecutiveAgent', {
            model: 'claude-3-opus',
            systemPrompt: `You are the executive decision-making component of a personal assistant.
Your responsibilities:
- Understand user intent and context
- Delegate tasks to appropriate specialized agents
- Maintain conversation continuity
- Learn from user preferences
- Prioritize tasks based on urgency and importance
- Make autonomous decisions when appropriate`,
            capabilities: ['decision-making', 'delegation', 'prioritization']
        }));

        // Schedule Agent - Calendar and time management
        this.orchestrator.registerAgent(new ISHAgent('ScheduleAgent', {
            model: 'gpt-4',
            systemPrompt: `You are a scheduling and time management specialist.
Your responsibilities:
- Manage calendar and appointments
- Optimize daily schedules
- Send reminders and notifications
- Handle meeting conflicts
- Track deadlines and important dates
- Suggest optimal times for tasks`,
            capabilities: ['scheduling', 'reminders', 'time-management']
        }));

        // Task Agent - Task and project management
        this.orchestrator.registerAgent(new ISHAgent('TaskAgent', {
            model: 'claude-3-sonnet',
            systemPrompt: `You are a task and project management specialist.
Your responsibilities:
- Break down complex projects into tasks
- Track task progress and dependencies
- Manage todo lists and priorities
- Estimate time requirements
- Identify blockers and suggest solutions
- Create actionable task plans`,
            capabilities: ['task-management', 'project-planning', 'tracking']
        }));

        // Communication Agent - Email, messages, and correspondence
        this.orchestrator.registerAgent(new ISHAgent('CommunicationAgent', {
            model: 'claude-3-opus',
            systemPrompt: `You are a communication specialist.
Your responsibilities:
- Draft emails and messages
- Summarize long conversations
- Manage communication templates
- Track important correspondence
- Suggest responses based on context
- Maintain professional and personal tone as needed`,
            capabilities: ['writing', 'summarization', 'correspondence']
        }));

        // Research Agent - Information gathering and analysis
        this.orchestrator.registerAgent(new ISHAgent('ResearchAgent', {
            model: 'gpt-4',
            systemPrompt: `You are a research and information specialist.
Your responsibilities:
- Conduct in-depth research on topics
- Fact-check information
- Provide summaries and insights
- Track information sources
- Identify trends and patterns
- Create research reports`,
            capabilities: ['research', 'analysis', 'fact-checking']
        }));

        // Learning Agent - Personal development and education
        this.orchestrator.registerAgent(new ISHAgent('LearningAgent', {
            model: 'claude-3-sonnet',
            systemPrompt: `You are a learning and development specialist.
Your responsibilities:
- Create personalized learning plans
- Track skill development
- Suggest learning resources
- Create study schedules
- Generate practice exercises
- Monitor progress and adapt strategies`,
            capabilities: ['education', 'skill-development', 'tutoring']
        }));

        // Wellness Agent - Health and wellness management
        this.orchestrator.registerAgent(new ISHAgent('WellnessAgent', {
            model: 'gpt-4',
            systemPrompt: `You are a wellness and health management specialist.
Your responsibilities:
- Track health metrics and habits
- Suggest wellness activities
- Manage medication reminders
- Create exercise and nutrition plans
- Monitor stress levels
- Encourage healthy work-life balance`,
            capabilities: ['health', 'wellness', 'habit-tracking']
        }));

        // Finance Agent - Financial management and advice
        this.orchestrator.registerAgent(new ISHAgent('FinanceAgent', {
            model: 'claude-3-sonnet',
            systemPrompt: `You are a financial management specialist.
Your responsibilities:
- Track expenses and budgets
- Analyze spending patterns
- Suggest savings opportunities
- Monitor investments
- Create financial reports
- Provide budgeting advice`,
            capabilities: ['budgeting', 'expense-tracking', 'financial-planning']
        }));

        // Creative Agent - Creative tasks and brainstorming
        this.orchestrator.registerAgent(new ISHAgent('CreativeAgent', {
            model: 'claude-3-opus',
            systemPrompt: `You are a creative specialist.
Your responsibilities:
- Brainstorm ideas and solutions
- Help with creative writing
- Generate creative content
- Suggest innovative approaches
- Help with design concepts
- Support artistic endeavors`,
            capabilities: ['creativity', 'brainstorming', 'content-creation']
        }));

        // Technical Agent - Technical support and coding
        this.orchestrator.registerAgent(new ISHAgent('TechnicalAgent', {
            model: 'claude-3-sonnet',
            systemPrompt: `You are a technical specialist.
Your responsibilities:
- Provide technical support
- Write and debug code
- Automate repetitive tasks
- Setup and configure tools
- Troubleshoot technical issues
- Create technical documentation`,
            capabilities: ['coding', 'debugging', 'automation', 'technical-support']
        }));

        // Memory Agent - Memory and context management
        this.orchestrator.registerAgent(new ISHAgent('MemoryAgent', {
            model: 'gpt-4',
            systemPrompt: `You are a memory and context management specialist.
Your responsibilities:
- Store and retrieve important information
- Maintain conversation context
- Track user preferences
- Remember important details
- Connect related information
- Learn from patterns`,
            capabilities: ['memory-management', 'context-tracking', 'pattern-recognition']
        }));

        // Social Agent - Social interactions and networking
        this.orchestrator.registerAgent(new ISHAgent('SocialAgent', {
            model: 'claude-3-opus',
            systemPrompt: `You are a social interaction specialist.
Your responsibilities:
- Manage social connections
- Track important dates (birthdays, anniversaries)
- Suggest social activities
- Help with social communication
- Maintain relationship notes
- Network management`,
            capabilities: ['social-management', 'networking', 'relationship-tracking']
        }));
    }

    async loadUserData() {
        console.log('📂 Loading user data and preferences...');

        try {
            // Load user profile
            const profilePath = 'assistant-data/user-profile.json';
            if (await this.fileExists(profilePath)) {
                const profileData = await fs.readFile(profilePath, 'utf8');
                this.userProfile = JSON.parse(profileData);
            }

            // Load memory
            const memoryPath = 'assistant-data/memory.json';
            if (await this.fileExists(memoryPath)) {
                const memoryData = await fs.readFile(memoryPath, 'utf8');
                const parsed = JSON.parse(memoryData);

                this.memory.shortTerm = parsed.shortTerm || [];
                this.memory.longTerm = new Map(parsed.longTerm || []);
                this.memory.preferences = new Map(parsed.preferences || []);
                this.memory.routines = new Map(parsed.routines || []);
            }

            console.log('✅ User data loaded successfully');
        } catch (error) {
            console.log('📝 No existing user data found, starting fresh');
        }
    }

    async setupIntegrations() {
        console.log('🔌 Setting up integrations...');

        // Calendar Integration
        this.integrations.set('calendar', {
            type: 'calendar',
            enabled: true,
            sync: async () => {
                // Implement calendar sync
                console.log('📅 Syncing calendar...');
            }
        });

        // Email Integration
        this.integrations.set('email', {
            type: 'email',
            enabled: true,
            checkEmails: async () => {
                // Implement email checking
                console.log('📧 Checking emails...');
            }
        });

        // Task Management Integration
        this.integrations.set('tasks', {
            type: 'task-management',
            enabled: true,
            syncTasks: async () => {
                // Implement task sync
                console.log('✓ Syncing tasks...');
            }
        });

        // Smart Home Integration
        this.integrations.set('smart-home', {
            type: 'iot',
            enabled: false,
            control: async (device, action) => {
                // Implement smart home control
                console.log(`🏠 Controlling ${device}: ${action}`);
            }
        });

        console.log('✅ Integrations configured');
    }

    async greetUser() {
        const hour = new Date().getHours();
        let greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

        const executiveAgent = this.orchestrator.agents.get('ExecutiveAgent');
        const greetingResponse = await executiveAgent.process(
            `Generate a warm, personalized greeting for the user. Current time: ${greeting}. User name: ${this.userProfile.name || 'there'}.`,
            { userProfile: this.userProfile }
        );

        console.log(`\n${this.name}: ${greeting}, ${this.userProfile.name || 'there'}! I'm ready to assist you today.`);

        // Check for any important items
        await this.checkDailyBriefing();
    }

    async checkDailyBriefing() {
        const scheduleAgent = this.orchestrator.agents.get('ScheduleAgent');
        const taskAgent = this.orchestrator.agents.get('TaskAgent');

        // Get today's schedule
        const schedule = await scheduleAgent.process(
            'What are the important items for today?',
            { date: new Date().toISOString() }
        );

        // Get priority tasks
        const tasks = await taskAgent.process(
            'What are the high-priority tasks?',
            { status: 'pending' }
        );

        console.log('\n📊 Daily Briefing:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📅 Today\'s Schedule: [Simulated schedule items]');
        console.log('✓ Priority Tasks: [Simulated task items]');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    async processRequest(request) {
        console.log(`\n👤 User: ${request}`);

        // Add to short-term memory
        this.memory.shortTerm.push({
            timestamp: new Date().toISOString(),
            type: 'user-request',
            content: request
        });

        // Executive agent analyzes the request
        const executiveAgent = this.orchestrator.agents.get('ExecutiveAgent');
        const analysis = await executiveAgent.process(
            `Analyze this user request and determine which agents should handle it: "${request}"`,
            {
                userProfile: this.userProfile,
                recentContext: this.memory.shortTerm.slice(-5),
                activeContexts: Array.from(this.activeContexts)
            }
        );

        // Route to appropriate agents based on request type
        const response = await this.routeRequest(request, analysis);

        // Store interaction in memory
        this.updateMemory(request, response);

        console.log(`\n${this.name}: ${response.message || response}`);

        return response;
    }

    async routeRequest(request, analysis) {
        const requestLower = request.toLowerCase();

        // Schedule-related requests
        if (requestLower.includes('schedule') || requestLower.includes('meeting') ||
            requestLower.includes('calendar') || requestLower.includes('appointment')) {
            return await this.handleScheduleRequest(request);
        }

        // Task-related requests
        if (requestLower.includes('task') || requestLower.includes('todo') ||
            requestLower.includes('project')) {
            return await this.handleTaskRequest(request);
        }

        // Email/Communication requests
        if (requestLower.includes('email') || requestLower.includes('message') ||
            requestLower.includes('draft')) {
            return await this.handleCommunicationRequest(request);
        }

        // Research requests
        if (requestLower.includes('research') || requestLower.includes('find') ||
            requestLower.includes('information about')) {
            return await this.handleResearchRequest(request);
        }

        // Learning requests
        if (requestLower.includes('learn') || requestLower.includes('study') ||
            requestLower.includes('teach')) {
            return await this.handleLearningRequest(request);
        }

        // Finance requests
        if (requestLower.includes('expense') || requestLower.includes('budget') ||
            requestLower.includes('finance') || requestLower.includes('money')) {
            return await this.handleFinanceRequest(request);
        }

        // Creative requests
        if (requestLower.includes('brainstorm') || requestLower.includes('idea') ||
            requestLower.includes('creative')) {
            return await this.handleCreativeRequest(request);
        }

        // Technical requests
        if (requestLower.includes('code') || requestLower.includes('debug') ||
            requestLower.includes('technical')) {
            return await this.handleTechnicalRequest(request);
        }

        // Default: Use executive agent for general requests
        return await this.handleGeneralRequest(request);
    }

    async handleScheduleRequest(request) {
        const scheduleAgent = this.orchestrator.agents.get('ScheduleAgent');
        const response = await scheduleAgent.process(request, {
            calendar: this.integrations.get('calendar'),
            userPreferences: this.memory.preferences
        });

        return {
            type: 'schedule',
            message: `I've handled your scheduling request. ${response.response}`,
            data: response
        };
    }

    async handleTaskRequest(request) {
        const taskAgent = this.orchestrator.agents.get('TaskAgent');
        const response = await taskAgent.process(request, {
            tasks: this.integrations.get('tasks'),
            currentTasks: []
        });

        return {
            type: 'task',
            message: `Task management update: ${response.response}`,
            data: response
        };
    }

    async handleCommunicationRequest(request) {
        const commAgent = this.orchestrator.agents.get('CommunicationAgent');
        const response = await commAgent.process(request, {
            templates: this.memory.preferences.get('email-templates') || {},
            contacts: this.memory.contacts
        });

        return {
            type: 'communication',
            message: `I've prepared your communication. ${response.response}`,
            data: response
        };
    }

    async handleResearchRequest(request) {
        const researchAgent = this.orchestrator.agents.get('ResearchAgent');
        const response = await researchAgent.process(request, {
            sources: this.memory.preferences.get('preferred-sources') || []
        });

        return {
            type: 'research',
            message: `Research findings: ${response.response}`,
            data: response
        };
    }

    async handleLearningRequest(request) {
        const learningAgent = this.orchestrator.agents.get('LearningAgent');
        const response = await learningAgent.process(request, {
            learningStyle: this.userProfile.learningStyle,
            skills: this.memory.skills
        });

        return {
            type: 'learning',
            message: `Learning assistance: ${response.response}`,
            data: response
        };
    }

    async handleFinanceRequest(request) {
        const financeAgent = this.orchestrator.agents.get('FinanceAgent');
        const response = await financeAgent.process(request, {
            budget: this.userProfile.budget || {},
            expenses: []
        });

        return {
            type: 'finance',
            message: `Financial analysis: ${response.response}`,
            data: response
        };
    }

    async handleCreativeRequest(request) {
        const creativeAgent = this.orchestrator.agents.get('CreativeAgent');
        const response = await creativeAgent.process(request, {
            style: this.userProfile.creativeStyle,
            previousWork: []
        });

        return {
            type: 'creative',
            message: `Creative output: ${response.response}`,
            data: response
        };
    }

    async handleTechnicalRequest(request) {
        const technicalAgent = this.orchestrator.agents.get('TechnicalAgent');
        const response = await technicalAgent.process(request, {
            techStack: this.userProfile.techStack || [],
            environment: process.platform
        });

        return {
            type: 'technical',
            message: `Technical assistance: ${response.response}`,
            data: response
        };
    }

    async handleGeneralRequest(request) {
        const executiveAgent = this.orchestrator.agents.get('ExecutiveAgent');
        const response = await executiveAgent.process(request, {
            context: this.memory.shortTerm.slice(-10),
            userProfile: this.userProfile
        });

        return {
            type: 'general',
            message: response.response,
            data: response
        };
    }

    updateMemory(request, response) {
        // Update short-term memory
        if (this.memory.shortTerm.length > 100) {
            // Move oldest items to long-term memory
            const toArchive = this.memory.shortTerm.splice(0, 50);
            toArchive.forEach(item => {
                const date = new Date(item.timestamp).toDateString();
                if (!this.memory.longTerm.has(date)) {
                    this.memory.longTerm.set(date, []);
                }
                this.memory.longTerm.get(date).push(item);
            });
        }

        // Learn from interaction
        this.learnFromInteraction(request, response);
    }

    learnFromInteraction(request, response) {
        // Extract patterns and preferences
        const memoryAgent = this.orchestrator.agents.get('MemoryAgent');

        memoryAgent.process(
            'Extract patterns and preferences from this interaction',
            { request, response }
        ).then(learning => {
            // Update preferences
            if (learning.preferences) {
                for (const [key, value] of Object.entries(learning.preferences)) {
                    this.memory.preferences.set(key, value);
                }
            }
        });
    }

    async saveUserData() {
        console.log('💾 Saving user data...');

        await this.ensureDirectoryExists('assistant-data');

        // Save user profile
        await fs.writeFile(
            'assistant-data/user-profile.json',
            JSON.stringify(this.userProfile, null, 2)
        );

        // Save memory
        await fs.writeFile(
            'assistant-data/memory.json',
            JSON.stringify({
                shortTerm: this.memory.shortTerm,
                longTerm: Array.from(this.memory.longTerm.entries()),
                preferences: Array.from(this.memory.preferences.entries()),
                routines: Array.from(this.memory.routines.entries())
            }, null, 2)
        );

        console.log('✅ User data saved');
    }

    async shutdown() {
        console.log(`\n👋 ${this.name} shutting down...`);

        // Save all data
        await this.saveUserData();

        // Cleanup orchestrator
        await this.orchestrator.cleanup();

        console.log('✅ Goodbye!');
    }

    async fileExists(path) {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }
}

// Interactive CLI for the assistant
async function runInteractiveAssistant() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const assistant = new PersonalAssistant({
        name: 'ARIA',
        userProfile: {
            name: 'User',
            preferences: {
                workHours: '9-5',
                timezone: 'EST',
                communicationStyle: 'professional yet friendly'
            }
        }
    });

    await assistant.initialize();

    console.log('\n💡 Tips:');
    console.log('- Try: "Schedule a meeting for tomorrow at 2pm"');
    console.log('- Try: "Help me brainstorm ideas for a startup"');
    console.log('- Try: "Create a task list for launching a product"');
    console.log('- Try: "Draft an email to my team about the project update"');
    console.log('- Try: "Research best practices for remote work"');
    console.log('- Type "exit" to quit\n');

    const askQuestion = () => {
        rl.question('You: ', async (input) => {
            if (input.toLowerCase() === 'exit') {
                await assistant.shutdown();
                rl.close();
                return;
            }

            await assistant.processRequest(input);
            askQuestion();
        });
    };

    askQuestion();
}

// Export for use as a module
module.exports = { PersonalAssistant };

// Run if executed directly
if (require.main === module) {
    runInteractiveAssistant().catch(console.error);
}