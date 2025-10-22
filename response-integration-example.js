/**
 * Response System Integration Example
 * Shows how to integrate the response processing system with existing orchestrator
 */

const ResponseProcessor = require('./response-processor');
const ResponseAggregator = require('./response-aggregator');
const ContentFormatter = require('./content-formatter');
const ResponseStorage = require('./response-storage');

class EnhancedResponseHandler {
  constructor(options = {}) {
    this.processor = new ResponseProcessor({
      enableCodeHighlight: true,
      enableDuplicateDetection: true,
      similarityThreshold: 0.85
    });

    this.aggregator = new ResponseAggregator({
      enableThemeExtraction: true,
      enableQualityMetrics: true
    });

    this.formatter = new ContentFormatter({
      enableColors: true
    });

    this.storage = new ResponseStorage({
      dbPath: options.dbPath || './ish-responses.db'
    });

    this.currentSession = null;
  }

  /**
   * Start a new session
   */
  startSession(name, description = '') {
    this.currentSession = this.storage.createSession({
      name,
      description,
      metadata: {
        startedAt: new Date().toISOString()
      }
    });
    return this.currentSession;
  }

  /**
   * Handle response from orchestrator
   * @param {Object} response - Raw response from AI platform
   * @param {string} platform - Platform name
   * @param {string} prompt - Original prompt
   * @param {Object} options - Processing options
   * @returns {Object} Processed response
   */
  async handleResponse(response, platform, prompt, options = {}) {
    try {
      // Parse the response
      const parsed = this.processor.parseResponse(response, platform);

      // Clean the text
      if (options.clean !== false) {
        parsed.text = this.processor.cleanText(parsed.text);
      }

      // Extract code blocks
      parsed.codeBlocks = this.processor.extractCodeBlocks(parsed.text);

      // Store if enabled
      if (options.store !== false) {
        const tags = options.tags || [];
        const responseId = this.storage.storeResponse(parsed, prompt, {
          sessionId: this.currentSession,
          tags,
          metadata: options.metadata || {}
        });
        parsed.storedId = responseId;
      }

      // Format for output
      const outputFormat = options.format || 'terminal';
      parsed.formatted = this.formatter.format(parsed, outputFormat, options.formatOptions);

      return parsed;
    } catch (error) {
      console.error(`Error handling response from ${platform}:`, error);
      throw error;
    }
  }

  /**
   * Handle multiple responses from different platforms
   * @param {Array} responses - Array of {response, platform, prompt} objects
   * @param {Object} options - Processing options
   * @returns {Object} Aggregated result
   */
  async handleMultipleResponses(responses, options = {}) {
    try {
      // Parse all responses
      const parsedResponses = responses.map(({ response, platform }) =>
        this.processor.parseResponse(response, platform)
      );

      // Store individual responses if enabled
      if (options.storeIndividual !== false && responses[0]?.prompt) {
        parsedResponses.forEach((parsed, idx) => {
          this.storage.storeResponse(parsed, responses[idx].prompt, {
            sessionId: this.currentSession,
            tags: options.tags || [],
            metadata: { ...options.metadata, type: 'individual' }
          });
        });
      }

      // Aggregate responses
      const aggregated = this.aggregator.aggregateResponses(parsedResponses);

      // Store aggregated summary if enabled
      if (options.storeAggregated !== false && responses[0]?.prompt) {
        const summaryId = this.storage.storeResponse(
          aggregated.summary,
          responses[0].prompt,
          {
            sessionId: this.currentSession,
            tags: [...(options.tags || []), 'aggregated'],
            metadata: {
              ...options.metadata,
              type: 'aggregated',
              sourceCount: parsedResponses.length,
              consensus: aggregated.consensus.agreement
            }
          }
        );
        aggregated.storedId = summaryId;
      }

      // Format output
      const outputFormat = options.format || 'terminal';

      if (outputFormat === 'comparison') {
        aggregated.formatted = this.formatter.applyTemplate(
          'comparison',
          aggregated.summary,
          {
            responses: parsedResponses,
            comparisonMatrix: aggregated.comparisonMatrix
          }
        );
      } else {
        aggregated.formatted = this.formatter.applyTemplate(
          'summary',
          aggregated.summary,
          aggregated
        );
      }

      return aggregated;
    } catch (error) {
      console.error('Error handling multiple responses:', error);
      throw error;
    }
  }

