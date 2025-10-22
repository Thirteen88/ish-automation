#!/usr/bin/env node

/**
 * Demo Script - AI Response Comparison Tool
 * Demonstrates programmatic usage of the comparison engine
 */

const fs = require('fs');
const path = require('path');

// Load modules
const ComparisonEngine = require('./comparison-engine.js');

// Colors for output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`  ${title}`, 'bright');
    log('='.repeat(60), 'cyan');
}

// Load sample data
const sampleData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8')
);

// Demo 1: Calculate similarity between two responses
section('Demo 1: Similarity Comparison');

const response1 = sampleData[0].response;
const response2 = sampleData[1].response;

log('\nComparing responses from OpenAI and Anthropic...', 'blue');

const levenshtein = ComparisonEngine.levenshteinDistance(response1, response2);
const jaccard = ComparisonEngine.jaccardSimilarity(response1, response2);
const cosine = ComparisonEngine.cosineSimilarity(response1, response2);
const semantic = ComparisonEngine.semanticSimilarity(response1, response2);

log(`\nLevenshtein Distance: ${(levenshtein * 100).toFixed(2)}%`, 'green');
log(`Jaccard Similarity:   ${(jaccard * 100).toFixed(2)}%`, 'green');
log(`Cosine Similarity:    ${(cosine * 100).toFixed(2)}%`, 'green');
log(`Semantic Similarity:  ${(semantic * 100).toFixed(2)}%`, 'green');

// Demo 2: Quality scoring
section('Demo 2: Quality Scoring');

log('\nScoring all responses...', 'blue');

sampleData.forEach(response => {
    response.qualityScore = ComparisonEngine.calculateQualityScore(response);
    const readability = ComparisonEngine.calculateReadability(response.response);
    const sentiment = ComparisonEngine.calculateSentiment(response.response);

    log(`\n${response.platform} (${response.model}):`, 'yellow');
    log(`  Quality Score: ${response.qualityScore.toFixed(1)}/100`, 'green');
    log(`  Readability:   ${readability.toFixed(1)}/100`, 'green');
    log(`  Sentiment:     ${(sentiment * 100).toFixed(1)}% positive`, 'green');
    log(`  Response Time: ${response.responseTime}ms`, 'green');
    log(`  Word Count:    ${response.response.split(/\s+/).length} words`, 'green');
});

// Demo 3: Keyword extraction
section('Demo 3: Keyword Extraction');

log('\nExtracting keywords from first response...', 'blue');

const keywords = ComparisonEngine.extractKeywords(response1, 10);

log('\nTop 10 Keywords:', 'yellow');
keywords.forEach((kw, i) => {
    log(`  ${i + 1}. ${kw.word} (${kw.count} occurrences)`, 'green');
});

// Demo 4: Similarity matrix
section('Demo 4: Similarity Matrix');

log('\nCalculating similarity matrix...', 'blue');

const matrix = ComparisonEngine.calculateSimilarityMatrix(sampleData, 'cosine');

log('\nSimilarity Matrix (Cosine):', 'yellow');
log('\n     ' + sampleData.map((r, i) =>
    r.platform.substring(0, 6).padEnd(7)
).join(''), 'cyan');

matrix.forEach((row, i) => {
    const rowStr = row.map(val =>
        (val * 100).toFixed(0).padStart(6) + '%'
    ).join(' ');
    log(`${sampleData[i].platform.substring(0, 6).padEnd(5)} ${rowStr}`, 'green');
});

// Demo 5: Consensus detection
section('Demo 5: Consensus Detection');

log('\nDetecting consensus across responses...', 'blue');

const consensus = ComparisonEngine.detectConsensus(sampleData);

log(`\nConsensus Score: ${(consensus.score * 100).toFixed(2)}%`, 'yellow');
log(`Responses Analyzed: ${consensus.count}`, 'yellow');
log('\nCommon Themes:', 'yellow');
consensus.themes.slice(0, 10).forEach((theme, i) => {
    log(`  ${i + 1}. ${theme}`, 'green');
});

// Demo 6: Outlier detection
section('Demo 6: Outlier Detection');

log('\nIdentifying outliers...', 'blue');

const outliers = ComparisonEngine.identifyOutliers(sampleData);

if (outliers.length > 0) {
    log(`\nFound ${outliers.length} outlier(s):`, 'yellow');
    outliers.forEach(outlier => {
        log(`  - ${outlier.platform}: ${outlier.reason}`, 'magenta');
    });
} else {
    log('\nNo significant outliers detected.', 'green');
}

// Demo 7: Statistical analysis
section('Demo 7: Statistical Analysis');

log('\nCalculating statistics...', 'blue');

const stats = ComparisonEngine.calculateStatistics(sampleData);

