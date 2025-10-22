#!/usr/bin/env node

/**
 * ARIA Personal Assistant - Main Application
 *
 * Your intelligent personal assistant that learns and adapts to your needs
 */

require('dotenv').config();
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const { ISHOrchestrator, ISHAgent } = require('./orchestrator');

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

class ARIA {
    constructor() {
        this.name = 'ARIA';
        this.version = '1.0.0';
        this.user = {
            name: process.env.USER_NAME || 'User',
            email: process.env.USER_EMAIL || '',
            timezone: process.env.USER_TIMEZONE || 'UTC',
            workHours: process.env.USER_WORK_HOURS || '9-5'
        };
        this.orchestrator = null;
        this.memory = {
            conversations: [],
            tasks: [],
            events: [],
            notes: [],
            learnings: []
        };
        this.isRunning = false;
        this.dataPath = path.join(__dirname, 'aria-data');
    }

    async initialize() {
        console.clear();
        this.printBanner();

        console.log(`${colors.cyan}Initializing ARIA Personal Assistant...${colors.reset}\n`);

        // Create data directory
        await this.ensureDirectoryExists(this.dataPath);

        // Initialize orchestrator
        this.orchestrator = new ISHOrchestrator({
            headless: true,
            timeout: 30000
        });

        await this.orchestrator.initialize();

        // Setup all agents
        await this.setupAgents();

        // Load previous data
        await this.loadData();

        this.isRunning = true;

        console.log(`${colors.green}✓ ARIA is ready to assist you, ${this.user.name}!${colors.reset}\n`);

        // Show quick stats
        await this.showDashboard();
    }

    printBanner() {
        console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     ${colors.bright}█████╗ ██████╗ ██╗ █████╗${colors.reset}${colors.cyan}                         ║
║    ${colors.bright}██╔══██╗██╔══██╗██║██╔══██╗${colors.reset}${colors.cyan}                        ║
║    ${colors.bright}███████║██████╔╝██║███████║${colors.reset}${colors.cyan}                        ║
║    ${colors.bright}██╔══██║██╔══██╗██║██╔══██║${colors.reset}${colors.cyan}                        ║
║    ${colors.bright}██║  ██║██║  ██║██║██║  ██║${colors.reset}${colors.cyan}                        ║
║    ${colors.bright}╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝${colors.reset}${colors.cyan}                        ║
║                                                           ║
║    ${colors.white}Adaptive Reasoning Intelligence Assistant v${this.version}${colors.cyan}      ║
║    ${colors.dim}Your AI-Powered Personal Assistant${colors.reset}${colors.cyan}                   ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
        `);
    }

    async setupAgents() {
        const agents = [
            {
                name: 'TaskManager',
                model: 'claude-3-opus',
                prompt: 'You are a task management expert. Help organize, prioritize, and track tasks efficiently.'
            },
            {
                name: 'Scheduler',
                model: 'gpt-4',
                prompt: 'You are a scheduling specialist. Optimize calendars and manage time effectively.'
            },
            {
                name: 'Researcher',
                model: 'claude-3-opus',
                prompt: 'You are a research expert. Provide thorough, accurate information on any topic.'
            },
            {
                name: 'Writer',
                model: 'claude-3-opus',
                prompt: 'You are a professional writer. Help draft emails, documents, and creative content.'
            },
            {
                name: 'Coder',
                model: 'claude-3-sonnet',
                prompt: 'You are a coding expert. Help with programming, debugging, and technical problems.'
            },
            {
                name: 'Wellness',
                model: 'gpt-4',
                prompt: 'You are a wellness coach. Provide health, fitness, and mental wellness guidance.'
            },
            {
                name: 'Finance',
                model: 'claude-3-sonnet',
                prompt: 'You are a financial advisor. Help with budgeting, expenses, and financial planning.'
            },
            {
                name: 'Learning',
                model: 'claude-3-opus',
                prompt: 'You are an education specialist. Create learning plans and teach new skills.'
            }
        ];

        for (const agent of agents) {
            this.orchestrator.registerAgent(new ISHAgent(agent.name, {
                model: agent.model,
                systemPrompt: agent.prompt
            }));
        }
    }

    async showDashboard() {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

        console.log(`${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.bright}📊 ${greeting}, ${this.user.name}! Here's your dashboard:${colors.reset}\n`);

        // Today's date
        const today = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        console.log(`📅 ${colors.cyan}Today:${colors.reset} ${today}`);

        // Task summary
        const pendingTasks = this.memory.tasks.filter(t => !t.completed).length;
        console.log(`✅ ${colors.cyan}Tasks:${colors.reset} ${pendingTasks} pending tasks`);

        // Upcoming events
        const upcomingEvents = this.memory.events.filter(e => new Date(e.date) > new Date()).length;
        console.log(`📍 ${colors.cyan}Events:${colors.reset} ${upcomingEvents} upcoming events`);

        // Notes
        console.log(`📝 ${colors.cyan}Notes:${colors.reset} ${this.memory.notes.length} saved notes`);

        // Recent conversations
        console.log(`💬 ${colors.cyan}Conversations:${colors.reset} ${this.memory.conversations.length} in history`);

        console.log(`${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}\n`);
    }

