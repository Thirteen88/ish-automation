# Quick Start Guide - AI Response Comparison Tool

Get started with the comparison tool in under 5 minutes!

## Installation (30 seconds)

```bash
cd /home/gary/ish-automation/comparison-tool
chmod +x start.sh
```

## Starting the Tool

### Option 1: Standalone Mode (Recommended for First Use)

```bash
./start.sh
```

This starts the comparison tool on port 3001 with a built-in server.

### Option 2: Integrated with Orchestrator

```bash
# First, ensure orchestrator is running
cd /home/gary/ish-automation
node ai-orchestrator.js

# Then access comparison tool at:
# http://localhost:3000/comparison
```

### Option 3: Direct Browser Access (No Server)

```bash
# Simply open the HTML file directly
open index.html  # macOS
xdg-open index.html  # Linux
```

## First Time Usage (2 minutes)

### Load Sample Data

1. **Click "Load Responses"** button
2. **Select** `sample-data.json`
3. **View** automatic comparison of 6 AI responses

### Explore Features

#### Comparison Tab
- See side-by-side response cards
- View quality scores (0-100)
- Check response times
- Filter by platform or quality

#### Ranking Tab
- Drag and drop to reorder responses
- Rankings based on quality scores
- Custom manual ordering

#### Visualizations Tab
- Response time bar charts
- Quality score distribution
- Platform performance scatter plots
- Word cloud of common themes

#### Analysis Tab
- Consensus detection
- Outlier identification
- Statistical metrics
- Similarity heatmap

#### Export Tab
- PDF reports
- Excel spreadsheets
- Markdown tables
- JSON/CSV data
- Email templates

## Common Tasks

### Compare Your Own Responses

Create a JSON file:

```json
[
  {
    "platform": "openai",
    "model": "gpt-4",
    "response": "Your AI response here...",
    "responseTime": 1234
  },
  {
    "platform": "anthropic",
    "model": "claude-3",
    "response": "Another AI response here...",
    "responseTime": 1567
  }
]
```

Load it using the "Load Responses" button.

### Connect to Orchestrator

1. Start the orchestrator: `node ai-orchestrator.js`
2. Send some queries to AI platforms
3. Click "Load from Orchestrator" in the comparison tool
4. Recent responses load automatically

### Export a Report

1. Load or compare responses
2. Go to "Export" tab
3. Choose format (PDF, Excel, Markdown, etc.)
4. Click the export option
5. File downloads automatically

## Keyboard Shortcuts

- **Tab** - Switch between tabs
- **Ctrl+O** - Open file dialog
- **Ctrl+E** - Export current view
- **Ctrl+F** - Focus filter input

## Tips for Best Results

1. **Compare Similar Prompts** - Ensure all responses answer the same question
2. **Use Consistent Data** - Include all required fields (platform, response, responseTime)
3. **Try Different Algorithms** - Each similarity algorithm has strengths:
   - Levenshtein: Character-level differences
   - Jaccard: Word overlap
   - Cosine: Overall similarity
   - Semantic: Meaning-based

4. **Filter First** - Apply filters before heavy analysis for better performance
5. **Save Your Work** - Export reports regularly

## Troubleshooting (1 minute fixes)

### Can't Load Sample Data
```bash
# Check if file exists
ls -la sample-data.json

# If missing, download or create one
```

### Server Won't Start
```bash
# Check if port is in use
lsof -i :3001

# Kill existing process
kill -9 $(lsof -t -i:3001)

# Or use different port
./start.sh --port 3002
```

### Orchestrator Connection Fails
```bash
# Verify orchestrator is running
curl http://localhost:3000/health

# If not, start it
cd /home/gary/ish-automation
node ai-orchestrator.js
```

### Charts Not Showing
- Check browser console for errors
- Ensure responses have required fields
- Try refreshing the page

## Advanced Usage

### Custom Similarity Algorithm

Edit `comparison-engine.js`:

```javascript
ComparisonEngine.customSimilarity = function(str1, str2) {
    // Your algorithm
    return similarity;
};
```

### Add Custom Visualization

Edit `visualizations.js`:

```javascript
Visualizations.customChart = function(responses) {
    const canvas = document.getElementById('customChart');
    // Your visualization
};
```

### Integrate with Your App

```javascript
// Load the comparison engine
const ComparisonEngine = require('./comparison-engine.js');

// Compare responses
const similarity = ComparisonEngine.cosineSimilarity(text1, text2);

// Get quality score
const score = ComparisonEngine.calculateQualityScore(response);
```

## Sample Workflows

### Workflow 1: Quick Comparison
1. Load sample data (10 seconds)
2. View comparison tab (instant)
3. Check similarity matrix (instant)
4. Done!

### Workflow 2: Detailed Analysis
1. Load responses (10 seconds)
2. Apply filters (5 seconds)
3. Switch to analysis tab (instant)
4. Review consensus and outliers (1 minute)
5. Export PDF report (10 seconds)

### Workflow 3: Ranking Exercise
1. Load responses (10 seconds)
2. Go to ranking tab (instant)
3. Drag to reorder (30 seconds)
4. Export markdown table (5 seconds)

## Next Steps

- Read the full [README.md](README.md) for comprehensive documentation
- Explore the source code to understand algorithms
- Integrate with your existing AI workflows
- Customize visualizations and reports
- Share reports with your team

## Getting Help

1. Check browser console for errors
2. Review the troubleshooting section
3. Examine sample-data.json format
4. Test with small datasets first

## Update Notes

**Version 1.0.0** - Initial release
- Core comparison algorithms
- Multiple export formats
- Drag-and-drop ranking
- Real-time visualizations
- Orchestrator integration

---

**Time to productivity:** < 5 minutes
**Learning curve:** Easy
**Browser support:** All modern browsers

Enjoy comparing AI responses! 🚀
