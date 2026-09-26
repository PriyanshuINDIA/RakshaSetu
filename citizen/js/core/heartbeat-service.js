/**
 * RakshaSetu Citizen Core - Pre-Blackout Location Heartbeat Service
 *
 * Provides periodic location telemetry to the Emergency Operations Center (EOC)
 * to preserve the citizen's last-known position before network or battery blackout.
 *
 * Architecture & Terminology Rules:
 * - "Periodic location telemetry while the Citizen PWA is active/eligible to execute, with cached last-known recovery."
 * - Does NOT claim continuous background GPS execution or delivery when the browser/PWA is terminated.
 * - Battery-conscious: pauses active polling when document is hidden unless in an active SOS session.
 * - Offline-durable: queues heartbeat events into authoritative IndexedDB OfflineQueue (priority: LOW).
 * - Bounded queue policy: retains only recent fixes to prevent queue bloat during extended blackouts.
 * - Authority compatibility: inserts into Supabase public.heartbeats matching Authority HeartbeatService.
 */

import { locationService, LocationSource } from './location-service.js';
import { connectivityService } from './connectivity-service.js';
import { offlineQueue, QueueEventStatus, QueueEventPriority } from './offline-queue.js';
import { store } from '../store.js';
import { apiClient } from '../api-client.js';

export const HeartbeatDeliveryState = {
  ONLINE_SENT: 'ONLINE_SENT',
  QUEUED_OFFLINE: 'QUEUED_OFFLINE',
  SKIPPED_INACTIVE: 'SKIPPED_INACTIVE',
  FAILED: 'FAILED'
};

export const HEARTBEAT_DISCLOSURE = 
  'periodic location telemetry while the Citizen PWA is active/eligible to execute, with cached last-known recovery.';

class HeartbeatService {
  constructor() {
    this.timer = null;
    this.defaultIntervalMs = 5 * 60 * 1000; // 5 minutes standard standby
    this.emergencyIntervalMs = 60 * 1000;    // 1 minute during active SOS
    this.maxOfflineHeartbeats = 3;          // Bounded queue limit
    this.isRunning = false;
    this.lastFix = null;
    this.disclosure = HEARTBEAT_DISCLOSURE;

    this._bindVisibilityHandler();
  }

  _bindVisibilityHandler() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        const { activeEmergencySession } = store.getState();
        const isInEmergency = activeEmergencySession && activeEmergencySession.status === 'ACTIVE';

