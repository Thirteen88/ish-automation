# AI Response Comparison & Ranking Tool

A comprehensive tool for analyzing, comparing, and ranking AI responses from multiple platforms with advanced metrics, visualizations, and export capabilities.

## Features

### 🔍 Comparison Capabilities
- **Side-by-side response comparison** - View multiple AI responses simultaneously
- **Diff highlighting** - Automatically detect and highlight differences between responses
- **Similarity analysis** - Multiple algorithms: Levenshtein, Jaccard, Cosine, and Semantic
- **Quality scoring** - Comprehensive scoring based on structure, completeness, and timing
- **Filtering** - Filter by platform, quality score, response time

### 🏆 Ranking System
- **Drag-and-drop ranking** - Easily reorder responses by preference
- **Automatic scoring** - AI-powered quality assessment
- **Multi-criteria evaluation** - Considers quality, speed, and completeness

### 📊 Visualizations
- **Response time charts** - Bar charts comparing platform performance
- **Quality score distribution** - Visual representation of quality metrics
- **Platform performance trends** - Scatter plots showing quality vs. speed
- **Word clouds** - Common themes and keywords across responses
- **Similarity heatmaps** - Matrix view of response similarities

### 🔬 Statistical Analysis
- **Consensus detection** - Identify common themes and agreements
- **Outlier identification** - Flag responses that deviate significantly
- **Statistical metrics** - Mean, median, standard deviation for all metrics
- **Readability scoring** - Flesch Reading Ease calculations
- **Sentiment analysis** - Basic sentiment detection

### 📤 Export Options
- **PDF Reports** - Comprehensive reports with charts and analysis
- **Excel Spreadsheets** - Multi-sheet workbooks with embedded data
- **Markdown Tables** - Perfect for documentation and GitHub
- **JSON Data** - Machine-readable export for further processing
- **CSV Files** - Compatible with spreadsheet applications
- **Email Templates** - Pre-formatted email reports

## Installation

### Standalone Usage

1. **Copy the comparison-tool directory** to your project:
   ```bash
   cp -r /path/to/comparison-tool /your/project/
   ```

2. **Open index.html** in a web browser:
   ```bash
   cd comparison-tool
   open index.html  # macOS
   xdg-open index.html  # Linux
   start index.html  # Windows
   ```

3. **Load responses** using one of these methods:
   - Click "Load Responses" and select a JSON file
   - Connect to the orchestrator API
   - Use the browser's file picker

### Integration with Orchestrator

The tool integrates seamlessly with the main AI orchestrator:

1. **Start the orchestrator**:
   ```bash
   node ai-orchestrator.js
   ```

2. **Open the comparison tool**:
   ```bash
   open comparison-tool/index.html
   ```

3. **Click "Load from Orchestrator"** to fetch recent responses

## Usage Guide

### Loading Responses

#### From JSON File
```json
[
  {
    "platform": "openai",
    "model": "gpt-4",
    "response": "Response text here...",
    "responseTime": 1234,
    "timestamp": "2025-01-01T12:00:00Z"
  }
]
```

#### From Orchestrator API
The tool automatically connects to `http://localhost:3000/api/responses/recent`

### Comparison Algorithms

#### Levenshtein Distance
Measures character-level edit distance between texts. Best for:
- Detecting typos and minor variations
- Finding nearly identical responses
- Character-level differences

#### Jaccard Similarity
Compares word sets between responses. Best for:
- Topic similarity
- Keyword overlap
- General content similarity

#### Cosine Similarity
Uses vector space model for comparison. Best for:
- Semantic similarity
- Content relevance
- Overall similarity scoring

#### Semantic Similarity
Keyword-based semantic comparison. Best for:
- Theme detection
- Conceptual similarity
- High-level comparison

### Quality Scoring

Responses are scored on multiple criteria:

1. **Length Score (0-25 points)**
   - Optimal: 50-500 words
   - Too short or too long penalized

2. **Structure Score (0-25 points)**
   - Headings: +10 points
   - Lists: +8 points
   - Paragraphs: +7 points

3. **Completeness Score (0-25 points)**
   - Based on sentence length
   - Optimal: 10-30 words per sentence

4. **Response Time Score (0-25 points)**
   - <1s: 25 points
   - <3s: 20 points
   - <5s: 15 points
   - >5s: 10 points

### Ranking Responses

1. **Automatic Ranking** - Based on quality scores
2. **Manual Ranking** - Drag and drop to reorder
3. **Custom Criteria** - Filter and sort by your preferences

### Exporting Reports

#### PDF Export
Generates a comprehensive PDF with:
- Executive summary
- Rankings table
- Statistical analysis
- Full response comparisons

