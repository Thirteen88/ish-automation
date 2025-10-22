/**
 * Response Processing System Demo
 * Demonstrates all features of the response processing and aggregation system
 */

const ResponseProcessor = require('./response-processor');
const ResponseAggregator = require('./response-aggregator');
const ContentFormatter = require('./content-formatter');
const ResponseStorage = require('./response-storage');

// Simple color functions for compatibility
const chalk = {
  cyan: function(s) { return `\x1b[36m${s}\x1b[0m`; },
  yellow: function(s) { return `\x1b[33m${s}\x1b[0m`; },
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  red: { bold: (s) => `\x1b[1m\x1b[31m${s}\x1b[0m` },
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};
chalk.cyan.bold = (s) => `\x1b[1m\x1b[36m${s}\x1b[0m`;
chalk.yellow.bold = (s) => `\x1b[1m\x1b[33m${s}\x1b[0m`;

// Sample responses from different platforms
const sampleResponses = {
  claude: {
    content: [{
      text: `# Understanding Async/Await in JavaScript

Async/await is a powerful feature in modern JavaScript that makes asynchronous code easier to write and read.

## Key Concepts

- **async**: Declares an asynchronous function
- **await**: Pauses execution until a promise resolves
- **Promise-based**: Built on top of Promises

## Example

\`\`\`javascript
async function fetchUserData(userId) {
  try {
    const response = await fetch(\`/api/users/\${userId}\`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
}
\`\`\`

## Benefits

1. **Cleaner code**: More readable than callback hell
2. **Error handling**: Use try/catch blocks
3. **Sequential flow**: Write async code that looks synchronous

Remember to always handle errors properly and be aware of the execution context.`
    }],
    model: 'claude-3-sonnet',
    usage: {
      input_tokens: 50,
      output_tokens: 200
    },
    stop_reason: 'end_turn',
    id: 'msg_123',
    role: 'assistant'
  },

  gpt4: {
    choices: [{
      message: {
        content: `# Async/Await in JavaScript Explained

Async/await is syntactic sugar over JavaScript Promises, making asynchronous programming more intuitive.

## What You Need to Know

**async functions** always return a Promise. When you use **await**, the function pauses until the Promise settles.

### Code Example

\`\`\`javascript
async function getUserData(id) {
  const user = await fetch(\`https://api.example.com/users/\${id}\`);
  const userData = await user.json();
  return userData;
}

// Usage
getUserData(1)
  .then(data => console.log(data))
  .catch(err => console.error(err));
\`\`\`

## Advantages

* Improved readability over Promise chains
* Better error handling with try/catch
* Easier to debug
* More maintainable code

## Common Pitfalls

- Forgetting to use await (returns Promise instead of value)
- Not handling errors properly
- Blocking execution when parallel execution is possible

For parallel execution, use \`Promise.all()\`:

\`\`\`javascript
const [users, posts] = await Promise.all([
  fetchUsers(),
  fetchPosts()
]);
\`\`\``,
        role: 'assistant'
      },
      finish_reason: 'stop'
    }],
    model: 'gpt-4',
    usage: {
      prompt_tokens: 45,
      completion_tokens: 220
    },
    id: 'chatcmpl_abc'
  },

  gemini: {
    candidates: [{
      content: {
        parts: [{
          text: `**Async/Await in JavaScript: A Modern Approach**

Async/await transforms how we handle asynchronous operations in JavaScript.

## Core Principles

1. Every async function returns a Promise
2. Await can only be used inside async functions
3. It makes async code look synchronous

**Simple Example:**

\`\`\`javascript
async function loadData() {
  const data = await fetchFromAPI();
  console.log(data);
}
\`\`\`

## Why Use Async/Await?

- **Readability**: Code flows top to bottom
- **Error Management**: Standard try/catch works
- **Debugging**: Easier to set breakpoints

## Important Notes

⚠️ Always wrap await calls in try/catch blocks
⚠️ Don't await in loops unless sequential execution is required
⚠️ Use Promise.all() for concurrent operations`
        }]
      },
      finishReason: 'STOP',
      safetyRatings: []
    }],
    model: 'gemini-pro',
    usageMetadata: {
      promptTokenCount: 40,
      candidatesTokenCount: 180
    }
  }
};

