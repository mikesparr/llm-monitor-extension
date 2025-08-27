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
    // OpenAI ChatGPT (both chat.openai.com and chatgpt.com)
    const chatGPTSelectors = [
      '[data-message-author-role="assistant"]',
      '[data-testid*="conversation-turn"]',
      '.markdown',
      '[class*="Message"]',
      '[class*="response"]'
    ];

    // Claude selectors  
    const claudeSelectors = [
      '[data-is-streaming="false"]',
      '.font-claude-message',
      '[class*="Message"][class*="assistant"]',
      '[data-testid="message-text"]'
    ];

    // Google (Gemini/Bard/AI Studio) selectors
    const googleSelectors = [
      '[data-test-id*="response"]',
      '.model-response-text',
      '[jsname*="response"]',
      '.response-container-content',
      '[class*="assistant-response"]',
      // AI Studio specific selectors
      '[data-testid="model-response"]',
      '.model-output',
      '[class*="generated-content"]',
      '.response-text',
      // MakerSuite selectors
      '.prompt-response',
      '[data-response-id]'
    ];

    // Microsoft Copilot/Bing selectors
    const microsoftSelectors = [
      '.ac-textBlock',
      '.b_slideexp',
      '[class*="response-message"]',
      '.cib-serp-main',
      '[data-content*="response"]'
    ];

    // Character.AI selectors
    const characterSelectors = [
      '[class*="ChatMessage"]',
      '[data-testid="message"]',
      '.msg',
      '[class*="character-message"]'
    ];

    // You.com selectors
    const youcomSelectors = [
      '.chat-turn',
      '[data-testid="chat-turn"]',
      '.youChatAnswer',
      '[class*="ai-response"]'
    ];

    // Poe selectors
    const poeSelectors = [
      '[class*="Message_botMessageBubble"]',
      '[class*="ChatMessage"]',
      '[data-testid="botMessage"]'
    ];

    // Meta AI selectors
    const metaSelectors = [
      '[data-testid="message-container"]',
      '.x1i10hfl',
      '[role="article"]'
    ];

    // Generic fallback selectors for other LLMs
    const genericSelectors = [
      '[class*="message"]',
      '[class*="response"]',
      '[class*="assistant"]',
      '[class*="bot"]',
      '[class*="ai"]',
      '[data-role="assistant"]',
      '[data-author="assistant"]'
    ];

    const allSelectors = [
      ...chatGPTSelectors, 
      ...claudeSelectors, 
      ...googleSelectors,
      ...microsoftSelectors,
      ...characterSelectors,
      ...youcomSelectors,
      ...poeSelectors,
      ...metaSelectors,
      ...genericSelectors
    ];
    
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
    
    if (hostname.includes('openai.com') || hostname === 'chatgpt.com') return 'OpenAI ChatGPT';
    if (hostname.includes('claude.ai') || hostname.includes('anthropic.com')) return 'Anthropic Claude';
    if (hostname.includes('bard.google.com')) return 'Google Bard';
    if (hostname.includes('gemini.google.com') || hostname.includes('ai.google.com')) return 'Google Gemini';
    if (hostname.includes('aistudio.google.com')) return 'Google AI Studio';
    if (hostname.includes('makersuite.google.com')) return 'Google MakerSuite';
    if (hostname.includes('copilot.microsoft.com')) return 'Microsoft Copilot';
    if (hostname.includes('bing.com')) return 'Microsoft Bing Chat';
    if (hostname.includes('you.com')) return 'You.com';
    if (hostname.includes('character.ai')) return 'Character.AI';
    if (hostname.includes('poe.com')) return 'Poe by Quora';
    if (hostname.includes('pi.ai')) return 'Inflection Pi';
    if (hostname.includes('meta.ai') || hostname.includes('llama.meta.com')) return 'Meta AI';
    if (hostname.includes('mistral.ai')) return 'Mistral AI';
    if (hostname.includes('perplexity.ai')) return 'Perplexity';
    if (hostname.includes('writesonic.com')) return 'Writesonic';
    if (hostname.includes('jasper.ai')) return 'Jasper';
    if (hostname.includes('copy.ai')) return 'Copy.ai';
    if (hostname.includes('grammarly.com')) return 'Grammarly AI';
    if (hostname.includes('notion.so')) return 'Notion AI';
    if (hostname.includes('huggingface.co')) return 'Hugging Face';
    
    return 'Unknown LLM Service';
  }

  setupProviderSpecificMonitoring() {
    const provider = this.detectProvider();
    
    switch (true) {
      case provider.includes('OpenAI'):
        this.monitorChatGPT();
        break;
      case provider.includes('Claude'):
        this.monitorClaude();
        break;
      case provider.includes('Google'):
        this.monitorGoogle();
        break;
      case provider.includes('Microsoft'):
        this.monitorMicrosoft();
        break;
      case provider.includes('Character'):
        this.monitorCharacterAI();
        break;
      case provider.includes('You.com'):
        this.monitorYouCom();
        break;
      case provider.includes('Poe'):
        this.monitorPoe();
        break;
      case provider.includes('Meta'):
        this.monitorMeta();
        break;
      default:
        this.monitorGeneric();
        break;
    }
  }

  monitorChatGPT() {
    // Monitor for streaming responses (works for both chat.openai.com and chatgpt.com)
    const checkForStreaming = () => {
      const streamingElements = document.querySelectorAll(
        '[data-message-author-role="assistant"]:not([data-logged]), [data-testid*="conversation-turn"]:not([data-logged])'
      );
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
    // Monitor for Google's response format (Bard, Gemini, AI Studio, MakerSuite)
    const checkForGoogle = () => {
      const responseElements = document.querySelectorAll(`
        [data-test-id*="response"]:not([data-logged]), 
        .model-response-text:not([data-logged]),
        [data-testid="model-response"]:not([data-logged]),
        .model-output:not([data-logged]),
        .response-text:not([data-logged]),
        .prompt-response:not([data-logged])
      `);
      responseElements.forEach(element => {
        element.setAttribute('data-logged', 'true');
        this.extractAndLogResponse(element);
      });
    };

    setInterval(checkForGoogle, 1000);
  }

  monitorMicrosoft() {
    // Monitor Microsoft Copilot/Bing Chat responses
    const checkForMicrosoft = () => {
      const responseElements = document.querySelectorAll('.ac-textBlock:not([data-logged]), .cib-serp-main:not([data-logged])');
      responseElements.forEach(element => {
        element.setAttribute('data-logged', 'true');
        this.extractAndLogResponse(element);
      });
    };

    setInterval(checkForMicrosoft, 1000);
  }

  monitorCharacterAI() {
    // Monitor Character.AI responses
    const checkForCharacter = () => {
      const responseElements = document.querySelectorAll('[class*="ChatMessage"]:not([data-logged]), [data-testid="message"]:not([data-logged])');
      responseElements.forEach(element => {
        element.setAttribute('data-logged', 'true');
        this.extractAndLogResponse(element);
      });
    };

    setInterval(checkForCharacter, 1000);
  }

  monitorYouCom() {
    // Monitor You.com responses
    const checkForYou = () => {
      const responseElements = document.querySelectorAll('.youChatAnswer:not([data-logged]), [data-testid="chat-turn"]:not([data-logged])');
      responseElements.forEach(element => {
        element.setAttribute('data-logged', 'true');
        this.extractAndLogResponse(element);
      });
    };

    setInterval(checkForYou, 1000);
  }

  monitorPoe() {
    // Monitor Poe by Quora responses
    const checkForPoe = () => {
      const responseElements = document.querySelectorAll('[class*="Message_botMessageBubble"]:not([data-logged]), [data-testid="botMessage"]:not([data-logged])');
      responseElements.forEach(element => {
        element.setAttribute('data-logged', 'true');
        this.extractAndLogResponse(element);
      });
    };

    setInterval(checkForPoe, 1000);
  }

  monitorMeta() {
    // Monitor Meta AI responses
    const checkForMeta = () => {
      const responseElements = document.querySelectorAll('[data-testid="message-container"]:not([data-logged]), [role="article"]:not([data-logged])');
      responseElements.forEach(element => {
        element.setAttribute('data-logged', 'true');
        this.extractAndLogResponse(element);
      });
    };

    setInterval(checkForMeta, 1000);
  }

  monitorGeneric() {
    // Generic monitoring for unknown LLM interfaces
    const checkForGeneric = () => {
      const responseElements = document.querySelectorAll(
        '[class*="message"]:not([data-logged]), [class*="response"]:not([data-logged]), [class*="assistant"]:not([data-logged]), [class*="bot"]:not([data-logged])'
      );
      responseElements.forEach(element => {
        element.setAttribute('data-logged', 'true');
        this.extractAndLogResponse(element);
      });
    };

    setInterval(checkForGeneric, 1000);
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