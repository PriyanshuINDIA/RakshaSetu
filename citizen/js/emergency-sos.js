/**
 * RakshaSetu Emergency SOS Module
 * Zero-decision emergency workflow, GPS capture with truthful fallback,
 * idempotent clientEventId outbox persistence, and live location heartbeat telemetry.
 */

import { store, NetworkStates } from './store.js';
import { offlineStorage } from './offline-storage.js';
import { syncManager } from './core/sync-manager.js';
import { apiClient } from './api-client.js';
import { heartbeatService } from './core/heartbeat-service.js';

export class EmergencySOSManager {
  constructor() {
    this.activeSession = null;
    this.heartbeatTimer = null;
    this.activeEmergencyHeartbeatTimer = null;
    this.startHeartbeatLoop();
  }

  startHeartbeatLoop() {
    // Consolidated Pre-Blackout Location Heartbeat Service
    heartbeatService.start();
  }

  async transmitLiveLocationHeartbeat(location, clientEventId) {
    try {
      const state = store.getState();
      const citizenId = state.profile?.citizenId || 'citizen-anonymous';
      const battery = await syncManager.captureBatteryLevel();

      const payload = {
        clientEventId,
        citizenId,
        timestamp: new Date().toISOString(),
        latitude: Number(location.lat.toFixed(5)),
        longitude: Number(location.lng.toFixed(5)),
        accuracyMeters: Math.round(location.accuracy || 20),
        networkState: state.networkState,
        batteryPercent: battery
      };

      const response = await apiClient.post(`/citizens/${citizenId}/heartbeat`, payload, {
        timeout: 4000
      });

      if (response && response.ok) {
        store.setState({ liveTelemetryActive: true });
      } else {
        store.setState({ liveTelemetryActive: false });
      }
    } catch (heartbeatErr) {
      // Heartbeat is non-critical: fail silently and gracefully without console spam
      store.setState({ liveTelemetryActive: false });
    }
  }

  async captureLocation() {
    this.isCapturing = true;
    const existing = store.getState().location;

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        this.isCapturing = false;
        resolve({ ...existing, isLastKnown: true, error: 'Geolocation not supported' });
        return;
      }

      const timeoutId = setTimeout(() => {
        this.isCapturing = false;
        resolve({ ...existing, isLastKnown: true, error: 'GPS Timeout' });
      }, 4000);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timeoutId);
          this.isCapturing = false;
          const freshLocation = {
            lat: Number(pos.coords.latitude.toFixed(5)),
            lng: Number(pos.coords.longitude.toFixed(5)),
            accuracy: Math.round(pos.coords.accuracy),
            timestamp: Date.now(),
            isLastKnown: false
          };
          store.setState({ location: freshLocation });
          offlineStorage.logHeartbeat(freshLocation);
          resolve(freshLocation);
        },
        (err) => {
          clearTimeout(timeoutId);
          this.isCapturing = false;
          resolve({ ...existing, isLastKnown: true, error: err.message });
        },
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 10000 }
      );
    });
  }

  /**
   * Main Emergency SOS Dispatch Pipeline
   * 1. Captures GPS / Last-known coords
   * 2. Enqueues in local outbox with UUID clientEventId
   * 3. Transmits to Supabase cloud backend if connected
   * 4. Returns honest transmission state
   */
  async dispatchSOS(options = {}) {
    const location = await this.captureLocation();
    const state = store.getState();

    // 1. Queue locally first (guaranteed persistence)
    const outboxItem = await syncManager.queueSOS({
      location,
      medicalFlag: options.medicalFlag || false,
      peopleCount: options.peopleCount || 1,
      message: options.message || 'Emergency rescue beacon triggered by citizen via RakshaSetu.'
    });

    // 2. If online, attempt immediate sync pass
    if (state.networkState === NetworkStates.INTERNET_ONLINE) {
      const syncResult = await syncManager.syncPendingOutbox('sos_trigger');
      
      const updatedState = store.getState();
      const isSynced = (updatedState.outboxQueue || []).some(
        item => item.clientEventId === outboxItem.clientEventId && item.status === 'SYNCED'
      );

      if (isSynced) {
        return {
          ok: true,
          status: 'SYNCED',
          clientEventId: outboxItem.clientEventId,
          location,
          message: 'SOS received and acknowledged by District Emergency Operations Center (DEOC).'
        };
      }
    }

    // 3. If offline or backend unreachable
    return {
      ok: true,
      status: 'QUEUED',
      clientEventId: outboxItem.clientEventId,
      location,
      message: 'Connection unavailable. Your SOS is safely stored locally and will retry automatically.'
    };
  }

  buildSOSMessage(location, contacts) {
    const locStr = `${location.lat.toFixed(5)},${location.lng.toFixed(5)}`;
    const mapsLink = `https://maps.google.com/?q=${locStr}`;
    const timeStr = new Date(location.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isCached = location.isLastKnown ? ' [LAST KNOWN CACHED COORDS]' : '';

    return `EMERGENCY SOS: I need immediate rescue assistance! My location is: ${locStr} (Accuracy: ~${location.accuracy}m)${isCached} recorded at ${timeStr}. View map: ${mapsLink} — Sent via RakshaSetu Citizen Emergency Network.`;
  }

  generateSmsUri(phone, body) {
    const cleanPhone = (phone || '').replace(/[^0-9+]/g, '');
    const encodedBody = encodeURIComponent(body);
    return `sms:${cleanPhone}?&body=${encodedBody}`;
  }

  sendLocationPingSms(location, contactPhone) {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const text = `LOCATION UPDATE: Current coords: ${location.lat.toFixed(5)},${location.lng.toFixed(5)} (~${location.accuracy}m accuracy) at ${timeStr}. Tracking via RakshaSetu.`;
    return this.generateSmsUri(contactPhone, text);
  }
}

export const emergencySOS = new EmergencySOSManager();