async function runDemo() {
  console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║  Response Processing & Aggregation System Demo            ║'));
  console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

  // Initialize components
  const processor = new ResponseProcessor({
    enableCodeHighlight: true,
    enableDuplicateDetection: true,
    similarityThreshold: 0.85
  });

  const aggregator = new ResponseAggregator({
    enableThemeExtraction: true,
    enableQualityMetrics: true
  });

  const formatter = new ContentFormatter({
    enableColors: true
  });

  const storage = new ResponseStorage({
    dbPath: './demo-responses.db'
  });

  try {
    // ==========================================
    // 1. RESPONSE PARSING
    // ==========================================
    console.log(chalk.yellow.bold('\n📥 1. PARSING RESPONSES FROM DIFFERENT PLATFORMS\n'));

    const parsedResponses = [
      processor.parseResponse(sampleResponses.claude, 'claude'),
      processor.parseResponse(sampleResponses.gpt4, 'gpt4'),
      processor.parseResponse(sampleResponses.gemini, 'gemini')
    ];

    parsedResponses.forEach(response => {
      console.log(chalk.green(`✓ Parsed ${response.platform} response`));
      console.log(chalk.gray(`  Model: ${response.model}`));
      console.log(chalk.gray(`  Tokens: ${response.tokens.input} in / ${response.tokens.output} out`));
      console.log(chalk.gray(`  Length: ${response.text.length} characters\n`));
    });

    // ==========================================
    // 2. CODE EXTRACTION
    // ==========================================
    console.log(chalk.yellow.bold('\n🔍 2. EXTRACTING CODE BLOCKS\n'));

    parsedResponses.forEach(response => {
      const codeBlocks = processor.extractCodeBlocks(response.text);
      console.log(chalk.green(`✓ Found ${codeBlocks.length} code blocks in ${response.platform} response`));
      codeBlocks.forEach((block, idx) => {
        console.log(chalk.gray(`  Block ${idx + 1}: ${block.language} (${block.type})`));
      });
    });

    // ==========================================
    // 3. RESPONSE SCORING
    // ==========================================
    console.log(chalk.yellow.bold('\n⭐ 3. SCORING AND RANKING RESPONSES\n'));

    const scored = processor.scoreAndRankResponses(parsedResponses);
    scored.forEach(response => {
      console.log(chalk.green(`\nRank #${response.rank}: ${response.platform}`));
      console.log(chalk.gray(`  Total Score: ${(response.totalScore * 100).toFixed(1)}%`));
      console.log(chalk.gray(`  Code Quality: ${(response.scores.codeQuality * 100).toFixed(1)}%`));
      console.log(chalk.gray(`  Clarity: ${(response.scores.clarity * 100).toFixed(1)}%`));
      console.log(chalk.gray(`  Completeness: ${(response.scores.completeness * 100).toFixed(1)}%`));
    });

    // ==========================================
    // 4. CONSENSUS BUILDING
    // ==========================================
    console.log(chalk.yellow.bold('\n🤝 4. BUILDING CONSENSUS\n'));

    const consensus = processor.buildConsensus(parsedResponses);
    console.log(chalk.green(`✓ Consensus built with ${(consensus.agreement * 100).toFixed(1)}% agreement`));
    console.log(chalk.gray(`  Consensus from: ${consensus.consensus.platform}`));
    console.log(chalk.gray(`  Variants found: ${consensus.variants.length}`));

    // ==========================================
    // 5. RESPONSE AGGREGATION
    // ==========================================
    console.log(chalk.yellow.bold('\n📊 5. AGGREGATING RESPONSES\n'));

    const aggregated = aggregator.aggregateResponses(parsedResponses);
    console.log(chalk.green('✓ Responses aggregated successfully'));
    console.log(chalk.gray(`  Total responses: ${aggregated.metadata.totalResponses}`));
    console.log(chalk.gray(`  Unique responses: ${aggregated.metadata.uniqueResponses}`));
    console.log(chalk.gray(`  Platforms: ${aggregated.metadata.platforms.join(', ')}`));

    // ==========================================
    // 6. THEME EXTRACTION
    // ==========================================
    console.log(chalk.yellow.bold('\n🎯 6. COMMON THEMES EXTRACTION\n'));

    if (aggregated.themes && aggregated.themes.length > 0) {
      console.log(chalk.green(`✓ Found ${aggregated.themes.length} common themes:\n`));
      aggregated.themes.slice(0, 5).forEach((theme, idx) => {
        console.log(`\x1b[36m  ${idx + 1}. "${theme.term}"\x1b[0m`);
        console.log(chalk.gray(`     Frequency: ${theme.frequency}/${parsedResponses.length} responses`));
        console.log(chalk.gray(`     Coverage: ${(theme.coverage * 100).toFixed(1)}%`));
      });
    }

    // ==========================================
    // 7. UNIQUE INSIGHTS
    // ==========================================
    console.log(chalk.yellow.bold('\n💡 7. UNIQUE INSIGHTS PER PLATFORM\n'));

    aggregated.uniqueInsights.forEach(insight => {
      console.log(chalk.green(`\n${insight.platform} (${insight.insights.length} unique points):`));
      insight.insights.slice(0, 2).forEach(point => {
        if (point.type === 'unique_perspective') {
          console.log(chalk.gray(`  • ${point.text.substring(0, 100)}...`));
        }
      });
    });

    // ==========================================
    // 8. COMPARISON MATRIX
    // ==========================================
    console.log(chalk.yellow.bold('\n📈 8. COMPARISON MATRIX\n'));

    const headers = ['Platform', 'Score', 'Rank', 'Length', 'Code Blocks'];
    const rows = aggregated.comparisonMatrix.overall.map((item, idx) => [
      item.platform,
      (item.score * 100).toFixed(1) + '%',
      item.rank,
      aggregated.comparisonMatrix.dimensions.length[idx],
      aggregated.comparisonMatrix.dimensions.codeBlocks[idx]
    ]);

    console.log(formatter.generateTable(headers, rows, 'terminal'));

    // ==========================================
    // 9. QUALITY METRICS
    // ==========================================
    console.log(chalk.yellow.bold('\n📊 9. QUALITY METRICS\n'));

    const metrics = aggregated.qualityMetrics;
    console.log(chalk.green('Overall Metrics:'));
    console.log(chalk.gray(`  Average Score: ${(metrics.overall.average * 100).toFixed(1)}%`));
    console.log(chalk.gray(`  Best Platform: ${metrics.summary.bestPlatform}`));
    console.log(chalk.gray(`  Quality Variance: ${metrics.summary.qualityVariance}`));

    console.log(chalk.green('\nPer-Platform Metrics:'));
    Object.entries(metrics.perPlatform).forEach(([platform, data]) => {
      console.log(`\x1b[36m  ${platform}:\x1b[0m`);
      console.log(chalk.gray(`    Average Score: ${(data.averageScore * 100).toFixed(1)}%`));
      console.log(chalk.gray(`    Best Rank: #${data.bestRank}`));
    });

    // ==========================================
    // 10. FORMATTING OUTPUTS
    // ==========================================
    console.log(chalk.yellow.bold('\n🎨 10. FORMATTING FOR DIFFERENT OUTPUTS\n'));

    // Terminal format
    console.log(chalk.green('✓ Terminal format:'));
    const terminalOutput = formatter.format(parsedResponses[0], 'terminal', { compact: true });
    console.log(terminalOutput.substring(0, 300) + '...\n');

    // JSON format
    console.log(chalk.green('✓ JSON format generated'));
    const jsonOutput = formatter.format(parsedResponses[0], 'json', { pretty: true });
    console.log(chalk.gray(`  Size: ${jsonOutput.length} bytes\n`));

    // Markdown format
    console.log(chalk.green('✓ Markdown format generated'));
    const markdownOutput = formatter.format(parsedResponses[0], 'markdown');
    console.log(chalk.gray(`  Size: ${markdownOutput.length} bytes\n`));

    // HTML format
    console.log(chalk.green('✓ HTML format generated'));
    const htmlOutput = formatter.format(parsedResponses[0], 'html', { standalone: true });
    console.log(chalk.gray(`  Size: ${htmlOutput.length} bytes\n`));

    // ==========================================
    // 11. RESPONSE STORAGE
    // ==========================================
    console.log(chalk.yellow.bold('\n💾 11. STORING RESPONSES\n'));

    const prompt = "Explain async/await in JavaScript";

    // Create a session
    const sessionId = storage.createSession({
      name: 'Async/Await Comparison',
      description: 'Comparing responses about async/await from different AI platforms'
    });
    console.log(chalk.green(`✓ Created session: ${sessionId}\n`));

    // Store all responses
    parsedResponses.forEach(response => {
      const responseId = storage.storeResponse(response, prompt, {
        sessionId,
        tags: ['javascript', 'async', 'tutorial']
      });
      console.log(chalk.green(`✓ Stored ${response.platform} response: ${responseId}`));
    });

    // ==========================================
    // 12. SEARCH FUNCTIONALITY
    // ==========================================
    console.log(chalk.yellow.bold('\n🔎 12. SEARCHING RESPONSES\n'));

    const searchResults = storage.search('Promise', {
      limit: 5
    });
    console.log(chalk.green(`✓ Found ${searchResults.length} responses matching "Promise"`));
    searchResults.forEach(result => {
      console.log(chalk.gray(`  - ${result.platform} (${result.createdAt.toLocaleString()})`));
    });

    // ==========================================
    // 13. RESPONSE HISTORY
    // ==========================================
    console.log(chalk.yellow.bold('\n📜 13. RESPONSE HISTORY\n'));

    const history = storage.getHistory(prompt, { limit: 5 });
    console.log(chalk.green(`✓ Retrieved ${history.length} historical responses for this prompt`));
    history.forEach((response, idx) => {
      console.log(chalk.gray(`  Version ${response.version}: ${response.platform} - ${response.createdAt.toLocaleString()}`));
    });

    // ==========================================
    // 14. STATISTICS
    // ==========================================
    console.log(chalk.yellow.bold('\n📊 14. STORAGE STATISTICS\n'));

    const stats = storage.getStatistics();
    console.log(chalk.green('Database Statistics:'));
    console.log(chalk.gray(`  Total Responses: ${stats.totalResponses}`));
    console.log(chalk.gray(`  Total Sessions: ${stats.totalSessions}`));
    console.log(chalk.gray(`  Total Tags: ${stats.totalTags}`));
    console.log(chalk.gray(`  Total Tokens: ${stats.tokens.total.toLocaleString()}`));
    console.log(chalk.gray(`  Recent Activity (7 days): ${stats.recentActivity}`));

    console.log(chalk.green('\nResponses by Platform:'));
    Object.entries(stats.byPlatform).forEach(([platform, count]) => {
      console.log(chalk.gray(`  ${platform}: ${count}`));
    });

    // ==========================================
    // 15. EXPORT CAPABILITIES
    // ==========================================
    console.log(chalk.yellow.bold('\n📤 15. EXPORT CAPABILITIES\n'));

    // Export as JSON
    const jsonExport = storage.exportResponses({ format: 'json', sessionId });
    console.log(chalk.green('✓ Exported to JSON'));
    console.log(chalk.gray(`  Exported ${jsonExport.count} responses\n`));

    // Export as Markdown
    const markdownExport = storage.exportResponses({ format: 'markdown', sessionId });
    console.log(chalk.green('✓ Exported to Markdown'));
    console.log(chalk.gray(`  Size: ${markdownExport.length} bytes\n`));

    // Export as CSV
    const csvExport = storage.exportResponses({ format: 'csv', sessionId });
    console.log(chalk.green('✓ Exported to CSV'));
    console.log(chalk.gray(`  Lines: ${csvExport.split('\n').length}\n`));

    // ==========================================
    // 16. SUMMARY GENERATION
    // ==========================================
    console.log(chalk.yellow.bold('\n📝 16. SUMMARY GENERATION\n'));

    const summary = aggregated.summary;
    console.log(chalk.green('✓ Generated aggregated summary'));
    console.log(chalk.gray(`  Sources: ${summary.sources.length}`));
    console.log(chalk.gray(`  Key Points: ${summary.keyPoints.length}`));
    console.log(chalk.gray(`  Code Examples: ${summary.codeBlocks.length}`));
    console.log(chalk.gray(`  Consensus: ${(summary.consensus * 100).toFixed(1)}%\n`));

    // Display summary
    console.log(chalk.cyan('Aggregated Summary:\n'));
    console.log(formatter.format(summary, 'terminal', { compact: true, showMetadata: false }));

    // ==========================================
    // SUCCESS
    // ==========================================
    console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║  ✅ Demo completed successfully!                          ║'));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

    console.log(chalk.yellow('Created files:'));
    console.log(chalk.gray('  • response-processor.js'));
    console.log(chalk.gray('  • response-aggregator.js'));
    console.log(chalk.gray('  • content-formatter.js'));
    console.log(chalk.gray('  • response-storage.js'));
    console.log(chalk.gray('  • demo-responses.db\n'));

  } catch (error) {
    console.error(chalk.red.bold('\n❌ Error during demo:'), error.message);
    console.error(chalk.gray(error.stack));
  } finally {
    // Clean up
    storage.close();
  }
}

// Run the demo
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { runDemo };
