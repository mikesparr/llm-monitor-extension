// content-script.js - Injected into LLM web pages to capture responses

class LLMContentMonitor {
  constructor() {
    this.isMonitoring = false;
    this.responseBuffer = [];
    this.init();
  }

  init() {
    // Inject script to intercept fetch/XMLHttpRequest at page level
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);

    // Listen for messages from injected script
    window.addEventListener('llm_response_intercepted', (event) => {
      this.handleInterceptedResponse(event.detail);
    });

    // Monitor DOM changes for chat interfaces
    this.observeDOM();
    
    // Handle different LLM interfaces
    this.setupProviderSpecificMonitoring();
  }

  handleInterceptedResponse(data) {
    chrome.runtime.sendMessage({
      type: 'LOG_RESPONSE',
      data: {
        timestamp: Date.now(),
        url: window.location.href,
        provider: this.detectProvider(),
        content: data.response,
        requestData: data.request,
        method: 'network_intercept'
      }
    });
  }

  observeDOM() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.checkForLLMResponse(node);
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  checkForLLMResponse(element) {
    // OpenAI ChatGPT selectors
    const chatGPTSelectors = [
      '[data-message-author-role="assistant"]',
      '.markdown',
      '[class*="Message"]'
    ];

    // Claude selectors  
    const claudeSelectors = [
      '[data-is-streaming="false"]',
      '.font-claude-message',
      '[class*="Message"][class*="assistant"]'
    ];

    // Gemini/Bard selectors
    const geminiSelectors = [
      '[data-test-id*="response"]',
      '.model-response-text',
      '[jsname*="response"]'
    ];

    const allSelectors = [...chatGPTSelectors, ...claudeSelectors, ...geminiSelectors];
    
    for (const selector of allSelectors) {
      const responseElement = element.querySelector ? element.querySelector(selector) : 
                             element.matches && element.matches(selector) ? element : null;
      
      if (responseElement) {
        this.extractAndLogResponse(responseElement);
        break;
      }
    }
  }

  extractAndLogResponse(element) {
    const textContent = this.extractText(element);
    
    if (textContent && textContent.length > 10) {
      chrome.runtime.sendMessage({
        type: 'LOG_RESPONSE',
        data: {
          timestamp: Date.now(),
          url: window.location.href,
          provider: this.detectProvider(),
          content: textContent,
          method: 'dom_extraction',
          elementInfo: {
            tagName: element.tagName,
            className: element.className,
            id: element.id
          }
        }
      });
    }
  }

  extractText(element) {
    // Handle different content types
    let text = '';
    
    // Try to get markdown content first (preserves formatting)
    const markdownElement = element.querySelector('pre, code, .language-');
    if (markdownElement) {
      text = markdownElement.textContent || markdownElement.innerText;
    } else {
      // Get all text content
      text = element.textContent || element.innerText;
    }

    return text.trim();
  }

  detectProvider() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('openai.com')) return 'OpenAI ChatGPT';
    if (hostname.includes('claude.ai') || hostname.includes('anthropic.com')) return 'Anthropic Claude';
    if (hostname.includes('bard.google.com')) return 'Google Bard';
    if (hostname.includes('gemini.google.com')) return 'Google Gemini';
    
    return 'Unknown';
  }

  setupProviderSpecificMonitoring() {
    const provider = this.detectProvider();
    
    switch (provider) {
      case 'OpenAI ChatGPT':
        this.monitorChatGPT();
        break;
      case 'Anthropic Claude':
        this.monitorClaude();
        break;
      case 'Google Bard':
      case 'Google Gemini':
        this.monitorGoogle();
        break;
    }
  }

  monitorChatGPT() {
    // Monitor for streaming responses
    const checkForStreaming = () => {
      const streamingElements = document.querySelectorAll('[data-message-author-role="assistant"]:not([data-logged])');
      streamingElements.forEach(element => {
        element.setAttribute('data-logged', 'true');
        
        // Wait for streaming to complete
        setTimeout(() => {
          this.extractAndLogResponse(element);
        }, 2000);
      });
    };

    setInterval(checkForStreaming, 1000);
  }

  monitorClaude() {
    // Monitor for Claude-specific response containers
    const checkForClaude = () => {
      const responseElements = document.querySelectorAll('[data-is-streaming="false"]:not([data-logged])');
      responseElements.forEach(element => {
        element.setAttribute('data-logged', 'true');
        this.extractAndLogResponse(element);
      });
    };

    setInterval(checkForClaude, 1000);
  }

  monitorGoogle() {
    // Monitor for Google's response format
    const checkForGoogle = () => {
      const responseElements = document.querySelectorAll('[data-test-id*="response"]:not([data-logged]), .model-response-text:not([data-logged])');
      responseElements.forEach(element => {
        element.setAttribute('data-logged', 'true');
        this.extractAndLogResponse(element);
      });
    };

    setInterval(checkForGoogle, 1000);
  }

  // Monitor user input as well
  monitorUserInput() {
    const inputSelectors = [
      'textarea[placeholder*="message"]',
      'div[contenteditable="true"]',
      'input[type="text"]'
    ];

    inputSelectors.forEach(selector => {
      const inputs = document.querySelectorAll(selector);
      inputs.forEach(input => {
        if (!input.hasAttribute('data-monitored')) {
          input.setAttribute('data-monitored', 'true');
          
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
              setTimeout(() => {
                const content = input.value || input.textContent;
                if (content && content.trim().length > 0) {
                  chrome.runtime.sendMessage({
                    type: 'LOG_REQUEST', 
                    data: {
                      timestamp: Date.now(),
                      url: window.location.href,
                      provider: this.detectProvider(),
                      content: content,
                      method: 'input_monitoring'
                    }
                  });
                }
              }, 100);
            }
          });
        }
      });
    });
  }
}

// Initialize monitoring when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new LLMContentMonitor();
  });
} else {
  new LLMContentMonitor();
}