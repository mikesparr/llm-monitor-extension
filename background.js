// background.js - Service Worker for intercepting network requests

class LLMMonitor {
  constructor() {
    this.llmEndpoints = new Map([
      // OpenAI
      ['chat.openai.com', { provider: 'OpenAI ChatGPT', type: 'web' }],
      ['chatgpt.com', { provider: 'OpenAI ChatGPT', type: 'web' }],
      ['api.openai.com', { provider: 'OpenAI', type: 'api' }],
      
      // Anthropic
      ['claude.ai', { provider: 'Anthropic Claude', type: 'web' }],
      ['api.anthropic.com', { provider: 'Anthropic', type: 'api' }],
      
      // Google
      ['bard.google.com', { provider: 'Google Bard', type: 'web' }],
      ['gemini.google.com', { provider: 'Google Gemini', type: 'web' }],
      ['ai.google.com', { provider: 'Google AI', type: 'web' }],
      ['aistudio.google.com', { provider: 'Google AI Studio', type: 'web' }],
      ['makersuite.google.com', { provider: 'Google MakerSuite', type: 'web' }],
      
      // Microsoft
      ['copilot.microsoft.com', { provider: 'Microsoft Copilot', type: 'web' }],
      ['bing.com', { provider: 'Microsoft Bing Chat', type: 'web' }],
      ['www.bing.com', { provider: 'Microsoft Bing Chat', type: 'web' }],
      
      // Meta
      ['meta.ai', { provider: 'Meta AI', type: 'web' }],
      ['llama.meta.com', { provider: 'Meta Llama', type: 'web' }],
      
      // Other Popular LLMs
      ['you.com', { provider: 'You.com', type: 'web' }],
      ['character.ai', { provider: 'Character.AI', type: 'web' }],
      ['beta.character.ai', { provider: 'Character.AI', type: 'web' }],
      ['poe.com', { provider: 'Poe by Quora', type: 'web' }],
      ['pi.ai', { provider: 'Inflection Pi', type: 'web' }],
      
      // API Endpoints
      ['api.cohere.ai', { provider: 'Cohere', type: 'api' }],
      ['api.mistral.ai', { provider: 'Mistral', type: 'api' }],
      ['chat.mistral.ai', { provider: 'Mistral Chat', type: 'web' }],
      ['api.perplexity.ai', { provider: 'Perplexity', type: 'api' }],
      
      // Content Creation Tools with AI
      ['app.writesonic.com', { provider: 'Writesonic', type: 'web' }],
      ['app.jasper.ai', { provider: 'Jasper', type: 'web' }],
      ['app.copy.ai', { provider: 'Copy.ai', type: 'web' }],
      ['app.grammarly.com', { provider: 'Grammarly AI', type: 'web' }],
      ['www.notion.so', { provider: 'Notion AI', type: 'web' }],
      
      // Development/Code AI
      ['huggingface.co', { provider: 'Hugging Face', type: 'web' }],
      ['replicate.com', { provider: 'Replicate', type: 'web' }],
      ['together.ai', { provider: 'Together AI', type: 'web' }]
    ]);
    
    this.sensitivePatterns = {
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
    
    this.init();
  }

  init() {
    // Listen for web requests to LLM services
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => this.interceptRequest(details),
      {
        urls: Array.from(this.llmEndpoints.keys()).map(domain => `*://${domain}/*`)
      },
      ['requestBody']
    );

    // Listen for responses
    chrome.webRequest.onResponseStarted.addListener(
      (details) => this.interceptResponse(details),
      {
        urls: Array.from(this.llmEndpoints.keys()).map(domain => `*://${domain}/*`)
      },
      ['responseHeaders']
    );

    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });
  }

  interceptRequest(details) {
    const url = new URL(details.url);
    const endpoint = this.llmEndpoints.get(url.hostname);
    
    if (!endpoint) return;

    // Only process POST requests (where LLM interactions typically happen)
    if (details.method !== 'POST') return;

    let requestBody = '';
    if (details.requestBody) {
      if (details.requestBody.formData) {
        // Handle form data
        requestBody = JSON.stringify(details.requestBody.formData);
      } else if (details.requestBody.raw) {
        // Handle raw data (typical for API calls)
        const decoder = new TextDecoder();
        requestBody = details.requestBody.raw
          .map(chunk => decoder.decode(chunk.bytes))
          .join('');
      }
    }

    // Analyze the request
    this.analyzeAndLogRequest({
      timestamp: Date.now(),
      tabId: details.tabId,
      url: details.url,
      provider: endpoint.provider,
      type: endpoint.type,
      method: details.method,
      requestBody: requestBody,
      requestId: details.requestId
    });
  }

  async interceptResponse(details) {
    // We'll get the actual response content from content scripts
    // since webRequest API doesn't provide response body in Manifest V3
    
    const url = new URL(details.url);
    const endpoint = this.llmEndpoints.get(url.hostname);
    
    if (endpoint) {
      // Store response metadata for correlation
      await this.storeResponseMetadata({
        requestId: details.requestId,
        timestamp: Date.now(),
        statusCode: details.statusCode,
        provider: endpoint.provider
      });
    }
  }

  async analyzeAndLogRequest(requestData) {
    const analysis = this.analyzeSensitiveData(requestData.requestBody);
    
    const logEntry = {
      ...requestData,
      analysis,
      riskScore: this.calculateRiskScore(analysis)
    };

    // Store locally
    await this.storeLogEntry(logEntry);
    
    // Send alert if high risk
    if (logEntry.riskScore >= 7) {
      this.sendAlert(logEntry);
    }

    console.log('LLM Request Intercepted:', logEntry);
  }

  analyzeSensitiveData(text) {
    if (!text || typeof text !== 'string') return { matches: [], types: [] };

    const matches = {};
    const types = [];

    for (const [type, pattern] of Object.entries(this.sensitivePatterns)) {
      const found = text.match(pattern);
      if (found && found.length > 0) {
        matches[type] = found;
        types.push(type);
      }
    }

    return {
      matches,
      types,
      hasPersonalData: types.some(t => ['ssn', 'email', 'phone', 'creditCard'].includes(t)),
      hasSecrets: types.some(t => ['apiKeys', 'confidential'].includes(t)),
      hasCode: types.includes('sourceCode'),
      totalMatches: Object.values(matches).reduce((sum, arr) => sum + arr.length, 0)
    };
  }

  calculateRiskScore(analysis) {
    let score = 0;
    
    // Base scoring
    if (analysis.hasPersonalData) score += 5;
    if (analysis.hasSecrets) score += 8;
    if (analysis.hasCode) score += 3;
    
    // Volume multiplier
    if (analysis.totalMatches > 5) score += 2;
    if (analysis.totalMatches > 10) score += 3;
    
    return Math.min(score, 10); // Cap at 10
  }

  async storeLogEntry(entry) {
    const key = `llm_log_${entry.timestamp}_${entry.requestId}`;
    await chrome.storage.local.set({ [key]: entry });
    
    // Also maintain an index
    const { logIndex = [] } = await chrome.storage.local.get(['logIndex']);
    logIndex.push({
      key,
      timestamp: entry.timestamp,
      provider: entry.provider,
      riskScore: entry.riskScore,
      url: entry.url
    });
    
    // Keep only last 1000 entries
    if (logIndex.length > 1000) {
      const toRemove = logIndex.splice(0, logIndex.length - 1000);
      for (const item of toRemove) {
        chrome.storage.local.remove(item.key);
      }
    }
    
    await chrome.storage.local.set({ logIndex });
  }

  async storeResponseMetadata(metadata) {
    await chrome.storage.local.set({ 
      [`response_${metadata.requestId}`]: metadata 
    });
  }

  sendAlert(logEntry) {
    // Create notification for high-risk requests
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'High Risk LLM Interaction Detected',
      message: `Sensitive data detected in ${logEntry.provider} request (Risk: ${logEntry.riskScore}/10)`
    });

    // Could also send to corporate monitoring system
    this.sendToCorporateMonitoring(logEntry);
  }

  async sendToCorporateMonitoring(logEntry) {
    // In a real implementation, this would send to your corporate SIEM/monitoring
    try {
      const corporateEndpoint = await this.getCorporateEndpoint();
      if (corporateEndpoint) {
        fetch(corporateEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: logEntry.timestamp,
            user: await this.getUserIdentity(),
            provider: logEntry.provider,
            riskScore: logEntry.riskScore,
            sensitiveTypes: logEntry.analysis.types,
            url: logEntry.url
          })
        });
      }
    } catch (error) {
      console.error('Failed to send to corporate monitoring:', error);
    }
  }

  async getCorporateEndpoint() {
    // Get from enterprise policy or storage
    const { corporateEndpoint } = await chrome.storage.managed.get(['corporateEndpoint']);
    return corporateEndpoint;
  }

  async getUserIdentity() {
    // In enterprise deployment, this could come from AD/LDAP integration
    const { userIdentity } = await chrome.storage.sync.get(['userIdentity']);
    return userIdentity || 'unknown';
  }

  async handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'LOG_RESPONSE':
        await this.logResponse(message.data);
        sendResponse({ success: true });
        break;
        
      case 'GET_LOGS':
        const logs = await this.getLogs(message.filters);
        sendResponse({ logs });
        break;
        
      case 'EXPORT_LOGS':
        const exportData = await this.exportLogs();
        sendResponse({ data: exportData });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }

  async logResponse(responseData) {
    const analysis = this.analyzeSensitiveData(responseData.content);
    
    const logEntry = {
      ...responseData,
      analysis,
      riskScore: this.calculateRiskScore(analysis),
      type: 'response'
    };

    await this.storeLogEntry(logEntry);
  }

  async getLogs(filters = {}) {
    const { logIndex = [] } = await chrome.storage.local.get(['logIndex']);
    
    let filteredIndex = logIndex;
    
    if (filters.provider) {
      filteredIndex = filteredIndex.filter(log => log.provider === filters.provider);
    }
    
    if (filters.minRiskScore) {
      filteredIndex = filteredIndex.filter(log => log.riskScore >= filters.minRiskScore);
    }
    
    if (filters.timeRange) {
      const cutoff = Date.now() - (filters.timeRange * 24 * 60 * 60 * 1000);
      filteredIndex = filteredIndex.filter(log => log.timestamp >= cutoff);
    }

    // Get full log entries
    const keys = filteredIndex.slice(0, 100).map(log => log.key); // Limit to 100
    const logData = await chrome.storage.local.get(keys);
    
    return Object.values(logData);
  }

  async exportLogs() {
    const logs = await this.getLogs();
    return {
      exportDate: new Date().toISOString(),
      totalEntries: logs.length,
      logs: logs
    };
  }
}

// Initialize the monitor
const monitor = new LLMMonitor();