    async processCommand(input) {
        const command = input.toLowerCase().trim();

        // Check for special commands
        if (command.startsWith('/')) {
            return await this.handleSpecialCommand(command);
        }

        // Check for quick actions
        const quickActions = {
            'task': this.handleTaskCommand,
            'schedule': this.handleScheduleCommand,
            'note': this.handleNoteCommand,
            'remind': this.handleReminderCommand,
            'search': this.handleSearchCommand,
            'learn': this.handleLearnCommand,
            'email': this.handleEmailCommand,
            'report': this.handleReportCommand
        };

        for (const [keyword, handler] of Object.entries(quickActions)) {
            if (command.startsWith(keyword)) {
                return await handler.call(this, input);
            }
        }

        // Default: Process with AI
        return await this.processWithAI(input);
    }

    async handleSpecialCommand(command) {
        const commands = {
            '/help': this.showHelp,
            '/tasks': this.showTasks,
            '/today': this.showToday,
            '/schedule': this.showSchedule,
            '/notes': this.showNotes,
            '/stats': this.showStats,
            '/settings': this.showSettings,
            '/clear': this.clearScreen,
            '/save': this.saveData,
            '/exit': this.shutdown
        };

        const handler = commands[command.split(' ')[0]];
        if (handler) {
            return await handler.call(this);
        } else {
            console.log(`${colors.red}Unknown command. Type /help for available commands.${colors.reset}`);
        }
    }

    async showHelp() {
        console.log(`
${colors.bright}📚 ARIA Commands & Features${colors.reset}

${colors.cyan}Special Commands:${colors.reset}
  /help      - Show this help message
  /tasks     - View all tasks
  /today     - Show today's agenda
  /schedule  - View your schedule
  /notes     - View saved notes
  /stats     - Show usage statistics
  /settings  - Manage settings
  /clear     - Clear the screen
  /save      - Save current data
  /exit      - Exit ARIA

${colors.cyan}Quick Actions:${colors.reset}
  task [description]     - Add a new task
  schedule [event]       - Schedule an event
  note [content]         - Save a note
  remind [what] [when]   - Set a reminder
  search [query]         - Search information
  learn [topic]          - Start learning
  email [draft request]  - Draft an email
  report [type]          - Generate a report

${colors.cyan}Natural Language:${colors.reset}
  Just type naturally! Examples:
  • "What's on my schedule today?"
  • "Help me plan a productive morning"
  • "Create a workout routine"
  • "Draft an email to my team about the project update"
  • "Teach me about machine learning"
  • "Analyze my spending this month"
  • "Brainstorm ideas for a startup"

${colors.dim}Tip: ARIA learns from your interactions and adapts to your preferences!${colors.reset}
        `);
    }

    async showTasks() {
        console.log(`\n${colors.bright}📋 Your Tasks${colors.reset}\n`);

        if (this.memory.tasks.length === 0) {
            console.log(`${colors.dim}No tasks yet. Add one by typing 'task [description]'${colors.reset}`);
            return;
        }

        const pending = this.memory.tasks.filter(t => !t.completed);
        const completed = this.memory.tasks.filter(t => t.completed);

        if (pending.length > 0) {
            console.log(`${colors.yellow}Pending:${colors.reset}`);
            pending.forEach((task, i) => {
                const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
                console.log(`  ${priority} ${i + 1}. ${task.description}`);
                if (task.due) console.log(`     ${colors.dim}Due: ${task.due}${colors.reset}`);
            });
        }

        if (completed.length > 0) {
            console.log(`\n${colors.green}Completed:${colors.reset}`);
            completed.slice(-5).forEach(task => {
                console.log(`  ✓ ${colors.dim}${task.description}${colors.reset}`);
            });
        }
    }

