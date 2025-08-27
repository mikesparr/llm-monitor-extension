// injected.js - Runs in page context to intercept network requests

(function() {
  'use strict';

  // Store original fetch and XMLHttpRequest
  const originalFetch = window.fetch;
  const originalXHR = window.XMLHttpRequest;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  // LLM API endpoints to monitor
  const llmEndpoints = [
    'api.openai.com',
    'api.anthropic.com', 
    'generativelanguage.googleapis.com',
    'api.cohere.ai',
    'api.mistral.ai'
  ];

  function isLLMEndpoint(url) {
    return llmEndpoints.some(endpoint => url.includes(endpoint));
  }

  function dispatchLLMEvent(type, data) {
    window.dispatchEvent(new CustomEvent('llm_response_intercepted', {
      detail: { type, ...data }
    }));
  }

  // Intercept fetch requests
  window.fetch = async function(...args) {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource.url;
    
    if (isLLMEndpoint(url)) {
      console.log('LLM Fetch intercepted:', url);
      
      // Capture request data
      let requestData = null;
      if (config && config.body) {
        try {
          requestData = typeof config.body === 'string' ? 
            JSON.parse(config.body) : config.body;
        } catch (e) {
          requestData = config.body;
        }
      }

      try {
        const response = await originalFetch.apply(this, args);
        
        // Clone response to read body
        const responseClone = response.clone();
        const responseText = await responseClone.text();
        
        dispatchLLMEvent('fetch_response', {
          url,
          method: config?.method || 'GET',
          request: requestData,
          response: responseText,
          status: response.status,
          timestamp: Date.now()
        });
        
        return response;
      } catch (error) {
        dispatchLLMEvent('fetch_error', {
          url,
          error: error.message,
          timestamp: Date.now()
        });
        throw error;
      }
    }
    
    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequest
  class InterceptedXHR extends originalXHR {
    constructor() {
      super();
      this._url = null;
      this._method = null;
      this._requestData = null;
    }

    open(method, url, ...args) {
      this._method = method;
      this._url = url;
      
      if (isLLMEndpoint(url)) {
        console.log('LLM XHR intercepted:', url);
        
        // Override onreadystatechange to capture response
        const originalOnReadyStateChange = this.onreadystatechange;
        
        this.onreadystatechange = function(e) {
          if (this.readyState === XMLHttpRequest.DONE && isLLMEndpoint(this._url)) {
            dispatchLLMEvent('xhr_response', {
              url: this._url,
              method: this._method,
              request: this._requestData,
              response: this.responseText,
              status: this.status,
              timestamp: Date.now()
            });
          }
          
          if (originalOnReadyStateChange) {
            originalOnReadyStateChange.apply(this, arguments);
          }
        };
      }
      
      return originalOpen.apply(this, [method, url, ...args]);
    }

    send(data) {
      if (isLLMEndpoint(this._url)) {
        this._requestData = data;
      }
      return originalSend.apply(this, arguments);
    }
  }

  window.XMLHttpRequest = InterceptedXHR;

  // Intercept EventSource (Server-Sent Events) for streaming responses
  const originalEventSource = window.EventSource;
  
  window.EventSource = class extends originalEventSource {
    constructor(url, eventSourceInitDict) {
      super(url, eventSourceInitDict);
      
      if (isLLMEndpoint(url)) {
        console.log('LLM EventSource intercepted:', url);
        
        this.addEventListener('message', (event) => {
          dispatchLLMEvent('sse_message', {
            url: url,
            data: event.data,
            timestamp: Date.now()
          });
        });
      }
    }
  };

  // Intercept WebSocket connections (less common but some LLMs use them)
  const originalWebSocket = window.WebSocket;
  
  window.WebSocket = class extends originalWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      
      if (isLLMEndpoint(url)) {
        console.log('LLM WebSocket intercepted:', url);
        
        this.addEventListener('message', (event) => {
          dispatchLLMEvent('websocket_message', {
            url: url,
            data: event.data,
            timestamp: Date.now()
          });
        });
      }
    }
  };

  console.log('LLM network interceptor injected successfully');

})();