        if (document.hidden && !isInEmergency) {
          // Pause standby timer while tab is in background to preserve device battery
          this._stopTimer();
        } else if (!document.hidden && this.isRunning) {
          // Resume upon foreground transition
          this._startTimer();
          // Trigger a fresh location update on resume
          this.sendHeartbeat().catch(() => {});
        }
      });
    }
  }

  start() {
    this.isRunning = true;
    this._startTimer();
    // Immediate initial heartbeat ping
    return this.sendHeartbeat().catch(() => {});
  }

  stop() {
    this.isRunning = false;
    this._stopTimer();
  }

  _startTimer() {
    this._stopTimer();
    const { activeEmergencySession } = store.getState();
    const interval = (activeEmergencySession && activeEmergencySession.status === 'ACTIVE')
      ? this.emergencyIntervalMs
      : this.defaultIntervalMs;

    this.timer = setInterval(() => {
      this.sendHeartbeat().catch(() => {});
    }, interval);
  }

  _stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Captures current or cached location and transmits/queues heartbeat telemetry.
   */
  async sendHeartbeat(forceLocation = null) {
    const state = store.getState();
    const profile = state.profile || {};
    const citizenId = profile.citizenId || 'citizen-anonymous';

    // Battery / Eligibility Check: Skip if tab hidden and not in active emergency (unless forceLocation provided)
    const isInEmergency = state.activeEmergencySession && state.activeEmergencySession.status === 'ACTIVE';
    if (!forceLocation && typeof document !== 'undefined' && document.hidden && !isInEmergency) {
      return {
        deliveryState: HeartbeatDeliveryState.SKIPPED_INACTIVE,
        message: 'Heartbeat paused while document in background.'
      };
    }

    // Acquire location fix via LocationService (with durable cached fallback)
    let location = forceLocation;
    if (!location) {
      try {
        location = await locationService.getCurrentPosition({
          timeoutMs: 3000,
          fallbackToCached: true
        });
      } catch {
        location = locationService.getLastKnownLocation() || state.location;
      }
    }

    this.lastFix = location;

    const lat = location ? (location.latitude ?? location.lat) : null;
    const lng = location ? (location.longitude ?? location.lng) : null;
    const accuracy = location ? Math.round(location.accuracy_meters ?? location.accuracy ?? 25) : 25;
    const source = location ? (location.source || LocationSource.CACHED) : LocationSource.CACHED;
    const isStale = location ? Boolean(location.is_stale) : true;
    const networkState = connectivityService.getState();
    const nowIso = new Date().toISOString();
    const clientEventId = `hb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const payload = {
      clientEventId,
      citizenId,
      latitude: lat != null ? Number(lat.toFixed(6)) : null,
      longitude: lng != null ? Number(lng.toFixed(6)) : null,
      accuracy_meters: accuracy,
      networkState,
      location_source: source,
      is_stale: isStale,
      timestamp: nowIso
    };

    const isOnline = connectivityService.isOnline();

    // ONLINE PATH: Direct transmission to Supabase public.heartbeats
    if (isOnline) {
      try {
        const response = await apiClient.post(`/citizens/${citizenId}/heartbeat`, payload, {
          timeout: 4000
        });

        if (response && response.ok) {
          const nowMs = Date.now();
          store.setState({ lastHeartbeatTime: nowMs });
          return {
            deliveryState: HeartbeatDeliveryState.ONLINE_SENT,
            clientEventId,
            payload,
            timestamp: nowMs,
            message: 'Heartbeat telemetry recorded in Emergency Operations Center.'
          };
        }
      } catch (err) {
        console.warn('[HeartbeatService] Direct online transmit failed, queueing offline:', err);
      }
    }

    // OFFLINE PATH: Queue in authoritative IndexedDB OfflineQueue (bounded policy)
    try {
      // Coalescing: Prune older queued heartbeats if exceeding maxOfflineHeartbeats
      const pending = await offlineQueue.getPendingEvents();
      const pendingHbs = pending.filter(e => e.type === 'HEARTBEAT');
      if (pendingHbs.length >= this.maxOfflineHeartbeats) {
        // Sort oldest first and remove oldest
        pendingHbs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const toRemove = pendingHbs.slice(0, pendingHbs.length - this.maxOfflineHeartbeats + 1);
        for (const oldHb of toRemove) {
          await offlineQueue.removeEvent(oldHb.id);
        }
      }

      await offlineQueue.enqueue(
        'HEARTBEAT',
        payload,
        QueueEventPriority.LOW,
        clientEventId
      );

      const nowMs = Date.now();
      store.setState({ lastHeartbeatTime: nowMs });

      return {
        deliveryState: HeartbeatDeliveryState.QUEUED_OFFLINE,
        clientEventId,
        payload,
        timestamp: nowMs,
        message: 'Heartbeat location fix durably saved in offline queue for auto-sync.'
      };
    } catch (qErr) {
      console.error('[HeartbeatService] Failed to queue heartbeat in IndexedDB:', qErr);
      return {
        deliveryState: HeartbeatDeliveryState.FAILED,
        error: qErr.message
      };
    }
  }

  getTelemetryStatus() {
    const state = store.getState();
    const lastTime = state.lastHeartbeatTime || null;
    const ageMinutes = lastTime ? Math.floor((Date.now() - lastTime) / 60000) : null;
    const location = this.lastFix || locationService.getLastKnownLocation() || state.location;

    return {
      isRunning: this.isRunning,
      intervalMinutes: Math.round(this.defaultIntervalMs / 60000),
      lastHeartbeatTime: lastTime,
      ageMinutes,
      isStale: ageMinutes != null ? ageMinutes > 15 : true,
      lastLocation: location ? {
        lat: location.latitude ?? location.lat,
        lng: location.longitude ?? location.lng,
        accuracy: location.accuracy_meters ?? location.accuracy,
        source: location.source || 'UNKNOWN',
        is_stale: location.is_stale || false
      } : null,
      networkState: connectivityService.getState(),
      disclosure: this.disclosure
    };
  }
}

export const heartbeatService = new HeartbeatService();
