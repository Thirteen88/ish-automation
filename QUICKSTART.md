# 🚀 ARIA Quick Start Guide

## Starting ARIA - Your Personal AI Assistant

### Method 1: Quick Start (Recommended)
```bash
cd ~/ish-automation
./start-aria.sh
```

### Method 2: Direct Node
```bash
cd ~/ish-automation
node aria.js
```

### Method 3: Create Desktop Shortcut (Linux)
```bash
# Create a desktop launcher
cat > ~/Desktop/ARIA.desktop << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=ARIA Assistant
Comment=Your Personal AI Assistant
Exec=gnome-terminal -- bash -c "cd $HOME/ish-automation && node aria.js; bash"
Icon=assistant
Terminal=true
Categories=Utility;
EOF

chmod +x ~/Desktop/ARIA.desktop
```

## 🎯 First Time Setup

1. **Edit your profile** (optional):
   ```bash
   nano ~/ish-automation/.env
   ```
   Update your name, email, and preferences.

2. **Start ARIA**:
   ```bash
   cd ~/ish-automation
   ./start-aria.sh
   ```

3. **Try these commands**:
   - `/help` - See all available commands
   - `/today` - View today's agenda
   - `task Buy groceries` - Add a task
   - `note Meeting ideas: AI automation` - Save a note
   - `Help me plan my day` - Natural language request
   - `Create a workout routine` - Get personalized advice
   - `Draft an email to my team` - Writing assistance

## 📱 Features at a Glance

### Task Management
- `task [description]` - Add a task
- `/tasks` - View all tasks
- Mark tasks complete/incomplete
- Priority levels (high/medium/low)

### Scheduling
- `schedule [event]` - Add to calendar
- `/schedule` - View your schedule
- `/today` - Today's agenda
- Time blocking suggestions

### Notes & Ideas
- `note [content]` - Save a note
- `/notes` - View saved notes
- Search through notes
- Tag and organize

### AI Assistance
- Research any topic
- Draft emails and documents
- Code generation and debugging
- Learning plans and tutorials
- Health and wellness advice
- Financial planning
- Creative brainstorming

### Natural Language
Just chat naturally! ARIA understands:
- "What should I focus on today?"
- "Help me write a project proposal"
- "Teach me about machine learning"
- "Create a meal plan for the week"
- "How can I be more productive?"

## 🔧 Customization

### Configure Preferences
Edit `.env` file to customize:
- Work hours
- Learning style
- Communication preferences
- Focus time blocks
- Wellness goals

### Add Integrations
ARIA supports:
- Google Calendar
- Gmail
- Todoist
- Notion
- And more...

## 💡 Pro Tips

1. **Morning Routine**: Start your day with `/today` to see your agenda
2. **Focus Time**: Let ARIA protect your deep work blocks
3. **Learning Mode**: Use `learn [topic]` for structured learning
4. **Voice Notes**: Quickly capture thoughts with `note`
5. **Weekly Review**: Use `/stats` to track your productivity

## 🆘 Troubleshooting

### Issue: ARIA won't start
```bash
# Reinstall dependencies
cd ~/ish-automation
npm install
```

### Issue: Lost data
```bash
# Your data is saved in
~/ish-automation/aria-data/aria-memory.json
```

### Issue: Slow responses
- Check internet connection
- Restart ARIA
- Clear cache with `/clear`

## 🎯 Daily Workflow Example

```
Morning (9 AM):
You: /today
ARIA: Shows agenda, suggests focus blocks

You: task Review project proposal - high priority
ARIA: ✓ High priority task added

You: Help me create a productive morning routine
ARIA: [Creates personalized routine based on your goals]

Afternoon (2 PM):
You: I need to write an email about the project delay
ARIA: [Drafts professional email with your style]

Evening (5 PM):
You: /stats
ARIA: Shows daily accomplishments and insights
```

## 🚀 Advanced Features

### Custom Commands
Create your own shortcuts by editing the command handlers in `aria.js`

### API Integration
Connect ARIA to your tools via the API interface

### Team Collaboration
Share tasks and notes with team members

### Automation
Set up recurring tasks and automated workflows

## 📞 Getting Help

- Type `/help` in ARIA for command reference
- Check `ASSISTANT-ARCHITECTURE.md` for technical details
- Review logs in `aria-data/` for debugging

## 🎉 Welcome to Your New AI-Powered Life!

ARIA learns and adapts to your preferences over time. The more you use it, the better it becomes at anticipating your needs and helping you achieve your goals.

Start now: `./start-aria.sh`

---

*ARIA - Adaptive Reasoning Intelligence Assistant*
*Your personal AI that grows with you*