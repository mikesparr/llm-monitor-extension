// popup.js - Interface logic for the extension popup

class PopupController {
  constructor() {
    this.currentFilters = {};
    this.currentLogs = [];
    this.init();
  }

  async init() {
    // Load initial data
    await this.loadStats();
    await this.loadRecentActivity();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Auto-refresh every 30 seconds
    setInterval(() => this.refresh(), 30000);
  }

  setupEventListeners() {
    // Filter controls
    document.getElementById('providerFilter').addEventListener('change', (e) => {
      this.currentFilters.provider = e.target.value;
      this.applyFilters();
    });

    document.getElementById('riskFilter').addEventListener('change', (e) => {
      this.currentFilters.minRiskScore = e.target.value ? parseInt(e.target.value) : null;
      this.applyFilters();
    });

    document.getElementById('timeFilter').addEventListener('change', (e) => {
      this.currentFilters.timeRange = e.target.value ? parseInt(e.target.value) : null;
      this.applyFilters();
    });

    // Button controls
    document.getElementById('refreshBtn').addEventListener('click', () => this.refresh());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportLogs());
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
  }

  async loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_LOGS',
        filters: {}
      });

      if (response && response.logs) {
        this.updateStatsDisplay(response.logs);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
      this.showError('Failed to load statistics');
    }
  }

  updateStatsDisplay(logs) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = {
      total: logs.length,
      highRisk: logs.filter(log => log.riskScore >= 7).length,
      today: logs.filter(log => new Date(log.timestamp) >= today).length,
      leaks: logs.filter(log => 
        log.analysis && (log.analysis.hasPersonalData || log.analysis.hasSecrets)
      ).length
    };

    document.getElementById('totalRequests').textContent = stats.total;
    document.getElementById('highRiskCount').textContent = stats.highRisk;
    document.getElementById('todayCount').textContent = stats.today;
    document.getElementById('leaksDetected').textContent = stats.leaks;

    // Show warning if high-risk items detected
    if (stats.highRisk > 0) {
      const statusElement = document.getElementById('status');
      statusElement.textContent = `⚠️ ${stats.highRisk} high-risk interactions detected`;
      statusElement.className = 'alert alert-danger';
      statusElement.classList.remove('hidden');
    }
  }

  async loadRecentActivity() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_LOGS',
        filters: { ...this.currentFilters, limit: 10 }
      });

      if (response && response.logs) {
        this.currentLogs = response.logs;
        this.displayActivity(response.logs);
      }
    } catch (error) {
      console.error('Failed to load activity:', error);
      this.showError('Failed to load recent activity');
    }
  }

  displayActivity(logs) {
    const activityList = document.getElementById('activityList');
    
    if (!logs || logs.length === 0) {
      activityList.innerHTML = '<div class="empty-state">No LLM interactions found</div>';
      return;
    }

    // Sort by timestamp (most recent first)
    const sortedLogs = logs.sort((a, b) => b.timestamp - a.timestamp);

    activityList.innerHTML = sortedLogs.slice(0, 10).map(log => {
      const time = this.formatTime(log.timestamp);
      const riskClass = this.getRiskClass(log.riskScore);
      const riskLabel = this.getRiskLabel(log.riskScore);
      
      return `
        <div class="activity-item" data-log-id="${log.timestamp}">
          <div class="activity-info">
            <div class="activity-provider">${log.provider || 'Unknown'}</div>
            <div class="activity-time">${time}</div>
            ${log.analysis ? this.renderSensitiveDataBadges(log.analysis) : ''}
          </div>
          <div class="activity-risk ${riskClass}">${riskLabel}</div>
        </div>
      `;
    }).join('');

    // Add click handlers for detailed view
    activityList.querySelectorAll('.activity-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const logId = e.currentTarget.getAttribute('data-log-id');
        this.showLogDetails(logId);
      });
    });
  }

  renderSensitiveDataBadges(analysis) {
    if (!analysis.types || analysis.types.length === 0) {
      return '';
    }

    const badges = analysis.types.map(type => {
      const label = this.getSensitiveTypeLabel(type);
      return `<span style="background: #ff6b6b; color: white; padding: 1px 6px; border-radius: 8px; font-size: 10px; margin-right: 4px;">${label}</span>`;
    }).join('');

    return `<div style="margin-top: 4px;">${badges}</div>`;
  }

  getSensitiveTypeLabel(type) {
    const labels = {
      'ssn': 'SSN',
      'email': 'Email',
      'phone': 'Phone',
      'creditCard': 'Card',
      'apiKeys': 'API Key',
      'confidential': 'Confidential',
      'sourceCode': 'Code',
      'sqlQueries': 'SQL'
    };
    return labels[type] || type.toUpperCase();
  }

  formatTime(timestamp) {
    const now = new Date();
    const logTime = new Date(timestamp);
    const diffMs = now - logTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return logTime.toLocaleDateString();
  }

  getRiskClass(score) {
    if (score >= 7) return 'high-risk';
    if (score >= 4) return 'medium-risk';
    return 'low-risk';
  }

  getRiskLabel(score) {
    if (score >= 7) return 'HIGH';
    if (score >= 4) return 'MED';
    return 'LOW';
  }

  async applyFilters() {
    await this.loadRecentActivity();
  }

  async refresh() {
    await this.loadStats();
    await this.loadRecentActivity();
  }

  async exportLogs() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXPORT_LOGS'
      });

      if (response && response.data) {
        // Create and download CSV
        const csvContent = this.convertToCSV(response.data.logs);
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `llm-monitor-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        
        window.URL.revokeObjectURL(url);
        
        this.showSuccess('Logs exported successfully');
      }
    } catch (error) {
      console.error('Export failed:', error);
      this.showError('Failed to export logs');
    }
  }

  convertToCSV(logs) {
    if (!logs || logs.length === 0) {
      return 'No data to export';
    }

    const headers = [
      'Timestamp',
      'Provider', 
      'URL',
      'Risk Score',
      'Sensitive Types',
      'Has Personal Data',
      'Has Secrets',
      'Has Code',
      'Total Matches'
    ];

    const rows = logs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.provider || '',
      log.url || '',
      log.riskScore || 0,
      log.analysis ? log.analysis.types.join('; ') : '',
      log.analysis ? log.analysis.hasPersonalData : false,
      log.analysis ? log.analysis.hasSecrets : false,
      log.analysis ? log.analysis.hasCode : false,
      log.analysis ? log.analysis.totalMatches : 0
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  showLogDetails(logId) {
    const log = this.currentLogs.find(l => l.timestamp.toString() === logId);
    if (!log) return;

    // Create detailed view modal (simplified for popup)
    alert(`
LLM Interaction Details:

Provider: ${log.provider}
Time: ${new Date(log.timestamp).toLocaleString()}
Risk Score: ${log.riskScore}/10
URL: ${log.url}

Sensitive Data Detected:
${log.analysis ? log.analysis.types.join(', ') || 'None' : 'None'}

${log.analysis && log.analysis.hasPersonalData ? '⚠️ Contains Personal Data' : ''}
${log.analysis && log.analysis.hasSecrets ? '🔒 Contains Secrets/Keys' : ''}
${log.analysis && log.analysis.hasCode ? '💻 Contains Code' : ''}
    `);
  }

  openSettings() {
    // In a real implementation, this would open a settings page
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  }

  showSuccess(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'alert alert-success';
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 3000);
  }

  showError(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'alert alert-danger';
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 5000);
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});