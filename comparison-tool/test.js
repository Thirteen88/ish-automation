#!/usr/bin/env node

/**
 * Test Script for Comparison Tool
 * Validates installation and runs basic functionality tests
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
    log(`✓ ${message}`, 'green');
}

function error(message) {
    log(`✗ ${message}`, 'red');
}

function info(message) {
    log(`ℹ ${message}`, 'blue');
}

function warn(message) {
    log(`⚠ ${message}`, 'yellow');
}

// Test results
const results = {
    passed: 0,
    failed: 0,
    warnings: 0
};

// Test 1: Check required files
function testFileStructure() {
    info('Testing file structure...');

    const requiredFiles = [
        'index.html',
        'comparison-engine.js',
        'visualizations.js',
        'reports.js',
        'integration.js',
        'sample-data.json',
        'README.md',
        'QUICKSTART.md'
    ];

    let allFilesExist = true;

    requiredFiles.forEach(file => {
        if (fs.existsSync(path.join(__dirname, file))) {
            success(`Found ${file}`);
            results.passed++;
        } else {
            error(`Missing ${file}`);
            results.failed++;
            allFilesExist = false;
        }
    });

    return allFilesExist;
}

// Test 2: Validate JSON files
function testJSONFiles() {
    info('\nTesting JSON files...');

    try {
        const sampleData = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8')
        );

        if (Array.isArray(sampleData) && sampleData.length > 0) {
            success(`Sample data valid (${sampleData.length} responses)`);
            results.passed++;
        } else {
            error('Sample data is empty or invalid');
            results.failed++;
            return false;
        }

        // Validate structure
        const firstResponse = sampleData[0];
        const requiredFields = ['platform', 'model', 'response', 'responseTime'];

        requiredFields.forEach(field => {
            if (field in firstResponse) {
                success(`Sample data has ${field} field`);
                results.passed++;
            } else {
                warn(`Sample data missing ${field} field`);
                results.warnings++;
            }
        });

        return true;
    } catch (err) {
        error(`JSON parsing failed: ${err.message}`);
        results.failed++;
        return false;
    }
}

// Test 3: Test comparison engine
function testComparisonEngine() {
    info('\nTesting comparison engine...');

    try {
        const ComparisonEngine = require('./comparison-engine.js');

        // Test Levenshtein distance
        const lev = ComparisonEngine.levenshteinDistance('hello', 'hallo');
        if (typeof lev === 'number' && lev >= 0 && lev <= 1) {
            success('Levenshtein distance works');
            results.passed++;
        } else {
            error('Levenshtein distance failed');
            results.failed++;
        }

        // Test Jaccard similarity
        const jaccard = ComparisonEngine.jaccardSimilarity('hello world', 'hello there');
        if (typeof jaccard === 'number' && jaccard >= 0 && jaccard <= 1) {
            success('Jaccard similarity works');
            results.passed++;
        } else {
            error('Jaccard similarity failed');
            results.failed++;
        }

        // Test Cosine similarity
        const cosine = ComparisonEngine.cosineSimilarity('hello world', 'hello there');
        if (typeof cosine === 'number' && cosine >= 0 && cosine <= 1) {
            success('Cosine similarity works');
            results.passed++;
        } else {
            error('Cosine similarity failed');
            results.failed++;
        }

        // Test keyword extraction
        const keywords = ComparisonEngine.extractKeywords('The quick brown fox jumps over the lazy dog');
        if (Array.isArray(keywords) && keywords.length > 0) {
            success(`Keyword extraction works (${keywords.length} keywords)`);
            results.passed++;
        } else {
            error('Keyword extraction failed');
            results.failed++;
        }

        // Test quality scoring
        const sampleResponse = {
            response: 'This is a sample response with multiple sentences. It includes various elements. Such as proper structure and formatting.',
            responseTime: 1000
        };
        const score = ComparisonEngine.calculateQualityScore(sampleResponse);
        if (typeof score === 'number' && score >= 0 && score <= 100) {
            success(`Quality scoring works (score: ${Math.round(score)})`);
            results.passed++;
        } else {
            error('Quality scoring failed');
            results.failed++;
        }

        return true;
    } catch (err) {
        error(`Comparison engine test failed: ${err.message}`);
        results.failed++;
        return false;
    }
}

// Test 4: Test with sample data
function testWithSampleData() {
    info('\nTesting with sample data...');

    try {
        const ComparisonEngine = require('./comparison-engine.js');
        const sampleData = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8')
        );

        // Calculate quality scores
        sampleData.forEach(response => {
            response.qualityScore = ComparisonEngine.calculateQualityScore(response);
        });

        // Test similarity matrix
        const matrix = ComparisonEngine.calculateSimilarityMatrix(sampleData, 'cosine');
        if (matrix.length === sampleData.length && matrix[0].length === sampleData.length) {
            success(`Similarity matrix generated (${matrix.length}x${matrix[0].length})`);
            results.passed++;
        } else {
            error('Similarity matrix has wrong dimensions');
            results.failed++;
        }

        // Test consensus detection
        const consensus = ComparisonEngine.detectConsensus(sampleData);
        if (consensus && typeof consensus.score === 'number') {
            success(`Consensus detection works (score: ${Math.round(consensus.score * 100)}%)`);
            results.passed++;
        } else {
            error('Consensus detection failed');
            results.failed++;
        }

        // Test outlier identification
        const outliers = ComparisonEngine.identifyOutliers(sampleData);
        if (Array.isArray(outliers)) {
            success(`Outlier identification works (${outliers.length} outliers)`);
            results.passed++;
        } else {
            error('Outlier identification failed');
            results.failed++;
        }

        // Test statistics
        const stats = ComparisonEngine.calculateStatistics(sampleData);
        if (stats && typeof stats.avgQuality === 'number') {
            success(`Statistics calculation works (avg quality: ${Math.round(stats.avgQuality)})`);
            results.passed++;
        } else {
            error('Statistics calculation failed');
            results.failed++;
        }

        return true;
    } catch (err) {
        error(`Sample data test failed: ${err.message}`);
        results.failed++;
        return false;
    }
}

// Test 5: Test integration module
function testIntegration() {
    info('\nTesting integration module...');

    try {
        const integration = require('./integration.js');

        if (typeof integration.compareResponses === 'function') {
            success('compareResponses function available');
            results.passed++;
        } else {
            error('compareResponses function missing');
            results.failed++;
        }

        if (typeof integration.saveComparison === 'function') {
            success('saveComparison function available');
            results.passed++;
        } else {
            error('saveComparison function missing');
            results.failed++;
        }

        if (typeof integration.addComparisonEndpoints === 'function') {
            success('addComparisonEndpoints function available');
            results.passed++;
        } else {
            error('addComparisonEndpoints function missing');
            results.failed++;
        }

        return true;
    } catch (err) {
        error(`Integration module test failed: ${err.message}`);
        results.failed++;
        return false;
    }
}

// Test 6: Validate HTML structure
function testHTMLStructure() {
    info('\nTesting HTML structure...');

    try {
        const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

        const requiredElements = [
            'comparisonContainer',
            'rankingContainer',
            'responseTimeChart',
            'qualityScoreChart',
            'platformTrendsChart',
            'wordCloud',
            'heatmapCanvas'
        ];

        requiredElements.forEach(id => {
            if (html.includes(`id="${id}"`)) {
                success(`Found element: ${id}`);
                results.passed++;
            } else {
                warn(`Missing element: ${id}`);
                results.warnings++;
            }
        });

        // Check for script tags
        if (html.includes('comparison-engine.js')) {
            success('comparison-engine.js included');
            results.passed++;
        } else {
            error('comparison-engine.js not included');
            results.failed++;
        }

        if (html.includes('visualizations.js')) {
            success('visualizations.js included');
            results.passed++;
        } else {
            error('visualizations.js not included');
            results.failed++;
        }

        if (html.includes('reports.js')) {
            success('reports.js included');
            results.passed++;
        } else {
            error('reports.js not included');
            results.failed++;
        }

        return true;
    } catch (err) {
        error(`HTML structure test failed: ${err.message}`);
        results.failed++;
        return false;
    }
}

// Run all tests
function runTests() {
    log('\n╔═══════════════════════════════════════════════════════╗', 'cyan');
    log('║   AI Response Comparison Tool - Test Suite          ║', 'cyan');
    log('╚═══════════════════════════════════════════════════════╝', 'cyan');

    testFileStructure();
    testJSONFiles();
    testComparisonEngine();
    testWithSampleData();
    testIntegration();
    testHTMLStructure();

    // Print summary
    log('\n╔═══════════════════════════════════════════════════════╗', 'cyan');
    log('║   Test Summary                                        ║', 'cyan');
    log('╚═══════════════════════════════════════════════════════╝', 'cyan');

    success(`Passed: ${results.passed}`);
    if (results.failed > 0) {
        error(`Failed: ${results.failed}`);
    } else {
        success('Failed: 0');
    }
    if (results.warnings > 0) {
        warn(`Warnings: ${results.warnings}`);
    }

    const total = results.passed + results.failed;
    const percentage = total > 0 ? Math.round((results.passed / total) * 100) : 0;

    log(`\nSuccess Rate: ${percentage}%`, percentage === 100 ? 'green' : 'yellow');

    if (results.failed === 0) {
        success('\n✓ All tests passed! The comparison tool is ready to use.');
        log('\nQuick start:', 'cyan');
        log('  ./start.sh                    # Start standalone server');
        log('  open index.html               # Open directly in browser');
        log('  node integration.js           # Start API server\n');
        process.exit(0);
    } else {
        error('\n✗ Some tests failed. Please fix the issues before using the tool.');
        process.exit(1);
    }
}

// Run tests
runTests();
