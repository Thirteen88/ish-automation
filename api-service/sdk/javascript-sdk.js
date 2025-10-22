/**
 * ISH AI Orchestrator - JavaScript/Node.js SDK
 * Official client library for JavaScript and Node.js applications
 *
 * @version 1.0.0
 * @author ISH Automation Team
 */

class ISHOrchestratorClient {
  /**
   * Initialize the SDK client
   * @param {Object} config - Configuration object
   * @param {string} config.apiKey - API key for authentication
   * @param {string} config.baseUrl - Base URL of the API (default: http://localhost:3000)
   * @param {number} config.timeout - Request timeout in ms (default: 30000)
   */
  constructor(config = {}) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'http://localhost:3000';
    this.timeout = config.timeout || 30000;
  }

  /**
   * Make HTTP request
   * @private
   */
  async _request(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    options.signal = controller.signal;

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      const result = await response.json();

      if (!response.ok) {
        const error = new Error(result.error?.message || 'Request failed');
        error.code = result.error?.code;
        error.statusCode = response.status;
        error.details = result.error?.details;
        throw error;
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  /**
   * Submit a new query
   * @param {Object} params - Query parameters
   * @param {string} params.query - The query text
   * @param {string} params.platform - Platform to use (claude|gpt|gemini|llama|auto)
   * @param {string} params.model - Specific model (optional)
   * @param {string} params.systemPrompt - System prompt (optional)
   * @param {number} params.temperature - Temperature (0-2, default: 0.7)
   * @param {number} params.maxTokens - Max tokens (default: 2000)
   * @param {boolean} params.stream - Enable streaming (default: false)
   * @param {Object} params.metadata - Additional metadata (optional)
   * @returns {Promise<Object>} Query response with queryId
   */
  async submitQuery(params) {
    return this._request('POST', '/v1/query', params);
  }

  /**
   * Get query results
   * @param {string} queryId - Query ID
   * @returns {Promise<Object>} Query results
   */
  async getQuery(queryId) {
    return this._request('GET', `/v1/query/${queryId}`);
  }

  /**
   * Stream query results using Server-Sent Events
   * @param {string} queryId - Query ID
   * @param {Function} onEvent - Callback for each event (event, data)
   * @returns {Promise<void>}
   */
  async streamQuery(queryId, onEvent) {
    const url = `${this.baseUrl}/v1/query/${queryId}/stream`;

    // For Node.js, you might need to use a library like eventsource
    // For browsers, use native EventSource
    const EventSource = globalThis.EventSource || require('eventsource');
    const eventSource = new EventSource(url, {
      headers: { 'X-API-Key': this.apiKey }
    });

    return new Promise((resolve, reject) => {
      eventSource.addEventListener('status', (e) => {
        onEvent('status', JSON.parse(e.data));
      });

      eventSource.addEventListener('result', (e) => {
        onEvent('result', JSON.parse(e.data));
      });

      eventSource.addEventListener('done', (e) => {
        onEvent('done', JSON.parse(e.data));
        eventSource.close();
        resolve();
      });

      eventSource.addEventListener('error', (e) => {
        const data = e.data ? JSON.parse(e.data) : { message: 'Stream error' };
        onEvent('error', data);
        eventSource.close();
        reject(new Error(data.message));
      });

      eventSource.onerror = (error) => {
        eventSource.close();
        reject(error);
      };
    });
  }

  /**
   * Submit query and wait for completion
   * @param {Object} params - Query parameters (same as submitQuery)
   * @param {number} pollInterval - Polling interval in ms (default: 1000)
   * @returns {Promise<Object>} Completed query result
   */
  async query(params, pollInterval = 1000) {
    const { data } = await this.submitQuery(params);
    const queryId = data.queryId;

    // Poll for completion
    while (true) {
      const result = await this.getQuery(queryId);

      if (result.data.status === 'completed') {
        return result;
      }

      if (result.data.status === 'failed') {
        throw new Error(result.data.error?.message || 'Query failed');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // ============================================================================
  // PLATFORM METHODS
  // ============================================================================

  /**
   * List all available platforms
   * @returns {Promise<Object>} List of platforms
   */
  async listPlatforms() {
    return this._request('GET', '/v1/platforms');
  }

  /**
   * Get platform details
   * @param {string} platformName - Platform name
   * @returns {Promise<Object>} Platform details
   */
  async getPlatform(platformName) {
    return this._request('GET', `/v1/platforms/${platformName}`);
  }

  /**
   * Get platform health status
   * @param {string} platformName - Platform name
   * @returns {Promise<Object>} Platform health status
   */
  async getPlatformStatus(platformName) {
    return this._request('GET', `/v1/platforms/${platformName}/status`);
  }

  /**
   * List platform models
   * @param {string} platformName - Platform name
   * @returns {Promise<Object>} Platform models
   */
  async getPlatformModels(platformName) {
    return this._request('GET', `/v1/platforms/${platformName}/models`);
  }

  // ============================================================================
  // BATCH METHODS
  // ============================================================================

  /**
   * Submit batch queries
   * @param {Array<Object>} queries - Array of query objects
   * @returns {Promise<Object>} Batch response with batchId
   */
  async submitBatch(queries) {
    return this._request('POST', '/v1/batch', { queries });
  }

  /**
   * Get batch results
   * @param {string} batchId - Batch ID
   * @returns {Promise<Object>} Batch results
   */
  async getBatch(batchId) {
    return this._request('GET', `/v1/batch/${batchId}`);
  }

  /**
   * Cancel batch processing
   * @param {string} batchId - Batch ID
   * @returns {Promise<Object>} Cancellation confirmation
   */
  async cancelBatch(batchId) {
    return this._request('POST', `/v1/batch/${batchId}/cancel`);
  }

  /**
   * Submit batch and wait for completion
   * @param {Array<Object>} queries - Array of query objects
   * @param {number} pollInterval - Polling interval in ms (default: 2000)
   * @returns {Promise<Object>} Completed batch results
   */
  async batch(queries, pollInterval = 2000) {
    const { data } = await this.submitBatch(queries);
    const batchId = data.batchId;

    while (true) {
      const result = await this.getBatch(batchId);

      if (result.data.status === 'completed' || result.data.status === 'cancelled') {
        return result;
      }

      if (result.data.status === 'failed') {
        throw new Error(result.data.error?.message || 'Batch failed');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // ============================================================================
  // COMPARE METHODS
  // ============================================================================

  /**
   * Compare responses across platforms
   * @param {string} query - Query text
   * @param {Array<string>} platforms - Array of platform names
   * @param {string} systemPrompt - System prompt (optional)
   * @returns {Promise<Object>} Comparison response with comparisonId
   */
  async submitCompare(query, platforms, systemPrompt = null) {
    const params = { query, platforms };
    if (systemPrompt) params.systemPrompt = systemPrompt;
    return this._request('POST', '/v1/compare', params);
  }

  /**
   * Get comparison results
   * @param {string} comparisonId - Comparison ID
   * @returns {Promise<Object>} Comparison results
   */
  async getCompare(comparisonId) {
    return this._request('GET', `/v1/compare/${comparisonId}`);
  }

  /**
   * Compare platforms and wait for completion
   * @param {string} query - Query text
   * @param {Array<string>} platforms - Array of platform names
   * @param {string} systemPrompt - System prompt (optional)
   * @param {number} pollInterval - Polling interval in ms (default: 2000)
   * @returns {Promise<Object>} Completed comparison results
   */
  async compare(query, platforms, systemPrompt = null, pollInterval = 2000) {
    const { data } = await this.submitCompare(query, platforms, systemPrompt);
    const comparisonId = data.comparisonId;

    while (true) {
      const result = await this.getCompare(comparisonId);

      if (result.data.status === 'completed') {
        return result;
      }

      if (result.data.status === 'failed') {
        throw new Error(result.data.error?.message || 'Comparison failed');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // ============================================================================
  // STATISTICS METHODS
  // ============================================================================

  /**
   * Get usage statistics
   * @param {Object} params - Query parameters
   * @param {string} params.startDate - Start date (ISO 8601)
   * @param {string} params.endDate - End date (ISO 8601)
   * @param {string} params.groupBy - Group by (hour|day|week|month)
   * @param {string} params.platform - Filter by platform
   * @returns {Promise<Object>} Usage statistics
   */
  async getStats(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this._request('GET', `/v1/stats?${query}`);
  }

  /**
   * Get statistics summary
   * @returns {Promise<Object>} Statistics summary
   */
  async getStatsSummary() {
    return this._request('GET', '/v1/stats/summary');
  }

  /**
   * Get platform usage breakdown
   * @returns {Promise<Object>} Platform statistics
   */
  async getPlatformStats() {
    return this._request('GET', '/v1/stats/platforms');
  }

  /**
   * Export analytics data as CSV
   * @returns {Promise<string>} CSV data
   */
  async exportStats() {
    const url = `${this.baseUrl}/v1/stats/export`;
    const response = await fetch(url, {
      headers: { 'X-API-Key': this.apiKey }
    });

    if (!response.ok) {
      throw new Error('Export failed');
    }

    return response.text();
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Check API health
   * @returns {Promise<Object>} Health status
   */
  async health() {
    return this._request('GET', '/health');
  }
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example 1: Simple Query
 */
async function example1() {
  const client = new ISHOrchestratorClient({
    apiKey: 'your-api-key',
    baseUrl: 'http://localhost:3000'
  });

  const result = await client.query({
    query: 'Explain quantum computing',
    platform: 'auto'
  });

  console.log(result.data.result.response);
}

/**
 * Example 2: Batch Processing
 */
async function example2() {
  const client = new ISHOrchestratorClient({
    apiKey: 'your-api-key'
  });

  const queries = [
    { id: 'q1', query: 'What is AI?', platform: 'claude' },
    { id: 'q2', query: 'Explain machine learning', platform: 'gpt' },
    { id: 'q3', query: 'What is neural network?', platform: 'gemini' }
  ];

  const result = await client.batch(queries);
  result.data.queries.forEach(q => {
    console.log(`${q.id}: ${q.result?.response}`);
  });
}

/**
 * Example 3: Platform Comparison
 */
async function example3() {
  const client = new ISHOrchestratorClient({
    apiKey: 'your-api-key'
  });

  const result = await client.compare(
    'Write a haiku about programming',
    ['claude', 'gpt', 'gemini']
  );

  result.data.results.forEach(r => {
    console.log(`\n${r.platform}:\n${r.result?.response}`);
  });

  console.log('\nRecommendations:', result.data.summary.recommendations);
}

/**
 * Example 4: Streaming
 */
async function example4() {
  const client = new ISHOrchestratorClient({
    apiKey: 'your-api-key'
  });

  const { data } = await client.submitQuery({
    query: 'Tell me a story',
    platform: 'claude',
    stream: true
  });

  await client.streamQuery(data.queryId, (event, data) => {
    console.log(`Event: ${event}`, data);
  });
}

// Export for CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ISHOrchestratorClient;
}

if (typeof window !== 'undefined') {
  window.ISHOrchestratorClient = ISHOrchestratorClient;
}
