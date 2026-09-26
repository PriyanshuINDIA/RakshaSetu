/**
 * RakshaSetu Citizen Core - Location Service
 *
 * Consolidates geolocation operations:
 * - High-accuracy GPS fixes
 * - Cached last-known position fallback
 * - Detection of stale location (>15 minutes old)
 * - Standardized location schema with explicit source tagging:
 *   'GPS' | 'NETWORK' | 'CACHED' | 'DEMO'
 *
 * Does NOT fake GPS data. Demo coordinates are strictly marked as DEMO.
 */

import { offlineQueue } from './offline-queue.js';

export const LocationSource = {
  GPS: 'GPS',
  NETWORK: 'NETWORK',
  CACHED: 'CACHED',
  DEMO: 'DEMO'
};

export const LocationPermissionState = {
  GRANTED: 'granted',
  DENIED: 'denied',
  PROMPT: 'prompt',
  UNKNOWN: 'unknown',
  UNSUPPORTED: 'unsupported'
};

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const LEGACY_STORAGE_KEY_LAST_LOCATION = 'rakshasetu_core_last_location_v1';
const OPERATIONAL_STATE_LOCATION_KEY = 'last_known_location';

export class LocationService {
  constructor() {
    this.currentLocation = null;
    this.lastKnownLocation = null;
    this.watchId = null;
    this.isCapturing = false;
    this.permissionState = LocationPermissionState.UNKNOWN;
    this.subscribers = new Set();

    // Durable operational location loaded asynchronously from IndexedDB (RakshaSetu_DB)
    this.initPromise = this._initLocationCache();
    this._initPermissionCheck();
  }