  /**
   * Search previous responses
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} Search results
   */
  searchResponses(query, options = {}) {
    const results = this.storage.search(query, options);

    if (options.format) {
      return results.map(result =>
        this.formatter.format(result, options.format, options.formatOptions)
      );
    }

    return results;
  }

  /**
   * Get response history for a prompt
   * @param {string} prompt - Prompt text
   * @param {Object} options - History options
   * @returns {Array} Response history
   */
  getHistory(prompt, options = {}) {
    const history = this.storage.getHistory(prompt, options);

    if (options.format) {
      return history.map(response =>
        this.formatter.format(response, options.format, options.formatOptions)
      );
    }

    return history;
  }

  /**
   * Export session
   * @param {string} sessionId - Session ID (defaults to current)
   * @param {string} format - Export format
   * @returns {Object|string} Export data
   */
  exportSession(sessionId = null, format = 'json') {
    return this.storage.exportResponses({
      format,
      sessionId: sessionId || this.currentSession
    });
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return this.storage.getStatistics();
  }

  /**
   * Display comparison table for multiple responses
   * @param {Object} aggregated - Aggregated response object
   * @param {string} format - Table format (terminal, markdown, html)
   * @returns {string} Formatted table
   */
  displayComparisonTable(aggregated, format = 'terminal') {
    const matrix = aggregated.comparisonMatrix;

    const headers = [
      'Platform',
      'Score',
      'Rank',
      'Length',
      'Code Blocks',
      'Quality'
    ];

    const rows = matrix.overall.map((item, idx) => {
      const platform = item.platform;
      const platformIdx = matrix.platforms.indexOf(platform);

      return [
        platform,
        (item.score * 100).toFixed(1) + '%',
        `#${item.rank}`,
        matrix.dimensions.length[platformIdx],
        matrix.dimensions.codeBlocks[platformIdx],
        this._getQualityLabel(item.score)
      ];
    });

    return this.formatter.generateTable(headers, rows, format);
  }

  /**
   * Display quality metrics
   * @param {Object} aggregated - Aggregated response object
   * @returns {string} Formatted metrics
   */
  displayQualityMetrics(aggregated) {
    const metrics = aggregated.qualityMetrics;
    let output = '';

    output += '📊 Quality Metrics\n\n';
    output += `Overall Average: ${(metrics.overall.average * 100).toFixed(1)}%\n`;
    output += `Best Platform: ${metrics.summary.bestPlatform}\n`;
    output += `Quality Variance: ${metrics.summary.qualityVariance}\n\n`;

    output += 'Per-Platform Breakdown:\n';
    Object.entries(metrics.perPlatform).forEach(([platform, data]) => {
      output += `\n${platform}:\n`;
      output += `  Average Score: ${(data.averageScore * 100).toFixed(1)}%\n`;
      output += `  Best Rank: #${data.bestRank}\n`;
      output += `  Code Quality: ${(data.detailedScores.codeQuality * 100).toFixed(1)}%\n`;
      output += `  Clarity: ${(data.detailedScores.clarity * 100).toFixed(1)}%\n`;
    });

    return output;
  }

  /**
   * Display unique insights
   * @param {Object} aggregated - Aggregated response object
   * @returns {string} Formatted insights
   */
  displayUniqueInsights(aggregated) {
    let output = '';

    output += '💡 Unique Insights\n\n';

    aggregated.uniqueInsights.forEach(insight => {
      output += `${insight.platform} (${insight.insights.length} unique points):\n`;
      insight.insights.forEach((point, idx) => {
        if (point.type === 'unique_perspective') {
          output += `  ${idx + 1}. ${point.text}\n`;
        } else if (point.type === 'unique_code') {
          output += `  ${idx + 1}. [Code Example in ${point.language}]\n`;
        }
      });
      output += '\n';
    });

    return output;
  }

