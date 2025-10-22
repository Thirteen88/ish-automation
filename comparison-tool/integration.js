/**
 * Orchestrator Integration Script
 * Adds comparison endpoints to the existing orchestrator
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

/**
 * Add comparison endpoints to existing Express app
 */
function addComparisonEndpoints(app) {
    // Serve comparison tool static files
    app.use('/comparison', express.static(path.join(__dirname, 'comparison-tool')));

    // Get recent responses for comparison
    app.get('/api/responses/recent', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const responses = getRecentResponses(limit);
            res.json(responses);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get responses by session ID
    app.get('/api/responses/session/:sessionId', (req, res) => {
        try {
            const responses = getResponsesBySession(req.params.sessionId);
            res.json(responses);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Compare specific responses
    app.post('/api/compare', express.json(), (req, res) => {
        try {
            const { responses, algorithm } = req.body;
            const comparison = compareResponses(responses, algorithm);
            res.json(comparison);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Save comparison results
    app.post('/api/comparison/save', express.json(), (req, res) => {
        try {
            const { name, responses, rankings, analysis } = req.body;
            const saved = saveComparison(name, responses, rankings, analysis);
            res.json({ success: true, id: saved.id });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get saved comparisons
    app.get('/api/comparisons', (req, res) => {
        try {
            const comparisons = getSavedComparisons();
            res.json(comparisons);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete comparison
    app.delete('/api/comparison/:id', (req, res) => {
        try {
            deleteComparison(req.params.id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    console.log('✅ Comparison endpoints added');
    console.log('📊 Access comparison tool at: http://localhost:3000/comparison');
}

/**
 * Get recent responses from storage
 */
function getRecentResponses(limit = 10) {
    const dbPath = path.join(__dirname, 'demo-responses.db');

    // If using SQLite
    if (fs.existsSync(dbPath)) {
        const Database = require('better-sqlite3');
        const db = new Database(dbPath);

        const responses = db.prepare(`
            SELECT * FROM responses
            ORDER BY timestamp DESC
            LIMIT ?
        `).all(limit);

        db.close();
        return responses;
    }

    // Fallback to file-based storage
    const responsesDir = path.join(__dirname, 'responses');
    if (!fs.existsSync(responsesDir)) {
        return [];
    }

    const files = fs.readdirSync(responsesDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

    return files.map(file => {
        const content = fs.readFileSync(path.join(responsesDir, file), 'utf8');
        return JSON.parse(content);
    });
}

/**
 * Get responses by session ID
 */
function getResponsesBySession(sessionId) {
    const dbPath = path.join(__dirname, 'demo-responses.db');

    if (fs.existsSync(dbPath)) {
        const Database = require('better-sqlite3');
        const db = new Database(dbPath);

        const responses = db.prepare(`
            SELECT * FROM responses
            WHERE session_id = ?
            ORDER BY timestamp ASC
        `).all(sessionId);

        db.close();
        return responses;
    }

    return [];
}

/**
 * Compare responses using specified algorithm
 */
function compareResponses(responses, algorithm = 'cosine') {
    const ComparisonEngine = require('./comparison-tool/comparison-engine.js');

    const results = {
        algorithm,
        timestamp: new Date().toISOString(),
        responses: responses.map(r => ({
            ...r,
            qualityScore: ComparisonEngine.calculateQualityScore(r)
        })),
        similarityMatrix: ComparisonEngine.calculateSimilarityMatrix(responses, algorithm),
        consensus: ComparisonEngine.detectConsensus(responses),
        outliers: ComparisonEngine.identifyOutliers(responses),
        statistics: ComparisonEngine.calculateStatistics(
            responses.map(r => ({
                ...r,
                qualityScore: ComparisonEngine.calculateQualityScore(r)
            }))
        )
    };

    return results;
}

/**
 * Save comparison results
 */
function saveComparison(name, responses, rankings, analysis) {
    const comparisonsDir = path.join(__dirname, 'comparisons');
    if (!fs.existsSync(comparisonsDir)) {
        fs.mkdirSync(comparisonsDir, { recursive: true });
    }

    const id = Date.now().toString();
    const data = {
        id,
        name,
        timestamp: new Date().toISOString(),
        responses,
        rankings,
        analysis
    };

    const filePath = path.join(comparisonsDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    return { id };
}

/**
 * Get all saved comparisons
 */
function getSavedComparisons() {
    const comparisonsDir = path.join(__dirname, 'comparisons');
    if (!fs.existsSync(comparisonsDir)) {
        return [];
    }

    const files = fs.readdirSync(comparisonsDir)
        .filter(f => f.endsWith('.json'));

    return files.map(file => {
        const content = fs.readFileSync(path.join(comparisonsDir, file), 'utf8');
        const data = JSON.parse(content);
        return {
            id: data.id,
            name: data.name,
            timestamp: data.timestamp,
            responseCount: data.responses.length
        };
    }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Delete a saved comparison
 */
function deleteComparison(id) {
    const comparisonsDir = path.join(__dirname, 'comparisons');
    const filePath = path.join(comparisonsDir, `${id}.json`);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

/**
 * Standalone server for comparison tool
 */
function startComparisonServer(port = 3001) {
    const app = express();
    app.use(express.json());

    // Enable CORS
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });

    // Add endpoints
    addComparisonEndpoints(app);

    app.listen(port, () => {
        console.log(`🚀 Comparison tool server running on http://localhost:${port}`);
        console.log(`📊 Open http://localhost:${port}/comparison to use the tool`);
    });
}

// Export functions
module.exports = {
    addComparisonEndpoints,
    startComparisonServer,
    compareResponses,
    getRecentResponses,
    saveComparison,
    getSavedComparisons
};

// If run directly, start standalone server
if (require.main === module) {
    startComparisonServer();
}
