/**
 * ish.chat Message Interceptor
 * Captures and relays messages to backend API
 */
(function() {
  'use strict';

  // ========== CONFIGURATION ==========
  const CONFIG = {
    // UPDATE THESE SELECTORS TO MATCH YOUR ish.chat IMPLEMENTATION
    chatContainer: '#ish-chat-container',
    userMessageSelector: '.user-message',
    botMessageSelector: '.bot-message',
    
    // Backend configuration
    backendUrl: 'http://localhost:8000/api/relay',
    apiKey: 'change-this-to-a-secure-random-key',
    
    // Performance settings
    debounceMs: 100,
    maxRetries: 3,
    retryDelayMs: 1000
  };

  // ========== STATE MANAGEMENT ==========
  const state = {
    processedNodes: new WeakSet(),
    messageQueue: [],
    isProcessing: false
  };

  // ========== UTILITY FUNCTIONS ==========
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // ========== MESSAGE RELAY ==========
  async function relayMessage(payload, retries = 0) {
    try {
      const response = await fetch(CONFIG.backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': CONFIG.apiKey,
          'X-Client-Version': '1.0.0'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[ish.chat] Message relayed successfully:', data);
      return data;
      
    } catch (error) {
      console.error('[ish.chat] Relay failed:', error);
      
      // Retry logic
      if (retries < CONFIG.maxRetries) {
        console.log(`[ish.chat] Retrying... (${retries + 1}/${CONFIG.maxRetries})`);
        await sleep(CONFIG.retryDelayMs * (retries + 1));
        return relayMessage(payload, retries + 1);
      }
      
      console.error('[ish.chat] Max retries reached, message lost');
      return null;
    }
  }

  // ========== MESSAGE PROCESSOR ==========
  const processMessage = debounce((node, sender) => {
    // Prevent duplicate processing
    if (state.processedNodes.has(node)) {
      return;
    }
    state.processedNodes.add(node);

    const message = node.textContent.trim();
    if (!message) {
      return;
    }

    const payload = {
      sender,
      message,
      timestamp: new Date().toISOString(),
      metadata: {
        nodeType: node.nodeName,
        classes: node.className,
        userAgent: navigator.userAgent
      }
    };

    console.log(`[ish.chat] Captured ${sender} message:`, message.substring(0, 50));
    relayMessage(payload);
    
  }, CONFIG.debounceMs);

  // ========== DOM OBSERVER ==========
  function initializeObserver() {
    const container = document.querySelector(CONFIG.chatContainer);
    
    if (!container) {
      console.error('[ish.chat] Container not found:', CONFIG.chatContainer);
      console.log('[ish.chat] Searching for potential containers...');
      
      const possibleContainers = document.querySelectorAll('[id*="chat"], [class*="chat"]');
      if (possibleContainers.length > 0) {
        console.log('[ish.chat] Found potential containers:');
        possibleContainers.forEach(el => {
          console.log(`  - ${el.tagName}#${el.id}.${el.className}`);
        });
      }
      
      // Retry after delay
      setTimeout(initializeObserver, 2000);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (node.matches(CONFIG.userMessageSelector)) {
            processMessage(node, 'user');
          } else if (node.matches(CONFIG.botMessageSelector)) {
            processMessage(node, 'bot');
          }
          
          // Also check children
          const userMessages = node.querySelectorAll(CONFIG.userMessageSelector);
          const botMessages = node.querySelectorAll(CONFIG.botMessageSelector);
          
          userMessages.forEach(msg => processMessage(msg, 'user'));
          botMessages.forEach(msg => processMessage(msg, 'bot'));
        }
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true
    });

    console.log('[ish.chat] Observer initialized successfully');
    console.log('[ish.chat] Monitoring:', CONFIG.chatContainer);
  }

  // ========== INITIALIZATION ==========
  function init() {
    console.log('[ish.chat] Interceptor starting...');
    console.log('[ish.chat] Config:', CONFIG);
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeObserver);
    } else {
      initializeObserver();
    }
  }

  // Expose configuration for debugging
  window.ishChatConfig = CONFIG;
  window.ishChatDebug = {
    state,
    processMessage,
    relayMessage
  };

  // Start
  init();
})();
