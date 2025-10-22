/**
 * Side Panel Script for AI Orchestrator Extension
 */

let activeQueries = new Map();
let selectedQueryForComparison = null;
let history = [];

// Initialize side panel
document.addEventListener('DOMContentLoaded', initialize);

function initialize() {
  // Setup tab switching
  setupTabs();

  // Load active queries
  loadActiveQueries();

  // Load history
  loadHistory();

  // Listen for updates
  chrome.runtime.onMessage.addListener(handleMessage);

  // Auto-refresh active queries
  setInterval(loadActiveQueries, 2000);
}

// Setup tab switching
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      // Add active class to clicked tab
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      document.getElementById(`${tabName}-tab`).classList.add('active');

      // Load content for tab
      if (tabName === 'history') {
        loadHistory();
      } else if (tabName === 'comparison' && selectedQueryForComparison) {
        showComparison(selectedQueryForComparison);
      }
    });
  });
}

// Load active queries
function loadActiveQueries() {
  chrome.runtime.sendMessage({ action: 'getActiveQueries' }, (response) => {
    if (!response || !response.queries) return;

    const queries = response.queries;
    activeQueries.clear();

    queries.forEach(query => {
      activeQueries.set(query.id, query);
    });

    renderActiveQueries();
  });
}

// Render active queries
function renderActiveQueries() {
  const container = document.getElementById('active-queries');

  if (activeQueries.size === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <h3>No Active Queries</h3>
        <p>Submit a query from the popup or right-click selected text</p>
      </div>
    `;
    return;
  }

  container.innerHTML = Array.from(activeQueries.values()).map(query =>
    renderQueryCard(query)
  ).join('');

  // Add event listeners
  setupQueryCardListeners();
}

// Render query card
function renderQueryCard(query) {
  const statusCounts = {
    processing: 0,
    complete: 0,
    error: 0
  };

  Object.values(query.responses || {}).forEach(response => {
    if (response.status === 'complete') statusCounts.complete++;
    else if (response.status === 'error') statusCounts.error++;
    else statusCounts.processing++;
  });

  return `
    <div class="query-card" data-query-id="${query.id}">
      <div class="query-header">
        <div>
          <div class="query-prompt">${escapeHtml(query.prompt)}</div>
          <div class="query-meta">
            ${formatTimestamp(query.timestamp)} •
            ${statusCounts.complete} complete,
            ${statusCounts.processing} processing
          </div>
        </div>
        <div class="query-actions">
          <button class="icon-btn" onclick="compareQuery('${query.id}')">Compare</button>
          <button class="icon-btn" onclick="exportQuery('${query.id}')">Export</button>
          <button class="icon-btn" onclick="clearQuery('${query.id}')">✕</button>
        </div>
      </div>

      <div class="responses-grid">
        ${query.platforms.map(platform => renderResponseCard(query, platform)).join('')}
      </div>

      <div class="export-options">
        <button class="export-btn" onclick="exportAsJSON('${query.id}')">Export JSON</button>
        <button class="export-btn" onclick="exportAsMarkdown('${query.id}')">Export Markdown</button>
        <button class="export-btn" onclick="copyAllResponses('${query.id}')">Copy All</button>
      </div>
    </div>
  `;
}

// Render response card
function renderResponseCard(query, platform) {
  const response = query.responses[platform] || { status: 'pending' };

  let statusClass = 'processing';
  let statusText = 'Processing...';
  let responseText = '<div class="loading-spinner"><div class="spinner"></div></div>';
  let duration = '';

  if (response.status === 'complete' && response.success) {
    statusClass = 'complete';
    statusText = 'Complete';
    responseText = escapeHtml(response.response || '');
    duration = response.duration ? `${response.duration}ms` : '';
  } else if (response.status === 'error') {
    statusClass = 'error';
    statusText = 'Error';
    responseText = `<span style="color: #C62828;">${escapeHtml(response.error || 'Unknown error')}</span>`;
  } else if (response.chunks && response.chunks.length > 0) {
    statusClass = 'processing';
    statusText = 'Streaming...';
    responseText = escapeHtml(response.chunks.join(''));
  }

  const truncated = responseText.length > 500;
  const displayText = truncated ? responseText.substring(0, 500) + '...' : responseText;

  return `
    <div class="response-card" data-platform="${platform}">
      <div class="response-header">
        <div class="platform-name">${getPlatformName(platform)}</div>
        <div class="response-status ${statusClass}">${statusText}</div>
      </div>
      <div class="response-body" id="response-${query.id}-${platform}">
        ${displayText}
        ${truncated ? `<div class="expand-btn" onclick="expandResponse('${query.id}', '${platform}')">Show more</div>` : ''}
      </div>
      <div class="response-footer">
        <div class="response-duration">${duration}</div>
        <div class="response-actions">
          <button class="vote-btn" onclick="vote('${query.id}', '${platform}', 'up')">👍</button>
          <button class="vote-btn" onclick="vote('${query.id}', '${platform}', 'down')">👎</button>
          <button class="vote-btn" onclick="vote('${query.id}', '${platform}', 'best')">⭐</button>
          <button class="vote-btn" onclick="copyResponse('${query.id}', '${platform}')">📋</button>
        </div>
      </div>
    </div>
  `;
}

// Setup query card listeners
function setupQueryCardListeners() {
  // Event delegation is used in onclick attributes
}

// Expand response
window.expandResponse = function(queryId, platform) {
  const responseEl = document.getElementById(`response-${queryId}-${platform}`);
  if (!responseEl) return;

  const query = activeQueries.get(queryId);
  if (!query) return;

  const response = query.responses[platform];
  if (!response || !response.response) return;

  responseEl.innerHTML = escapeHtml(response.response);
  responseEl.classList.add('expanded');
};

// Vote on response
window.vote = async function(queryId, platform, voteType) {
  try {
    const response = await fetch('http://localhost:3000/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queryId,
        platform,
        vote: voteType
      })
    });

    if (response.ok) {
      showNotification(`Voted ${voteType} for ${getPlatformName(platform)}`);
    }
  } catch (error) {
    console.error('Vote error:', error);
  }
};

// Copy response
window.copyResponse = function(queryId, platform) {
  const query = activeQueries.get(queryId);
  if (!query) return;

  const response = query.responses[platform];
  if (!response || !response.response) return;

  navigator.clipboard.writeText(response.response).then(() => {
    showNotification('Response copied to clipboard!');
  });
};

// Copy all responses
window.copyAllResponses = function(queryId) {
  const query = activeQueries.get(queryId);
  if (!query) return;

  let text = `Query: ${query.prompt}\n\n`;

  for (const [platform, response] of Object.entries(query.responses)) {
    if (response.success && response.response) {
      text += `=== ${getPlatformName(platform)} ===\n`;
      text += response.response + '\n\n';
    }
  }

  navigator.clipboard.writeText(text).then(() => {
    showNotification('All responses copied to clipboard!');
  });
};

// Compare query
window.compareQuery = function(queryId) {
  selectedQueryForComparison = queryId;

  // Switch to comparison tab
  document.querySelector('.tab[data-tab="comparison"]').click();

  showComparison(queryId);
};

// Show comparison
function showComparison(queryId) {
  const query = activeQueries.get(queryId);
  if (!query) return;

  const grid = document.getElementById('comparison-grid');

  grid.innerHTML = query.platforms.map(platform => {
    const response = query.responses[platform];
    if (!response || !response.success) return '';

    return `
      <div class="response-card">
        <div class="response-header">
          <div class="platform-name">${getPlatformName(platform)}</div>
          <div class="response-status complete">Complete</div>
        </div>
        <div class="response-body expanded">
          ${escapeHtml(response.response || '')}
        </div>
        <div class="response-footer">
          <div class="response-duration">${response.duration}ms</div>
          <div class="response-actions">
            <button class="vote-btn" onclick="vote('${queryId}', '${platform}', 'best')">Mark as Best</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Export query as JSON
window.exportAsJSON = async function(queryId) {
  const query = activeQueries.get(queryId);
  if (!query) return;

  const dataStr = JSON.stringify(query, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `query-${queryId}.json`;
  link.click();

  URL.revokeObjectURL(url);
  showNotification('Exported as JSON');
};

// Export query as Markdown
window.exportAsMarkdown = async function(queryId) {
  const query = activeQueries.get(queryId);
  if (!query) return;

  let markdown = `# AI Query Results\n\n`;
  markdown += `**Query:** ${query.prompt}\n\n`;
  markdown += `**Date:** ${new Date(query.timestamp).toLocaleString()}\n\n`;
  markdown += `---\n\n`;

  for (const [platform, response] of Object.entries(query.responses)) {
    if (response.success && response.response) {
      markdown += `## ${getPlatformName(platform)}\n\n`;
      markdown += `${response.response}\n\n`;
      markdown += `*Duration: ${response.duration}ms*\n\n`;
      markdown += `---\n\n`;
    }
  }

  const dataBlob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `query-${queryId}.md`;
  link.click();

  URL.revokeObjectURL(url);
  showNotification('Exported as Markdown');
};

// Clear query
window.clearQuery = function(queryId) {
  if (confirm('Remove this query from active list?')) {
    chrome.runtime.sendMessage({
      action: 'clearQuery',
      queryId
    });

    activeQueries.delete(queryId);
    renderActiveQueries();
  }
};

// Load history
async function loadHistory() {
  const result = await chrome.storage.local.get(['history']);
  history = result.history || [];

  renderHistory();
}

// Render history
function renderHistory() {
  const container = document.getElementById('history-list');

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
          <path d="M3 21v-5h5"/>
        </svg>
        <h3>No Query History</h3>
        <p>Your query history will appear here</p>
      </div>
    `;
    return;
  }

  container.innerHTML = history.map(item => `
    <div class="history-item" onclick="loadHistoryItem('${item.id}')">
      <div class="history-prompt">${escapeHtml(item.prompt)}</div>
      <div class="history-meta">
        <span>${formatTimestamp(item.timestamp)}</span>
        <span>${item.platforms.length} platforms</span>
      </div>
    </div>
  `).join('');
}

// Load history item
window.loadHistoryItem = function(queryId) {
  // Switch to active tab and try to find the query
  document.querySelector('.tab[data-tab="active"]').click();

  // If query is still active, scroll to it
  const queryCard = document.querySelector(`[data-query-id="${queryId}"]`);
  if (queryCard) {
    queryCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    queryCard.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.3)';
    setTimeout(() => {
      queryCard.style.boxShadow = '';
    }, 2000);
  }
};

// Handle messages
function handleMessage(request, sender, sendResponse) {
  switch (request.action) {
    case 'queryUpdate':
      if (request.query) {
        activeQueries.set(request.query.id, request.query);
        renderActiveQueries();
      }
      break;

    case 'showQuery':
      if (request.queryId) {
        loadHistoryItem(request.queryId);
      }
      break;
  }
}

// Show notification
function showNotification(message) {
  // Simple notification - could be enhanced
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10000;
    font-size: 14px;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Helper functions

function getPlatformName(platform) {
  const names = {
    'lmarena': 'LMArena',
    'claude': 'Claude',
    'chatgpt': 'ChatGPT',
    'gemini': 'Gemini',
    'poe': 'Poe'
  };
  return names[platform] || platform;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  const days = Math.floor(diff / 86400000);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString();
}
