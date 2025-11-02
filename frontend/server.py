#!/usr/bin/env python3
"""
Simple static file server for the ISH Chat frontend
"""
import http.server
import socketserver
import os
import sys

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.directory = DIRECTORY

    def do_GET(self):
        # Serve index.html for root requests
        if self.path == '/' or self.path == '':
            self.path = '/index.html'

        # Handle CORS preflight requests
        if self.path.startswith('/api/'):
            self.send_response(404, 'Not Found')
            return

        # Map to actual files
        file_path = self.directory + self.path
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return super().do_GET()
        else:
            self.send_error(404, "File not found")

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

def run_server():
    os.chdir(DIRECTORY)

    with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
        print(f"🚀 ISH Chat Dashboard running on http://localhost:{PORT}")
        print("Press Ctrl+C to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped")
            sys.exit(0)

if __name__ == "__main__":
    run_server()