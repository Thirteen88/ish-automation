# Response System Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Installation

Already installed! The response processing system is ready to use.

### Quick Test

Run the comprehensive demo:

```bash
node response-system-demo.js
```

This will demonstrate all 16 features of the system.

### Basic Usage

#### 1. Process a Single Response

```javascript
const ResponseProcessor = require('./response-processor');

const processor = new ResponseProcessor();

// Parse a response from Claude
const parsed = processor.parseResponse(claudeResponse, 'claude');

console.log('Platform:', parsed.platform);
console.log('Text:', parsed.text);
console.log('Tokens:', parsed.tokens);
```

#### 2. Store Responses

```javascript
const ResponseStorage = require('./response-storage');

const storage = new ResponseStorage({
  dbPath: './my-responses.db'
});

// Store a response
const id = storage.storeResponse(parsed, "Your prompt here", {
  tags: ['javascript', 'async']
});

// Search later
const results = storage.search('async');
console.log(`Found ${results.length} responses`);
```

#### 3. Aggregate Multiple Responses

```javascript
const ResponseAggregator = require('./response-aggregator');

const aggregator = new ResponseAggregator();

// Parse responses from different platforms
const responses = [
  processor.parseResponse(claudeResponse, 'claude'),
  processor.parseResponse(gpt4Response, 'gpt4'),
  processor.parseResponse(geminiResponse, 'gemini')
];

// Aggregate them
const result = aggregator.aggregateResponses(responses);

console.log('Consensus:', result.consensus);
console.log('Common Themes:', result.themes);
console.log('Quality Metrics:', result.qualityMetrics);
```

#### 4. Format Output

```javascript
const ContentFormatter = require('./content-formatter');

const formatter = new ContentFormatter();

// Format for terminal
console.log(formatter.format(parsed, 'terminal'));

// Format as JSON
const json = formatter.format(parsed, 'json', { pretty: true });

// Format as HTML
const html = formatter.format(parsed, 'html', { standalone: true });
```

### Integration with Orchestrator

```javascript
const EnhancedResponseHandler = require('./response-integration-example');

const handler = new EnhancedResponseHandler();

// Start a session
const sessionId = handler.startSession('My Analysis Session');

// Handle responses from your orchestrator
const result = await handler.handleMultipleResponses(
  [
    { response: claudeResp, platform: 'claude', prompt },
    { response: gpt4Resp, platform: 'gpt4', prompt },
    { response: geminiResp, platform: 'gemini', prompt }
  ],
  {
    store: true,
    tags: ['analysis'],
    format: 'comparison'
  }
);

// Display comparison
console.log(handler.displayComparisonTable(result));
console.log(handler.displayQualityMetrics(result));

// Export session
const export = handler.exportSession(sessionId, 'markdown');
```

## 📚 Key Features

### ResponseProcessor
- ✅ Parse responses from 6+ AI platforms
- ✅ Clean and normalize text
- ✅ Extract code blocks with syntax detection
- ✅ Calculate similarity between responses
- ✅ Build consensus from multiple responses
- ✅ Score and rank responses

### ResponseAggregator
- ✅ Combine multiple platform responses
- ✅ Extract common themes (TF-IDF based)
- ✅ Identify key differences
- ✅ Generate summary responses
- ✅ Extract unique insights per platform
- ✅ Create comparison matrices
- ✅ Calculate quality metrics

### ContentFormatter
- ✅ Format for Terminal (with colors)
- ✅ Format for Web/HTML
- ✅ Format for JSON
- ✅ Format for Markdown
- ✅ Generate tables (multiple formats)
- ✅ Syntax highlighting
- ✅ Template system

### ResponseStorage
- ✅ SQLite database with FTS5 search
- ✅ Session management
- ✅ Tag system
- ✅ Response versioning
- ✅ Export to JSON/CSV/Markdown
- ✅ Statistics and analytics

## 📖 Documentation

See [RESPONSE-SYSTEM-README.md](./RESPONSE-SYSTEM-README.md) for complete documentation.

## 🎯 Common Use Cases

### Use Case 1: Compare AI Responses

