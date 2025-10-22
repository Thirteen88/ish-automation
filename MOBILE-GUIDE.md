# 📱 ARIA on Google Pixel 9 Pro XL - Complete Guide

## 🚀 Quick Access Right Now!

### **Option 1: Web Interface (Easiest - Working NOW!)**

Your ARIA web server is **currently running** and accessible at:

**📍 http://192.168.0.159:3002**

**On your Pixel 9 Pro XL:**
1. Open Chrome
2. Go to: **http://192.168.0.159:3002**
3. Tap "Start Conversation"
4. You're connected to ARIA!

**Make it an App:**
1. In Chrome, tap the 3 dots menu
2. Select "Add to Home screen"
3. Name it "ARIA"
4. Now you have an app icon!

---

## 🎯 All Access Methods for Your Pixel

### **Method 1: Progressive Web App (PWA) - RECOMMENDED**
✅ Currently running at http://192.168.0.159:3002

**Features:**
- Works like a native app
- Voice input via Gboard
- Offline capability
- Real-time sync with desktop
- Beautiful mobile UI
- No installation required

**To Start the Server Anytime:**
```bash
cd ~/ish-automation
PORT=3002 node aria-mobile-server.js
```

### **Method 2: Termux Native App**

Install ARIA directly on your phone:

**Step 1: Install Termux**
1. Download from F-Droid (not Play Store)
2. Open Termux

**Step 2: Setup ARIA**
```bash
# In Termux, run:
curl -o setup.sh https://raw.githubusercontent.com/your-repo/aria-setup.sh
bash setup.sh
```

**Step 3: Run ARIA**
```bash
./start-aria.sh
```

**Features:**
- Runs completely on your phone
- No internet required
- Terminal-based interface
- Full task management
- Syncs with desktop

### **Method 3: SSH Access**

Control desktop ARIA from your phone:

**Apps to Use:**
- JuiceSSH (Android)
- Termux (with SSH)

**Connect:**
```bash
ssh gary@192.168.0.159
cd ~/ish-automation
./start-aria.sh
```

### **Method 4: Voice Assistant Integration**

**Using Tasker + AutoVoice:**
1. Install Tasker and AutoVoice
2. Create profile: "Hey Google, ask ARIA..."
3. Action: HTTP Request to http://192.168.0.159:3002/api
4. Response: Read aloud with TTS

### **Method 5: Widget Access**

**Using KWGT/Zooper:**
1. Create custom widget
2. Add HTTP actions
3. Quick task buttons
4. Display today's agenda

---

## 📲 Mobile-Specific Features

### **Voice Commands**
- Use Gboard's voice input
- "Hey Google" integration via Tasker
- Voice notes and reminders

### **Quick Actions**
- Swipe down for quick tasks
- Widget shortcuts
- Notification actions

### **Location-Based**
- Reminders when arriving/leaving
- Location-tagged notes
- Commute optimization

### **Gestures**
- Swipe to complete tasks
- Long-press for options
- Pull to refresh

---

## 🔧 Optimizations for Pixel 9 Pro XL

### **Tensor G4 Features**
- On-device AI processing
- Magic Eraser for screenshots
- Live Translate for notes

### **Android 14+ Features**
- Material You theming
- Predictive back gesture
- App pairs with desktop

### **Battery Optimization**
```bash
# In Termux settings:
termux-wake-lock  # Keep running
termux-wake-unlock  # Allow sleep
```

---

## 🎮 Usage Examples

### **Morning Routine**
1. Widget shows today's agenda
2. Voice: "Hey Google, ask ARIA for my focus tasks"
3. Swipe notifications to complete

### **On the Go**
1. Open ARIA PWA
2. Voice note: "Remember to buy milk"
3. Auto-syncs when back online

### **Meeting Mode**
1. Quick action: "Take meeting notes"
2. Voice transcription
3. Action items extracted

---

## 🔗 Quick Links & Commands

### **Desktop Control**
```bash
# Start web server (on desktop)
cd ~/ish-automation
PORT=3002 node aria-mobile-server.js
```

### **Mobile Access**
- **Web**: http://192.168.0.159:3002
- **API**: http://192.168.0.159:3002/api
- **WebSocket**: ws://192.168.0.159:3002

### **Termux Commands**
```bash
# Install
pkg install nodejs git
git clone [your-aria-repo]
cd aria-mobile && npm install

# Run
node aria-mobile.js

# Create widget shortcut
mkdir -p ~/.shortcuts
echo "node ~/aria-mobile/aria-mobile.js" > ~/.shortcuts/ARIA
chmod +x ~/.shortcuts/ARIA
```

---

## 🚨 Troubleshooting

### **Can't Connect?**
1. Check both devices on same WiFi
2. Firewall: `sudo ufw allow 3002`
3. Try IP instead of hostname
4. Restart server

### **Slow Performance?**
1. Close other apps
2. Clear Chrome cache
3. Use lite mode in settings

### **Voice Not Working?**
1. Enable microphone permissions
2. Update Gboard
3. Check language settings

---

## 💡 Pro Tips

1. **Pin to Always-On Display**: See tasks without unlocking
2. **Bixby Routines**: Automate ARIA actions
3. **Samsung DeX**: Full desktop ARIA experience
4. **Split Screen**: ARIA + other apps
5. **Edge Panel**: Quick ARIA shortcuts

---

## 🎯 Next Steps

1. **Current Status**: Web interface running at http://192.168.0.159:3002
2. **Add to Home Screen**: Make it an app
3. **Install Termux**: For native access
4. **Setup Widgets**: For quick actions
5. **Configure Voice**: For hands-free use

---

## 🔒 Security Notes

- Use HTTPS for public networks
- Set up authentication for remote access
- Regular data backups
- Encrypted storage on device

---

## 📞 Support

- **Logs**: Check `aria-data/logs/`
- **Reset**: Delete `.aria-data` folder
- **Update**: `git pull` in Termux
- **Backup**: Sync with cloud storage

---

**Your ARIA is ready on your Pixel 9 Pro XL!**

Just open Chrome and go to: **http://192.168.0.159:3002** 🚀