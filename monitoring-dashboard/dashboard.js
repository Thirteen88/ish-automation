/**
 * Dashboard Controller for AI Orchestrator Monitoring
 *
 * Manages WebSocket connections, real-time updates, and visualizations
 */

class MonitoringDashboard {
    constructor(options = {}) {
        this.options = {
            wsUrl: options.wsUrl || this.getWebSocketUrl(),
            refreshInterval: options.refreshInterval || 5000, // 5 seconds
            reconnectDelay: options.reconnectDelay || 3000,
            maxReconnectAttempts: options.maxReconnectAttempts || 10,
            ...options
        };

        // Initialize components
        this.metricsCollector = new MetricsCollector();
        this.alertManager = new AlertManager();

        // WebSocket state
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;

        // Auto-refresh state
        this.autoRefresh = false;
        this.refreshTimer = null;

        // Theme state
        this.darkMode = true;

        // Charts
        this.charts = {};

        // UI elements
        this.elements = {};

        // Initialize
        this.init();
    }

    /**
     * Get WebSocket URL
     */
    getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port || '8000';
        return `${protocol}//${host}:${port}/ws`;
    }

    /**
     * Initialize dashboard
     */
    async init() {
        // Cache UI elements
        this.cacheElements();

        // Setup event listeners
        this.setupEventListeners();

        // Initialize charts
        this.initializeCharts();

        // Load initial data
        await this.loadInitialData();

        // Connect WebSocket
        this.connectWebSocket();

        // Setup auto-refresh
        this.setupAutoRefresh();

        // Show overview section by default
        this.showSection('overview');

        // Start update loop
        this.startUpdateLoop();

        console.log('Dashboard initialized');
    }

    /**
     * Cache DOM elements
     */
    cacheElements() {
        // Status elements
        this.elements.wsStatus = document.getElementById('wsStatus');
        this.elements.wsStatusText = document.getElementById('wsStatusText');

        // Metric elements
        this.elements.totalQueries = document.getElementById('totalQueries');
        this.elements.avgResponseTime = document.getElementById('avgResponseTime');
        this.elements.errorRate = document.getElementById('errorRate');
        this.elements.activePlatforms = document.getElementById('activePlatforms');
        this.elements.totalPlatforms = document.getElementById('totalPlatforms');

        // Change indicators
        this.elements.queriesChange = document.getElementById('queriesChange');
        this.elements.responseTimeChange = document.getElementById('responseTimeChange');
        this.elements.errorRateChange = document.getElementById('errorRateChange');
        this.elements.platformsStatus = document.getElementById('platformsStatus');

        // Container elements
        this.elements.platformsGrid = document.getElementById('platformsGrid');
        this.elements.queriesList = document.getElementById('queriesList');
        this.elements.alertsList = document.getElementById('alertsList');

        // Counter elements
        this.elements.activeQueryCount = document.getElementById('activeQueryCount');
        this.elements.alertCount = document.getElementById('alertCount');

        // Resource elements
        this.elements.cpuUsage = document.getElementById('cpuUsage');
        this.elements.cpuBar = document.getElementById('cpuBar');
        this.elements.cpuDetails = document.getElementById('cpuDetails');
        this.elements.memoryUsage = document.getElementById('memoryUsage');
        this.elements.memoryBar = document.getElementById('memoryBar');
        this.elements.memoryDetails = document.getElementById('memoryDetails');
        this.elements.networkIO = document.getElementById('networkIO');
        this.elements.networkBar = document.getElementById('networkBar');
        this.elements.networkDetails = document.getElementById('networkDetails');
        this.elements.diskUsage = document.getElementById('diskUsage');
        this.elements.diskBar = document.getElementById('diskBar');
        this.elements.diskDetails = document.getElementById('diskDetails');
        this.elements.uptime = document.getElementById('uptime');
        this.elements.uptimeDetails = document.getElementById('uptimeDetails');
        this.elements.requestsPerSec = document.getElementById('requestsPerSec');
        this.elements.requestsBar = document.getElementById('requestsBar');
        this.elements.requestsDetails = document.getElementById('requestsDetails');

        // Buttons
        this.elements.autoRefreshToggle = document.getElementById('autoRefreshToggle');
        this.elements.themeToggle = document.getElementById('themeToggle');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const section = item.dataset.section;
                this.showSection(section);

                // Update active state
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
            });
        });

        // Auto-refresh toggle
        this.elements.autoRefreshToggle.addEventListener('click', () => {
            this.toggleAutoRefresh();
        });

        // Theme toggle
        this.elements.themeToggle.addEventListener('click', () => {
            this.toggleTheme();
        });
    }

    /**
     * Initialize charts
     */
    initializeCharts() {
        // Response time chart
        this.charts.responseTime = this.createLineChart(
            'responseTimeChart',
            'Response Time (ms)',
            {
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true
            }
        );

        // Error rate chart
        this.charts.errorRate = this.createLineChart(
            'errorRateChart',
            'Error Rate (%)',
            {
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true
            }
        );

        // Query volume chart
        this.charts.queryVolume = this.createBarChart(
            'queryVolumeChart',
            'Queries',
            {
                backgroundColor: '#10b981'
            }
        );

        // Platform distribution chart
        this.charts.platformDist = this.createDoughnutChart('platformDistChart');
    }

    /**
     * Create line chart
     */
    createLineChart(canvasId, label, style = {}) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: label,
                    data: [],
                    borderColor: style.borderColor || '#6366f1',
                    backgroundColor: style.backgroundColor || 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    fill: style.fill || false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#f8fafc',
                        bodyColor: '#f8fafc',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            color: 'rgba(51, 65, 85, 0.3)'
                        },
                        ticks: {
                            color: '#94a3b8',
                            maxRotation: 0
                        }
                    },
                    y: {
                        display: true,
                        grid: {
                            color: 'rgba(51, 65, 85, 0.3)'
                        },
                        ticks: {
                            color: '#94a3b8'
                        },
                        beginAtZero: true
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    /**
     * Create bar chart
     */
    createBarChart(canvasId, label, style = {}) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: label,
                    data: [],
                    backgroundColor: style.backgroundColor || '#10b981',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#f8fafc',
                        bodyColor: '#f8fafc',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#94a3b8'
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(51, 65, 85, 0.3)'
                        },
                        ticks: {
                            color: '#94a3b8'
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * Create doughnut chart
     */
    createDoughnutChart(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#6366f1',
                        '#10b981',
                        '#f59e0b',
                        '#ef4444',
                        '#3b82f6',
                        '#8b5cf6'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#94a3b8',
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#f8fafc',
                        bodyColor: '#f8fafc',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12
                    }
                }
            }
        });
    }

    /**
     * Connect to WebSocket
     */
    connectWebSocket() {
        try {
            this.ws = new WebSocket(this.options.wsUrl);

            this.ws.addEventListener('open', () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                this.updateConnectionStatus('connected');
                console.log('WebSocket connected');
            });

            this.ws.addEventListener('message', (event) => {
                this.handleWebSocketMessage(event.data);
            });

            this.ws.addEventListener('close', () => {
                this.connected = false;
                this.updateConnectionStatus('disconnected');
                console.log('WebSocket disconnected');
                this.scheduleReconnect();
            });

            this.ws.addEventListener('error', (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('error');
            });
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            this.updateConnectionStatus('error');
            this.scheduleReconnect();
        }
    }

    /**
     * Handle WebSocket message
     */
    handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'metrics':
                    this.handleMetricsUpdate(message.data);
                    break;
                case 'query':
                    this.handleQueryUpdate(message.data);
                    break;
                case 'platform':
                    this.handlePlatformUpdate(message.data);
                    break;
                case 'alert':
                    this.handleAlertUpdate(message.data);
                    break;
                case 'resources':
                    this.handleResourcesUpdate(message.data);
                    break;
                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Failed to handle WebSocket message:', error);
        }
    }

    /**
     * Handle metrics update
     */
    handleMetricsUpdate(data) {
        this.metricsCollector.recordQuery(data);
        this.updateMetricsDisplay();
    }

    /**
     * Handle query update
     */
    handleQueryUpdate(data) {
        this.metricsCollector.recordQuery(data);
        this.updateActiveQueries();
    }

    /**
     * Handle platform update
     */
    handlePlatformUpdate(data) {
        this.metricsCollector.recordPlatformMetric(data.platform, data);
        this.updatePlatformDisplay();
    }

    /**
     * Handle alert update
     */
    handleAlertUpdate(data) {
        this.alertManager.addAlert(data);
        this.updateAlertsDisplay();
    }

    /**
     * Handle resources update
     */
    handleResourcesUpdate(data) {
        this.metricsCollector.recordResources(data);
        this.updateResourcesDisplay();
    }

    /**
     * Schedule WebSocket reconnect
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.options.reconnectDelay * this.reconnectAttempts;

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(status) {
        const indicator = this.elements.wsStatus;
        const text = this.elements.wsStatusText;

        indicator.classList.remove('connected', 'disconnected', 'error');

        switch (status) {
            case 'connected':
                indicator.classList.add('connected');
                text.textContent = 'Connected';
                break;
            case 'disconnected':
                text.textContent = 'Disconnected';
                break;
            case 'error':
                indicator.classList.add('error');
                text.textContent = 'Error';
                break;
            default:
                text.textContent = 'Unknown';
        }
    }

    /**
     * Load initial data
     */
    async loadInitialData() {
        try {
            // Try to fetch from API
            const response = await fetch('/api/metrics');
            if (response.ok) {
                const data = await response.json();
                this.metricsCollector.importData(data);
            }
        } catch (error) {
            console.log('No initial data available, using defaults');
        }

        // Generate mock data for demo
        this.generateMockData();

        // Update display
        this.updateAllDisplays();
    }

    /**
     * Generate mock data for demo
     */
    generateMockData() {
        const platforms = ['claude', 'chatgpt', 'gemini', 'perplexity'];

        // Generate historical data
        const now = Date.now();
        for (let i = 144; i >= 0; i--) { // Last 24 hours (10-minute intervals)
            const timestamp = now - (i * 10 * 60 * 1000);

            platforms.forEach(platform => {
                const success = Math.random() > 0.1;
                const responseTime = 1000 + Math.random() * 3000;

                this.metricsCollector.recordQuery({
                    platform,
                    success,
                    responseTime,
                    timestamp
                });
            });
        }

        // Generate current resource data
        this.metricsCollector.recordResources({
            cpu: 45 + Math.random() * 20,
            memory: 60 + Math.random() * 15,
            network: Math.random() * 1000,
            disk: 50 + Math.random() * 10,
            uptime: Date.now() - (24 * 60 * 60 * 1000),
            requestsPerSecond: 10 + Math.random() * 20
        });
    }

    /**
     * Update all displays
     */
    updateAllDisplays() {
        this.updateMetricsDisplay();
        this.updatePlatformDisplay();
        this.updateChartsDisplay();
        this.updateActiveQueries();
        this.updateAlertsDisplay();
        this.updateResourcesDisplay();
    }

    /**
     * Update metrics display
     */
    updateMetricsDisplay() {
        const metrics = this.metricsCollector.getCurrentMetrics();
        const stats = this.metricsCollector.getPerformanceStats(3600000);

        // Update values
        this.elements.totalQueries.textContent = this.formatNumber(metrics.totalQueries);
        this.elements.avgResponseTime.textContent = this.formatDuration(metrics.avgResponseTime);
        this.elements.errorRate.textContent = this.formatPercentage(metrics.errorRate);

        const platforms = this.metricsCollector.getAllPlatformMetrics();
        const activePlatforms = platforms.filter(p => p.status !== 'disabled').length;
        this.elements.activePlatforms.textContent = activePlatforms;
        this.elements.totalPlatforms.textContent = platforms.length;

        // Update changes
        this.elements.queriesChange.textContent = this.formatPercentage(Math.abs(stats.queryVolume.trend / 100));
        this.elements.responseTimeChange.textContent = this.formatPercentage(Math.abs(stats.responseTime.trend / 100));
        this.elements.errorRateChange.textContent = this.formatPercentage(Math.abs(stats.errorRate.trend / 100));

        // Update platform status
        const unhealthyPlatforms = platforms.filter(p => p.status === 'unhealthy').length;
        if (unhealthyPlatforms > 0) {
            this.elements.platformsStatus.textContent = `${unhealthyPlatforms} platforms degraded`;
        } else {
            this.elements.platformsStatus.textContent = 'All operational';
        }
    }

    /**
     * Update platform display
     */
    updatePlatformDisplay() {
        const platforms = this.metricsCollector.getAllPlatformMetrics();
        const container = this.elements.platformsGrid;

        container.innerHTML = '';

        platforms.forEach(platform => {
            const card = this.createPlatformCard(platform);
            container.appendChild(card);
        });
    }

    /**
     * Create platform card
     */
    createPlatformCard(platform) {
        const div = document.createElement('div');
        div.className = `platform-card ${platform.status}`;

        div.innerHTML = `
            <div class="platform-header">
                <div class="platform-name">${this.formatPlatformName(platform.name)}</div>
                <div class="platform-status ${platform.status}">${platform.status}</div>
            </div>
            <div class="platform-metrics">
                <div class="platform-metric">
                    <div class="platform-metric-label">Response Time</div>
                    <div class="platform-metric-value">${this.formatDuration(platform.avgResponseTime)}</div>
                </div>
                <div class="platform-metric">
                    <div class="platform-metric-label">Error Rate</div>
                    <div class="platform-metric-value">${this.formatPercentage(platform.errorRate)}</div>
                </div>
                <div class="platform-metric">
                    <div class="platform-metric-label">Total Queries</div>
                    <div class="platform-metric-value">${this.formatNumber(platform.totalQueries)}</div>
                </div>
                <div class="platform-metric">
                    <div class="platform-metric-label">Success Rate</div>
                    <div class="platform-metric-value">${this.formatPercentage(platform.successfulQueries / platform.totalQueries)}</div>
                </div>
            </div>
        `;

        return div;
    }

    /**
     * Update charts display
     */
    updateChartsDisplay() {
        this.updateResponseTimeChart();
        this.updateErrorRateChart();
        this.updateQueryVolumeChart();
        this.updatePlatformDistChart();
    }

    /**
     * Update response time chart
     */
    updateResponseTimeChart() {
        const data = this.metricsCollector.getTimeSeries('responseTime', 86400000);

        this.charts.responseTime.data.labels = data.map(d =>
            new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        this.charts.responseTime.data.datasets[0].data = data.map(d => d.value);
        this.charts.responseTime.update('none');
    }

    /**
     * Update error rate chart
     */
    updateErrorRateChart() {
        const data = this.metricsCollector.getTimeSeries('errorRate', 86400000);

        this.charts.errorRate.data.labels = data.map(d =>
            new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        this.charts.errorRate.data.datasets[0].data = data.map(d => d.value * 100);
        this.charts.errorRate.update('none');
    }

    /**
     * Update query volume chart
     */
    updateQueryVolumeChart() {
        const data = this.metricsCollector.getTimeSeries('queryVolume', 86400000);

        // Group by hour
        const hourlyData = {};
        data.forEach(d => {
            const hour = new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            hourlyData[hour] = (hourlyData[hour] || 0) + d.value;
        });

        this.charts.queryVolume.data.labels = Object.keys(hourlyData).slice(-24);
        this.charts.queryVolume.data.datasets[0].data = Object.values(hourlyData).slice(-24);
        this.charts.queryVolume.update('none');
    }

    /**
     * Update platform distribution chart
     */
    updatePlatformDistChart() {
        const platforms = this.metricsCollector.getAllPlatformMetrics();

        this.charts.platformDist.data.labels = platforms.map(p => this.formatPlatformName(p.name));
        this.charts.platformDist.data.datasets[0].data = platforms.map(p => p.totalQueries);
        this.charts.platformDist.update('none');
    }

    /**
     * Update active queries display
     */
    updateActiveQueries() {
        // This would typically come from WebSocket
        // For now, show empty state
        const container = this.elements.queriesList;
        this.elements.activeQueryCount.textContent = '0';

        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-tasks"></i>
                <p>No active queries</p>
            </div>
        `;
    }

    /**
     * Update alerts display
     */
    updateAlertsDisplay() {
        const alerts = this.alertManager.getRecentAlerts(10);
        const container = this.elements.alertsList;
        this.elements.alertCount.textContent = alerts.length;

        if (alerts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bell"></i>
                    <p>No recent alerts</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        alerts.forEach(alert => {
            const item = this.createAlertItem(alert);
            container.appendChild(item);
        });
    }

    /**
     * Create alert item
     */
    createAlertItem(alert) {
        const div = document.createElement('div');
        div.className = `alert-item ${alert.severity}`;

        const icon = alert.severity === 'critical' ? 'fa-exclamation-circle' :
                     alert.severity === 'warning' ? 'fa-exclamation-triangle' :
                     'fa-info-circle';

        div.innerHTML = `
            <div class="alert-icon ${alert.severity}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="alert-content">
                <div class="alert-title">${alert.title}</div>
                <div class="alert-message">${alert.message}</div>
                <div class="alert-time">${this.formatRelativeTime(alert.timestamp)}</div>
            </div>
        `;

        return div;
    }

    /**
     * Update resources display
     */
    updateResourcesDisplay() {
        const resources = this.metricsCollector.currentMetrics.resources;

        // CPU
        this.elements.cpuUsage.textContent = this.formatPercentage(resources.cpu / 100);
        this.elements.cpuBar.style.width = `${resources.cpu}%`;
        this.elements.cpuBar.className = 'resource-bar-fill ' + this.getResourceClass(resources.cpu);
        this.elements.cpuDetails.textContent = `${resources.cpu.toFixed(1)}% of available cores`;

        // Memory
        this.elements.memoryUsage.textContent = this.formatPercentage(resources.memory / 100);
        this.elements.memoryBar.style.width = `${resources.memory}%`;
        this.elements.memoryBar.className = 'resource-bar-fill ' + this.getResourceClass(resources.memory);
        this.elements.memoryDetails.textContent = `${(resources.memory / 100 * 16).toFixed(1)} GB / 16 GB`;

        // Network
        this.elements.networkIO.textContent = this.formatBytes(resources.network) + '/s';
        const networkPercent = Math.min((resources.network / 10000) * 100, 100);
        this.elements.networkBar.style.width = `${networkPercent}%`;
        this.elements.networkDetails.textContent = `In: ${this.formatBytes(resources.network * 0.6)}/s, Out: ${this.formatBytes(resources.network * 0.4)}/s`;

        // Disk
        this.elements.diskUsage.textContent = this.formatPercentage(resources.disk / 100);
        this.elements.diskBar.style.width = `${resources.disk}%`;
        this.elements.diskBar.className = 'resource-bar-fill ' + this.getResourceClass(resources.disk);
        this.elements.diskDetails.textContent = `${(resources.disk / 100 * 500).toFixed(0)} GB / 500 GB`;

        // Uptime
        this.elements.uptime.textContent = this.formatUptime(resources.uptime);
        this.elements.uptimeDetails.textContent = `Started: ${new Date(Date.now() - resources.uptime).toLocaleString()}`;

        // Requests per second
        this.elements.requestsPerSec.textContent = resources.requestsPerSecond.toFixed(1);
        const reqPercent = Math.min((resources.requestsPerSecond / 100) * 100, 100);
        this.elements.requestsBar.style.width = `${reqPercent}%`;
        this.elements.requestsDetails.textContent = `Peak: ${(resources.requestsPerSecond * 1.5).toFixed(1)} req/s`;
    }

    /**
     * Get resource usage class
     */
    getResourceClass(percentage) {
        if (percentage >= 90) return 'critical';
        if (percentage >= 70) return 'warning';
        return '';
    }

    /**
     * Show section
     */
    showSection(section) {
        // Hide all sections
        document.querySelectorAll('.dashboard-section, .platforms-section, .charts-section, .active-queries-section, .alerts-section, .system-resources-section').forEach(el => {
            el.classList.add('section-hidden');
        });

        // Show selected section
        const sectionMap = {
            overview: 'overview-section',
            platforms: 'platforms-section',
            performance: 'performance-section',
            queries: 'queries-section',
            alerts: 'alerts-section',
            resources: 'resources-section'
        };

        const sectionId = sectionMap[section];
        if (sectionId) {
            document.getElementById(sectionId).classList.remove('section-hidden');
        }

        // Update charts if performance section
        if (section === 'performance') {
            setTimeout(() => this.updateChartsDisplay(), 100);
        }
    }

    /**
     * Toggle auto-refresh
     */
    toggleAutoRefresh() {
        this.autoRefresh = !this.autoRefresh;

        const button = this.elements.autoRefreshToggle;
        const span = button.querySelector('span');

        if (this.autoRefresh) {
            button.classList.add('active');
            span.textContent = 'Auto-refresh: ON';
        } else {
            button.classList.remove('active');
            span.textContent = 'Auto-refresh: OFF';
        }
    }

    /**
     * Setup auto-refresh
     */
    setupAutoRefresh() {
        setInterval(() => {
            if (this.autoRefresh) {
                this.refreshData();
            }
        }, this.options.refreshInterval);
    }

    /**
     * Refresh data
     */
    async refreshData() {
        try {
            const response = await fetch('/api/metrics');
            if (response.ok) {
                const data = await response.json();
                this.handleMetricsUpdate(data);
            }
        } catch (error) {
            console.error('Failed to refresh data:', error);
        }
    }

    /**
     * Toggle theme
     */
    toggleTheme() {
        this.darkMode = !this.darkMode;
        document.body.classList.toggle('light-mode');

        const button = this.elements.themeToggle;
        const icon = button.querySelector('i');
        const span = button.querySelector('span');

        if (this.darkMode) {
            icon.className = 'fas fa-moon';
            span.textContent = 'Dark Mode';
        } else {
            icon.className = 'fas fa-sun';
            span.textContent = 'Light Mode';
        }

        // Update chart colors
        this.updateChartTheme();
    }

    /**
     * Update chart theme
     */
    updateChartTheme() {
        const gridColor = this.darkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(226, 232, 240, 0.5)';
        const textColor = this.darkMode ? '#94a3b8' : '#64748b';

        Object.values(this.charts).forEach(chart => {
            if (!chart) return;

            if (chart.options.scales) {
                if (chart.options.scales.x) {
                    chart.options.scales.x.grid.color = gridColor;
                    chart.options.scales.x.ticks.color = textColor;
                }
                if (chart.options.scales.y) {
                    chart.options.scales.y.grid.color = gridColor;
                    chart.options.scales.y.ticks.color = textColor;
                }
            }

            if (chart.options.plugins?.legend?.labels) {
                chart.options.plugins.legend.labels.color = textColor;
            }

            chart.update('none');
        });
    }

    /**
     * Start update loop
     */
    startUpdateLoop() {
        setInterval(() => {
            this.updateAllDisplays();
        }, 1000);
    }

    /**
     * Format number
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toFixed(0);
    }

    /**
     * Format duration
     */
    formatDuration(ms) {
        if (ms < 1000) {
            return ms.toFixed(0) + 'ms';
        }
        return (ms / 1000).toFixed(2) + 's';
    }

    /**
     * Format percentage
     */
    formatPercentage(ratio) {
        return (ratio * 100).toFixed(1) + '%';
    }

    /**
     * Format bytes
     */
    formatBytes(bytes) {
        if (bytes < 1024) return bytes.toFixed(0) + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    /**
     * Format uptime
     */
    formatUptime(ms) {
        const days = Math.floor(ms / (24 * 60 * 60 * 1000));
        const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

        return `${days}d ${hours}h ${minutes}m`;
    }

    /**
     * Format relative time
     */
    formatRelativeTime(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    /**
     * Format platform name
     */
    formatPlatformName(name) {
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.ws) {
            this.ws.close();
        }

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        this.metricsCollector.destroy();

        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new MonitoringDashboard();
});