log('\nQuality Scores:', 'yellow');
log(`  Average:   ${stats.avgQuality.toFixed(2)}`, 'green');
log(`  Median:    ${stats.medianQuality.toFixed(2)}`, 'green');
log(`  Std Dev:   ${stats.stdDevQuality.toFixed(2)}`, 'green');
log(`  Min:       ${stats.minQuality.toFixed(2)}`, 'green');
log(`  Max:       ${stats.maxQuality.toFixed(2)}`, 'green');

log('\nResponse Times:', 'yellow');
log(`  Average:   ${stats.avgTime.toFixed(0)}ms`, 'green');
log(`  Median:    ${stats.medianTime.toFixed(0)}ms`, 'green');
log(`  Std Dev:   ${stats.stdDevTime.toFixed(0)}ms`, 'green');
log(`  Fastest:   ${stats.minTime}ms`, 'green');
log(`  Slowest:   ${stats.maxTime}ms`, 'green');

log('\nWord Counts:', 'yellow');
log(`  Average:   ${stats.avgWords.toFixed(0)} words`, 'green');
log(`  Median:    ${stats.medianWords.toFixed(0)} words`, 'green');
log(`  Std Dev:   ${stats.stdDevWords.toFixed(0)} words`, 'green');

// Demo 8: Rankings
section('Demo 8: Response Rankings');

log('\nRanking responses by quality score...', 'blue');

const ranked = [...sampleData].sort((a, b) =>
    (b.qualityScore || 0) - (a.qualityScore || 0)
);

log('\nRankings:', 'yellow');
ranked.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    log(`\n${medal} ${r.platform} (${r.model})`, 'cyan');
    log(`   Quality: ${r.qualityScore.toFixed(1)}/100`, 'green');
    log(`   Speed:   ${r.responseTime}ms`, 'green');
    log(`   Words:   ${r.response.split(/\s+/).length}`, 'green');
});

// Demo 9: Find differences
section('Demo 9: Finding Differences');

log('\nFinding differences between top 2 responses...', 'blue');

const diff = ComparisonEngine.findDifferences(
    ranked[0].response,
    ranked[1].response
);

log(`\nAdded words: ${diff.added.length}`, 'yellow');
log(`Removed words: ${diff.removed.length}`, 'yellow');
log(`Common words: ${diff.common.length}`, 'yellow');

if (diff.added.length > 0) {
    log('\nSample added words:', 'cyan');
    diff.added.slice(0, 10).forEach(word => {
        log(`  + ${word}`, 'green');
    });
}

if (diff.removed.length > 0) {
    log('\nSample removed words:', 'cyan');
    diff.removed.slice(0, 10).forEach(word => {
        log(`  - ${word}`, 'magenta');
    });
}

// Demo 10: Platform comparison
section('Demo 10: Platform Performance Comparison');

log('\nComparing platform performance...', 'blue');

const byPlatform = {};
sampleData.forEach(r => {
    if (!byPlatform[r.platform]) {
        byPlatform[r.platform] = [];
    }
    byPlatform[r.platform].push(r);
});

log('\nPlatform Rankings:', 'yellow');
const platformStats = Object.entries(byPlatform).map(([platform, responses]) => {
    const avgQuality = responses.reduce((sum, r) =>
        sum + (r.qualityScore || 0), 0) / responses.length;
    const avgTime = responses.reduce((sum, r) =>
        sum + (r.responseTime || 0), 0) / responses.length;
    return { platform, avgQuality, avgTime };
}).sort((a, b) => b.avgQuality - a.avgQuality);

platformStats.forEach((stat, i) => {
    log(`\n${i + 1}. ${stat.platform}`, 'cyan');
    log(`   Quality: ${stat.avgQuality.toFixed(1)}/100`, 'green');
    log(`   Speed:   ${stat.avgTime.toFixed(0)}ms`, 'green');
});

// Summary
section('Demo Complete');

log('\nKey Takeaways:', 'yellow');
log(`✓ Analyzed ${sampleData.length} AI responses`, 'green');
log(`✓ Compared using 4 similarity algorithms`, 'green');
log(`✓ Calculated quality scores for all responses`, 'green');
log(`✓ Detected ${consensus.themes.length} common themes`, 'green');
log(`✓ Identified ${outliers.length} outliers`, 'green');
log(`✓ Generated comprehensive statistics`, 'green');
log(`✓ Ranked responses by quality`, 'green');

log('\nNext Steps:', 'cyan');
log('  - Open index.html in a browser for visual comparison', 'blue');
log('  - Run ./start.sh to start the web interface', 'blue');
log('  - Integrate with your AI orchestrator', 'blue');
log('  - Export reports in various formats', 'blue');

log('\n');
