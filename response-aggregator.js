/**
 * Response Aggregator
 * Combines and analyzes responses from multiple AI platforms
 */

const natural = require('natural');
const ResponseProcessor = require('./response-processor');

class ResponseAggregator {
  constructor(options = {}) {
    this.options = {
      minResponsesForAggregation: 2,
      enableThemeExtraction: true,
      enableQualityMetrics: true,
      themeMinFrequency: 2,
      ...options
    };

    this.processor = new ResponseProcessor();
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
  }

  /**
   * Aggregate multiple platform responses
   * @param {Array} responses - Array of parsed responses
   * @returns {Object} Aggregated result
   */
  aggregateResponses(responses) {
    if (!Array.isArray(responses) || responses.length === 0) {
      throw new Error('No responses to aggregate');
    }

    if (responses.length < this.options.minResponsesForAggregation) {
      return {
        summary: responses[0],
        platforms: [responses[0].platform],
        responseCount: 1,
        aggregated: false
      };
    }

    // Deduplicate responses
    const { unique, duplicateGroups, duplicateCount } =
      this.processor.deduplicateResponses(responses);

    // Build consensus
    const consensus = this.processor.buildConsensus(unique);

    // Extract themes
    const themes = this.options.enableThemeExtraction
      ? this.extractCommonThemes(unique)
      : [];

    // Identify differences
    const differences = this.identifyDifferences(unique);

    // Create summary
    const summary = this.createSummaryResponse(unique, consensus);

    // Extract unique insights
    const uniqueInsights = this.extractUniqueInsights(unique);

    // Generate comparison matrix
    const comparisonMatrix = this.generateComparisonMatrix(unique);

    // Calculate quality metrics
    const qualityMetrics = this.options.enableQualityMetrics
      ? this.calculateQualityMetrics(unique)
      : null;

    return {
      summary,
      consensus,
      themes,
      differences,
      uniqueInsights,
      comparisonMatrix,
      qualityMetrics,
      metadata: {
        totalResponses: responses.length,
        uniqueResponses: unique.length,
        duplicateCount,
        platforms: [...new Set(responses.map(r => r.platform))],
        models: [...new Set(responses.map(r => r.model))],
        aggregatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Extract common themes from multiple responses
   * @param {Array} responses - Array of responses
   * @returns {Array} Common themes with frequency
   */
  extractCommonThemes(responses) {
    if (responses.length < 2) return [];

    // Build TF-IDF corpus
    responses.forEach(response => {
      this.tfidf.addDocument(response.text);
    });

    // Extract top terms from each document
    const allTerms = new Map();

    responses.forEach((response, idx) => {
      const topTerms = this.tfidf.listTerms(idx)
        .slice(0, 20) // Top 20 terms per document
        .map(item => item.term);

      topTerms.forEach(term => {
        if (!allTerms.has(term)) {
          allTerms.set(term, {
            term,
            count: 0,
            documentIndices: []
          });
        }
        const termData = allTerms.get(term);
        termData.count++;
        termData.documentIndices.push(idx);
      });
    });

    // Filter for common terms (appear in multiple documents)
    const commonThemes = Array.from(allTerms.values())
      .filter(item => item.count >= this.options.themeMinFrequency)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 themes

    // Extract phrase contexts for each theme
    return commonThemes.map(theme => ({
      term: theme.term,
      frequency: theme.count,
      coverage: theme.count / responses.length,
      contexts: this._extractContexts(theme.term, responses, theme.documentIndices),
      platforms: theme.documentIndices.map(idx => responses[idx].platform)
    }));
  }

  /**
   * Extract contexts where a term appears
   */
  _extractContexts(term, responses, documentIndices) {
    const contexts = [];
    const regex = new RegExp(`\\b${term}\\b`, 'gi');

    documentIndices.forEach(idx => {
      const text = responses[idx].text;
      let match;
      let count = 0;

      while ((match = regex.exec(text)) !== null && count < 2) {
        const start = Math.max(0, match.index - 50);
        const end = Math.min(text.length, match.index + term.length + 50);
        contexts.push({
          platform: responses[idx].platform,
          snippet: '...' + text.substring(start, end) + '...',
          position: match.index
        });
        count++;
      }
    });

    return contexts;
  }

  /**
   * Identify key differences between responses
   * @param {Array} responses - Array of responses
   * @returns {Array} Identified differences
   */
  identifyDifferences(responses) {
    if (responses.length < 2) return [];

    const differences = [];

    // Compare responses pairwise
    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        const diff = this._compareResponses(responses[i], responses[j]);
        if (diff.hasMajorDifference) {
          differences.push(diff);
        }
      }
    }

    // Categorize differences
    const categorized = this._categorizeDifferences(differences);

    return categorized;
  }

  /**
   * Compare two responses
   */
  _compareResponses(response1, response2) {
    const text1 = response1.text.toLowerCase();
    const text2 = response2.text.toLowerCase();

    // Extract code blocks
    const code1 = this.processor.extractCodeBlocks(response1.text);
    const code2 = this.processor.extractCodeBlocks(response2.text);

    // Check for code differences
    const hasDifferentCode = code1.length !== code2.length ||
      code1.some((c1, idx) => !code2[idx] || c1.code !== code2[idx].code);

    // Check for structural differences
    const hasHeadings1 = /^#{1,6}\s+/m.test(response1.text);
    const hasHeadings2 = /^#{1,6}\s+/m.test(response2.text);

    // Check for length differences
    const lengthRatio = Math.max(text1.length, text2.length) /
                        Math.min(text1.length, text2.length);
    const hasLengthDifference = lengthRatio > 1.5;

    // Check for unique terms
    const terms1 = new Set(this.tokenizer.tokenize(text1));
    const terms2 = new Set(this.tokenizer.tokenize(text2));

    const uniqueTo1 = [...terms1].filter(t => !terms2.has(t));
    const uniqueTo2 = [...terms2].filter(t => !terms1.has(t));

    const hasMajorDifference = hasDifferentCode ||
                               hasLengthDifference ||
                               uniqueTo1.length > 20 ||
                               uniqueTo2.length > 20;

    return {
      platforms: [response1.platform, response2.platform],
      hasMajorDifference,
      differences: {
        code: hasDifferentCode,
        structure: hasHeadings1 !== hasHeadings2,
        length: hasLengthDifference,
        uniqueTerms: {
          [response1.platform]: uniqueTo1.slice(0, 10),
          [response2.platform]: uniqueTo2.slice(0, 10)
        }
      },
      similarity: this.processor.calculateSimilarity(response1.text, response2.text)
    };
  }

  /**
   * Categorize differences
   */
  _categorizeDifferences(differences) {
    const categories = {
      structural: [],
      content: [],
      code: [],
      length: []
    };

    differences.forEach(diff => {
      if (diff.differences.structure) {
        categories.structural.push(diff);
      }
      if (diff.differences.code) {
        categories.code.push(diff);
      }
      if (diff.differences.length) {
        categories.length.push(diff);
      }
      if (diff.similarity < 0.7) {
        categories.content.push(diff);
      }
    });

    return categories;
  }

  /**
   * Create summary response combining all responses
   * @param {Array} responses - Array of responses
   * @param {Object} consensus - Consensus data
   * @returns {Object} Summary response
   */
  createSummaryResponse(responses, consensus) {
    if (responses.length === 0) return null;

    // Use consensus as base
    const baseText = consensus.consensus.text;

    // Extract all code blocks from all responses
    const allCodeBlocks = [];
    responses.forEach(response => {
      const blocks = this.processor.extractCodeBlocks(response.text);
      blocks.forEach(block => {
        allCodeBlocks.push({
          ...block,
          platform: response.platform
        });
      });
    });

    // Deduplicate code blocks
    const uniqueCodeBlocks = this._deduplicateCodeBlocks(allCodeBlocks);

    // Combine key points
    const keyPoints = this._extractKeyPoints(responses);

    // Build summary
    let summary = `# Aggregated Response Summary\n\n`;
    summary += `*Based on ${responses.length} responses from ${[...new Set(responses.map(r => r.platform))].join(', ')}*\n\n`;

    // Add consensus info
    summary += `## Consensus (${(consensus.agreement * 100).toFixed(1)}% agreement)\n\n`;
    summary += baseText + '\n\n';

    // Add key points if different from consensus
    if (keyPoints.length > 0) {
      summary += `## Key Points Across All Responses\n\n`;
      keyPoints.forEach((point, idx) => {
        summary += `${idx + 1}. ${point.text} *(mentioned by ${point.platforms.join(', ')})*\n`;
      });
      summary += '\n';
    }

    // Add unique code examples if any
    if (uniqueCodeBlocks.length > 0) {
      summary += `## Code Examples\n\n`;
      uniqueCodeBlocks.forEach((block, idx) => {
        summary += `### Example ${idx + 1} (${block.platform})\n\n`;
        summary += `\`\`\`${block.language}\n${block.code}\n\`\`\`\n\n`;
      });
    }

    return {
      text: summary,
      platform: 'aggregated',
      model: 'multiple',
      keyPoints,
      codeBlocks: uniqueCodeBlocks,
      consensus: consensus.agreement,
      sources: responses.map(r => ({
        platform: r.platform,
        model: r.model
      }))
    };
  }

  /**
   * Deduplicate code blocks
   */
  _deduplicateCodeBlocks(codeBlocks) {
    const unique = [];

    codeBlocks.forEach(block => {
      const isDuplicate = unique.some(existing =>
        existing.code.trim() === block.code.trim() &&
        existing.language === block.language
      );

      if (!isDuplicate) {
        unique.push(block);
      }
    });

    return unique;
  }

  /**
   * Extract key points from responses
   */
  _extractKeyPoints(responses) {
    const points = [];

    responses.forEach(response => {
      // Extract sentences that start with bullets or numbers
      const bulletRegex = /^[\*\-\+]\s+(.+)$/gm;
      const numberRegex = /^\d+\.\s+(.+)$/gm;

      let match;
      while ((match = bulletRegex.exec(response.text)) !== null) {
        points.push({
          text: match[1].trim(),
          platform: response.platform,
          type: 'bullet'
        });
      }

      while ((match = numberRegex.exec(response.text)) !== null) {
        points.push({
          text: match[1].trim(),
          platform: response.platform,
          type: 'numbered'
        });
      }
    });

    // Group similar points
    const grouped = [];
    points.forEach(point => {
      const similar = grouped.find(g =>
        this.processor.calculateSimilarity(g.text, point.text) > 0.8
      );

      if (similar) {
        similar.platforms.push(point.platform);
      } else {
        grouped.push({
          text: point.text,
          platforms: [point.platform],
          type: point.type
        });
      }
    });

    // Sort by number of platforms mentioning
    return grouped
      .sort((a, b) => b.platforms.length - a.platforms.length)
      .slice(0, 10);
  }

  /**
   * Extract unique insights from each platform
   * @param {Array} responses - Array of responses
   * @returns {Array} Unique insights per platform
   */
  extractUniqueInsights(responses) {
    if (responses.length < 2) return [];

    const insights = [];

    responses.forEach((response, idx) => {
      const otherResponses = responses.filter((_, i) => i !== idx);
      const uniqueContent = this._findUniqueContent(response, otherResponses);

      if (uniqueContent.length > 0) {
        insights.push({
          platform: response.platform,
          model: response.model,
          insights: uniqueContent
        });
      }
    });

    return insights;
  }

  /**
   * Find content unique to a response
   */
  _findUniqueContent(response, otherResponses) {
    const unique = [];
    const responseText = response.text.toLowerCase();
    const otherTexts = otherResponses.map(r => r.text.toLowerCase());

    // Extract sentences
    const sentences = response.text.split(/[.!?]+/).filter(s => s.trim().length > 20);

    sentences.forEach(sentence => {
      const sentenceLower = sentence.toLowerCase();

      // Check if this sentence or similar content exists in other responses
      const existsInOthers = otherTexts.some(text =>
        text.includes(sentenceLower.substring(0, 30)) ||
        this.processor.calculateSimilarity(sentenceLower, text) > 0.3
      );

      if (!existsInOthers && sentence.trim().length > 30) {
        unique.push({
          text: sentence.trim(),
          type: 'unique_perspective'
        });
      }
    });

    // Extract unique code examples
    const codeBlocks = this.processor.extractCodeBlocks(response.text);
    codeBlocks.forEach(block => {
      const existsInOthers = otherResponses.some(other => {
        const otherBlocks = this.processor.extractCodeBlocks(other.text);
        return otherBlocks.some(ob => ob.code.trim() === block.code.trim());
      });

      if (!existsInOthers) {
        unique.push({
          text: block.code,
          type: 'unique_code',
          language: block.language
        });
      }
    });

    return unique.slice(0, 5); // Top 5 unique insights
  }

  /**
   * Generate comparison matrix
   * @param {Array} responses - Array of responses
   * @returns {Object} Comparison matrix
   */
  generateComparisonMatrix(responses) {
    const matrix = {
      platforms: responses.map(r => r.platform),
      dimensions: {},
      overall: []
    };

    // Compare on various dimensions
    const dimensions = [
      { name: 'length', fn: r => r.text.length },
      { name: 'codeBlocks', fn: r => this.processor.extractCodeBlocks(r.text).length },
      { name: 'hasHeadings', fn: r => /^#{1,6}\s+/m.test(r.text) ? 1 : 0 },
      { name: 'hasLists', fn: r => /^[\*\-\+\d+\.]\s+/m.test(r.text) ? 1 : 0 },
      { name: 'sentenceCount', fn: r => r.text.split(/[.!?]+/).length }
    ];

    dimensions.forEach(dim => {
      matrix.dimensions[dim.name] = responses.map(r => dim.fn(r));
    });

    // Calculate overall scores
    const scored = this.processor.scoreAndRankResponses(responses);
    matrix.overall = scored.map(r => ({
      platform: r.platform,
      score: r.totalScore,
      rank: r.rank,
      scores: r.scores
    }));

    return matrix;
  }

  /**
   * Calculate quality metrics for responses
   * @param {Array} responses - Array of responses
   * @returns {Object} Quality metrics
   */
  calculateQualityMetrics(responses) {
    const metrics = {
      overall: {},
      perPlatform: {},
      summary: {}
    };

    // Score all responses
    const scored = this.processor.scoreAndRankResponses(responses);

    // Overall metrics
    const scores = scored.map(r => r.totalScore);
    metrics.overall = {
      average: scores.reduce((a, b) => a + b, 0) / scores.length,
      min: Math.min(...scores),
      max: Math.max(...scores),
      standardDeviation: this._calculateStdDev(scores)
    };

    // Per-platform metrics
    const platforms = [...new Set(responses.map(r => r.platform))];
    platforms.forEach(platform => {
      const platformResponses = scored.filter(r => r.platform === platform);
      const platformScores = platformResponses.map(r => r.totalScore);

      metrics.perPlatform[platform] = {
        count: platformResponses.length,
        averageScore: platformScores.reduce((a, b) => a + b, 0) / platformScores.length,
        averageRank: platformResponses.reduce((sum, r) => sum + r.rank, 0) / platformResponses.length,
        bestRank: Math.min(...platformResponses.map(r => r.rank)),
        detailedScores: platformResponses[0]?.scores || {}
      };
    });

    // Summary
    const bestPlatform = Object.keys(metrics.perPlatform).reduce((best, platform) => {
      if (!best || metrics.perPlatform[platform].averageScore > metrics.perPlatform[best].averageScore) {
        return platform;
      }
      return best;
    }, null);

    metrics.summary = {
      bestPlatform,
      totalResponses: responses.length,
      uniquePlatforms: platforms.length,
      qualityVariance: metrics.overall.standardDeviation > 0.1 ? 'high' : 'low'
    };

    return metrics;
  }

  /**
   * Calculate standard deviation
   */
  _calculateStdDev(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }
}

module.exports = ResponseAggregator;