  async _initLocationCache() {
    // Enforce storage rule: Purge any legacy operational cache from localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LEGACY_STORAGE_KEY_LAST_LOCATION);
      }
    } catch {}

    try {
      const cached = await offlineQueue.getOperationalState(OPERATIONAL_STATE_LOCATION_KEY);
      if (cached && typeof cached.latitude === 'number' && typeof cached.longitude === 'number') {
        cached.is_stale = (Date.now() - new Date(cached.captured_at).getTime()) > STALE_THRESHOLD_MS;
        cached.source = LocationSource.CACHED;
        cached.isLastKnown = true;
        this.lastKnownLocation = cached;
        return cached;
      }
    } catch (err) {
      console.warn('[LocationService] Failed to load durable location from IndexedDB:', err);
    }
    return null;
  }

  async _saveCachedLocation(loc) {
    try {
      if (loc) {
        // Operational location is stored exclusively in IndexedDB (RakshaSetu_DB)
        await offlineQueue.setOperationalState(OPERATIONAL_STATE_LOCATION_KEY, loc);
      }
      // Guarantee zero operational location data in localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LEGACY_STORAGE_KEY_LAST_LOCATION);
      }
    } catch (err) {
      console.warn('[LocationService] Failed to persist location to IndexedDB:', err);
    }
  }

  async loadDurableLocation() {
    await this.initPromise;
    try {
      const cached = await offlineQueue.getOperationalState(OPERATIONAL_STATE_LOCATION_KEY);
      if (cached && typeof cached.latitude === 'number' && typeof cached.longitude === 'number') {
        cached.is_stale = (Date.now() - new Date(cached.captured_at).getTime()) > STALE_THRESHOLD_MS;
        cached.source = LocationSource.CACHED;
        cached.isLastKnown = true;
        this.lastKnownLocation = cached;
        return cached;
      }
    } catch (err) {
      console.warn('[LocationService] Error loading durable location:', err);
    }
    return null;
  }

  async _initPermissionCheck() {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        this.permissionState = status.state || LocationPermissionState.UNKNOWN;
        status.onchange = () => {
          this.permissionState = status.state || LocationPermissionState.UNKNOWN;
          this._notifySubscribers();
        };
      } catch {
        this.permissionState = LocationPermissionState.UNKNOWN;
      }
    } else if (typeof navigator !== 'undefined' && !navigator.geolocation) {
      this.permissionState = LocationPermissionState.UNSUPPORTED;
    }
  }

  formatLocation(rawCoords, source = LocationSource.GPS) {
    const now = new Date();
    const capturedTime = rawCoords.timestamp ? new Date(rawCoords.timestamp) : now;
    const isStale = (Date.now() - capturedTime.getTime()) > STALE_THRESHOLD_MS;

    return {
      latitude: Number(rawCoords.latitude.toFixed(6)),
      longitude: Number(rawCoords.longitude.toFixed(6)),
      accuracy_meters: rawCoords.accuracy != null ? Math.round(rawCoords.accuracy) : 25,
      captured_at: capturedTime.toISOString(),
      source: source,
      is_stale: isStale,
      // Compatibility properties for existing UI components
      lat: Number(rawCoords.latitude.toFixed(6)),
      lng: Number(rawCoords.longitude.toFixed(6)),
      accuracy: rawCoords.accuracy != null ? Math.round(rawCoords.accuracy) : 25,
      isLastKnown: source === LocationSource.CACHED || isStale
    };
  }

  async getCurrentPosition(options = {}) {
    const {
      timeoutMs = 6000,
      enableHighAccuracy = true,
      maxAgeMs = 15000,
      fallbackToCached = true
    } = options;

    if (fallbackToCached && !this.lastKnownLocation && this.initPromise) {
      try {
        await this.initPromise;
      } catch {}
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.permissionState = LocationPermissionState.UNSUPPORTED;
      if (fallbackToCached && this.lastKnownLocation) {
        return {
          ...this.lastKnownLocation,
          is_stale: true,
          error: 'Geolocation is not supported by this browser.'
        };
      }
      throw new Error('Geolocation is not supported by this browser.');
    }

    this.isCapturing = true;

    return new Promise((resolve, reject) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.isCapturing = false;

        if (fallbackToCached && this.lastKnownLocation) {
          const fallback = {
            ...this.lastKnownLocation,
            is_stale: true,
            error: 'GPS acquisition timed out. Using last-known location.'
          };
          resolve(fallback);
        } else {
          reject(new Error('GPS acquisition timed out.'));
        }
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          this.isCapturing = false;
          this.permissionState = LocationPermissionState.GRANTED;

          const loc = this.formatLocation(
            {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp
            },
            LocationSource.GPS
          );

          this.currentLocation = loc;
          this.lastKnownLocation = loc;
          this._saveCachedLocation(loc);
          this._notifySubscribers();
          resolve(loc);
        },
        (err) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          this.isCapturing = false;

          if (err.code === 1) {
            this.permissionState = LocationPermissionState.DENIED;
          }

          if (fallbackToCached && this.lastKnownLocation) {
            const fallback = {
              ...this.lastKnownLocation,
              is_stale: true,
              error: err.message || 'Geolocation acquisition failed.'
            };
            resolve(fallback);
          } else {
            reject(err);
          }
        },
        {
          enableHighAccuracy,
          timeout: timeoutMs,
          maximumAge: maxAgeMs
        }
      );
    });
  }

  getLastKnownLocation() {
    if (!this.lastKnownLocation) return null;
    const isStale = (Date.now() - new Date(this.lastKnownLocation.captured_at).getTime()) > STALE_THRESHOLD_MS;
    return {
      ...this.lastKnownLocation,
      is_stale: isStale,
      isLastKnown: true
    };
  }

  getDemoLocation(lat = 25.3757, lng = 86.4735, label = 'Munger, Bihar (Demo)') {
    const now = new Date();
    return {
      latitude: lat,
      longitude: lng,
      accuracy_meters: 15,
      captured_at: now.toISOString(),
      source: LocationSource.DEMO,
      is_stale: false,
      label,
      lat,
      lng,
      accuracy: 15,
      isLastKnown: false
    };
  }

  subscribe(listener) {
    if (typeof listener === 'function') {
      this.subscribers.add(listener);
      return () => this.subscribers.delete(listener);
    }
    return () => {};
  }

  _notifySubscribers() {
    for (const listener of this.subscribers) {
      try {
        listener(this.currentLocation || this.lastKnownLocation, this.permissionState);
      } catch (e) {
        console.warn('[LocationService] Subscriber error:', e);
      }
    }
  }
}

export const locationService = new LocationService();
