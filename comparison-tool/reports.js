/**
 * Reports Module
 * Handles export functionality for PDF, Excel, Markdown, CSV, and Email reports
 */

class Reports {
    /**
     * Generate comprehensive comparison report
     */
    static generateComprehensiveReport(responses, rankings) {
        const report = {
            metadata: {
                generatedAt: new Date().toISOString(),
                totalResponses: responses.length,
                platforms: [...new Set(responses.map(r => r.platform))],
            },
            statistics: ComparisonEngine.calculateStatistics(responses),
            rankings: rankings.map((r, i) => ({
                rank: i + 1,
                platform: r.platform,
                qualityScore: r.qualityScore,
                responseTime: r.responseTime || r.elapsed
            })),
            consensus: ComparisonEngine.detectConsensus(responses),
            outliers: ComparisonEngine.identifyOutliers(responses),
            responses: responses.map(r => ({
                platform: r.platform,
                model: r.model,
                response: r.response || r.text,
                qualityScore: r.qualityScore,
                responseTime: r.responseTime || r.elapsed,
                wordCount: (r.response || r.text || '').split(/\s+/).length
            }))
        };

        return report;
    }

    /**
     * Export to PDF
     */
    static async exportPDF(responses, rankings) {
        try {
            const report = this.generateComprehensiveReport(responses, rankings);

            // Create HTML content for PDF
            const html = this.generatePDFHTML(report);

            // Use jsPDF library if available
            if (typeof jsPDF !== 'undefined') {
                const doc = new jsPDF();
                doc.fromHTML(html, 15, 15);
                doc.save('ai-comparison-report.pdf');
            } else {
                // Fallback: Open print dialog
                const printWindow = window.open('', '_blank');
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.print();
            }

            this.showSuccess('PDF report generated successfully!');
        } catch (error) {
            this.showError('Failed to generate PDF: ' + error.message);
        }
    }