#### Excel Export
Creates multi-sheet workbook:
- Summary sheet
- Rankings sheet
- Statistics sheet
- Full responses sheet

#### Markdown Export
Perfect for documentation:
- Tables with all metrics
- Full response text
- Easy to version control

## API Integration

### Fetch Recent Responses

```javascript
fetch('http://localhost:3000/api/responses/recent')
  .then(res => res.json())
  .then(data => loadResponses(data));
```

### Submit for Comparison

```javascript
const responses = [
  { platform: 'openai', response: '...' },
  { platform: 'anthropic', response: '...' }
];

fetch('http://localhost:3000/api/compare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ responses })
});
```

## Programmatic Usage

### Using the Comparison Engine

```javascript
// Calculate similarity
const similarity = ComparisonEngine.cosineSimilarity(text1, text2);

// Extract keywords
const keywords = ComparisonEngine.extractKeywords(text);

// Calculate quality score
const score = ComparisonEngine.calculateQualityScore(response);

// Detect consensus
const consensus = ComparisonEngine.detectConsensus(responses);

// Identify outliers
const outliers = ComparisonEngine.identifyOutliers(responses);
```

### Creating Visualizations

```javascript
// Create charts
Visualizations.createResponseTimeChart(responses);
Visualizations.createQualityScoreChart(responses);
Visualizations.createPlatformTrendsChart(responses);
Visualizations.createWordCloud(responses);
Visualizations.createHeatmap(responses);
```

### Generating Reports

```javascript
// Generate comprehensive report
const report = Reports.generateComprehensiveReport(responses, rankings);

// Export to various formats
Reports.exportPDF(responses, rankings);
Reports.exportExcel(responses, rankings);
Reports.exportMarkdown(responses, rankings);
Reports.exportJSON(responses, rankings);
Reports.exportCSV(responses, rankings);
Reports.exportEmail(responses, rankings);
```

## Advanced Features

### Custom Similarity Algorithms

Add your own similarity algorithm:

```javascript
ComparisonEngine.customSimilarity = function(str1, str2) {
  // Your algorithm here
  return similarityScore;
};
```

### Custom Quality Metrics

Define custom quality scoring:

```javascript
ComparisonEngine.customQualityScore = function(response) {
  // Your scoring logic
  return score;
};
```

### Custom Visualizations

Create custom charts:

```javascript
Visualizations.customChart = function(responses) {
  const canvas = document.getElementById('customChart');
  const ctx = canvas.getContext('2d');
  // Your visualization logic
};
```

## File Structure

```
comparison-tool/
├── index.html              # Main UI
├── comparison-engine.js    # Similarity algorithms & analysis
├── visualizations.js       # Charts, graphs, word clouds
├── reports.js             # Export functionality
└── README.md              # This file
```

## Browser Compatibility

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Opera
- ⚠️ IE11 (limited support)

## Performance

- Handles **100+ responses** smoothly
- Real-time similarity calculations
- Optimized rendering for large datasets
- Efficient memory usage

## Tips & Best Practices

1. **Load Similar Prompts** - Compare responses to the same prompt for meaningful results
2. **Use Appropriate Algorithms** - Choose the right similarity algorithm for your use case
3. **Filter First** - Apply filters before complex analysis for better performance
4. **Export Regularly** - Save your analysis for future reference
5. **Combine Metrics** - Use multiple algorithms for comprehensive comparison

## Troubleshooting

### Cannot Load from Orchestrator
- Ensure orchestrator is running on port 3000
- Check CORS settings
- Verify API endpoint is accessible

### Charts Not Displaying
- Check browser console for errors
- Ensure canvas elements are present
- Verify responses have required fields

### Export Not Working
- Check browser download settings
- Ensure popup blockers are disabled
- Try different export format

## Future Enhancements

- [ ] Real-time comparison streaming
- [ ] Advanced ML-based similarity
- [ ] Custom report templates
- [ ] Team collaboration features
- [ ] Historical trend analysis
- [ ] API endpoint for programmatic access
- [ ] Integration with more platforms
- [ ] Advanced sentiment analysis
- [ ] Multi-language support
- [ ] Custom scoring templates

## License

MIT License - Feel free to use and modify

## Support

For issues, questions, or contributions:
1. Check the troubleshooting section
2. Review the usage guide
3. Examine the code examples
4. Test with sample data

## Credits

Built with:
- Vanilla JavaScript (no dependencies for core functionality)
- HTML5 Canvas for visualizations
- Modern CSS3 for styling

Optional libraries for enhanced functionality:
- jsPDF (PDF generation)
- SheetJS/xlsx (Excel export)
- Chart.js (advanced charts)

---

**Version:** 1.0.0
**Last Updated:** 2025-10-21
**Compatibility:** All modern browsers
