/**
 * RakshaSetu Citizen Core - Offline Queue
 *
 * Authoritative durable storage for offline operational events using IndexedDB.
 * Implements best-effort durable offline synchronization with retry and idempotency.
 *
 * Event Types:
 * - 'SOS_INCIDENT'
 * - 'RESOURCE_REQUEST'
 * - 'FAMILY_IM_SAFE'
 * - 'HEARTBEAT'
 *
 * Statuses:
 * - 'PENDING'
 * - 'SYNCING'
 * - 'SYNCED'
 * - 'FAILED'
 *
 * Priorities:
 * - 'CRITICAL' (Weight: 40)
 * - 'HIGH'     (Weight: 30)
 * - 'NORMAL'   (Weight: 20)
 * - 'LOW'      (Weight: 10)
 */

export const QueueEventStatus = {
  PENDING: 'PENDING',
  SYNCING: 'SYNCING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED'
};

export const QueueEventPriority = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  LOW: 'LOW'
};

const PRIORITY_WEIGHTS = {
  [QueueEventPriority.CRITICAL]: 40,
  [QueueEventPriority.HIGH]: 30,
  [QueueEventPriority.NORMAL]: 20,
  [QueueEventPriority.LOW]: 10
};

const DB_NAME = 'RakshaSetu_DB';
const DB_VERSION = 3;
const STORE_NAME = 'offline_queue';
const STATE_STORE_NAME = 'operational_state';

class OfflineQueue {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.initPromise = this._initDatabase();
    this.subscribers = new Set();
  }

  async _initDatabase() {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[OfflineQueue] IndexedDB is not supported in this browser. Offline operations will be memory-limited.');
      return null;
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Preserve existing stores if created in DB_VERSION 1
        if (!db.objectStoreNames.contains('regional_packages')) {
          db.createObjectStore('regional_packages', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        }

        // Authoritative durable offline queue store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('priority', 'priority', { unique: false });
          store.createIndex('created_at', 'created_at', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }

        // Operational state store for last-known location and operational device cache
        if (!db.objectStoreNames.contains(STATE_STORE_NAME)) {
          db.createObjectStore(STATE_STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onblocked = () => {
        console.warn('[OfflineQueue] IndexedDB open blocked by another connection');
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.db.onversionchange = () => {
          try { this.db.close(); } catch {}
        };
        this.isReady = true;
        resolve(this.db);
      };

      request.onerror = (err) => {
        console.error('[OfflineQueue] IndexedDB open error:', err);
        resolve(null);
      };
    });
  }

  _generateId(prefix = 'evt') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async enqueue(type, payload, priority = QueueEventPriority.NORMAL, existingId = null) {
    await this.initPromise;

    if (!this.db) {
      throw new Error('[OfflineQueue] IndexedDB unavailable; cannot persist event.');
    }

    const id = existingId || payload?.clientEventId || payload?.client_event_id || payload?.requestId || this._generateId(type.toLowerCase());
    const now = new Date().toISOString();

    const event = {
      id,
      type,
      payload: { ...payload },
      created_at: now,
      attempts: 0,
      last_attempt_at: null,
      status: QueueEventStatus.PENDING,
      priority: priority || QueueEventPriority.NORMAL,
      error_reason: null
    };

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        // Check if event already exists (idempotency)
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          if (getReq.result) {
            // Already enqueued
            resolve(getReq.result);
          } else {
            const addReq = store.add(event);
            addReq.onsuccess = () => {
              this._notifySubscribers('enqueue', event);
              resolve(event);
            };
            addReq.onerror = (e) => reject(e);
          }
        };
        getReq.onerror = (e) => reject(e);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getPendingEvents() {
    await this.initPromise;
    if (!this.db) return [];

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const all = req.result || [];
          const pending = all.filter(e => e.status === QueueEventStatus.PENDING || e.status === QueueEventStatus.FAILED);

          // Sort by priority weight desc, then created_at asc
          pending.sort((a, b) => {
            const wA = PRIORITY_WEIGHTS[a.priority] || 20;
            const wB = PRIORITY_WEIGHTS[b.priority] || 20;
            if (wB !== wA) return wB - wA;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          });

          resolve(pending);
        };

        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async getAllEvents() {
    await this.initPromise;
    if (!this.db) return [];

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async getPendingCount() {
    const pending = await this.getPendingEvents();
    return pending.length;
  }

  async updateEventStatus(id, status, errorReason = null) {
    await this.initPromise;
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
          const item = getReq.result;
          if (!item) {
            resolve(null);
            return;
          }

          item.status = status;
          item.last_attempt_at = new Date().toISOString();
          if (status === QueueEventStatus.SYNCING || status === QueueEventStatus.FAILED) {
            item.attempts = (item.attempts || 0) + 1;
          }
          if (errorReason !== undefined) {
            item.error_reason = errorReason;
          }

          const putReq = store.put(item);
          putReq.onsuccess = () => {
            this._notifySubscribers('update', item);
            resolve(item);
          };
          putReq.onerror = (e) => reject(e);
        };

        getReq.onerror = (e) => reject(e);
      } catch (err) {
        reject(err);
      }
    });
  }

  async markSynced(id, serverResponse = null) {
    await this.initPromise;
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
          const item = getReq.result;
          if (!item) {
            resolve(null);
            return;
          }

          item.status = QueueEventStatus.SYNCED;
          item.last_attempt_at = new Date().toISOString();
          item.synced_at = new Date().toISOString();
          item.error_reason = null;
          if (serverResponse) {
            item.server_response = serverResponse;
          }

          const putReq = store.put(item);
          putReq.onsuccess = () => {
            this._notifySubscribers('synced', item);
            resolve(item);
          };
          putReq.onerror = (e) => reject(e);
        };

        getReq.onerror = (e) => reject(e);
      } catch (err) {
        reject(err);
      }
    });
  }

  async removeEvent(id) {
    await this.initPromise;
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => {
          this._notifySubscribers('remove', { id });
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async getOperationalState(key) {
    await this.initPromise;
    if (!this.db) return null;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([STATE_STORE_NAME], 'readonly');
        const store = tx.objectStore(STATE_STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async setOperationalState(key, value) {
    await this.initPromise;
    if (!this.db) return false;

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([STATE_STORE_NAME], 'readwrite');
        const store = tx.objectStore(STATE_STORE_NAME);
        const req = store.put({ id: key, value, updated_at: new Date().toISOString() });
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  subscribe(listener) {
    if (typeof listener === 'function') {
      this.subscribers.add(listener);
      return () => this.subscribers.delete(listener);
    }
    return () => {};
  }

  _notifySubscribers(action, event) {
    for (const listener of this.subscribers) {
      try {
        listener(action, event);
      } catch (e) {
        console.warn('[OfflineQueue] Subscriber error:', e);
      }
    }
  }
}

export const offlineQueue = new OfflineQueue();
