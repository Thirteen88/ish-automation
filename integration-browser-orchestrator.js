#!/usr/bin/env node

/**
 * Integration Example - Browser Orchestrator with Existing AI Orchestrator
 *
 * Shows how to integrate the browser orchestrator with the existing web interface
 */

const BrowserOrchestrator = require('./production-orchestrator-browser');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8001;

// Middleware
app.use(cors());
app.use(express.json());

// Global orchestrator instance
let orchestrator = null;

// Initialize orchestrator
async function initializeOrchestrator() {
    console.log('🚀 Initializing Browser Orchestrator...\n');

    orchestrator = new BrowserOrchestrator({
        environment: process.env.NODE_ENV || 'development',
        headless: process.env.HEADLESS !== 'false',
        enableHealthMonitoring: true,
        enableSessionPersistence: true,
        maxConcurrent: 5
    });

    await orchestrator.initialize();
    console.log('✅ Browser Orchestrator ready!\n');
}

// API Endpoints

// Health check
app.get('/api/health', (req, res) => {
    if (!orchestrator || !orchestrator.state.initialized) {
        return res.status(503).json({
            status: 'not_ready',
            message: 'Orchestrator not initialized'
        });
    }

    const health = orchestrator.healthMonitor
        ? orchestrator.healthMonitor.getAllPlatformHealth()
        : {};

    res.json({
        status: 'healthy',
        initialized: orchestrator.state.initialized,
        uptime: orchestrator.state.startTime,
        platforms: health
    });
});

// Query endpoint
app.post('/api/query', async (req, res) => {
    try {
        const { prompt, platforms, model } = req.body;

        if (!prompt || !platforms || !Array.isArray(platforms)) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'prompt and platforms (array) required'
            });
        }

        if (!orchestrator || !orchestrator.state.initialized) {
            return res.status(503).json({
                error: 'Service unavailable',
                message: 'Orchestrator not ready'
            });
        }

        console.log(`\n📝 Query received: ${platforms.join(', ')}`);
        console.log(`   Prompt: ${prompt.substring(0, 50)}...`);

        const result = await orchestrator.query({
            prompt,
            platforms,
            model: model || 'default'
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Query error:', error);
        res.status(500).json({
            error: 'Query failed',
            message: error.message
        });
    }
});

// Platforms endpoint
app.get('/api/platforms', (req, res) => {
    if (!orchestrator || !orchestrator.state.initialized) {
        return res.status(503).json({
            error: 'Service unavailable'
        });
    }

    const platforms = Array.from(orchestrator.platforms.keys()).map(name => {
        const platform = orchestrator.platforms.get(name);
        return {
            name,
            models: platform.models || [],
            initialized: platform.isInitialized
        };
    });

    res.json({
        platforms
    });
});

// Sessions endpoint
app.get('/api/sessions', (req, res) => {
    if (!orchestrator) {
        return res.status(503).json({
            error: 'Service unavailable'
        });
    }

    const sessions = Array.from(orchestrator.platforms.entries()).map(([name, platform]) => ({
        platform: name,
        hasSession: !!platform.sessionData,
        sessionTimestamp: platform.sessionData?.timestamp || null
    }));

    res.json({ sessions });
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
    if (!orchestrator) {
        return res.status(503).json({
            error: 'Service unavailable'
        });
    }

    const avgLatency = orchestrator.metrics.latencies.length > 0
        ? orchestrator.metrics.latencies.reduce((a, b) => a + b, 0) / orchestrator.metrics.latencies.length
        : 0;

    res.json({
        requests: {
            total: orchestrator.state.requestCount,
            successful: orchestrator.state.requestCount - orchestrator.state.errorCount,
            failed: orchestrator.state.errorCount
        },
        performance: {
            averageLatency: avgLatency.toFixed(2) + 'ms',
            totalQueries: orchestrator.metrics.requests.length
        },
        uptime: orchestrator.state.startTime
    });
});

