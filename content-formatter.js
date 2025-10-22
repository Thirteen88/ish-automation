/**
 * Content Formatter
 * Formats responses for different output types with styling and templating
 */

const { marked } = require('marked');
const { markedTerminal } = require('marked-terminal');
const hljs = require('highlight.js');

// Simple chalk replacement for compatibility
const chalk = {
  cyan: { bold: (s) => `\x1b[1m\x1b[36m${s}\x1b[0m` },
  yellow: { bold: (s) => `\x1b[1m\x1b[33m${s}\x1b[0m` },
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  gray: {
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    _: (s) => `\x1b[90m${s}\x1b[0m`
  },
  white: (s) => `\x1b[37m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  blue: { underline: (s) => `\x1b[4m\x1b[34m${s}\x1b[0m` },
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  italic: (s) => `\x1b[3m${s}\x1b[0m`
};
// Add function calls for gray
chalk.gray = (s) => `\x1b[90m${s}\x1b[0m`;
chalk.gray.dim = (s) => `\x1b[2m${s}\x1b[0m`;

class ContentFormatter {
  constructor(options = {}) {
    this.options = {
      defaultTheme: 'terminal',
      enableColors: true,
      tableStyle: 'github',
      codeTheme: 'monokai',
      ...options
    };

    // Configure marked for terminal output
    marked.use(markedTerminal());

    this.themes = {
      terminal: this._getTerminalTheme(),
      web: this._getWebTheme(),
      plain: this._getPlainTheme()
    };
  }

  /**
   * Format response for specified output type
   * @param {Object} response - Response object
   * @param {string} outputType - Output type (terminal, web, json, markdown)
   * @param {Object} options - Formatting options
   * @returns {string} Formatted output
   */
  format(response, outputType = 'terminal', options = {}) {
    const formatters = {
      terminal: this.formatForTerminal.bind(this),
      web: this.formatForWeb.bind(this),
      json: this.formatForJSON.bind(this),
      markdown: this.formatForMarkdown.bind(this),
      html: this.formatForHTML.bind(this),
      plain: this.formatForPlain.bind(this)
    };

    const formatter = formatters[outputType.toLowerCase()] || formatters.terminal;
    return formatter(response, options);
  }

  /**
   * Format for terminal output with colors
   */
  formatForTerminal(response, options = {}) {
    const { showMetadata = true, compact = false } = options;

    let output = '';

    // Header
    if (showMetadata) {
      output += chalk.cyan.bold(`\n${'='.repeat(80)}\n`);
      output += chalk.yellow.bold(`Platform: `) + chalk.white(response.platform || 'unknown') + '\n';
      if (response.model) {
        output += chalk.yellow.bold(`Model: `) + chalk.white(response.model) + '\n';
      }
      if (response.tokens) {
        output += chalk.yellow.bold(`Tokens: `) +
                 chalk.white(`${response.tokens.input} in / ${response.tokens.output} out`) + '\n';
      }
      output += chalk.cyan.bold(`${'='.repeat(80)}\n\n`);
    }

    // Content
    const text = response.text || response.summary?.text || '';

    if (compact) {
      output += this._formatPlainText(text);
    } else {
      output += this._formatMarkdownForTerminal(text);
    }

    // Footer
    if (showMetadata && response.metadata) {
      output += '\n' + chalk.gray.dim(`\n${'─'.repeat(80)}\n`);
      output += chalk.gray(`Generated: ${new Date().toLocaleString()}\n`);
    }

    return output;
  }

  /**
   * Format markdown for terminal with syntax highlighting
   */
  _formatMarkdownForTerminal(markdown) {
    try {
      // Use marked-terminal for rich terminal output
      return marked(markdown);
    } catch (error) {
      console.error('Terminal formatting error:', error);
      return markdown;
    }
  }

  /**
   * Format for web/HTML output
   */
  formatForWeb(response, options = {}) {
    const { includeStyles = true, theme = 'github' } = options;

    let html = '';

    if (includeStyles) {
      html += this._getWebStyles(theme);
    }

    html += '<div class="response-container">\n';

    // Metadata header
    if (response.platform) {
      html += `  <div class="response-header">\n`;
      html += `    <span class="platform-badge">${this._escapeHtml(response.platform)}</span>\n`;
      if (response.model) {
        html += `    <span class="model-badge">${this._escapeHtml(response.model)}</span>\n`;
      }
      html += `  </div>\n`;
    }

    // Content
    const text = response.text || response.summary?.text || '';
    html += `  <div class="response-content">\n`;
    html += this._markdownToHtmlWithHighlight(text);
    html += `  </div>\n`;

    // Metadata footer
    if (response.tokens) {
      html += `  <div class="response-footer">\n`;
      html += `    <small>Tokens: ${response.tokens.input} in / ${response.tokens.output} out</small>\n`;
      html += `  </div>\n`;
    }

    html += '</div>\n';

    return html;
  }

  /**
   * Format for JSON output
   */
  formatForJSON(response, options = {}) {
    const { pretty = true, includeRaw = false } = options;

    const output = {
      platform: response.platform,
      model: response.model,
      text: response.text,
      tokens: response.tokens,
      metadata: response.metadata
    };

    if (includeRaw) {
      output.raw = response.raw;
    }

    if (response.scores) {
      output.scores = response.scores;
    }

    if (response.summary) {
      output.summary = response.summary;
    }

    return JSON.stringify(output, null, pretty ? 2 : 0);
  }

  /**
   * Format for Markdown output
   */
  formatForMarkdown(response, options = {}) {
    const { includeMetadata = true } = options;

    let markdown = '';

    if (includeMetadata) {
      markdown += `---\n`;
      markdown += `platform: ${response.platform}\n`;
      markdown += `model: ${response.model || 'unknown'}\n`;
      if (response.tokens) {
        markdown += `tokens_input: ${response.tokens.input}\n`;
        markdown += `tokens_output: ${response.tokens.output}\n`;
      }
      markdown += `generated: ${new Date().toISOString()}\n`;
      markdown += `---\n\n`;
    }

    markdown += response.text || response.summary?.text || '';

    return markdown;
  }

  /**
   * Format for HTML output
   */
  formatForHTML(response, options = {}) {
    const { standalone = false, includeStyles = true } = options;

    let html = '';

    if (standalone) {
      html += '<!DOCTYPE html>\n';
      html += '<html lang="en">\n';
      html += '<head>\n';
      html += '  <meta charset="UTF-8">\n';
      html += '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
      html += '  <title>AI Response</title>\n';
      if (includeStyles) {
        html += this._getWebStyles('github');
      }
      html += '</head>\n';
      html += '<body>\n';
    }

    html += this.formatForWeb(response, { ...options, includeStyles: false });

    if (standalone) {
      html += '</body>\n';
      html += '</html>\n';
    }

    return html;
  }

  /**
   * Format for plain text output
   */
  formatForPlain(response, options = {}) {
    const { includeMetadata = true, stripMarkdown = true } = options;

    let output = '';

    if (includeMetadata) {
      output += `Platform: ${response.platform}\n`;
      output += `Model: ${response.model || 'unknown'}\n`;
      if (response.tokens) {
        output += `Tokens: ${response.tokens.input} in / ${response.tokens.output} out\n`;
      }
      output += '\n' + '='.repeat(80) + '\n\n';
    }

    const text = response.text || response.summary?.text || '';
    output += stripMarkdown ? this._stripMarkdown(text) : text;

    return output;
  }

  /**
   * Highlight code with syntax highlighting
   * @param {string} code - Code to highlight
   * @param {string} language - Programming language
   * @param {string} format - Output format (html, terminal)
   * @returns {string} Highlighted code
   */
  highlightCode(code, language = 'javascript', format = 'html') {
    if (format === 'terminal') {
      return this._highlightForTerminal(code, language);
    } else {
      return this._highlightForWeb(code, language);
    }
  }

  /**
   * Highlight code for terminal
   */
  _highlightForTerminal(code, language) {
    try {
      const highlighted = hljs.highlight(code, { language }).value;
      // Convert HTML to terminal colors
      return this._htmlToTerminalColors(highlighted);
    } catch (error) {
      return code;
    }
  }

  /**
   * Highlight code for web
   */
  _highlightForWeb(code, language) {
    try {
      return hljs.highlight(code, { language }).value;
    } catch (error) {
      return this._escapeHtml(code);
    }
  }

  /**
   * Generate table
   * @param {Array} headers - Table headers
   * @param {Array} rows - Table rows
   * @param {string} format - Output format (terminal, markdown, html)
   * @returns {string} Formatted table
   */
  generateTable(headers, rows, format = 'terminal') {
    const generators = {
      terminal: this._generateTerminalTable.bind(this),
      markdown: this._generateMarkdownTable.bind(this),
      html: this._generateHTMLTable.bind(this)
    };

    const generator = generators[format] || generators.terminal;
    return generator(headers, rows);
  }

  /**
   * Generate terminal table
   */
  _generateTerminalTable(headers, rows) {
    // Calculate column widths
    const widths = headers.map((header, idx) => {
      const headerWidth = header.length;
      const maxRowWidth = Math.max(...rows.map(row =>
        String(row[idx] || '').length
      ));
      return Math.max(headerWidth, maxRowWidth);
    });

    // Build table
    let table = '';

    // Top border
    table += '┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐\n';

    // Headers
    table += '│ ' + headers.map((header, idx) =>
      chalk.bold(header.padEnd(widths[idx]))
    ).join(' │ ') + ' │\n';

    // Header separator
    table += '├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤\n';

    // Rows
    rows.forEach(row => {
      table += '│ ' + row.map((cell, idx) =>
        String(cell || '').padEnd(widths[idx])
      ).join(' │ ') + ' │\n';
    });

    // Bottom border
    table += '└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘\n';

    return table;
  }

  /**
   * Generate Markdown table
   */
  _generateMarkdownTable(headers, rows) {
    let table = '';

    // Headers
    table += '| ' + headers.join(' | ') + ' |\n';

    // Separator
    table += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    // Rows
    rows.forEach(row => {
      table += '| ' + row.join(' | ') + ' |\n';
    });

    return table;
  }

  /**
   * Generate HTML table
   */
  _generateHTMLTable(headers, rows) {
    let table = '<table class="response-table">\n';

    // Headers
    table += '  <thead>\n    <tr>\n';
    headers.forEach(header => {
      table += `      <th>${this._escapeHtml(header)}</th>\n`;
    });
    table += '    </tr>\n  </thead>\n';

    // Body
    table += '  <tbody>\n';
    rows.forEach(row => {
      table += '    <tr>\n';
      row.forEach(cell => {
        table += `      <td>${this._escapeHtml(String(cell || ''))}</td>\n`;
      });
      table += '    </tr>\n';
    });
    table += '  </tbody>\n';

    table += '</table>\n';

    return table;
  }

  /**
   * Embed image/media
   * @param {string} url - Media URL
   * @param {string} format - Output format
   * @param {Object} options - Embedding options
   * @returns {string} Embedded media markup
   */
  embedMedia(url, format = 'html', options = {}) {
    const { alt = 'Image', width, height, caption } = options;

    if (format === 'html') {
      let html = '<figure class="media-embed">\n';
      html += `  <img src="${this._escapeHtml(url)}" alt="${this._escapeHtml(alt)}"`;
      if (width) html += ` width="${width}"`;
      if (height) html += ` height="${height}"`;
      html += ' />\n';
      if (caption) {
        html += `  <figcaption>${this._escapeHtml(caption)}</figcaption>\n`;
      }
      html += '</figure>\n';
      return html;
    } else if (format === 'markdown') {
      let md = `![${alt}](${url})`;
      if (caption) {
        md += `\n*${caption}*`;
      }
      return md;
    } else {
      return url;
    }
  }

  /**
   * Format citations
   * @param {Array} citations - Array of citations
   * @param {string} format - Output format
   * @returns {string} Formatted citations
   */
  formatCitations(citations, format = 'markdown') {
    if (!citations || citations.length === 0) {
      return '';
    }

    if (format === 'markdown') {
      let output = '\n## References\n\n';
      citations.forEach((citation, idx) => {
        output += `${idx + 1}. ${citation.title || 'Untitled'}\n`;
        if (citation.url) {
          output += `   ${citation.url}\n`;
        }
        if (citation.author) {
          output += `   by ${citation.author}\n`;
        }
        output += '\n';
      });
      return output;
    } else if (format === 'html') {
      let html = '<div class="citations">\n';
      html += '  <h2>References</h2>\n';
      html += '  <ol>\n';
      citations.forEach(citation => {
        html += '    <li>\n';
        if (citation.url) {
          html += `      <a href="${this._escapeHtml(citation.url)}">${this._escapeHtml(citation.title || 'Untitled')}</a>\n`;
        } else {
          html += `      ${this._escapeHtml(citation.title || 'Untitled')}\n`;
        }
        if (citation.author) {
          html += `      <br><small>by ${this._escapeHtml(citation.author)}</small>\n`;
        }
        html += '    </li>\n';
      });
      html += '  </ol>\n';
      html += '</div>\n';
      return html;
    }

    return '';
  }

  /**
   * Apply template to response
   * @param {string} templateName - Template name
   * @param {Object} response - Response object
   * @param {Object} data - Additional template data
   * @returns {string} Templated output
   */
  applyTemplate(templateName, response, data = {}) {
    const templates = {
      comparison: this._comparisonTemplate.bind(this),
      summary: this._summaryTemplate.bind(this),
      detailed: this._detailedTemplate.bind(this),
      minimal: this._minimalTemplate.bind(this)
    };

    const template = templates[templateName] || templates.summary;
    return template(response, data);
  }

  /**
   * Comparison template
   */
  _comparisonTemplate(response, data) {
    const { responses = [], comparisonMatrix } = data;

    let output = '# Response Comparison\n\n';

    // Summary table
    if (comparisonMatrix) {
      const headers = ['Platform', 'Score', 'Rank', 'Length', 'Code Blocks'];
      const rows = comparisonMatrix.overall.map(item => {
        const platform = item.platform;
        const idx = comparisonMatrix.platforms.indexOf(platform);
        return [
          platform,
          item.score.toFixed(3),
          item.rank,
          comparisonMatrix.dimensions.length[idx],
          comparisonMatrix.dimensions.codeBlocks[idx]
        ];
      });
      output += this.generateTable(headers, rows, 'markdown');
      output += '\n';
    }

    // Individual responses
    responses.forEach((resp, idx) => {
      output += `## Response ${idx + 1}: ${resp.platform}\n\n`;
      output += resp.text + '\n\n';
    });

    return output;
  }

  /**
   * Summary template
   */
  _summaryTemplate(response, data) {
    let output = '# Summary\n\n';

    if (response.platforms) {
      output += `**Sources:** ${response.platforms.join(', ')}\n\n`;
    }

    if (response.consensus !== undefined) {
      output += `**Consensus:** ${(response.consensus * 100).toFixed(1)}%\n\n`;
    }

    output += response.text || '';

    if (response.keyPoints && response.keyPoints.length > 0) {
      output += '\n\n## Key Takeaways\n\n';
      response.keyPoints.forEach((point, idx) => {
        output += `${idx + 1}. ${point.text}\n`;
      });
    }

    return output;
  }

  /**
   * Detailed template
   */
  _detailedTemplate(response, data) {
    let output = this.formatForMarkdown(response, { includeMetadata: true });

    if (data.analysis) {
      output += '\n\n## Analysis\n\n';
      output += JSON.stringify(data.analysis, null, 2);
    }

    return output;
  }

  /**
   * Minimal template
   */
  _minimalTemplate(response, data) {
    return response.text || '';
  }

  // Helper methods

  _getTerminalTheme() {
    return {
      heading: (s) => chalk.cyan.bold(s),
      strong: (s) => chalk.bold(s),
      em: (s) => chalk.italic(s),
      code: (s) => `\x1b[33m${s}\x1b[0m`,
      link: (s) => chalk.blue.underline(s)
    };
  }

  _getWebTheme() {
    return {
      primaryColor: '#2563eb',
      secondaryColor: '#64748b',
      backgroundColor: '#ffffff',
      codeBackground: '#f8f9fa'
    };
  }

  _getPlainTheme() {
    return {};
  }

  _getWebStyles(theme) {
    return `
<style>
  .response-container {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    line-height: 1.6;
  }
  .response-header {
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 2px solid #e5e7eb;
  }
  .platform-badge, .model-badge {
    display: inline-block;
    padding: 4px 12px;
    margin-right: 8px;
    background: #2563eb;
    color: white;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
  }
  .model-badge {
    background: #64748b;
  }
  .response-content {
    margin: 20px 0;
  }
  .response-content pre {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    border: 1px solid #e5e7eb;
  }
  .response-content code {
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
    font-size: 0.875em;
  }
  .response-content pre code {
    background: none;
    padding: 0;
  }
  .response-footer {
    margin-top: 20px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    color: #64748b;
    font-size: 0.875rem;
  }
  .response-table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
  }
  .response-table th,
  .response-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
  }
  .response-table th {
    background: #f8f9fa;
    font-weight: 600;
    color: #1e293b;
  }
  .media-embed {
    margin: 20px 0;
  }
  .media-embed img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }
  .media-embed figcaption {
    margin-top: 8px;
    color: #64748b;
    font-size: 0.875rem;
    text-align: center;
  }
  .citations {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 2px solid #e5e7eb;
  }
  .citations h2 {
    color: #1e293b;
    margin-bottom: 16px;
  }
  .citations ol {
    padding-left: 20px;
  }
  .citations li {
    margin-bottom: 12px;
  }
  .citations a {
    color: #2563eb;
    text-decoration: none;
  }
  .citations a:hover {
    text-decoration: underline;
  }
</style>
`;
  }

  _markdownToHtmlWithHighlight(markdown) {
    const html = marked(markdown, {
      highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (err) {
            console.error('Highlight error:', err);
          }
        }
        return code;
      }
    });
    return html;
  }

  _escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  _stripMarkdown(text) {
    return text
      .replace(/^#{1,6}\s+/gm, '') // Remove headings
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic
      .replace(/`([^`]+)`/g, '$1') // Remove inline code
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
      .replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
      .replace(/^\s*\d+\.\s+/gm, ''); // Remove numbered list markers
  }

  _formatPlainText(text) {
    return this._stripMarkdown(text);
  }

  _htmlToTerminalColors(html) {
    // Convert highlight.js HTML to terminal colors
    return html
      .replace(/<span class="hljs-keyword">(.*?)<\/span>/g, chalk.magenta('$1'))
      .replace(/<span class="hljs-string">(.*?)<\/span>/g, chalk.green('$1'))
      .replace(/<span class="hljs-number">(.*?)<\/span>/g, chalk.cyan('$1'))
      .replace(/<span class="hljs-comment">(.*?)<\/span>/g, chalk.gray('$1'))
      .replace(/<span class="hljs-function">(.*?)<\/span>/g, chalk.blue('$1'))
      .replace(/<[^>]+>/g, ''); // Remove remaining tags
  }
}

module.exports = ContentFormatter;
