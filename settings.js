// settings.js - Settings page functionality

class SettingsManager {
  constructor() {
    this.defaultSettings = {
      monitoringEnabled: true,
      riskThreshold: 7,
      retentionDays: 90,
      userIdentity: '',
      providers: {
        openai: true,
        anthropic: true,
        google: true,
        cohere: true,
        mistral: true
      },
      customDomains: [],
      detectionCategories: {
        pii: true,
        secrets: true,
        code: true,
        confidential: true,
        financial: true
      },
      customPatterns: {},
      corporateEndpoint: '',
      apiToken: '',
      organizationUnit: '',
      alerts: {
        browser: true,
        corporate: true,
        email: false
      }
    };

    this.currentSettings = { ...this.defaultSettings };
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.populateForm();
    await this.loadStatistics();
  }

  async loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(['llmMonitorSettings']);
      if (stored.llmMonitorSettings) {
        this.currentSettings = { 
          ...this.defaultSettings, 
          ...stored.llmMonitorSettings 
        };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showAlert('Failed to load settings', 'danger');
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set({ 
        llmMonitorSettings: this.currentSettings 
      });
      this.showAlert('Settings saved successfully', 'success');
      
      // Notify background script of settings change
      chrome.runtime.sendMessage({
        type: 'SETTINGS_UPDATED',
        settings: this.currentSettings
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showAlert('Failed to save settings', 'danger');
    }
  }

  populateForm() {
    // General settings
    document.getElementById('monitoringEnabled').checked = this.currentSettings.monitoringEnabled;
    document.getElementById('riskThreshold').value = this.currentSettings.riskThreshold;
    document.getElementById('thresholdValue').textContent = this.currentSettings.riskThreshold;
    document.getElementById('retentionDays').value = this.currentSettings.retentionDays;
    document.getElementById('userIdentity').value = this.currentSettings.userIdentity;

    // Provider settings
    Object.keys(this.currentSettings.providers).forEach(provider => {
      const element = document.getElementById(`provider-${provider}`);
      if (element) {
        element.checked = this.currentSettings.providers[provider];
      }
    });

    document.getElementById('customDomains').value = 
      this.currentSettings.customDomains.join('\n');

    // Detection categories
    Object.keys(this.currentSettings.detectionCategories).forEach(category => {
      const element = document.getElementById(`detect-${category}`);
      if (element) {
        element.checked = this.currentSettings.detectionCategories[category];
      }
    });

    document.getElementById('customPatterns').value = 
      JSON.stringify(this.currentSettings.customPatterns, null, 2);

    // Corporate integration
    document.getElementById('corporateEndpoint').value = this.currentSettings.corporateEndpoint;
    document.getElementById('apiToken').value = this.currentSettings.apiToken;
    document.getElementById('organizationUnit').value = this.currentSettings.organizationUnit;

    // Alert preferences
    Object.keys(this.currentSettings.alerts).forEach(alertType => {
      const element = document.getElementById(`alert-${alertType}`);
      if (element) {
        element.checked = this.currentSettings.alerts[alertType];
      }
    });
  }

  collectFormData() {
    // General settings
    this.currentSettings.monitoringEnabled = document.getElementById('monitoringEnabled').checked;
    this.currentSettings.riskThreshold = parseInt(document.getElementById('riskThreshold').value);
    this.currentSettings.retentionDays = parseInt(document.getElementById('retentionDays').value);
    this.currentSettings.userIdentity = document.getElementById('userIdentity').value;

    // Provider settings
    Object.keys(this.currentSettings.providers).forEach(provider => {
      const element = document.getElementById(`provider-${provider}`);
      if (element) {
        this.currentSettings.providers[provider] = element.checked;
      }
    });

    const customDomains = document.getElementById('customDomains').value
      .split('\n')
      .map(domain => domain.trim())
      .filter(domain => domain.length > 0);
    this.currentSettings.customDomains = customDomains;

    // Detection categories
    Object.keys(this.currentSettings.detectionCategories).forEach(category => {
      const element = document.getElementById(`detect-${category}`);
      if (element) {
        this.currentSettings.detectionCategories[category] = element.checked;
      }
    });

    // Custom patterns
    try {
      const customPatternsText = document.getElementById('customPatterns').value;
      this.currentSettings.customPatterns = customPatternsText ? 
        JSON.parse(customPatternsText) : {};
    } catch (error) {
      this.showAlert('Invalid JSON in custom patterns', 'danger');
      return false;
    }

    // Corporate integration
    this.currentSettings.corporateEndpoint = document.getElementById('corporateEndpoint').value;
    this.currentSettings.apiToken = document.getElementById('apiToken').value;
    this.currentSettings.organizationUnit = document.getElementById('organizationUnit').value;

    // Alert preferences
    Object.keys(this.currentSettings.alerts).forEach(alertType => {
      const element = document.getElementById(`alert-${alertType}`);
      if (element) {
        this.currentSettings.alerts[alertType] = element.checked;
      }
    });

    return true;
  }

  setupEventListeners() {
    // Range input for risk threshold
    document.getElementById('riskThreshold').addEventListener('input', (e) => {
      document.getElementById('thresholdValue').textContent = e.target.value;
    });

    // Save button
    document.getElementById('saveBtn').addEventListener('click', async () => {
      if (this.collectFormData()) {
        await this.saveSettings();
      }
    });

    // Cancel button
    document.getElementById('cancelBtn').addEventListener('click', () => {
      this.populateForm(); // Reset form to current settings
    });

    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
      window.close();
    });

