#!/usr/bin/env python3

"""
ARIA Public Access Setup
Quick and easy way to make ARIA accessible from anywhere
"""

import os
import sys
import subprocess
import time

print("""
╔═══════════════════════════════════════════════════════════╗
║           ARIA External Access Setup                     ║
╚═══════════════════════════════════════════════════════════╝
""")

print("Setting up public access for ARIA...\n")

# Options for free tunneling services
options = """
Available Options (All Free):

1. 📦 Localtunnel (Easiest - No signup)
   - Instant public URL
   - No account needed
   - Works immediately

2. 🔒 Tailscale (Most Secure)
   - Private VPN access
   - Free forever
   - Most secure option

3. 🌐 Cloudflare (Professional)
   - Custom domain support
   - Free account required
   - Most reliable

Choose option (1-3): """

choice = input(options) or "1"

if choice == "1":
    print("\n🚀 Setting up Localtunnel...\n")

    # Install localtunnel
    print("Installing localtunnel...")
    os.system("npm install -g localtunnel 2>/dev/null")

    print("\n✅ Starting public tunnel...\n")
    print("=" * 60)
    print("YOUR ARIA IS NOW ACCESSIBLE FROM ANYWHERE!")
    print("=" * 60)

    # Start localtunnel
    os.system("lt --port 3002 --subdomain aria-assistant")

elif choice == "2":
    print("\n🔒 Setting up Tailscale...\n")

    # Install Tailscale
    os.system("curl -fsSL https://tailscale.com/install.sh | sh")

    print("\nStarting Tailscale...")
    os.system("sudo tailscale up")

    print("\n✅ Tailscale is running!")
    print("\nNext steps:")
    print("1. Install Tailscale app on your Pixel 9 Pro XL")
    print("2. Sign in with the same account")
    print("3. Access ARIA at: http://[your-tailscale-ip]:3002")

elif choice == "3":
    print("\n🌐 Cloudflare Tunnel Setup...\n")

    print("For Cloudflare tunnel:")
    print("1. Sign up at: https://dash.cloudflare.com/sign-up")
    print("2. Install cloudflared:")
    print("   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb")
    print("   sudo dpkg -i cloudflared-linux-amd64.deb")
    print("3. Run: cloudflared tunnel --url localhost:3002")

print("\n✨ Setup complete!")