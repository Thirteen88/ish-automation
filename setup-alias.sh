#!/bin/bash

# Add ARIA alias to your shell configuration
echo "Setting up ARIA command alias..."

# Detect shell
if [ -f ~/.bashrc ]; then
    SHELL_RC=~/.bashrc
elif [ -f ~/.zshrc ]; then
    SHELL_RC=~/.zshrc
else
    SHELL_RC=~/.profile
fi

# Add alias if not already present
if ! grep -q "alias aria=" "$SHELL_RC"; then
    echo "" >> "$SHELL_RC"
    echo "# ARIA Personal Assistant" >> "$SHELL_RC"
    echo "alias aria='cd ~/ish-automation && node aria.js'" >> "$SHELL_RC"
    echo "✅ Added 'aria' command to $SHELL_RC"
    echo ""
    echo "To use it, either:"
    echo "1. Restart your terminal, or"
    echo "2. Run: source $SHELL_RC"
    echo ""
    echo "Then just type 'aria' from anywhere to start your assistant!"
else
    echo "✅ ARIA command already configured"
fi