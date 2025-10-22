#!/data/data/com.termux/files/usr/bin/bash

# ARIA Termux Setup Script
# Run ARIA directly on your Android device using Termux

echo "═══════════════════════════════════════════════════════════"
echo "          ARIA Mobile Setup for Termux"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Update packages
echo "📦 Updating Termux packages..."
pkg update -y

# Install required packages
echo "📦 Installing Node.js and Git..."
pkg install -y nodejs git

# Create directory
echo "📁 Creating ARIA directory..."
mkdir -p ~/aria-mobile
cd ~/aria-mobile

# Download ARIA files
echo "📥 Downloading ARIA files..."
cat > package.json << 'EOF'
{
  "name": "aria-mobile",
  "version": "1.0.0",
  "description": "ARIA Personal Assistant - Mobile Version",
  "main": "aria-mobile.js",
  "scripts": {
    "start": "node aria-mobile.js"
  },
  "dependencies": {
    "readline-sync": "^1.4.10",
    "chalk": "^4.1.2"
  }
}
EOF

# Create simplified mobile version of ARIA
cat > aria-mobile.js << 'EOF'
#!/usr/bin/env node

const readlineSync = require('readline-sync');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

class ARIAMobile {
    constructor() {
        this.name = 'ARIA';
        this.dataPath = path.join(process.env.HOME, '.aria-data');
        this.memory = {
            tasks: [],
            notes: [],
            conversations: []
        };
    }

    async initialize() {
        console.clear();
        console.log(chalk.cyan.bold(`
╔═══════════════════════════════════════════╗
║            ARIA Mobile Assistant          ║
║         Your AI Assistant on Android      ║
╚═══════════════════════════════════════════╝
        `));

        // Create data directory
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }

        // Load saved data
        this.loadData();

