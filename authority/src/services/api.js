/* ==========================================================================
   RakshaSetu Authority - Core API & Network Client
   Supports:
   - Dynamic Operational Mode: MODE = 'DEMO' | 'API'
   - Configurable Base URL & WebSocket URL
   - Unified HTTP Client with timeout, JSON parsing, and resilient error handling
   - Event-driven mode transition notification
   ========================================================================== */

export const MODES = {
  DEMO: 'DEMO',
  API: 'API'
};

class ApiClient {
  constructor() {
    // Mode persistence via localStorage or default to DEMO
    const storedMode = (typeof localStorage !== 'undefined') ? localStorage.getItem('raksha_mode') : null;
    this.mode = storedMode === MODES.API ? MODES.API : MODES.DEMO;

    const storedBase = (typeof localStorage !== 'undefined') ? localStorage.getItem('raksha_api_base') : null;
    this.baseUrl = storedBase || (window.location.origin ? `${window.location.origin}/api` : '/api');

    const storedWs = (typeof localStorage !== 'undefined') ? localStorage.getItem('raksha_ws_url') : null;
    this.wsUrl = storedWs || '';

    this.listeners = new Set();
    this.defaultTimeoutMs = 8000;
  }

  getMode() {
    return this.mode;
  }

  isDemo() {
    return false;
  }

  isApi() {
    return true; // Supabase is the sole live backend transport
  }

  setMode(newMode) {
    if (newMode !== MODES.DEMO && newMode !== MODES.API) {
      console.warn(`[ApiClient] Invalid mode: ${newMode}`);
      return;
    }
    const prevMode = this.mode;
    this.mode = newMode;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('raksha_mode', newMode);
    }
    console.info(`[ApiClient] Operating Mode changed: ${prevMode} -> ${newMode}`);
    this.notifyModeChange(newMode, prevMode);
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/+$/, '');
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('raksha_api_base', this.baseUrl);
    }
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  setWsUrl(url) {
    this.wsUrl = url;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('raksha_ws_url', this.wsUrl);
    }
  }

  getWsUrl() {
    return this.wsUrl;
  }

  onModeChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyModeChange(newMode, prevMode) {
    this.listeners.forEach(cb => {
      try {
        cb(newMode, prevMode);
      } catch (err) {
        console.error('[ApiClient] Mode change listener error:', err);
      }
    });
  }

  // HTTP Request abstraction
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || this.defaultTimeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        let errorData = null;
        try {
          errorData = await response.json();
        } catch (_) {
          errorData = { message: response.statusText };
        }
        const error = new Error(errorData.message || `HTTP ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.data = errorData;
        throw error;
      }

      // 204 No Content
      if (response.status === 204) return null;
      return await response.json();
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        const timeoutError = new Error(`Request to ${endpoint} timed out after ${options.timeout || this.defaultTimeoutMs}ms`);
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      throw err;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { method: 'GET', ...options });
  }

  post(endpoint, body = {}, options = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      ...options
    });
  }

  patch(endpoint, body = {}, options = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
      ...options
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { method: 'DELETE', ...options });
  }
}

export const api = new ApiClient();
window.__rakshaApi = api;