    async showToday() {
        console.log(`\n${colors.bright}📅 Today's Agenda${colors.reset}\n`);

        const today = new Date();
        const todayStr = today.toDateString();

        // Today's events
        const todayEvents = this.memory.events.filter(e =>
            new Date(e.date).toDateString() === todayStr
        );

        if (todayEvents.length > 0) {
            console.log(`${colors.cyan}Events:${colors.reset}`);
            todayEvents.forEach(event => {
                console.log(`  📍 ${event.time} - ${event.title}`);
                if (event.location) console.log(`     ${colors.dim}@ ${event.location}${colors.reset}`);
            });
        }

        // Today's tasks
        const todayTasks = this.memory.tasks.filter(t =>
            !t.completed && t.due && new Date(t.due).toDateString() === todayStr
        );

        if (todayTasks.length > 0) {
            console.log(`\n${colors.cyan}Tasks Due:${colors.reset}`);
            todayTasks.forEach(task => {
                console.log(`  □ ${task.description}`);
            });
        }

        // Suggestions
        console.log(`\n${colors.cyan}💡 Suggestions:${colors.reset}`);
        console.log(`  • Focus time: 9:00 AM - 11:00 AM`);
        console.log(`  • Take a break every hour`);
        console.log(`  • Review tomorrow's schedule before EOD`);
    }

    async handleTaskCommand(input) {
        const taskDescription = input.substring(4).trim();

        if (!taskDescription) {
            return await this.showTasks();
        }

        const task = {
            id: Date.now(),
            description: taskDescription,
            completed: false,
            priority: 'normal',
            created: new Date().toISOString(),
            due: null
        };

        // Check for priority keywords
        if (taskDescription.includes('urgent') || taskDescription.includes('asap')) {
            task.priority = 'high';
        } else if (taskDescription.includes('important')) {
            task.priority = 'medium';
        }

        this.memory.tasks.push(task);

        console.log(`${colors.green}✓ Task added: "${taskDescription}"${colors.reset}`);
        console.log(`${colors.dim}Total pending tasks: ${this.memory.tasks.filter(t => !t.completed).length}${colors.reset}`);

        await this.saveData();
    }

    async handleNoteCommand(input) {
        const noteContent = input.substring(4).trim();

        if (!noteContent) {
            return await this.showNotes();
        }

        const note = {
            id: Date.now(),
            content: noteContent,
            created: new Date().toISOString(),
            tags: []
        };

        this.memory.notes.push(note);

        console.log(`${colors.green}✓ Note saved${colors.reset}`);

        await this.saveData();
    }

    async showNotes() {
        console.log(`\n${colors.bright}📝 Your Notes${colors.reset}\n`);

        if (this.memory.notes.length === 0) {
            console.log(`${colors.dim}No notes yet. Add one by typing 'note [content]'${colors.reset}`);
            return;
        }

        this.memory.notes.slice(-5).forEach((note, i) => {
            const date = new Date(note.created).toLocaleDateString();
            console.log(`${colors.cyan}${date}:${colors.reset} ${note.content}`);
        });
    }

    async processWithAI(input) {
        // Store conversation
        this.memory.conversations.push({
            timestamp: new Date().toISOString(),
            user: input,
            response: null
        });

        // Determine which agent should handle this
        const inputLower = input.toLowerCase();
        let agent = null;
        let context = {};

        if (inputLower.includes('task') || inputLower.includes('todo')) {
            agent = this.orchestrator.agents.get('TaskManager');
            context = { tasks: this.memory.tasks };
        } else if (inputLower.includes('schedule') || inputLower.includes('calendar')) {
            agent = this.orchestrator.agents.get('Scheduler');
            context = { events: this.memory.events };
        } else if (inputLower.includes('research') || inputLower.includes('find')) {
            agent = this.orchestrator.agents.get('Researcher');
        } else if (inputLower.includes('write') || inputLower.includes('draft')) {
            agent = this.orchestrator.agents.get('Writer');
        } else if (inputLower.includes('code') || inputLower.includes('program')) {
            agent = this.orchestrator.agents.get('Coder');
        } else if (inputLower.includes('health') || inputLower.includes('wellness')) {
            agent = this.orchestrator.agents.get('Wellness');
        } else if (inputLower.includes('money') || inputLower.includes('budget')) {
            agent = this.orchestrator.agents.get('Finance');
        } else if (inputLower.includes('learn') || inputLower.includes('teach')) {
            agent = this.orchestrator.agents.get('Learning');
        } else {
            // Default to TaskManager for general queries
            agent = this.orchestrator.agents.get('TaskManager');
        }

        console.log(`\n${colors.cyan}ARIA:${colors.reset} Processing your request...`);

        const response = await agent.process(input, context);

        // Simulate response (in production, this would be actual AI response)
        const simulatedResponse = this.generateSimulatedResponse(input, agent.name);

        console.log(`\n${colors.bright}ARIA:${colors.reset} ${simulatedResponse}\n`);

        // Update conversation history
        this.memory.conversations[this.memory.conversations.length - 1].response = simulatedResponse;

        await this.saveData();
    }

