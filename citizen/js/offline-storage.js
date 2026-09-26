/**
 * RakshaSetu Offline Storage & Data Engine
 * Ensures zero-dependency access to verified regional disaster data and local queues
 */

import { store } from './store.js';

export class OfflineStorage {
  constructor() {
    this.dbName = 'RakshaSetu_DB';
    this.dbVersion = 3;
    this.db = null;
    this.initDatabase();
  }

  async initDatabase() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('[OfflineStorage] IndexedDB not available, falling back to localStorage');
        resolve(null);
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('regional_packages')) {
          db.createObjectStore('regional_packages', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('offline_queue')) {
          db.createObjectStore('offline_queue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('operational_state')) {
          db.createObjectStore('operational_state', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (err) => {
        console.error('[OfflineStorage] IndexedDB initialization error:', err);
        resolve(null);
      };
    });
  }

  async loadRegionalData() {
    try {
      const response = await fetch('./assets/data/regional-packages.json');
      if (response.ok) {
        const data = await response.json();
        store.setState({ regionalData: data });
        return data;
      }
    } catch (err) {
      console.warn('[OfflineStorage] Network load failed for regional packages, checking local cache:', err);
    }

    // Fallback: check stored package in localStorage if fetch failed
    const cached = store.getState().regionalData;
    return cached;
  }

  async getPackageForRegion(regionId) {
    const data = store.getState().regionalData || await this.loadRegionalData();
    if (!data || !data.packages) return null;
    if (regionId) {
      return data.packages.find(p => p.id === regionId) || null;
    }
    return null;
  }

  /**
   * Determine the appropriate regional package based on strictly defined priority:
   * Priority 1: User-selected regional package
   * Priority 2: Saved user region/profile (district, state, address)
   * Priority 3: Reliable location-derived region (GPS coordinates within verified boundaries)
   * Priority 4: Manual selection fallback (null - never silently default to Coastal Odisha)
   */
  resolveActiveRegionPackageSync(profile, location) {
    const data = store.getState().regionalData;
    const pkgs = data?.packages || [];
    if (!pkgs.length) return null;

    // 1. User-selected regional package
    if (profile?.region) {
      const matched = pkgs.find(p => p.id === profile.region);
      if (matched) {
        // Guard against legacy unverified defaults if user profile actually specifies another region
        const dist = (profile.district || '').toLowerCase();
        const st = (profile.state || '').toLowerCase();
        const isLegacyWrongDefault = profile.region === 'odisha-coastal' && !profile.hasManuallySelectedRegion && (dist.includes('munger') || st.includes('bihar'));
        if (!isLegacyWrongDefault) {
          return matched;
        }
      }
    }

    // 2. Saved user region/profile (district / state / address)
    const district = (profile?.district || '').trim().toLowerCase();
    const state = (profile?.state || '').trim().toLowerCase();
    const address = (profile?.address || '').trim().toLowerCase();

    if (district.includes('munger') || state.includes('bihar') || address.includes('munger') || address.includes('bihar')) {
      return pkgs.find(p => p.id === 'bihar-munger') || null;
    }
    if (district.includes('puri') || district.includes('kendrapara') || district.includes('balasore') || district.includes('jagatsinghpur') || state.includes('odisha') || state.includes('orissa')) {
      return pkgs.find(p => p.id === 'odisha-coastal') || null;
    }
    if (district.includes('mumbai') || district.includes('thane') || state.includes('maharashtra')) {
      return pkgs.find(p => p.id === 'mumbai-metro') || null;
    }

    // 3. Reliable location-derived region (if accurate GPS coordinates are present)
    if (location && typeof location.lat === 'number' && typeof location.lng === 'number' && !location.error) {
      const { lat, lng } = location;
      // Bihar / Munger: lat 24.2 to 27.6, lng 83.3 to 88.3
      if (lat >= 24.2 && lat <= 27.6 && lng >= 83.3 && lng <= 88.3) {
        return pkgs.find(p => p.id === 'bihar-munger') || null;
      }
      // Coastal Odisha: lat 19.0 to 21.8, lng 84.5 to 87.5
      if (lat >= 19.0 && lat <= 21.8 && lng >= 84.5 && lng <= 87.5) {
        return pkgs.find(p => p.id === 'odisha-coastal') || null;
      }
      // Mumbai Metropolitan: lat 18.8 to 19.5, lng 72.7 to 73.3
      if (lat >= 18.8 && lat <= 19.5 && lng >= 72.7 && lng <= 73.3) {
        return pkgs.find(p => p.id === 'mumbai-metro') || null;
      }
    }

    // 4. Manual selection fallback (neutral - returns null instead of false default)
    return null;
  }

  async resolveActiveRegionPackage(profile, location) {
    if (!store.getState().regionalData) {
      await this.loadRegionalData();
    }
    return this.resolveActiveRegionPackageSync(profile, location);
  }

  getNDMAProtocols() {
    const data = store.getState().regionalData;
    return data ? data.ndmaSafetyProtocols : null;
  }

  queueSOSOutbox(sosPayload) {
    const currentQueue = store.getState().outboxQueue || [];
    const item = {
      id: 'sos_' + Date.now(),
      type: 'SOS_EMERGENCY',
      payload: sosPayload,
      timestamp: Date.now(),
      status: 'PENDING_DISPATCH'
    };
    const updated = [item, ...currentQueue];
    store.setState({ outboxQueue: updated });
    return item;
  }

  queueResourceRequest(requestPayload) {
    const currentRequests = store.getState().resourceRequests || [];
    const item = {
      id: 'req_' + Date.now(),
      ...requestPayload,
      timestamp: Date.now(),
      status: 'PENDING_SYNC'
    };
    const updated = [item, ...currentRequests];
    store.setState({ resourceRequests: updated });
    return item;
  }

  logHeartbeat(locationData) {
    const log = {
      timestamp: Date.now(),
      lat: locationData.lat,
      lng: locationData.lng,
      accuracy: locationData.accuracy
    };
    store.setState({ lastHeartbeatTime: log.timestamp });
    return log;
  }
}

export const offlineStorage = new OfflineStorage();
