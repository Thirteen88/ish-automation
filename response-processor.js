/**
 * Response Processor
 * Handles response parsing, cleaning, conversion, and deduplication from multiple AI platforms
 */

const { marked } = require('marked');
const TurndownService = require('turndown');
const hljs = require('highlight.js');
const natural = require('natural');

class ResponseProcessor {
  constructor(options = {}) {
    this.options = {
      enableCodeHighlight: true,
      enableDuplicateDetection: true,
      similarityThreshold: 0.85,
      cleanWhitespace: true,
      ...options
    };

    // Initialize markdown parser with custom renderer
    this.markedOptions = {
      highlight: this.options.enableCodeHighlight ? (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (err) {
            console.error('Highlight error:', err);
          }
        }
        return code;
      } : null,
      breaks: true,
      gfm: true
    };

    // Initialize Turndown for HTML to Markdown
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      fence: '```'
    });

    // Initialize tokenizer for text processing
    this.tokenizer = new natural.WordTokenizer();
    this.TfIdf = natural.TfIdf;
  }

  /**
   * Parse response from different AI platforms
   * @param {Object} response - Raw response object
   * @param {string} platform - Platform name (claude, gpt4, gemini, etc.)
   * @returns {Object} Parsed response
   */
  parseResponse(response, platform) {
    const parsers = {
      claude: this._parseClaudeResponse.bind(this),
      gpt4: this._parseGPT4Response.bind(this),
      gemini: this._parseGeminiResponse.bind(this),
      copilot: this._parseCopilotResponse.bind(this),
      perplexity: this._parsePerplexityResponse.bind(this),
      generic: this._parseGenericResponse.bind(this)
    };

    const parser = parsers[platform.toLowerCase()] || parsers.generic;
    return parser(response);
  }

  /**
   * Parse Claude API response
   */
  _parseClaudeResponse(response) {
    try {
      const content = response.content?.[0]?.text || response.completion || response.text || '';
      return {
        platform: 'claude',
        text: content,
        model: response.model || 'unknown',
        tokens: {
          input: response.usage?.input_tokens || 0,
          output: response.usage?.output_tokens || 0
        },
        metadata: {
          stopReason: response.stop_reason,
          id: response.id,
          role: response.role
        },
        raw: response
      };
    } catch (error) {
      throw new Error(`Failed to parse Claude response: ${error.message}`);
    }
  }

  /**
   * Parse GPT-4 API response
   */
  _parseGPT4Response(response) {
    try {
      const content = response.choices?.[0]?.message?.content || response.text || '';
      return {
        platform: 'gpt4',
        text: content,
        model: response.model || 'unknown',
        tokens: {
          input: response.usage?.prompt_tokens || 0,
          output: response.usage?.completion_tokens || 0
        },
        metadata: {
          finishReason: response.choices?.[0]?.finish_reason,
          id: response.id,
          role: response.choices?.[0]?.message?.role
        },
        raw: response
      };
    } catch (error) {
      throw new Error(`Failed to parse GPT-4 response: ${error.message}`);
    }
  }

  /**
   * Parse Gemini API response
   */
  _parseGeminiResponse(response) {
    try {
      const content = response.candidates?.[0]?.content?.parts?.[0]?.text || response.text || '';
      return {
        platform: 'gemini',
        text: content,
        model: response.model || 'unknown',
        tokens: {
          input: response.usageMetadata?.promptTokenCount || 0,
          output: response.usageMetadata?.candidatesTokenCount || 0
        },
        metadata: {
          finishReason: response.candidates?.[0]?.finishReason,
          safetyRatings: response.candidates?.[0]?.safetyRatings
        },
        raw: response
      };
    } catch (error) {
      throw new Error(`Failed to parse Gemini response: ${error.message}`);
    }
  }

  /**
   * Parse Copilot response
   */
  _parseCopilotResponse(response) {
    try {
      const content = response.message || response.text || '';
      return {
        platform: 'copilot',
        text: content,
        model: 'copilot',
        tokens: {
          input: 0,
          output: content.split(/\s+/).length
        },
        metadata: {
          timestamp: response.timestamp || Date.now()
        },
        raw: response
      };
    } catch (error) {
      throw new Error(`Failed to parse Copilot response: ${error.message}`);
    }
  }

  /**
   * Parse Perplexity response
   */
  _parsePerplexityResponse(response) {
    try {
      const content = response.choices?.[0]?.message?.content || response.text || '';
      return {
        platform: 'perplexity',
        text: content,
        model: response.model || 'unknown',
        tokens: {
          input: response.usage?.prompt_tokens || 0,
          output: response.usage?.completion_tokens || 0
        },
        metadata: {
          citations: response.citations || [],
          finishReason: response.choices?.[0]?.finish_reason
        },
        raw: response
      };
    } catch (error) {
      throw new Error(`Failed to parse Perplexity response: ${error.message}`);
    }
  }

  /**
   * Parse generic/unknown platform response
   */
  _parseGenericResponse(response) {
    const text = response.text || response.content || response.message ||
                 JSON.stringify(response);
    return {
      platform: 'generic',
      text,
      model: response.model || 'unknown',
      tokens: {
        input: 0,
        output: text.split(/\s+/).length
      },
      metadata: {},
      raw: response
    };
  }

  /**
   * Clean and normalize text
   * @param {string} text - Raw text
   * @returns {string} Cleaned text
   */
  cleanText(text) {
    if (!text) return '';

    let cleaned = text;

    // Remove excessive whitespace
    if (this.options.cleanWhitespace) {
      cleaned = cleaned.replace(/\r\n/g, '\n'); // Normalize line endings
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
      cleaned = cleaned.replace(/[ \t]{2,}/g, ' '); // Normalize spaces
      cleaned = cleaned.trim();
    }

    // Remove HTML comments
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

    // Remove zero-width characters
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');

    return cleaned;
  }

  /**
   * Convert Markdown to HTML
   * @param {string} markdown - Markdown text
   * @returns {string} HTML
   */
  markdownToHtml(markdown) {
    try {
      return marked(markdown, this.markedOptions);
    } catch (error) {
      throw new Error(`Failed to convert markdown to HTML: ${error.message}`);
    }
  }

  /**
   * Convert HTML to Markdown
   * @param {string} html - HTML text
   * @returns {string} Markdown
   */
  htmlToMarkdown(html) {
    try {
      return this.turndownService.turndown(html);
    } catch (error) {
      throw new Error(`Failed to convert HTML to markdown: ${error.message}`);
    }
  }

  /**
   * Extract code blocks from text
   * @param {string} text - Text containing code blocks
   * @returns {Array} Array of code blocks with metadata
   */
  extractCodeBlocks(text) {
    const codeBlocks = [];
    const fencedRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const inlineRegex = /`([^`]+)`/g;

    // Extract fenced code blocks
    let match;
    while ((match = fencedRegex.exec(text)) !== null) {
      codeBlocks.push({
        type: 'fenced',
        language: match[1] || 'plaintext',
        code: match[2].trim(),
        raw: match[0],
        start: match.index,
        end: match.index + match[0].length
      });
    }

    // Extract inline code
    while ((match = inlineRegex.exec(text)) !== null) {
      // Skip if already captured in fenced block
      const inFencedBlock = codeBlocks.some(
        block => match.index >= block.start && match.index <= block.end
      );
      if (!inFencedBlock) {
        codeBlocks.push({
          type: 'inline',
          language: 'plaintext',
          code: match[1],
          raw: match[0],
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }

    return codeBlocks.sort((a, b) => a.start - b.start);
  }

  /**
   * Apply syntax highlighting to code
   * @param {string} code - Code to highlight
   * @param {string} language - Programming language
   * @returns {string} Highlighted code (HTML)
   */
  highlightCode(code, language = 'plaintext') {
    if (!this.options.enableCodeHighlight) {
      return code;
    }

    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch (error) {
      console.error('Syntax highlighting error:', error);
      return code;
    }
  }

  /**
   * Calculate similarity between two texts
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score (0-1)
   */
  calculateSimilarity(text1, text2) {
    // Use cosine similarity with TF-IDF
    const tfidf = new this.TfIdf();
    tfidf.addDocument(text1);
    tfidf.addDocument(text2);

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    tfidf.listTerms(0).forEach(term => {
      const term1 = term.tfidf;
      const term2 = tfidf.tfidf(term.term, 1);
      dotProduct += term1 * term2;
      magnitude1 += term1 * term1;
      magnitude2 += term2 * term2;
    });

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Deduplicate responses
   * @param {Array} responses - Array of parsed responses
   * @returns {Array} Deduplicated responses
   */
  deduplicateResponses(responses) {
    if (!this.options.enableDuplicateDetection || responses.length < 2) {
      return responses;
    }

    const unique = [];
    const duplicateGroups = [];

    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      let isDuplicate = false;

      for (let j = 0; j < unique.length; j++) {
        const similarity = this.calculateSimilarity(
          response.text,
          unique[j].text
        );

        if (similarity >= this.options.similarityThreshold) {
          isDuplicate = true;
          // Track which responses are duplicates
          if (!duplicateGroups[j]) {
            duplicateGroups[j] = [unique[j]];
          }
          duplicateGroups[j].push(response);
          break;
        }
      }

      if (!isDuplicate) {
        unique.push(response);
      }
    }

    return {
      unique,
      duplicateGroups: duplicateGroups.filter(Boolean),
      duplicateCount: responses.length - unique.length
    };
  }

  /**
   * Merge similar responses
   * @param {Array} responses - Array of similar responses
   * @returns {Object} Merged response
   */
  mergeResponses(responses) {
    if (responses.length === 0) {
      throw new Error('No responses to merge');
    }

    if (responses.length === 1) {
      return responses[0];
    }

    // Find the longest response as base
    const base = responses.reduce((prev, current) =>
      current.text.length > prev.text.length ? current : prev
    );

    // Combine metadata
    const platforms = [...new Set(responses.map(r => r.platform))];
    const models = [...new Set(responses.map(r => r.model))];

    const totalTokens = responses.reduce((sum, r) => ({
      input: sum.input + (r.tokens?.input || 0),
      output: sum.output + (r.tokens?.output || 0)
    }), { input: 0, output: 0 });

    return {
      ...base,
      platforms,
      models,
      tokens: totalTokens,
      mergedFrom: responses.length,
      metadata: {
        ...base.metadata,
        mergedSources: responses.map(r => ({
          platform: r.platform,
          model: r.model
        }))
      }
    };
  }

  /**
   * Build consensus from multiple responses
   * @param {Array} responses - Array of parsed responses
   * @returns {Object} Consensus response with scoring
   */
  buildConsensus(responses) {
    if (responses.length === 0) {
      throw new Error('No responses for consensus building');
    }

    if (responses.length === 1) {
      return {
        consensus: responses[0],
        agreement: 1.0,
        variants: []
      };
    }

    // Calculate pairwise similarities
    const similarities = [];
    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        similarities.push({
          i,
          j,
          score: this.calculateSimilarity(responses[i].text, responses[j].text)
        });
      }
    }

    // Find response with highest average similarity to others
    const avgSimilarities = responses.map((_, idx) => {
      const related = similarities.filter(s => s.i === idx || s.j === idx);
      const avg = related.reduce((sum, s) => sum + s.score, 0) / related.length;
      return { index: idx, score: avg };
    });

    avgSimilarities.sort((a, b) => b.score - a.score);
    const consensusIndex = avgSimilarities[0].index;

    // Calculate agreement score
    const agreementScore = avgSimilarities[0].score;

    // Identify variants (responses that differ significantly)
    const variants = responses.filter((r, idx) => {
      if (idx === consensusIndex) return false;
      const similarity = this.calculateSimilarity(
        r.text,
        responses[consensusIndex].text
      );
      return similarity < 0.7; // Different enough to be considered a variant
    });

    return {
      consensus: responses[consensusIndex],
      agreement: agreementScore,
      variants,
      allSimilarities: similarities,
      responseScores: avgSimilarities
    };
  }

  /**
   * Score and rank responses based on various metrics
   * @param {Array} responses - Array of parsed responses
   * @param {Object} criteria - Scoring criteria
   * @returns {Array} Ranked responses with scores
   */
  scoreAndRankResponses(responses, criteria = {}) {
    const defaultCriteria = {
      length: { weight: 0.2, preferred: 'medium' }, // short, medium, long
      codeQuality: { weight: 0.3 },
      clarity: { weight: 0.25 },
      completeness: { weight: 0.25 }
    };

    const scoringCriteria = { ...defaultCriteria, ...criteria };

    const scored = responses.map(response => {
      const scores = {
        length: this._scoreLengthMetric(response, scoringCriteria.length),
        codeQuality: this._scoreCodeQuality(response),
        clarity: this._scoreClarity(response),
        completeness: this._scoreCompleteness(response)
      };

      // Calculate weighted total
      const totalScore = Object.keys(scores).reduce((sum, key) => {
        const weight = scoringCriteria[key]?.weight || 0;
        return sum + (scores[key] * weight);
      }, 0);

      return {
        ...response,
        scores,
        totalScore,
        rank: 0 // Will be set after sorting
      };
    });

    // Sort by total score and assign ranks
    scored.sort((a, b) => b.totalScore - a.totalScore);
    scored.forEach((response, idx) => {
      response.rank = idx + 1;
    });

    return scored;
  }

  /**
   * Score length metric
   */
  _scoreLengthMetric(response, criteria) {
    const wordCount = response.text.split(/\s+/).length;
    const { preferred = 'medium' } = criteria;

    const ranges = {
      short: { min: 0, max: 200, optimal: 100 },
      medium: { min: 200, max: 800, optimal: 500 },
      long: { min: 800, max: Infinity, optimal: 1500 }
    };

    const range = ranges[preferred];
    if (wordCount < range.min || wordCount > range.max) {
      return 0.5;
    }

    // Score based on distance from optimal
    const distance = Math.abs(wordCount - range.optimal);
    const maxDistance = range.optimal;
    return Math.max(0, 1 - (distance / maxDistance));
  }

  /**
   * Score code quality
   */
  _scoreCodeQuality(response) {
    const codeBlocks = this.extractCodeBlocks(response.text);
    if (codeBlocks.length === 0) return 0.5; // Neutral if no code

    let score = 0;
    codeBlocks.forEach(block => {
      // Has language specified
      if (block.language !== 'plaintext') score += 0.3;

      // Reasonable length
      const lines = block.code.split('\n').length;
      if (lines >= 3 && lines <= 100) score += 0.3;

      // Has comments
      if (block.code.includes('//') || block.code.includes('/*')) score += 0.2;

      // Proper indentation
      const hasIndentation = /^\s{2,}/m.test(block.code);
      if (hasIndentation) score += 0.2;
    });

    return Math.min(1, score / codeBlocks.length);
  }

  /**
   * Score clarity
   */
  _scoreClarity(response) {
    const text = response.text;
    let score = 0.5; // Base score

    // Has headings
    if (/^#{1,6}\s+/m.test(text)) score += 0.15;

    // Has lists
    if (/^[\*\-\+]\s+/m.test(text) || /^\d+\.\s+/m.test(text)) score += 0.15;

    // Reasonable sentence length (not too long)
    const sentences = text.split(/[.!?]+/).filter(Boolean);
    const avgSentenceLength = sentences.reduce((sum, s) =>
      sum + s.split(/\s+/).length, 0) / sentences.length;
    if (avgSentenceLength >= 10 && avgSentenceLength <= 25) score += 0.2;

    return Math.min(1, score);
  }

  /**
   * Score completeness
   */
  _scoreCompleteness(response) {
    const text = response.text;
    let score = 0.5;

    // Has introduction
    const hasIntro = text.split('\n\n')[0].length > 50;
    if (hasIntro) score += 0.15;

    // Has conclusion
    const hasConclusion = text.split('\n\n').slice(-1)[0].length > 50;
    if (hasConclusion) score += 0.15;

    // Has examples
    if (/example|for instance|such as/i.test(text)) score += 0.1;

    // Has explanations
    if (/because|therefore|thus|hence/i.test(text)) score += 0.1;

    return Math.min(1, score);
  }
}

module.exports = ResponseProcessor;