    // Reset to defaults
    document.getElementById('resetSettingsBtn').addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
        this.currentSettings = { ...this.defaultSettings };
        this.populateForm();
        await this.saveSettings();
      }
    });

    // Export all logs
    document.getElementById('exportAllBtn').addEventListener('click', () => {
      this.exportAllLogs();
    });

    // Clear old logs
    document.getElementById('clearLogsBtn').addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear old logs? This cannot be undone.')) {
        await this.clearOldLogs();
      }
    });

    // Test detection
    document.getElementById('testDetectionBtn').addEventListener('click', () => {
      this.testDetection();
    });

    // Test corporate connection
    document.getElementById('testConnectionBtn').addEventListener('click', () => {
      this.testCorporateConnection();
    });
  }

  async loadStatistics() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_STATISTICS'
      });

      if (response) {
        document.getElementById('totalLogs').textContent = response.totalLogs || 0;
        document.getElementById('storageUsed').textContent = `${response.storageUsedMB || 0}MB`;
        document.getElementById('lastAlert').textContent = response.lastAlert || 'Never';
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  }

  async exportAllLogs() {
    try {
      this.showAlert('Exporting logs...', 'warning');
      
      const response = await chrome.runtime.sendMessage({
        type: 'EXPORT_LOGS'
      });

      if (response && response.data) {
        const csvContent = this.convertToCSV(response.data.logs);
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `llm-monitor-full-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        
        window.URL.revokeObjectURL(url);
        this.showAlert('Logs exported successfully', 'success');
      }
    } catch (error) {
      console.error('Export failed:', error);
      this.showAlert('Failed to export logs', 'danger');
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
      'Total Matches',
      'User Identity',
      'Request Method'
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
      log.analysis ? log.analysis.totalMatches : 0,
      log.userIdentity || 'Unknown',
      log.method || 'Unknown'
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  async clearOldLogs() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CLEAR_OLD_LOGS',
        retentionDays: this.currentSettings.retentionDays
      });

      if (response && response.success) {
        this.showAlert(`Cleared ${response.removedCount || 0} old log entries`, 'success');
        await this.loadStatistics();
      }
    } catch (error) {
      console.error('Failed to clear logs:', error);
      this.showAlert('Failed to clear old logs', 'danger');
    }
  }

  testDetection() {
    const testInput = document.getElementById('testInput').value;
    const resultsElement = document.getElementById('testResults');
    
    if (!testInput.trim()) {
      this.showTestResults('Please enter some text to test', 'warning');
      return;
    }

    // Simulate the detection patterns from background.js
    const sensitivePatterns = {
      ssn: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g,
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
      confidential: /(confidential|proprietary|internal\s+only|classified)/gi,
      apiKeys: /(api[_-]?key|secret[_-]?key|access[_-]?token)[\s=:]["']?([a-zA-Z0-9_-]{20,})/gi,
      sourceCode: /(function\s+\w+|def\s+\w+|class\s+\w+|import\s+\w+)/g,
      sqlQueries: /(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\s+/gi
    };

    const matches = {};
    const types = [];
    let totalMatches = 0;

    // Test against each pattern
    Object.entries(sensitivePatterns).forEach(([type, pattern]) => {
      if (this.currentSettings.detectionCategories[type] !== false) {
        const found = testInput.match(pattern);
        if (found && found.length > 0) {
          matches[type] = found;
          types.push(type);
          totalMatches += found.length;
        }
      }
    });

    // Test custom patterns if any
    Object.entries(this.currentSettings.customPatterns).forEach(([name, pattern]) => {
      try {
        const regex = new RegExp(pattern, 'gi');
        const found = testInput.match(regex);
        if (found && found.length > 0) {
          matches[`custom_${name}`] = found;
          types.push(`custom_${name}`);
          totalMatches += found.length;
        }
      } catch (error) {
        console.error(`Invalid custom pattern ${name}:`, error);
      }
    });

    // Calculate risk score
    let riskScore = 0;
    const hasPersonalData = types.some(t => ['ssn', 'email', 'phone', 'creditCard'].includes(t));
    const hasSecrets = types.some(t => ['apiKeys', 'confidential'].includes(t));
    const hasCode = types.includes('sourceCode');

    if (hasPersonalData) riskScore += 5;
    if (hasSecrets) riskScore += 8;
    if (hasCode) riskScore += 3;
    if (totalMatches > 5) riskScore += 2;
    if (totalMatches > 10) riskScore += 3;

    riskScore = Math.min(riskScore, 10);

    // Display results
    let resultMessage = `Detection Results:\n`;
    resultMessage += `Risk Score: ${riskScore}/10\n`;
    resultMessage += `Total Matches: ${totalMatches}\n`;
    resultMessage += `Sensitive Types: ${types.join(', ') || 'None'}\n\n`;

    if (Object.keys(matches).length > 0) {
      resultMessage += 'Detected Patterns:\n';
      Object.entries(matches).forEach(([type, found]) => {
        resultMessage += `• ${type}: ${found.join(', ')}\n`;
      });
    }

    const alertType = riskScore >= 7 ? 'danger' : riskScore >= 4 ? 'warning' : 'success';
    this.showTestResults(resultMessage, alertType);
  }

  async testCorporateConnection() {
    const endpoint = document.getElementById('corporateEndpoint').value;
    const token = document.getElementById('apiToken').value;
    const resultsElement = document.getElementById('connectionResults');

    if (!endpoint) {
      resultsElement.textContent = 'Please enter a corporate endpoint URL';
      resultsElement.style.color = '#dc3545';
      return;
    }

    resultsElement.textContent = 'Testing connection...';
    resultsElement.style.color = '#6c757d';

    try {
      const testPayload = {
        test: true,
        timestamp: Date.now(),
        message: 'LLM Monitor connection test'
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(testPayload)
      });

      if (response.ok) {
        resultsElement.textContent = `✅ Connection successful (${response.status})`;
        resultsElement.style.color = '#28a745';
      } else {
        resultsElement.textContent = `❌ Connection failed (${response.status}: ${response.statusText})`;
        resultsElement.style.color = '#dc3545';
      }
    } catch (error) {
      resultsElement.textContent = `❌ Connection error: ${error.message}`;
      resultsElement.style.color = '#dc3545';
    }
  }

  showAlert(message, type = 'success') {
    const alertContainer = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    alertContainer.innerHTML = '';
    alertContainer.appendChild(alert);

    // Auto-hide success alerts after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        if (alert.parentNode) {
          alert.parentNode.removeChild(alert);
        }
      }, 3000);
    }
  }

  showTestResults(message, type) {
    const resultsElement = document.getElementById('testResults');
    resultsElement.textContent = message;
    resultsElement.className = `alert alert-${type}`;
    resultsElement.classList.remove('hidden');
  }
}

// Initialize settings manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new SettingsManager();
});