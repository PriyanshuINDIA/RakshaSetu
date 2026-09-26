/**
 * RakshaSetu Citizen Core - Connectivity Service
 *
 * Provides honest connectivity telemetry:
 * - Distinguishes between browser online flag and actual reachable internet
 * - States: ONLINE | OFFLINE | DEGRADED | UNKNOWN
 * - Lightweight health probes against Supabase / edge origin
 * - Network change detection and listener registration
 */

export const ConnectivityState = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  DEGRADED: 'DEGRADED',
  UNKNOWN: 'UNKNOWN'
};

class ConnectivityService {
  constructor() {
    this.currentState = typeof navigator !== 'undefined' && !navigator.onLine
      ? ConnectivityState.OFFLINE
      : ConnectivityState.UNKNOWN;

    this.lastCheckedAt = null;
    this.lastLatencyMs = null;
    this.probeTimer = null;
    this.subscribers = new Set();
    this.isProbing = false;

    this._bindBrowserEvents();
    // Initial async probe
    if (typeof window !== 'undefined') {
      setTimeout(() => this.checkConnectivity(), 100);
    }
  }

  _bindBrowserEvents() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this._setState(ConnectivityState.UNKNOWN);
      this.checkConnectivity();
    });

    window.addEventListener('offline', () => {
      this._setState(ConnectivityState.OFFLINE);
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkConnectivity();
        }
      });
    }

    // Periodic lightweight probe every 30 seconds
    this.probeTimer = setInterval(() => {
      this.checkConnectivity();
    }, 30000);
  }

  _setState(newState) {
    if (this.currentState !== newState) {
      const prev = this.currentState;
      this.currentState = newState;
      this._notifySubscribers(newState, prev);
    }
  }

  getState() {
    return this.currentState;
  }

  isOnline() {
    return this.currentState === ConnectivityState.ONLINE;
  }

  isEligibleForRetry() {
    return this.currentState === ConnectivityState.ONLINE || this.currentState === ConnectivityState.DEGRADED;
  }

  async checkConnectivity(options = {}) {
    const { timeoutMs = 4000 } = options;

    // Fast-path offline check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this._setState(ConnectivityState.OFFLINE);
      this.lastCheckedAt = Date.now();
      return ConnectivityState.OFFLINE;
    }

    if (this.isProbing) return this.currentState;
    this.isProbing = true;

    const start = Date.now();
    try {
      // Lightweight probe using cache-busted favicon or Supabase ping
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      const probeUrl = `./manifest.webmanifest?_t=${Date.now()}`;
      const response = await fetch(probeUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller?.signal
      });

      if (timeoutId) clearTimeout(timeoutId);

      const latency = Date.now() - start;
      this.lastLatencyMs = latency;
      this.lastCheckedAt = Date.now();

      if (response && (response.ok || response.status < 400)) {
        if (latency > 2500) {
          this._setState(ConnectivityState.DEGRADED);
        } else {
          this._setState(ConnectivityState.ONLINE);
        }
      } else {
        this._setState(ConnectivityState.DEGRADED);
      }
    } catch {
      // Probe failed
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        // Browser claims online but probe failed
        this._setState(ConnectivityState.DEGRADED);
      } else {
        this._setState(ConnectivityState.OFFLINE);
      }
    } finally {
      this.isProbing = false;
    }

    return this.currentState;
  }

  subscribe(listener) {
    if (typeof listener === 'function') {
      this.subscribers.add(listener);
      return () => this.subscribers.delete(listener);
    }
    return () => {};
  }

  _notifySubscribers(newState, prevState) {
    for (const listener of this.subscribers) {
      try {
        listener(newState, prevState);
      } catch (e) {
        console.warn('[ConnectivityService] Subscriber error:', e);
      }
    }
  }
}

export const connectivityService = new ConnectivityService();