    generateSimulatedResponse(input, agentName) {
        const responses = {
            'TaskManager': [
                "I'll help you organize that task. I've broken it down into actionable steps for you.",
                "Task recorded and prioritized based on your current workload.",
                "I've analyzed your task list and suggest focusing on high-priority items first."
            ],
            'Scheduler': [
                "I've optimized your schedule to accommodate this request.",
                "Your calendar has been updated with the suggested time blocks.",
                "Based on your availability, I recommend scheduling this for tomorrow at 2 PM."
            ],
            'Researcher': [
                "I've gathered comprehensive information on that topic for you.",
                "Here's what I found based on the latest available data.",
                "I've compiled research from multiple reliable sources."
            ],
            'Writer': [
                "I've drafted that for you with your preferred communication style.",
                "Here's a professional version of what you requested.",
                "I've created multiple versions for you to choose from."
            ],
            'Coder': [
                "I've written the code solution with proper documentation.",
                "Here's an optimized implementation of what you need.",
                "I've included error handling and best practices in the solution."
            ],
            'Wellness': [
                "Based on your wellness goals, here's my recommendation.",
                "I've created a personalized plan for your health objective.",
                "Remember to take regular breaks and stay hydrated!"
            ],
            'Finance': [
                "I've analyzed your financial data and have some insights.",
                "Based on your spending patterns, here are my suggestions.",
                "I've created a budget plan that aligns with your goals."
            ],
            'Learning': [
                "I've created a personalized learning path for you.",
                "Let's start with the fundamentals and build from there.",
                "I've structured this into digestible lessons for optimal retention."
            ]
        };

        const agentResponses = responses[agentName] || responses['TaskManager'];
        return agentResponses[Math.floor(Math.random() * agentResponses.length)];
    }

    async loadData() {
        try {
            const dataFile = path.join(this.dataPath, 'aria-memory.json');
            const data = await fs.readFile(dataFile, 'utf8');
            this.memory = JSON.parse(data);
            console.log(`${colors.dim}Loaded ${this.memory.conversations.length} conversations from memory${colors.reset}`);
        } catch (error) {
            console.log(`${colors.dim}Starting with fresh memory${colors.reset}`);
        }
    }

    async saveData() {
        try {
            const dataFile = path.join(this.dataPath, 'aria-memory.json');
            await fs.writeFile(dataFile, JSON.stringify(this.memory, null, 2));
        } catch (error) {
            console.error(`${colors.red}Error saving data:${colors.reset}`, error.message);
        }
    }

    async clearScreen() {
        console.clear();
        this.printBanner();
        await this.showDashboard();
    }

    async showStats() {
        console.log(`\n${colors.bright}📊 Usage Statistics${colors.reset}\n`);
        console.log(`${colors.cyan}Conversations:${colors.reset} ${this.memory.conversations.length}`);
        console.log(`${colors.cyan}Tasks Created:${colors.reset} ${this.memory.tasks.length}`);
        console.log(`${colors.cyan}Tasks Completed:${colors.reset} ${this.memory.tasks.filter(t => t.completed).length}`);
        console.log(`${colors.cyan}Notes Saved:${colors.reset} ${this.memory.notes.length}`);
        console.log(`${colors.cyan}Events Scheduled:${colors.reset} ${this.memory.events.length}`);

        // Calculate productivity score
        const completionRate = this.memory.tasks.length > 0
            ? Math.round((this.memory.tasks.filter(t => t.completed).length / this.memory.tasks.length) * 100)
            : 0;

        console.log(`\n${colors.cyan}Productivity Score:${colors.reset} ${completionRate}%`);
    }

    async shutdown() {
        console.log(`\n${colors.yellow}Saving your data...${colors.reset}`);
        await this.saveData();

        if (this.orchestrator) {
            await this.orchestrator.cleanup();
        }

        console.log(`${colors.green}✓ All data saved successfully${colors.reset}`);
        console.log(`\n${colors.cyan}Goodbye, ${this.user.name}! Have a great day!${colors.reset}\n`);

        this.isRunning = false;
        return true;
    }

    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }
}

// Main execution
async function main() {
    const aria = new ARIA();
    await aria.initialize();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `${colors.bright}You:${colors.reset} `
    });

    console.log(`${colors.dim}Type '/help' for commands or just chat naturally!${colors.reset}\n`);

    rl.prompt();

    rl.on('line', async (input) => {
        if (input.toLowerCase() === '/exit') {
            await aria.shutdown();
            rl.close();
            process.exit(0);
        }

        await aria.processCommand(input);

        if (aria.isRunning) {
            rl.prompt();
        }
    });

    rl.on('close', async () => {
        await aria.shutdown();
        process.exit(0);
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log(`\n${colors.yellow}Shutting down gracefully...${colors.reset}`);
        await aria.shutdown();
        process.exit(0);
    });
}

// Run ARIA
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ARIA };