        console.log(chalk.green('✓ ARIA Mobile is ready!\n'));
        this.showMenu();
    }

    showMenu() {
        console.log(chalk.yellow('═══════════════════════════════════════════'));
        console.log(chalk.cyan('What would you like to do?\n'));
        console.log('1. 📝 Add Task');
        console.log('2. ✅ View Tasks');
        console.log('3. 📌 Add Note');
        console.log('4. 📋 View Notes');
        console.log('5. 💬 Chat with ARIA');
        console.log('6. 📊 View Stats');
        console.log('7. 🔄 Sync with Desktop');
        console.log('8. ❌ Exit\n');

        const choice = readlineSync.question('Choose (1-8): ');
        this.handleChoice(choice);
    }

    handleChoice(choice) {
        console.clear();

        switch(choice) {
            case '1':
                this.addTask();
                break;
            case '2':
                this.viewTasks();
                break;
            case '3':
                this.addNote();
                break;
            case '4':
                this.viewNotes();
                break;
            case '5':
                this.chat();
                break;
            case '6':
                this.viewStats();
                break;
            case '7':
                this.syncWithDesktop();
                break;
            case '8':
                this.exit();
                break;
            default:
                console.log(chalk.red('Invalid choice!'));
                this.showMenu();
        }
    }

    addTask() {
        console.log(chalk.cyan.bold('📝 Add New Task\n'));

        const description = readlineSync.question('Task description: ');
        const priority = readlineSync.question('Priority (low/medium/high): ');

        const task = {
            id: Date.now(),
            description: description,
            priority: priority || 'medium',
            completed: false,
            created: new Date().toISOString()
        };

        this.memory.tasks.push(task);
        this.saveData();

        console.log(chalk.green('\n✓ Task added successfully!'));

        readlineSync.question('\nPress Enter to continue...');
        this.showMenu();
    }

    viewTasks() {
        console.log(chalk.cyan.bold('✅ Your Tasks\n'));

        if (this.memory.tasks.length === 0) {
            console.log(chalk.dim('No tasks yet. Add your first task!'));
        } else {
            const pending = this.memory.tasks.filter(t => !t.completed);
            const completed = this.memory.tasks.filter(t => t.completed);

            if (pending.length > 0) {
                console.log(chalk.yellow('Pending Tasks:'));
                pending.forEach((task, i) => {
                    const priority = task.priority === 'high' ? '🔴' :
                                   task.priority === 'medium' ? '🟡' : '🟢';
                    console.log(`  ${priority} ${i + 1}. ${task.description}`);
                });
            }

            if (completed.length > 0) {
                console.log(chalk.green('\nCompleted Tasks:'));
                completed.slice(-3).forEach(task => {
                    console.log(`  ✓ ${task.description}`);
                });
            }
        }

        const actions = ['Back to Menu'];
        if (this.memory.tasks.filter(t => !t.completed).length > 0) {
            actions.unshift('Mark Task Complete');
        }

        const actionIndex = readlineSync.keyInSelect(actions, '\nWhat would you like to do?');

        if (actionIndex === 0 && actions[0] === 'Mark Task Complete') {
            this.markTaskComplete();
        } else {
            this.showMenu();
        }
    }

    markTaskComplete() {
        const pending = this.memory.tasks.filter(t => !t.completed);
        const taskIndex = readlineSync.keyInSelect(
            pending.map(t => t.description),
            'Which task to complete?'
        );

        if (taskIndex !== -1) {
            const task = pending[taskIndex];
            const originalTask = this.memory.tasks.find(t => t.id === task.id);
            originalTask.completed = true;
            this.saveData();
            console.log(chalk.green('\n✓ Task marked as complete!'));
        }

        readlineSync.question('\nPress Enter to continue...');
        this.viewTasks();
    }

    addNote() {
        console.log(chalk.cyan.bold('📌 Add New Note\n'));

        const content = readlineSync.question('Note content: ');

        const note = {
            id: Date.now(),
            content: content,
            created: new Date().toISOString()
        };

        this.memory.notes.push(note);
        this.saveData();

        console.log(chalk.green('\n✓ Note saved successfully!'));

        readlineSync.question('\nPress Enter to continue...');
        this.showMenu();
    }

    viewNotes() {
        console.log(chalk.cyan.bold('📋 Your Notes\n'));

        if (this.memory.notes.length === 0) {
            console.log(chalk.dim('No notes yet. Add your first note!'));
        } else {
            this.memory.notes.slice(-5).forEach((note, i) => {
                const date = new Date(note.created).toLocaleDateString();
                console.log(chalk.cyan(`${date}:`));
                console.log(`  ${note.content}\n`);
            });
        }

        readlineSync.question('\nPress Enter to continue...');
        this.showMenu();
    }

    chat() {
        console.log(chalk.cyan.bold('💬 Chat with ARIA\n'));
        console.log(chalk.dim('Type "exit" to return to menu\n'));

        let chatting = true;
        while (chatting) {
            const input = readlineSync.question(chalk.bold('You: '));

            if (input.toLowerCase() === 'exit') {
                chatting = false;
            } else {
                // Simulate response
                const responses = [
                    'I understand. Let me help you with that.',
                    'That\'s a great question! Here\'s what I suggest...',
                    'I\'ve noted that for you.',
                    'Based on your preferences, I recommend...',
                    'I\'ll help you organize that.'
                ];

                const response = responses[Math.floor(Math.random() * responses.length)];
                console.log(chalk.green(`\nARIA: ${response}\n`));

                this.memory.conversations.push({
                    timestamp: new Date().toISOString(),
                    user: input,
                    aria: response
                });
            }
        }

        this.saveData();
        this.showMenu();
    }

    viewStats() {
        console.log(chalk.cyan.bold('📊 Your Statistics\n'));

        const totalTasks = this.memory.tasks.length;
        const completedTasks = this.memory.tasks.filter(t => t.completed).length;
        const pendingTasks = totalTasks - completedTasks;
        const totalNotes = this.memory.notes.length;
        const conversations = this.memory.conversations.length;

        console.log(chalk.yellow('Tasks:'));
        console.log(`  Total: ${totalTasks}`);
        console.log(`  Completed: ${completedTasks}`);
        console.log(`  Pending: ${pendingTasks}`);

        if (totalTasks > 0) {
            const completion = Math.round((completedTasks / totalTasks) * 100);
            console.log(`  Completion Rate: ${completion}%`);
        }

        console.log(chalk.yellow('\nNotes:'));
        console.log(`  Total: ${totalNotes}`);

        console.log(chalk.yellow('\nConversations:'));
        console.log(`  Total: ${conversations}`);

        readlineSync.question('\nPress Enter to continue...');
        this.showMenu();
    }

    syncWithDesktop() {
        console.log(chalk.cyan.bold('🔄 Sync with Desktop\n'));

        console.log('To sync with your desktop ARIA:');
        console.log('\n1. On Desktop: Start ARIA Web Server');
        console.log('   Run: node aria-mobile-server.js');
        console.log('\n2. Note the IP address shown');
        console.log('\n3. Open browser on this device');
        console.log('   Go to: http://[desktop-ip]:3001');
        console.log('\n4. Your data will sync automatically');

        readlineSync.question('\nPress Enter to continue...');
        this.showMenu();
    }

    loadData() {
        const dataFile = path.join(this.dataPath, 'aria-mobile.json');
        try {
            if (fs.existsSync(dataFile)) {
                const data = fs.readFileSync(dataFile, 'utf8');
                this.memory = JSON.parse(data);
            }
        } catch (error) {
            console.log(chalk.dim('Starting with fresh data'));
        }
    }

    saveData() {
        const dataFile = path.join(this.dataPath, 'aria-mobile.json');
        try {
            fs.writeFileSync(dataFile, JSON.stringify(this.memory, null, 2));
        } catch (error) {
            console.error(chalk.red('Error saving data:', error.message));
        }
    }

    exit() {
        this.saveData();
        console.log(chalk.green('\n✓ Data saved'));
        console.log(chalk.cyan('Goodbye! 👋\n'));
        process.exit(0);
    }
}

// Start ARIA Mobile
const aria = new ARIAMobile();
aria.initialize();
EOF

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create start script
cat > start-aria.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
cd ~/aria-mobile
node aria-mobile.js
EOF

chmod +x start-aria.sh

# Create desktop sync script
cat > sync-desktop.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
echo "Enter your desktop IP address (e.g., 192.168.1.100):"
read DESKTOP_IP
echo "Opening ARIA Web Interface..."
termux-open-url "http://$DESKTOP_IP:3001"
EOF

chmod +x sync-desktop.sh

echo ""
echo "✅ ARIA Mobile Setup Complete!"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "                    How to Use ARIA Mobile"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "1. Start ARIA:"
echo "   ./start-aria.sh"
echo ""
echo "2. Sync with Desktop:"
echo "   ./sync-desktop.sh"
echo ""
echo "3. Create Shortcut:"
echo "   - Long press Termux icon"
echo "   - Select 'Widgets'"
echo "   - Add Termux:Widget"
echo "   - Create shortcut for start-aria.sh"
echo ""
echo "Enjoy ARIA on your Pixel 9 Pro XL! 🚀"