    /**
     * Generate HTML for PDF report
     */
    static generatePDFHTML(report) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>AI Response Comparison Report</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 40px;
                        color: #333;
                    }
                    h1 {
                        color: #667eea;
                        border-bottom: 3px solid #667eea;
                        padding-bottom: 10px;
                    }
                    h2 {
                        color: #764ba2;
                        margin-top: 30px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 12px;
                        text-align: left;
                    }
                    th {
                        background: #667eea;
                        color: white;
                    }
                    .stat-box {
                        display: inline-block;
                        padding: 15px;
                        margin: 10px;
                        background: #f8f9fa;
                        border-radius: 8px;
                        min-width: 150px;
                    }
                    .stat-label {
                        font-size: 12px;
                        color: #6c757d;
                    }
                    .stat-value {
                        font-size: 24px;
                        font-weight: bold;
                        color: #667eea;
                    }
                    .platform-badge {
                        display: inline-block;
                        padding: 5px 10px;
                        border-radius: 4px;
                        color: white;
                        font-size: 12px;
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <h1>AI Response Comparison Report</h1>
                <p><strong>Generated:</strong> ${new Date(report.metadata.generatedAt).toLocaleString()}</p>
                <p><strong>Total Responses:</strong> ${report.metadata.totalResponses}</p>
                <p><strong>Platforms:</strong> ${report.metadata.platforms.join(', ')}</p>

                <h2>Executive Summary</h2>
                <div>
                    <div class="stat-box">
                        <div class="stat-label">Average Quality</div>
                        <div class="stat-value">${Math.round(report.statistics.avgQuality)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Average Time</div>
                        <div class="stat-value">${Math.round(report.statistics.avgTime)}ms</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Consensus Score</div>
                        <div class="stat-value">${Math.round(report.consensus.score * 100)}%</div>
                    </div>
                </div>

                <h2>Rankings</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Platform</th>
                            <th>Quality Score</th>
                            <th>Response Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${report.rankings.map(r => `
                            <tr>
                                <td>#${r.rank}</td>
                                <td>${r.platform}</td>
                                <td>${Math.round(r.qualityScore)}</td>
                                <td>${r.responseTime}ms</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <h2>Detailed Statistics</h2>
                <table>
                    <tr>
                        <th>Metric</th>
                        <th>Average</th>
                        <th>Median</th>
                        <th>Std Dev</th>
                    </tr>
                    <tr>
                        <td>Quality Score</td>
                        <td>${Math.round(report.statistics.avgQuality)}</td>
                        <td>${Math.round(report.statistics.medianQuality)}</td>
                        <td>${Math.round(report.statistics.stdDevQuality)}</td>
                    </tr>
                    <tr>
                        <td>Response Time</td>
                        <td>${Math.round(report.statistics.avgTime)}ms</td>
                        <td>${Math.round(report.statistics.medianTime)}ms</td>
                        <td>${Math.round(report.statistics.stdDevTime)}ms</td>
                    </tr>
                    <tr>
                        <td>Word Count</td>
                        <td>${Math.round(report.statistics.avgWords)}</td>
                        <td>${Math.round(report.statistics.medianWords)}</td>
                        <td>${Math.round(report.statistics.stdDevWords)}</td>
                    </tr>
                </table>

                <h2>Consensus Analysis</h2>
                <p><strong>Common Themes:</strong></p>
                <ul>
                    ${report.consensus.themes.map(theme => `<li>${theme}</li>`).join('')}
                </ul>

                ${report.outliers.length > 0 ? `
                    <h2>Outliers Detected</h2>
                    <ul>
                        ${report.outliers.map(o => `<li>${o.platform}: ${o.reason}</li>`).join('')}
                    </ul>
                ` : ''}

                <h2>Full Responses</h2>
                ${report.responses.map((r, i) => `
                    <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <h3>${r.platform} - ${r.model}</h3>
                        <p><strong>Quality:</strong> ${Math.round(r.qualityScore)} |
                           <strong>Time:</strong> ${r.responseTime}ms |
                           <strong>Words:</strong> ${r.wordCount}</p>
                        <p>${r.response}</p>
                    </div>
                `).join('')}
            </body>
            </html>
        `;
    }

    /**
     * Export to Excel (using SheetJS/xlsx library)
     */
    static async exportExcel(responses, rankings) {
        try {
            const report = this.generateComprehensiveReport(responses, rankings);

            // Create workbook data
            const workbookData = this.createExcelWorkbook(report);

            // If XLSX library is available
            if (typeof XLSX !== 'undefined') {
                const wb = XLSX.utils.book_new();

                // Add worksheets
                Object.keys(workbookData).forEach(sheetName => {
                    const ws = XLSX.utils.aoa_to_sheet(workbookData[sheetName]);
                    XLSX.utils.book_append_sheet(wb, ws, sheetName);
                });

                // Export
                XLSX.writeFile(wb, 'ai-comparison-report.xlsx');
            } else {
                // Fallback: Export as CSV
                this.exportCSV(responses, rankings);
                this.showWarning('Excel library not found. Exported as CSV instead.');
                return;
            }

            this.showSuccess('Excel report exported successfully!');
        } catch (error) {
            this.showError('Failed to export Excel: ' + error.message);
        }
    }

    /**
     * Create Excel workbook structure
     */
    static createExcelWorkbook(report) {
        return {
            'Summary': [
                ['AI Response Comparison Report'],
                ['Generated:', new Date(report.metadata.generatedAt).toLocaleString()],
                ['Total Responses:', report.metadata.totalResponses],
                ['Platforms:', report.metadata.platforms.join(', ')],
                [],
                ['Key Metrics'],
                ['Metric', 'Value'],
                ['Average Quality Score', Math.round(report.statistics.avgQuality)],
                ['Average Response Time', Math.round(report.statistics.avgTime) + 'ms'],
                ['Average Word Count', Math.round(report.statistics.avgWords)],
                ['Consensus Score', Math.round(report.consensus.score * 100) + '%'],
            ],
            'Rankings': [
                ['Rank', 'Platform', 'Quality Score', 'Response Time (ms)'],
                ...report.rankings.map(r => [
                    r.rank,
                    r.platform,
                    Math.round(r.qualityScore),
                    r.responseTime
                ])
            ],
            'Statistics': [
                ['Metric', 'Average', 'Median', 'Std Dev', 'Min', 'Max'],
                [
                    'Quality Score',
                    Math.round(report.statistics.avgQuality),
                    Math.round(report.statistics.medianQuality),
                    Math.round(report.statistics.stdDevQuality),
                    Math.round(report.statistics.minQuality),
                    Math.round(report.statistics.maxQuality)
                ],
                [
                    'Response Time',
                    Math.round(report.statistics.avgTime),
                    Math.round(report.statistics.medianTime),
                    Math.round(report.statistics.stdDevTime),
                    Math.round(report.statistics.minTime),
                    Math.round(report.statistics.maxTime)
                ],
                [
                    'Word Count',
                    Math.round(report.statistics.avgWords),
                    Math.round(report.statistics.medianWords),
                    Math.round(report.statistics.stdDevWords),
                    '-',
                    '-'
                ]
            ],
            'Responses': [
                ['Platform', 'Model', 'Quality', 'Time (ms)', 'Words', 'Response'],
                ...report.responses.map(r => [
                    r.platform,
                    r.model,
                    Math.round(r.qualityScore),
                    r.responseTime,
                    r.wordCount,
                    r.response
                ])
            ]
        };
    }

    /**
     * Export to Markdown
     */
    static exportMarkdown(responses, rankings) {
        try {
            const report = this.generateComprehensiveReport(responses, rankings);
            const markdown = this.generateMarkdown(report);

            // Download as file
            this.downloadFile(markdown, 'ai-comparison-report.md', 'text/markdown');

            this.showSuccess('Markdown report exported successfully!');
        } catch (error) {
            this.showError('Failed to export Markdown: ' + error.message);
        }
    }

    /**
     * Generate Markdown content
     */
    static generateMarkdown(report) {
        let md = `# AI Response Comparison Report\n\n`;
        md += `**Generated:** ${new Date(report.metadata.generatedAt).toLocaleString()}\n`;
        md += `**Total Responses:** ${report.metadata.totalResponses}\n`;
        md += `**Platforms:** ${report.metadata.platforms.join(', ')}\n\n`;

        md += `## Executive Summary\n\n`;
        md += `| Metric | Value |\n`;
        md += `|--------|-------|\n`;
        md += `| Average Quality Score | ${Math.round(report.statistics.avgQuality)} |\n`;
        md += `| Average Response Time | ${Math.round(report.statistics.avgTime)}ms |\n`;
        md += `| Average Word Count | ${Math.round(report.statistics.avgWords)} |\n`;
        md += `| Consensus Score | ${Math.round(report.consensus.score * 100)}% |\n\n`;

        md += `## Rankings\n\n`;
        md += `| Rank | Platform | Quality Score | Response Time |\n`;
        md += `|------|----------|---------------|---------------|\n`;
        report.rankings.forEach(r => {
            md += `| #${r.rank} | ${r.platform} | ${Math.round(r.qualityScore)} | ${r.responseTime}ms |\n`;
        });
        md += `\n`;

        md += `## Detailed Statistics\n\n`;
        md += `| Metric | Average | Median | Std Dev |\n`;
        md += `|--------|---------|--------|----------|\n`;
        md += `| Quality Score | ${Math.round(report.statistics.avgQuality)} | ${Math.round(report.statistics.medianQuality)} | ${Math.round(report.statistics.stdDevQuality)} |\n`;
        md += `| Response Time | ${Math.round(report.statistics.avgTime)}ms | ${Math.round(report.statistics.medianTime)}ms | ${Math.round(report.statistics.stdDevTime)}ms |\n`;
        md += `| Word Count | ${Math.round(report.statistics.avgWords)} | ${Math.round(report.statistics.medianWords)} | ${Math.round(report.statistics.stdDevWords)} |\n\n`;

        md += `## Consensus Analysis\n\n`;
        md += `**Common Themes:**\n\n`;
        report.consensus.themes.forEach(theme => {
            md += `- ${theme}\n`;
        });
        md += `\n`;

        if (report.outliers.length > 0) {
            md += `## Outliers Detected\n\n`;
            report.outliers.forEach(o => {
                md += `- **${o.platform}:** ${o.reason}\n`;
            });
            md += `\n`;
        }

        md += `## Full Responses\n\n`;
        report.responses.forEach((r, i) => {
            md += `### ${i + 1}. ${r.platform} - ${r.model}\n\n`;
            md += `**Quality:** ${Math.round(r.qualityScore)} | `;
            md += `**Time:** ${r.responseTime}ms | `;
            md += `**Words:** ${r.wordCount}\n\n`;
            md += `${r.response}\n\n---\n\n`;
        });

        return md;
    }

    /**
     * Export to JSON
     */
    static exportJSON(responses, rankings) {
        try {
            const report = this.generateComprehensiveReport(responses, rankings);
            const json = JSON.stringify(report, null, 2);

            this.downloadFile(json, 'ai-comparison-report.json', 'application/json');

            this.showSuccess('JSON data exported successfully!');
        } catch (error) {
            this.showError('Failed to export JSON: ' + error.message);
        }
    }

    /**
     * Export to CSV
     */
    static exportCSV(responses, rankings) {
        try {
            const report = this.generateComprehensiveReport(responses, rankings);

            // Create CSV content
            let csv = 'Platform,Model,Quality Score,Response Time (ms),Word Count,Response\n';

            report.responses.forEach(r => {
                csv += `"${r.platform}","${r.model}",${Math.round(r.qualityScore)},${r.responseTime},${r.wordCount},"${this.escapeCSV(r.response)}"\n`;
            });

            this.downloadFile(csv, 'ai-comparison-report.csv', 'text/csv');

            this.showSuccess('CSV file exported successfully!');
        } catch (error) {
            this.showError('Failed to export CSV: ' + error.message);
        }
    }

    /**
     * Escape CSV content
     */
    static escapeCSV(str) {
        return str.replace(/"/g, '""');
    }

    /**
     * Generate email report
     */
    static exportEmail(responses, rankings) {
        try {
            const report = this.generateComprehensiveReport(responses, rankings);
            const emailBody = this.generateEmailTemplate(report);

            // Create mailto link
            const subject = encodeURIComponent('AI Response Comparison Report');
            const body = encodeURIComponent(emailBody);

            window.location.href = `mailto:?subject=${subject}&body=${body}`;

            this.showSuccess('Email client opened with report!');
        } catch (error) {
            this.showError('Failed to generate email: ' + error.message);
        }
    }

    /**
     * Generate email template
     */
    static generateEmailTemplate(report) {
        let email = `AI Response Comparison Report\n`;
        email += `Generated: ${new Date(report.metadata.generatedAt).toLocaleString()}\n\n`;

        email += `EXECUTIVE SUMMARY\n`;
        email += `=================\n`;
        email += `Total Responses: ${report.metadata.totalResponses}\n`;
        email += `Platforms: ${report.metadata.platforms.join(', ')}\n`;
        email += `Average Quality Score: ${Math.round(report.statistics.avgQuality)}\n`;
        email += `Average Response Time: ${Math.round(report.statistics.avgTime)}ms\n`;
        email += `Consensus Score: ${Math.round(report.consensus.score * 100)}%\n\n`;

        email += `TOP RANKINGS\n`;
        email += `============\n`;
        report.rankings.slice(0, 5).forEach(r => {
            email += `#${r.rank} - ${r.platform}: Score ${Math.round(r.qualityScore)}, Time ${r.responseTime}ms\n`;
        });
        email += `\n`;

        email += `COMMON THEMES\n`;
        email += `=============\n`;
        report.consensus.themes.forEach(theme => {
            email += `- ${theme}\n`;
        });

        email += `\n\nFor full report, please see the attached files.\n`;

        return email;
    }

    /**
     * Download file helper
     */
    static downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Show success message
     */
    static showSuccess(message) {
        if (typeof showAlert === 'function') {
            showAlert(message, 'success');
        } else {
            alert(message);
        }
    }

    /**
     * Show error message
     */
    static showError(message) {
        if (typeof showAlert === 'function') {
            showAlert(message, 'warning');
        } else {
            alert('Error: ' + message);
        }
    }

    /**
     * Show warning message
     */
    static showWarning(message) {
        if (typeof showAlert === 'function') {
            showAlert(message, 'warning');
        } else {
            alert('Warning: ' + message);
        }
    }

    /**
     * Generate comparison matrix report
     */
    static generateComparisonMatrix(responses) {
        const matrix = ComparisonEngine.calculateSimilarityMatrix(responses, 'cosine');

        let report = 'Similarity Matrix\n\n';
        report += '     ';
        responses.forEach((r, i) => {
            report += `${r.platform.substring(0, 4).padEnd(5)} `;
        });
        report += '\n';

        matrix.forEach((row, i) => {
            report += `${responses[i].platform.substring(0, 4).padEnd(5)}`;
            row.forEach(value => {
                report += `${Math.round(value * 100).toString().padStart(4)}% `;
            });
            report += '\n';
        });

        return report;
    }

    /**
     * Generate performance benchmark report
     */
    static generateBenchmarkReport(responses) {
        const stats = ComparisonEngine.calculateStatistics(responses);

        let report = 'Performance Benchmark Report\n\n';

        // Group by platform
        const byPlatform = {};
        responses.forEach(r => {
            const platform = r.platform || 'Unknown';
            if (!byPlatform[platform]) {
                byPlatform[platform] = [];
            }
            byPlatform[platform].push(r);
        });

        report += 'Platform Performance:\n\n';
        Object.keys(byPlatform).forEach(platform => {
            const platformResponses = byPlatform[platform];
            const avgQuality = platformResponses.reduce((sum, r) =>
                sum + (r.qualityScore || 0), 0) / platformResponses.length;
            const avgTime = platformResponses.reduce((sum, r) =>
                sum + (r.responseTime || r.elapsed || 0), 0) / platformResponses.length;

            report += `${platform}:\n`;
            report += `  Average Quality: ${Math.round(avgQuality)}\n`;
            report += `  Average Time: ${Math.round(avgTime)}ms\n`;
            report += `  Total Responses: ${platformResponses.length}\n\n`;
        });

        return report;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Reports;
}