```javascript
const processor = new ResponseProcessor();
const aggregator = new ResponseAggregator();
const formatter = new ContentFormatter();

// Parse all responses
const responses = platforms.map(p =>
  processor.parseResponse(p.response, p.name)
);

// Aggregate and compare
const result = aggregator.aggregateResponses(responses);

// Show comparison table
const table = formatter.generateTable(
  ['Platform', 'Score', 'Rank'],
  result.comparisonMatrix.overall.map(r => [
    r.platform,
    (r.score * 100).toFixed(1) + '%',
    r.rank
  ]),
  'terminal'
);

console.log(table);
```

### Use Case 2: Build Knowledge Base

```javascript
const storage = new ResponseStorage();

// Create session for topic
const sessionId = storage.createSession({
  name: 'React Hooks Tutorial',
  description: 'Collection of responses about React hooks'
});

// Store responses as you get them
prompts.forEach(prompt => {
  const responses = getResponsesFromPlatforms(prompt);

  responses.forEach(response => {
    storage.storeResponse(response, prompt, {
      sessionId,
      tags: ['react', 'hooks', 'tutorial']
    });
  });
});

// Later, search the knowledge base
const results = storage.search('useState hook', {
  tags: ['react'],
  limit: 10
});
```

### Use Case 3: Quality Analysis

```javascript
const processor = new ResponseProcessor();
const aggregator = new ResponseAggregator();

// Get responses
const responses = [
  processor.parseResponse(resp1, 'claude'),
  processor.parseResponse(resp2, 'gpt4'),
  processor.parseResponse(resp3, 'gemini')
];

// Analyze quality
const result = aggregator.aggregateResponses(responses);
const metrics = result.qualityMetrics;

console.log('Best Platform:', metrics.summary.bestPlatform);
console.log('Average Score:', metrics.overall.average);

// Per-platform details
Object.entries(metrics.perPlatform).forEach(([platform, data]) => {
  console.log(`${platform}:`, {
    score: data.averageScore,
    rank: data.bestRank,
    codeQuality: data.detailedScores.codeQuality,
    clarity: data.detailedScores.clarity
  });
});
```

## 🔧 Configuration Options

### ResponseProcessor Options

```javascript
new ResponseProcessor({
  enableCodeHighlight: true,      // Enable syntax highlighting
  enableDuplicateDetection: true, // Detect similar responses
  similarityThreshold: 0.85,      // Similarity threshold (0-1)
  cleanWhitespace: true           // Clean excessive whitespace
});
```

### ResponseAggregator Options

```javascript
new ResponseAggregator({
  minResponsesForAggregation: 2,  // Min responses to aggregate
  enableThemeExtraction: true,     // Extract common themes
  enableQualityMetrics: true,      // Calculate quality metrics
  themeMinFrequency: 2             // Min frequency for themes
});
```

### ResponseStorage Options

```javascript
new ResponseStorage({
  dbPath: './responses.db',        // Database file path
  enableVersioning: true,          // Enable versioning
  maxHistoryPerPrompt: 100         // Max versions per prompt
});
```

### ContentFormatter Options

```javascript
new ContentFormatter({
  enableColors: true,              // Enable colored output
  codeTheme: 'monokai',           // Code highlighting theme
  tableStyle: 'github'             // Table style
});
```

## 📊 Example Output

When you run the demo, you'll see:

1. ✅ Response parsing from 3 platforms
2. ✅ Code block extraction (5 blocks found)
3. ✅ Response scoring and ranking
4. ✅ Consensus building (63.9% agreement)
5. ✅ Response aggregation
6. ✅ Theme extraction (10 common themes)
7. ✅ Unique insights per platform
8. ✅ Comparison matrix table
9. ✅ Quality metrics analysis
10. ✅ Multiple output formats
11. ✅ Database storage
12. ✅ Full-text search
13. ✅ Response history
14. ✅ Statistics dashboard
15. ✅ Export capabilities (JSON, CSV, Markdown)
16. ✅ Summary generation

## 🤝 Need Help?

- Run the demo: `node response-system-demo.js`
- Check the full documentation: [RESPONSE-SYSTEM-README.md](./RESPONSE-SYSTEM-README.md)
- See integration example: `response-integration-example.js`

## 🎉 You're Ready!

The response processing system is production-ready and fully functional. Start integrating it with your existing orchestrator to get powerful response analysis, comparison, and storage capabilities!
