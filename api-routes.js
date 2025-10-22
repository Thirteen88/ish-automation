/**
 * API Routes Module for AI Orchestrator
 *
 * This module provides all REST API endpoints for the orchestrator:
 * - Query submission and management
 * - Platform status monitoring
 * - History and analytics
 * - Voting and ranking system
 * - Metrics and performance data
 * - Export functionality
 */

const express = require('express');

class APIRoutes {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.router = express.Router();
        this.setupRoutes();
    }

    /**
     * Setup all API routes
     */
    setupRoutes() {
        // Query endpoints
        this.router.post('/query', this.submitQuery.bind(this));
        this.router.get('/query/:id', this.getQuery.bind(this));
        this.router.delete('/query/:id', this.deleteQuery.bind(this));
        this.router.post('/query/:id/retry', this.retryQuery.bind(this));

        // Platform endpoints
        this.router.get('/status', this.getPlatformStatus.bind(this));
        this.router.get('/platforms', this.listPlatforms.bind(this));
        this.router.get('/platform/:name/health', this.checkPlatformHealth.bind(this));

        // History endpoints
        this.router.get('/history', this.getHistory.bind(this));
        this.router.get('/history/search', this.searchHistory.bind(this));
        this.router.delete('/history', this.clearHistory.bind(this));

        // Voting endpoints
        this.router.post('/vote', this.submitVote.bind(this));
        this.router.get('/vote/:queryId', this.getVotes.bind(this));
        this.router.get('/rankings', this.getRankings.bind(this));

        // Metrics endpoints
        this.router.get('/metrics', this.getMetrics.bind(this));
        this.router.get('/metrics/platforms', this.getPlatformMetrics.bind(this));
        this.router.get('/metrics/performance', this.getPerformanceMetrics.bind(this));

        // Export endpoints
        this.router.get('/export/:id', this.exportQuery.bind(this));
        this.router.get('/export/:id/markdown', this.exportMarkdown.bind(this));
        this.router.get('/export/:id/csv', this.exportCSV.bind(this));
        this.router.get('/export/history/json', this.exportAllHistory.bind(this));

        // Comparison endpoints
        this.router.post('/compare', this.compareResponses.bind(this));
        this.router.get('/compare/:id', this.getComparison.bind(this));

        // Auto-detection endpoints
        this.router.post('/detect-platforms', this.detectOptimalPlatforms.bind(this));
        this.router.post('/analyze-prompt', this.analyzePrompt.bind(this));
    }

    /**
     * Submit a new query to platforms
     */
    async submitQuery(req, res) {
        try {
            const { prompt, platforms, options = {} } = req.body;

            // Validate input
            if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Valid prompt is required'
                });
            }

            // Use default platforms if not specified
            const targetPlatforms = platforms || ['lmarena', 'claude', 'chatgpt', 'gemini'];

            // Validate platforms
            const availablePlatforms = this.orchestrator.getAvailablePlatforms();
            const invalidPlatforms = targetPlatforms.filter(p => !availablePlatforms.includes(p));

            if (invalidPlatforms.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid platforms: ${invalidPlatforms.join(', ')}`,
                    availablePlatforms
                });
            }

            // Create query
            const queryId = this.orchestrator.generateQueryId();
            const query = {
                id: queryId,
                prompt: prompt.trim(),
                platforms: targetPlatforms,
                options,
                status: 'pending',
                responses: {},
                startTime: Date.now(),
                endTime: null,
                metadata: {
                    userAgent: req.headers['user-agent'],
                    ip: req.ip,
                    createdAt: new Date().toISOString()
                }
            };

            // Submit to orchestrator
            await this.orchestrator.submitQuery(query);

            res.json({
                success: true,
                queryId,
                message: 'Query submitted successfully',
                platforms: targetPlatforms,
                estimatedTime: this.estimateQueryTime(targetPlatforms)
            });

        } catch (error) {
            console.error('Submit query error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get query by ID
     */
    async getQuery(req, res) {
        try {
            const { id } = req.params;
            const query = this.orchestrator.getQuery(id);

            if (!query) {
                return res.status(404).json({
                    success: false,
                    error: 'Query not found'
                });
            }

            res.json({
                success: true,
                query
            });

        } catch (error) {
            console.error('Get query error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Delete query
     */
    async deleteQuery(req, res) {
        try {
            const { id } = req.params;
            const deleted = this.orchestrator.deleteQuery(id);

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    error: 'Query not found'
                });
            }

            res.json({
                success: true,
                message: 'Query deleted successfully'
            });

        } catch (error) {
            console.error('Delete query error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Retry failed query
     */
    async retryQuery(req, res) {
        try {
            const { id } = req.params;
            const query = this.orchestrator.getQuery(id);

            if (!query) {
                return res.status(404).json({
                    success: false,
                    error: 'Query not found'
                });
            }

            // Get failed platforms
            const failedPlatforms = Object.keys(query.responses)
                .filter(platform => !query.responses[platform].success);

            if (failedPlatforms.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No failed platforms to retry'
                });
            }

            // Retry failed platforms
            await this.orchestrator.retryQuery(id, failedPlatforms);

            res.json({
                success: true,
                message: 'Query retry initiated',
                retryPlatforms: failedPlatforms
            });

        } catch (error) {
            console.error('Retry query error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get platform status
     */
    async getPlatformStatus(req, res) {
        try {
            const status = this.orchestrator.getPlatformStatus();

            res.json({
                success: true,
                platforms: status,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Get platform status error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * List available platforms
     */
    async listPlatforms(req, res) {
        try {
            const platforms = this.orchestrator.getAvailablePlatforms();
            const details = platforms.map(name => ({
                name,
                displayName: this.getPlatformDisplayName(name),
                capabilities: this.getPlatformCapabilities(name),
                status: this.orchestrator.getPlatformStatus(name)
            }));

            res.json({
                success: true,
                platforms: details,
                total: platforms.length
            });

        } catch (error) {
            console.error('List platforms error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Check platform health
     */
    async checkPlatformHealth(req, res) {
        try {
            const { name } = req.params;
            const health = await this.orchestrator.checkPlatformHealth(name);

            res.json({
                success: true,
                platform: name,
                health
            });

        } catch (error) {
            console.error('Platform health check error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get query history
     */
    async getHistory(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const filter = req.query.filter; // 'completed', 'failed', 'pending'

            const history = this.orchestrator.getHistory({ limit, offset, filter });

            res.json({
                success: true,
                queries: history.queries,
                total: history.total,
                limit,
                offset
            });

        } catch (error) {
            console.error('Get history error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Search query history
     */
    async searchHistory(req, res) {
        try {
            const { q, platforms, dateFrom, dateTo } = req.query;

            if (!q) {
                return res.status(400).json({
                    success: false,
                    error: 'Search query (q) is required'
                });
            }

            const results = this.orchestrator.searchHistory({
                query: q,
                platforms: platforms ? platforms.split(',') : null,
                dateFrom: dateFrom ? new Date(dateFrom) : null,
                dateTo: dateTo ? new Date(dateTo) : null
            });

            res.json({
                success: true,
                results,
                total: results.length
            });

        } catch (error) {
            console.error('Search history error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Clear query history
     */
    async clearHistory(req, res) {
        try {
            const { olderThan } = req.query;
            const clearedCount = this.orchestrator.clearHistory(olderThan);

            res.json({
                success: true,
                message: `Cleared ${clearedCount} queries from history`
            });

        } catch (error) {
            console.error('Clear history error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Submit vote for response
     */
    async submitVote(req, res) {
        try {
            const { queryId, platform, vote, comment } = req.body;

            if (!queryId || !platform || !vote) {
                return res.status(400).json({
                    success: false,
                    error: 'queryId, platform, and vote are required'
                });
            }

            if (!['up', 'down', 'best'].includes(vote)) {
                return res.status(400).json({
                    success: false,
                    error: 'vote must be "up", "down", or "best"'
                });
            }

            this.orchestrator.submitVote(queryId, platform, vote, comment);

            res.json({
                success: true,
                message: 'Vote recorded successfully'
            });

        } catch (error) {
            console.error('Submit vote error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get votes for query
     */
    async getVotes(req, res) {
        try {
            const { queryId } = req.params;
            const votes = this.orchestrator.getVotes(queryId);

            res.json({
                success: true,
                queryId,
                votes
            });

        } catch (error) {
            console.error('Get votes error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get platform rankings
     */
    async getRankings(req, res) {
        try {
            const timeRange = req.query.range || '7d'; // '24h', '7d', '30d', 'all'
            const rankings = this.orchestrator.getRankings(timeRange);

            res.json({
                success: true,
                rankings,
                timeRange
            });

        } catch (error) {
            console.error('Get rankings error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get system metrics
     */
    async getMetrics(req, res) {
        try {
            const metrics = this.orchestrator.getMetrics();

            res.json({
                success: true,
                metrics
            });

        } catch (error) {
            console.error('Get metrics error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get platform-specific metrics
     */
    async getPlatformMetrics(req, res) {
        try {
            const metrics = this.orchestrator.getPlatformMetrics();

            res.json({
                success: true,
                metrics
            });

        } catch (error) {
            console.error('Get platform metrics error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get performance metrics
     */
    async getPerformanceMetrics(req, res) {
        try {
            const metrics = this.orchestrator.getPerformanceMetrics();

            res.json({
                success: true,
                metrics
            });

        } catch (error) {
            console.error('Get performance metrics error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Export query as JSON
     */
    async exportQuery(req, res) {
        try {
            const { id } = req.params;
            const query = this.orchestrator.getQuery(id);

            if (!query) {
                return res.status(404).json({
                    success: false,
                    error: 'Query not found'
                });
            }

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="query-${id}.json"`);
            res.json(query);

        } catch (error) {
            console.error('Export query error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Export query as Markdown
     */
    async exportMarkdown(req, res) {
        try {
            const { id } = req.params;
            const query = this.orchestrator.getQuery(id);

            if (!query) {
                return res.status(404).json({
                    success: false,
                    error: 'Query not found'
                });
            }

            const markdown = this.generateMarkdownReport(query);

            res.setHeader('Content-Type', 'text/markdown');
            res.setHeader('Content-Disposition', `attachment; filename="query-${id}.md"`);
            res.send(markdown);

        } catch (error) {
            console.error('Export markdown error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Export query as CSV
     */
    async exportCSV(req, res) {
        try {
            const { id } = req.params;
            const query = this.orchestrator.getQuery(id);

            if (!query) {
                return res.status(404).json({
                    success: false,
                    error: 'Query not found'
                });
            }

            const csv = this.generateCSVReport(query);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="query-${id}.csv"`);
            res.send(csv);

        } catch (error) {
            console.error('Export CSV error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Export all history as JSON
     */
    async exportAllHistory(req, res) {
        try {
            const history = this.orchestrator.getAllHistory();

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="query-history.json"');
            res.json(history);

        } catch (error) {
            console.error('Export history error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Compare responses from different platforms
     */
    async compareResponses(req, res) {
        try {
            const { queryId, platforms } = req.body;

            if (!queryId || !platforms || !Array.isArray(platforms)) {
                return res.status(400).json({
                    success: false,
                    error: 'queryId and platforms array are required'
                });
            }

            const comparison = this.orchestrator.compareResponses(queryId, platforms);

            res.json({
                success: true,
                comparison
            });

        } catch (error) {
            console.error('Compare responses error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get saved comparison
     */
    async getComparison(req, res) {
        try {
            const { id } = req.params;
            const comparison = this.orchestrator.getComparison(id);

            if (!comparison) {
                return res.status(404).json({
                    success: false,
                    error: 'Comparison not found'
                });
            }

            res.json({
                success: true,
                comparison
            });

        } catch (error) {
            console.error('Get comparison error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Detect optimal platforms for a prompt
     */
    async detectOptimalPlatforms(req, res) {
        try {
            const { prompt } = req.body;

            if (!prompt) {
                return res.status(400).json({
                    success: false,
                    error: 'Prompt is required'
                });
            }

            const analysis = this.analyzePromptType(prompt);
            const recommendations = this.getRecommendedPlatforms(analysis);

            res.json({
                success: true,
                analysis,
                recommendations
            });

        } catch (error) {
            console.error('Detect platforms error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Analyze prompt characteristics
     */
    async analyzePrompt(req, res) {
        try {
            const { prompt } = req.body;

            if (!prompt) {
                return res.status(400).json({
                    success: false,
                    error: 'Prompt is required'
                });
            }

            const analysis = this.analyzePromptType(prompt);

            res.json({
                success: true,
                analysis
            });

        } catch (error) {
            console.error('Analyze prompt error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Helper methods

    estimateQueryTime(platforms) {
        const avgTimePerPlatform = 15000; // 15 seconds average
        return platforms.length * avgTimePerPlatform;
    }

    getPlatformDisplayName(name) {
        const names = {
            'lmarena': 'LMArena (LMSys)',
            'claude': 'Claude.ai',
            'chatgpt': 'ChatGPT',
            'gemini': 'Google Gemini',
            'poe': 'Poe.com'
        };
        return names[name] || name;
    }

    getPlatformCapabilities(name) {
        const capabilities = {
            'lmarena': ['text', 'multi-model'],
            'claude': ['text', 'long-context', 'coding'],
            'chatgpt': ['text', 'browsing', 'plugins'],
            'gemini': ['text', 'multi-modal', 'search'],
            'poe': ['text', 'multi-bot']
        };
        return capabilities[name] || ['text'];
    }

    generateMarkdownReport(query) {
        let md = `# Query Report: ${query.id}\n\n`;
        md += `**Prompt:** ${query.prompt}\n\n`;
        md += `**Submitted:** ${new Date(query.startTime).toISOString()}\n\n`;
        md += `**Duration:** ${query.endTime ? ((query.endTime - query.startTime) / 1000).toFixed(2) + 's' : 'In progress'}\n\n`;
        md += `---\n\n`;

        for (const [platform, response] of Object.entries(query.responses)) {
            md += `## ${this.getPlatformDisplayName(platform)}\n\n`;
            if (response.success) {
                md += `**Status:** ✅ Success\n\n`;
                md += `**Response:**\n\n${response.response}\n\n`;
                md += `**Duration:** ${response.duration}ms\n\n`;
            } else {
                md += `**Status:** ❌ Failed\n\n`;
                md += `**Error:** ${response.error}\n\n`;
            }
            md += `---\n\n`;
        }

        return md;
    }

    generateCSVReport(query) {
        let csv = 'Platform,Status,Duration (ms),Response\n';

        for (const [platform, response] of Object.entries(query.responses)) {
            const status = response.success ? 'Success' : 'Failed';
            const duration = response.duration || 0;
            const responseText = response.success
                ? response.response.replace(/"/g, '""')
                : response.error.replace(/"/g, '""');

            csv += `"${platform}","${status}",${duration},"${responseText}"\n`;
        }

        return csv;
    }

    analyzePromptType(prompt) {
        const analysis = {
            length: prompt.length,
            type: 'general',
            characteristics: [],
            complexity: 'medium'
        };

        // Code detection
        if (prompt.match(/```|function|class|const|let|var|def |import /)) {
            analysis.type = 'coding';
            analysis.characteristics.push('code');
        }

        // Math detection
        if (prompt.match(/\d+[\+\-\*\/\^]\d+|equation|calculate|solve/i)) {
            analysis.type = 'math';
            analysis.characteristics.push('math');
        }

        // Creative writing detection
        if (prompt.match(/write a story|poem|creative|imagine|once upon/i)) {
            analysis.type = 'creative';
            analysis.characteristics.push('creative');
        }

        // Analysis/reasoning detection
        if (prompt.match(/analyze|compare|explain|why|how|evaluate/i)) {
            analysis.type = 'analytical';
            analysis.characteristics.push('reasoning');
        }

        // Complexity based on length and structure
        if (prompt.length > 500 || prompt.split('\n').length > 5) {
            analysis.complexity = 'high';
        } else if (prompt.length < 100) {
            analysis.complexity = 'low';
        }

        return analysis;
    }

    getRecommendedPlatforms(analysis) {
        const recommendations = [];

        switch (analysis.type) {
            case 'coding':
                recommendations.push('claude', 'chatgpt', 'gemini');
                break;
            case 'creative':
                recommendations.push('claude', 'chatgpt', 'poe');
                break;
            case 'analytical':
                recommendations.push('claude', 'gemini', 'lmarena');
                break;
            case 'math':
                recommendations.push('chatgpt', 'gemini', 'claude');
                break;
            default:
                recommendations.push('lmarena', 'claude', 'chatgpt', 'gemini');
        }

        return recommendations;
    }
}

module.exports = APIRoutes;