  /**
   * Close storage connection
   */
  close() {
    this.storage.close();
  }

  // Private helper methods

  _getQualityLabel(score) {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.6) return 'Good';
    if (score >= 0.4) return 'Fair';
    return 'Poor';
  }
}

// Example usage with orchestrator
async function example() {
  const handler = new EnhancedResponseHandler({
    dbPath: './ish-responses.db'
  });

  // Start a session
  const sessionId = handler.startSession(
    'Testing Async/Await',
    'Comparing different AI explanations of async/await'
  );

  console.log(`Started session: ${sessionId}`);

  // Simulate getting responses from orchestrator
  const prompt = "Explain async/await in JavaScript";

  // Handle single response
  const response1 = await handler.handleResponse(
    claudeApiResponse,
    'claude',
    prompt,
    {
      store: true,
      tags: ['javascript', 'async'],
      format: 'terminal'
    }
  );

  console.log(response1.formatted);

  // Handle multiple responses
  const multipleResponses = await handler.handleMultipleResponses(
    [
      { response: claudeResponse, platform: 'claude', prompt },
      { response: gpt4Response, platform: 'gpt4', prompt },
      { response: geminiResponse, platform: 'gemini', prompt }
    ],
    {
      storeIndividual: true,
      storeAggregated: true,
      tags: ['javascript', 'async', 'comparison'],
      format: 'comparison'
    }
  );

  // Display comparison
  console.log('\n' + handler.displayComparisonTable(multipleResponses));

  // Display quality metrics
  console.log('\n' + handler.displayQualityMetrics(multipleResponses));

  // Display unique insights
  console.log('\n' + handler.displayUniqueInsights(multipleResponses));

  // Search for previous responses
  const searchResults = handler.searchResponses('Promise', {
    platform: 'claude',
    limit: 5
  });

  console.log(`\nFound ${searchResults.length} previous responses about Promises`);

  // Get history
  const history = handler.getHistory(prompt, { limit: 5 });
  console.log(`\nFound ${history.length} versions of this prompt`);

  // Export session
  const exportData = handler.exportSession(sessionId, 'markdown');
  require('fs').writeFileSync('session-export.md', exportData);

  // Get statistics
  const stats = handler.getStatistics();
  console.log('\nDatabase Statistics:', stats);

  // Clean up
  handler.close();
}

// Export for use in other modules
module.exports = EnhancedResponseHandler;

// Example orchestrator integration
class OrchesteratorWithResponseHandling {
  constructor() {
    this.responseHandler = new EnhancedResponseHandler();
  }

  async sendToAllModels(prompt, options = {}) {
    // Start session for this multi-model query
    const sessionId = this.responseHandler.startSession(
      `Multi-model query: ${prompt.substring(0, 50)}...`,
      'Parallel query to all AI models'
    );

    // Send to all models (your existing orchestrator logic)
    const responses = await this.getAllModelResponses(prompt);

    // Handle all responses
    const aggregated = await this.responseHandler.handleMultipleResponses(
      responses,
      {
        tags: options.tags || [],
        format: options.format || 'comparison'
      }
    );

    // Return formatted results
    return {
      aggregated,
      comparisonTable: this.responseHandler.displayComparisonTable(aggregated),
      qualityMetrics: this.responseHandler.displayQualityMetrics(aggregated),
      uniqueInsights: this.responseHandler.displayUniqueInsights(aggregated)
    };
  }

  async getAllModelResponses(prompt) {
    // Your existing orchestrator logic to get responses from all models
    // This is just a placeholder
    return [
      { response: {}, platform: 'claude', prompt },
      { response: {}, platform: 'gpt4', prompt },
      { response: {}, platform: 'gemini', prompt }
    ];
  }
}

if (require.main === module) {
  // Run example if executed directly
  example().catch(console.error);
}
