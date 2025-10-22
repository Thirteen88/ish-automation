/**
 * Comparison Engine
 * Advanced algorithms for text similarity, quality scoring, and statistical analysis
 */

class ComparisonEngine {
    /**
     * Calculate Levenshtein Distance between two strings
     * Measures the minimum number of single-character edits required
     */
    static levenshteinDistance(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,      // deletion
                        dp[i][j - 1] + 1,      // insertion
                        dp[i - 1][j - 1] + 1   // substitution
                    );
                }
            }
        }

        const maxLen = Math.max(m, n);
        return maxLen === 0 ? 1 : 1 - (dp[m][n] / maxLen);
    }

    /**
     * Calculate Jaccard Similarity
     * Measures similarity between two sets of words
     */
    static jaccardSimilarity(str1, str2) {
        const set1 = new Set(str1.toLowerCase().split(/\s+/));
        const set2 = new Set(str2.toLowerCase().split(/\s+/));

        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    /**
     * Calculate Cosine Similarity
     * Measures cosine of angle between two vectors
     */
    static cosineSimilarity(str1, str2) {
        const words1 = str1.toLowerCase().split(/\s+/);
        const words2 = str2.toLowerCase().split(/\s+/);

        // Create vocabulary
        const vocabulary = [...new Set([...words1, ...words2])];

        // Create frequency vectors
        const vector1 = vocabulary.map(word =>
            words1.filter(w => w === word).length
        );
        const vector2 = vocabulary.map(word =>
            words2.filter(w => w === word).length
        );

        // Calculate dot product
        const dotProduct = vector1.reduce((sum, val, i) =>
            sum + val * vector2[i], 0
        );

        // Calculate magnitudes
        const magnitude1 = Math.sqrt(vector1.reduce((sum, val) =>
            sum + val * val, 0
        ));
        const magnitude2 = Math.sqrt(vector2.reduce((sum, val) =>
            sum + val * val, 0
        ));

        return magnitude1 === 0 || magnitude2 === 0
            ? 0
            : dotProduct / (magnitude1 * magnitude2);
    }

    /**
     * Extract keywords from text
     */
    static extractKeywords(text, limit = 20) {
        // Common stop words
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
            'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
            'more', 'most', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
            'same', 'so', 'than', 'too', 'very', 'as', 'by', 'from', 'into'
        ]);

        // Tokenize and filter
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3 && !stopWords.has(word));

        // Count frequencies
        const frequency = {};
        words.forEach(word => {
            frequency[word] = (frequency[word] || 0) + 1;
        });

        // Sort by frequency
        return Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([word, count]) => ({ word, count }));
    }

    /**
     * Calculate semantic similarity using keyword overlap
     */
    static semanticSimilarity(str1, str2) {
        const keywords1 = new Set(this.extractKeywords(str1).map(k => k.word));
        const keywords2 = new Set(this.extractKeywords(str2).map(k => k.word));

        const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));
        const union = new Set([...keywords1, ...keywords2]);

        // Weighted similarity
        const keywordSimilarity = union.size === 0 ? 0 : intersection.size / union.size;
        const lengthSimilarity = 1 - Math.abs(str1.length - str2.length) / Math.max(str1.length, str2.length);

        return (keywordSimilarity * 0.7 + lengthSimilarity * 0.3);
    }

    /**
     * Calculate quality score for a response
     */
    static calculateQualityScore(response) {
        const text = response.response || response.text || '';
        let score = 0;

        // Length score (0-25 points)
        const wordCount = text.split(/\s+/).length;
        if (wordCount > 50 && wordCount < 500) {
            score += 25;
        } else if (wordCount >= 500) {
            score += 20;
        } else {
            score += Math.min(wordCount / 2, 25);
        }

        // Structure score (0-25 points)
        const hasHeadings = /#{1,6}\s/.test(text) || /<h[1-6]>/.test(text);
        const hasList = /^[\-\*\d]+\.\s/m.test(text) || /<[uo]l>/.test(text);
        const hasParagraphs = text.split(/\n\n/).length > 2;

        if (hasHeadings) score += 10;
        if (hasList) score += 8;
        if (hasParagraphs) score += 7;

        // Completeness score (0-25 points)
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const avgSentenceLength = wordCount / sentences.length;

        if (avgSentenceLength > 10 && avgSentenceLength < 30) {
            score += 25;
        } else {
            score += Math.max(0, 25 - Math.abs(20 - avgSentenceLength));
        }

        // Response time score (0-25 points)
        const responseTime = response.responseTime || response.elapsed || 1000;
        if (responseTime < 1000) {
            score += 25;
        } else if (responseTime < 3000) {
            score += 20;
        } else if (responseTime < 5000) {
            score += 15;
        } else {
            score += 10;
        }

        return Math.min(100, Math.max(0, score));
    }

    /**
     * Calculate similarity matrix for all responses
     */
    static calculateSimilarityMatrix(responses, algorithm = 'cosine') {
        const n = responses.length;
        const matrix = Array(n).fill(null).map(() => Array(n).fill(0));

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    matrix[i][j] = 1;
                } else {
                    const text1 = responses[i].response || responses[i].text || '';
                    const text2 = responses[j].response || responses[j].text || '';

                    switch (algorithm) {
                        case 'levenshtein':
                            matrix[i][j] = this.levenshteinDistance(text1, text2);
                            break;
                        case 'jaccard':
                            matrix[i][j] = this.jaccardSimilarity(text1, text2);
                            break;
                        case 'semantic':
                            matrix[i][j] = this.semanticSimilarity(text1, text2);
                            break;
                        default:
                            matrix[i][j] = this.cosineSimilarity(text1, text2);
                    }
                }
            }
        }

        return matrix;
    }

    /**
     * Detect consensus among responses
     */
    static detectConsensus(responses) {
        if (responses.length < 2) {
            return { score: 1, count: responses.length, themes: [] };
        }

        // Extract keywords from all responses
        const allKeywords = responses.map(r =>
            this.extractKeywords(r.response || r.text || '', 10)
        );

        // Find common keywords
        const keywordCounts = {};
        allKeywords.forEach(keywords => {
            keywords.forEach(({ word }) => {
                keywordCounts[word] = (keywordCounts[word] || 0) + 1;
            });
        });

        // Find themes that appear in majority of responses
        const threshold = Math.ceil(responses.length / 2);
        const commonThemes = Object.entries(keywordCounts)
            .filter(([_, count]) => count >= threshold)
            .sort((a, b) => b[1] - a[1])
            .map(([word]) => word);

        // Calculate consensus score
        const avgSimilarity = this.calculateAverageSimilarity(responses);

        return {
            score: avgSimilarity,
            count: responses.length,
            themes: commonThemes.slice(0, 10)
        };
    }

    /**
     * Calculate average similarity across all responses
     */
    static calculateAverageSimilarity(responses) {
        if (responses.length < 2) return 1;

        let totalSimilarity = 0;
        let comparisons = 0;

        for (let i = 0; i < responses.length; i++) {
            for (let j = i + 1; j < responses.length; j++) {
                const text1 = responses[i].response || responses[i].text || '';
                const text2 = responses[j].response || responses[j].text || '';
                totalSimilarity += this.cosineSimilarity(text1, text2);
                comparisons++;
            }
        }

        return comparisons === 0 ? 0 : totalSimilarity / comparisons;
    }

    /**
     * Identify outlier responses
     */
    static identifyOutliers(responses) {
        if (responses.length < 3) return [];

        const outliers = [];
        const matrix = this.calculateSimilarityMatrix(responses, 'cosine');

        responses.forEach((response, i) => {
            // Calculate average similarity with other responses
            let totalSimilarity = 0;
            for (let j = 0; j < responses.length; j++) {
                if (i !== j) {
                    totalSimilarity += matrix[i][j];
                }
            }
            const avgSimilarity = totalSimilarity / (responses.length - 1);

            // Mark as outlier if average similarity is below threshold
            if (avgSimilarity < 0.3) {
                outliers.push({
                    index: i,
                    platform: response.platform,
                    similarity: avgSimilarity,
                    reason: `Low similarity (${Math.round(avgSimilarity * 100)}%) with other responses`
                });
            }

            // Check for length outliers
            const wordCount = (response.response || response.text || '').split(/\s+/).length;
            const avgWordCount = responses.reduce((sum, r) =>
                sum + (r.response || r.text || '').split(/\s+/).length, 0
            ) / responses.length;

            if (Math.abs(wordCount - avgWordCount) > avgWordCount * 0.5) {
                outliers.push({
                    index: i,
                    platform: response.platform,
                    reason: `Unusual length (${wordCount} vs avg ${Math.round(avgWordCount)} words)`
                });
            }
        });

        return outliers;
    }

    /**
     * Calculate statistical metrics
     */
    static calculateStatistics(responses) {
        const qualityScores = responses.map(r => r.qualityScore || 0);
        const responseTimes = responses.map(r => r.responseTime || r.elapsed || 0);
        const wordCounts = responses.map(r =>
            (r.response || r.text || '').split(/\s+/).length
        );

        return {
            avgQuality: this.average(qualityScores),
            medianQuality: this.median(qualityScores),
            stdDevQuality: this.standardDeviation(qualityScores),

            avgTime: this.average(responseTimes),
            medianTime: this.median(responseTimes),
            stdDevTime: this.standardDeviation(responseTimes),

            avgWords: this.average(wordCounts),
            medianWords: this.median(wordCounts),
            stdDevWords: this.standardDeviation(wordCounts),

            minQuality: Math.min(...qualityScores),
            maxQuality: Math.max(...qualityScores),
            minTime: Math.min(...responseTimes),
            maxTime: Math.max(...responseTimes)
        };
    }

    /**
     * Calculate average
     */
    static average(arr) {
        return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    /**
     * Calculate median
     */
    static median(arr) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }

    /**
     * Calculate standard deviation
     */
    static standardDeviation(arr) {
        if (arr.length === 0) return 0;
        const avg = this.average(arr);
        const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
        return Math.sqrt(this.average(squareDiffs));
    }

    /**
     * Find differences between two texts
     */
    static findDifferences(text1, text2) {
        const words1 = text1.split(/\s+/);
        const words2 = text2.split(/\s+/);

        const differences = {
            added: [],
            removed: [],
            common: []
        };

        const set1 = new Set(words1);
        const set2 = new Set(words2);

        words2.forEach(word => {
            if (!set1.has(word)) {
                differences.added.push(word);
            }
        });

        words1.forEach(word => {
            if (!set2.has(word)) {
                differences.removed.push(word);
            } else {
                differences.common.push(word);
            }
        });

        return differences;
    }

    /**
     * Highlight differences in text
     */
    static highlightDifferences(text, differences) {
        let highlighted = text;

        differences.added.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            highlighted = highlighted.replace(regex,
                `<span class="diff-added">${word}</span>`);
        });

        differences.removed.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            highlighted = highlighted.replace(regex,
                `<span class="diff-removed">${word}</span>`);
        });

        return highlighted;
    }

    /**
     * Calculate n-gram similarity
     */
    static ngramSimilarity(str1, str2, n = 3) {
        const ngrams1 = this.getNgrams(str1, n);
        const ngrams2 = this.getNgrams(str2, n);

        const set1 = new Set(ngrams1);
        const set2 = new Set(ngrams2);

        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    /**
     * Get n-grams from text
     */
    static getNgrams(text, n) {
        const ngrams = [];
        const cleaned = text.toLowerCase().replace(/[^\w\s]/g, '');

        for (let i = 0; i <= cleaned.length - n; i++) {
            ngrams.push(cleaned.slice(i, i + n));
        }

        return ngrams;
    }

    /**
     * Calculate readability score (Flesch Reading Ease)
     */
    static calculateReadability(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const syllables = words.reduce((count, word) =>
            count + this.countSyllables(word), 0
        );

        if (sentences.length === 0 || words.length === 0) return 0;

        const avgWordsPerSentence = words.length / sentences.length;
        const avgSyllablesPerWord = syllables / words.length;

        // Flesch Reading Ease formula
        const score = 206.835
            - (1.015 * avgWordsPerSentence)
            - (84.6 * avgSyllablesPerWord);

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Count syllables in a word (simplified)
     */
    static countSyllables(word) {
        word = word.toLowerCase().replace(/[^a-z]/g, '');
        if (word.length <= 3) return 1;

        const vowels = 'aeiouy';
        let count = 0;
        let prevWasVowel = false;

        for (let i = 0; i < word.length; i++) {
            const isVowel = vowels.includes(word[i]);
            if (isVowel && !prevWasVowel) {
                count++;
            }
            prevWasVowel = isVowel;
        }

        // Adjust for silent 'e'
        if (word.endsWith('e')) {
            count--;
        }

        return Math.max(1, count);
    }

    /**
     * Calculate sentiment score (simplified)
     */
    static calculateSentiment(text) {
        const positiveWords = new Set([
            'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
            'best', 'better', 'superior', 'outstanding', 'exceptional',
            'positive', 'helpful', 'useful', 'effective', 'efficient'
        ]);

        const negativeWords = new Set([
            'bad', 'poor', 'terrible', 'awful', 'horrible', 'worst',
            'worse', 'inferior', 'negative', 'unhelpful', 'useless',
            'ineffective', 'inefficient', 'wrong', 'incorrect', 'error'
        ]);

        const words = text.toLowerCase().split(/\s+/);
        let positiveCount = 0;
        let negativeCount = 0;

        words.forEach(word => {
            if (positiveWords.has(word)) positiveCount++;
            if (negativeWords.has(word)) negativeCount++;
        });

        const total = positiveCount + negativeCount;
        if (total === 0) return 0.5; // neutral

        return positiveCount / total;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComparisonEngine;
}
