/**
 * Visualizations Module
 * Creates charts, graphs, word clouds, and heatmaps for response analysis
 */

class Visualizations {
    /**
     * Create response time comparison chart
     */
    static createResponseTimeChart(responses) {
        const canvas = document.getElementById('responseTimeChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const platforms = responses.map(r => r.platform || 'Unknown');
        const times = responses.map(r => r.responseTime || r.elapsed || 0);

        // Clear previous chart
        canvas.width = canvas.width;

        // Simple bar chart
        const maxTime = Math.max(...times, 1);
        const padding = 40;
        const barWidth = (canvas.width - padding * 2) / platforms.length;
        const chartHeight = canvas.height - padding * 2;

        // Draw bars
        times.forEach((time, i) => {
            const barHeight = (time / maxTime) * chartHeight;
            const x = padding + i * barWidth;
            const y = canvas.height - padding - barHeight;

            // Draw bar
            ctx.fillStyle = this.getPlatformColor(platforms[i]);
            ctx.fillRect(x + 5, y, barWidth - 10, barHeight);

            // Draw value
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(time + 'ms', x + barWidth / 2, y - 5);

            // Draw label
            ctx.save();
            ctx.translate(x + barWidth / 2, canvas.height - padding + 20);
            ctx.rotate(-Math.PI / 4);
            ctx.textAlign = 'right';
            ctx.fillText(platforms[i], 0, 0);
            ctx.restore();
        });

        // Draw axes
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Draw title
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Response Time (ms)', canvas.width / 2, 20);
    }

    /**
     * Create quality score distribution chart
     */
    static createQualityScoreChart(responses) {
        const canvas = document.getElementById('qualityScoreChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const platforms = responses.map(r => r.platform || 'Unknown');
        const scores = responses.map(r => r.qualityScore || 0);

        // Clear previous chart
        canvas.width = canvas.width;

        // Create horizontal bar chart
        const maxScore = 100;
        const padding = 60;
        const barHeight = (canvas.height - padding * 2) / platforms.length;
        const chartWidth = canvas.width - padding * 2;

        // Draw bars
        scores.forEach((score, i) => {
            const barWidth = (score / maxScore) * chartWidth;
            const x = padding;
            const y = padding + i * barHeight;

            // Draw bar
            const gradient = ctx.createLinearGradient(x, 0, x + barWidth, 0);
            gradient.addColorStop(0, '#28a745');
            gradient.addColorStop(1, '#20c997');
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y + 5, barWidth, barHeight - 10);

            // Draw score
            ctx.fillStyle = '#333';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(Math.round(score), x + barWidth + 5, y + barHeight / 2 + 5);

            // Draw platform label
            ctx.textAlign = 'right';
            ctx.fillText(platforms[i], padding - 10, y + barHeight / 2 + 5);
        });

        // Draw title
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Quality Score Distribution', canvas.width / 2, 20);
    }

    /**
     * Create platform performance trends chart
     */
    static createPlatformTrendsChart(responses) {
        const canvas = document.getElementById('platformTrendsChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Group by platform
        const platformData = {};
        responses.forEach(r => {
            const platform = r.platform || 'Unknown';
            if (!platformData[platform]) {
                platformData[platform] = {
                    scores: [],
                    times: []
                };
            }
            platformData[platform].scores.push(r.qualityScore || 0);
            platformData[platform].times.push(r.responseTime || r.elapsed || 0);
        });

        // Clear previous chart
        canvas.width = canvas.width;

        // Calculate averages
        const platforms = Object.keys(platformData);
        const avgScores = platforms.map(p =>
            platformData[p].scores.reduce((a, b) => a + b, 0) / platformData[p].scores.length
        );
        const avgTimes = platforms.map(p =>
            platformData[p].times.reduce((a, b) => a + b, 0) / platformData[p].times.length
        );

        // Create scatter plot
        const padding = 60;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;

        const maxTime = Math.max(...avgTimes, 1);
        const maxScore = 100;

        // Draw axes
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Draw grid
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(canvas.width - padding, y);
            ctx.stroke();

            const x = padding + (chartWidth / 5) * i;
            ctx.beginPath();
            ctx.moveTo(x, padding);
            ctx.lineTo(x, canvas.height - padding);
            ctx.stroke();
        }

        // Plot points
        platforms.forEach((platform, i) => {
            const x = padding + (avgTimes[i] / maxTime) * chartWidth;
            const y = canvas.height - padding - (avgScores[i] / maxScore) * chartHeight;

            // Draw point
            ctx.fillStyle = this.getPlatformColor(platform);
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();

            // Draw label
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(platform, x, y - 15);
        });

        // Draw labels
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Response Time (ms)', canvas.width / 2, canvas.height - 10);

        ctx.save();
        ctx.translate(15, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Quality Score', 0, 0);
        ctx.restore();

        // Draw title
        ctx.font = 'bold 16px Arial';
        ctx.fillText('Performance: Quality vs Speed', canvas.width / 2, 20);
    }

    /**
     * Create word cloud from common themes
     */
    static createWordCloud(responses) {
        const container = document.getElementById('wordCloud');
        if (!container) return;

        // Extract all keywords
        const allKeywords = {};
        responses.forEach(r => {
            const text = r.response || r.text || '';
            const keywords = ComparisonEngine.extractKeywords(text, 30);
            keywords.forEach(({ word, count }) => {
                allKeywords[word] = (allKeywords[word] || 0) + count;
            });
        });

        // Sort by frequency
        const sorted = Object.entries(allKeywords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50);

        // Clear container
        container.innerHTML = '';

        // Create word elements
        const maxCount = sorted[0][1];
        sorted.forEach(([word, count]) => {
            const span = document.createElement('span');
            span.className = 'word-item';
            span.textContent = word;

            // Size based on frequency
            const fontSize = 12 + (count / maxCount) * 28;
            span.style.fontSize = fontSize + 'px';

            // Random color
            const hue = Math.random() * 360;
            span.style.color = `hsl(${hue}, 70%, 50%)`;

            container.appendChild(span);
        });
    }

    /**
     * Create similarity heatmap
     */
    static createHeatmap(responses) {
        const canvas = document.getElementById('heatmapCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const matrix = ComparisonEngine.calculateSimilarityMatrix(responses, 'cosine');

        // Clear previous chart
        canvas.width = canvas.width;

        const n = matrix.length;
        const cellSize = Math.min(
            (canvas.width - 100) / n,
            (canvas.height - 100) / n
        );
        const padding = 60;

        // Draw cells
        matrix.forEach((row, i) => {
            row.forEach((value, j) => {
                const x = padding + j * cellSize;
                const y = padding + i * cellSize;

                // Color based on similarity
                const hue = value * 120; // 0 = red, 120 = green
                ctx.fillStyle = `hsl(${hue}, 70%, ${85 - value * 20}%)`;
                ctx.fillRect(x, y, cellSize - 1, cellSize - 1);

                // Draw value
                if (cellSize > 40) {
                    ctx.fillStyle = '#333';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(
                        Math.round(value * 100) + '%',
                        x + cellSize / 2,
                        y + cellSize / 2
                    );
                }
            });
        });

        // Draw labels
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        responses.forEach((r, i) => {
            const platform = r.platform || 'R' + (i + 1);

            // Top labels
            ctx.save();
            ctx.translate(padding + i * cellSize + cellSize / 2, padding - 10);
            ctx.rotate(-Math.PI / 4);
            ctx.textAlign = 'right';
            ctx.fillText(platform, 0, 0);
            ctx.restore();

            // Left labels
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(platform, padding - 10, padding + i * cellSize + cellSize / 2);
        });

        // Draw title
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Response Similarity Heatmap', canvas.width / 2, 20);

        // Draw legend
        this.drawHeatmapLegend(ctx, canvas.width - 50, padding, 20, cellSize * n);
    }

    /**
     * Draw heatmap legend
     */
    static drawHeatmapLegend(ctx, x, y, width, height) {
        const steps = 100;
        const stepHeight = height / steps;

        for (let i = 0; i < steps; i++) {
            const value = i / steps;
            const hue = value * 120;
            ctx.fillStyle = `hsl(${hue}, 70%, ${85 - value * 20}%)`;
            ctx.fillRect(x, y + (steps - i - 1) * stepHeight, width, stepHeight);
        }

        // Draw border
        ctx.strokeStyle = '#333';
        ctx.strokeRect(x, y, width, height);

        // Draw labels
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('100%', x + width + 5, y + 5);
        ctx.fillText('50%', x + width + 5, y + height / 2);
        ctx.fillText('0%', x + width + 5, y + height);
    }

    /**
     * Get color for platform
     */
    static getPlatformColor(platform) {
        const colors = {
            'openai': '#10a37f',
            'anthropic': '#d97757',
            'google': '#4285f4',
            'meta': '#0668e1',
            'mistral': '#f2a900',
            'cohere': '#39594d'
        };
        return colors[platform?.toLowerCase()] || '#6c757d';
    }

    /**
     * Create pie chart for platform distribution
     */
    static createPieChart(ctx, data, labels, title) {
        const canvas = ctx.canvas;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2 + 20;
        const radius = Math.min(canvas.width, canvas.height) / 3;

        const total = data.reduce((a, b) => a + b, 0);
        let currentAngle = -Math.PI / 2;

        data.forEach((value, i) => {
            const sliceAngle = (value / total) * Math.PI * 2;

            // Draw slice
            ctx.fillStyle = this.getChartColor(i);
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.closePath();
            ctx.fill();

            // Draw label
            const labelAngle = currentAngle + sliceAngle / 2;
            const labelX = centerX + Math.cos(labelAngle) * (radius + 30);
            const labelY = centerY + Math.sin(labelAngle) * (radius + 30);

            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = labelX > centerX ? 'left' : 'right';
            ctx.fillText(labels[i] + ' (' + Math.round(value / total * 100) + '%)', labelX, labelY);

            currentAngle += sliceAngle;
        });

        // Draw title
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, canvas.width / 2, 20);
    }

    /**
     * Get chart color by index
     */
    static getChartColor(index) {
        const colors = [
            '#667eea', '#764ba2', '#f093fb', '#4facfe',
            '#43e97b', '#fa709a', '#fee140', '#30cfd0'
        ];
        return colors[index % colors.length];
    }

    /**
     * Create line chart
     */
    static createLineChart(ctx, datasets, labels, title) {
        const canvas = ctx.canvas;
        const padding = 60;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;

        // Find min and max values
        let maxValue = 0;
        datasets.forEach(dataset => {
            maxValue = Math.max(maxValue, ...dataset.data);
        });

        // Draw axes
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Draw grid
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(canvas.width - padding, y);
            ctx.stroke();
        }

        // Draw datasets
        datasets.forEach((dataset, datasetIndex) => {
            ctx.strokeStyle = this.getChartColor(datasetIndex);
            ctx.fillStyle = this.getChartColor(datasetIndex);
            ctx.lineWidth = 3;

            ctx.beginPath();
            dataset.data.forEach((value, i) => {
                const x = padding + (i / (dataset.data.length - 1)) * chartWidth;
                const y = canvas.height - padding - (value / maxValue) * chartHeight;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                // Draw point
                ctx.fillRect(x - 3, y - 3, 6, 6);
            });
            ctx.stroke();
        });

        // Draw labels
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        labels.forEach((label, i) => {
            const x = padding + (i / (labels.length - 1)) * chartWidth;
            ctx.fillText(label, x, canvas.height - padding + 20);
        });

        // Draw title
        ctx.font = 'bold 16px Arial';
        ctx.fillText(title, canvas.width / 2, 20);
    }

    /**
     * Create radar chart
     */
    static createRadarChart(ctx, data, labels, title) {
        const canvas = ctx.canvas;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) / 3;
        const numPoints = data.length;

        // Draw background grid
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;

        for (let i = 1; i <= 5; i++) {
            ctx.beginPath();
            for (let j = 0; j < numPoints; j++) {
                const angle = (j / numPoints) * Math.PI * 2 - Math.PI / 2;
                const r = (radius / 5) * i;
                const x = centerX + Math.cos(angle) * r;
                const y = centerY + Math.sin(angle) * r;

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
            ctx.stroke();
        }

        // Draw axes
        ctx.strokeStyle = '#ccc';
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2 - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + Math.cos(angle) * radius,
                centerY + Math.sin(angle) * radius
            );
            ctx.stroke();
        }

        // Draw data
        ctx.strokeStyle = '#667eea';
        ctx.fillStyle = 'rgba(102, 126, 234, 0.3)';
        ctx.lineWidth = 2;

        ctx.beginPath();
        data.forEach((value, i) => {
            const angle = (i / numPoints) * Math.PI * 2 - Math.PI / 2;
            const r = (value / 100) * radius;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw labels
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        labels.forEach((label, i) => {
            const angle = (i / numPoints) * Math.PI * 2 - Math.PI / 2;
            const x = centerX + Math.cos(angle) * (radius + 20);
            const y = centerY + Math.sin(angle) * (radius + 20);

            ctx.textAlign = 'center';
            ctx.fillText(label, x, y);
        });

        // Draw title
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, canvas.width / 2, 20);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Visualizations;
}