// Serve simple web interface
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Browser Orchestrator - Web Interface</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
            color: #667eea;
            margin-bottom: 20px;
            text-align: center;
        }
        .info {
            background: #f0f0f0;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .query-section {
            margin-bottom: 20px;
        }
        .platforms {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 15px;
        }
        .platform-btn {
            padding: 10px 20px;
            border: 2px solid #e0e0e0;
            background: white;
            border-radius: 25px;
            cursor: pointer;
            transition: all 0.3s;
        }
        .platform-btn.selected {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }
        textarea {
            width: 100%;
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
            margin-bottom: 15px;
            min-height: 100px;
            font-family: inherit;
        }
        button.submit {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
        }
        button.submit:hover { transform: translateY(-2px); }
        button.submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .results {
            margin-top: 20px;
        }
        .result-card {
            background: #f5f5f5;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 15px;
        }
        .result-header {
            font-weight: 600;
            color: #667eea;
            margin-bottom: 10px;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🌐 Browser Orchestrator</h1>

        <div class="info">
            <div id="status">Loading...</div>
        </div>

        <div class="query-section">
            <h3>Select Platforms</h3>
            <div class="platforms">
                <button class="platform-btn" data-platform="claude">Claude</button>
                <button class="platform-btn" data-platform="chatgpt">ChatGPT</button>
                <button class="platform-btn" data-platform="gemini">Gemini</button>
                <button class="platform-btn" data-platform="lmarena">LMArena</button>
                <button class="platform-btn" data-platform="ish">ISH</button>
            </div>

            <h3>Enter Your Query</h3>
            <textarea id="prompt" placeholder="Ask anything..."></textarea>

            <button class="submit" id="submitBtn">Submit Query</button>
        </div>

        <div class="results" id="results" style="display:none;">
            <h3>Results</h3>
            <div id="resultsContainer"></div>
        </div>
    </div>

    <script>
        let selectedPlatforms = new Set();

        // Load status
        async function loadStatus() {
            const res = await fetch('/api/health');
            const data = await res.json();
            document.getElementById('status').innerHTML = \`
                Status: <strong>\${data.status}</strong><br>
                Initialized: <strong>\${data.initialized}</strong><br>
                Platforms: <strong>\${Object.keys(data.platforms || {}).length}</strong>
            \`;
        }

        // Platform selection
        document.querySelectorAll('.platform-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('selected');
                const platform = btn.dataset.platform;
                if (selectedPlatforms.has(platform)) {
                    selectedPlatforms.delete(platform);
                } else {
                    selectedPlatforms.add(platform);
                }
            });
        });

        // Submit query
        document.getElementById('submitBtn').addEventListener('click', async () => {
            const prompt = document.getElementById('prompt').value.trim();

            if (!prompt) {
                alert('Please enter a query');
                return;
            }

            if (selectedPlatforms.size === 0) {
                alert('Please select at least one platform');
                return;
            }

            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';

            document.getElementById('results').style.display = 'block';
            document.getElementById('resultsContainer').innerHTML = '<div class="loading">⏳ Querying platforms...</div>';

            try {
                const res = await fetch('/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt,
                        platforms: Array.from(selectedPlatforms),
                        model: 'default'
                    })
                });

                const data = await res.json();

                if (data.success) {
                    const container = document.getElementById('resultsContainer');
                    container.innerHTML = '';

                    data.data.results.forEach(result => {
                        const card = document.createElement('div');
                        card.className = 'result-card';
                        card.innerHTML = \`
                            <div class="result-header">\${result.platformName} - \${result.success ? '✅' : '❌'}</div>
                            <div>\${result.success ? result.result.response : result.error}</div>
                        \`;
                        container.appendChild(card);
                    });
                } else {
                    document.getElementById('resultsContainer').innerHTML = \`
                        <div class="result-card">
                            <div class="result-header">❌ Error</div>
                            <div>\${data.message}</div>
                        </div>
                    \`;
                }
            } catch (error) {
                document.getElementById('resultsContainer').innerHTML = \`
                    <div class="result-card">
                        <div class="result-header">❌ Error</div>
                        <div>\${error.message}</div>
                    </div>
                \`;
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Query';
            }
        });

        // Load status on page load
        loadStatus();
        setInterval(loadStatus, 5000);
    </script>
</body>
</html>
    `);
});

// Start server
async function start() {
    try {
        // Initialize orchestrator
        await initializeOrchestrator();

        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Browser Orchestrator - Web Interface             ║
╚═══════════════════════════════════════════════════════════╝

🚀 Server running at: http://localhost:${PORT}

📡 API Endpoints:
   GET  /api/health       - Health check
   GET  /api/platforms    - Available platforms
   GET  /api/sessions     - Session status
   GET  /api/metrics      - Performance metrics
   POST /api/query        - Submit query

🌐 Web Interface: http://localhost:${PORT}

Press Ctrl+C to stop the server
            `);
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n\n🛑 Shutting down...\n');
            await orchestrator.shutdown();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Failed to start:', error);
        process.exit(1);
    }
}

start().catch(console.error);
