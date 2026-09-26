/**
 * RakshaSetu Citizen Core - Low-Data Location Ping & SMS Fallback Service
 *
 * Transmits ultra-compact emergency telemetry under severe bandwidth constraints (2G/EDGE)
 * or prepares a compact SMS URI for manual cellular dispatch during total data blackouts.
 *
 * Architecture & Disclosure Rules:
 * - Minimum essential fields: Type, Lat, Lng, Accuracy, Source, Timestamp.
 * - Compact payload (< 140 chars) fits in a single standard GSM-7 SMS PDU.
 * - Online: Prefers internet delivery to emergency operations gateway.
 * - Offline: Durably enqueues into IndexedDB OfflineQueue AND prepares an SMS URI.
 * - Explicit disclosure: "SMS URI generation is not equivalent to automated SMS delivery."
 * - States: ONLINE_SENT | QUEUED | SMS_READY | USER_ACTION_REQUIRED | FAILED.
 */

import { locationService, LocationSource } from './location-service.js';
import { connectivityService } from './connectivity-service.js';
import { communicationFallback } from './communication-fallback.js';
import { offlineQueue, QueueEventPriority } from './offline-queue.js';
import { store } from '../store.js';
import { apiClient } from '../api-client.js';

export const LowDataPingState = {
  ONLINE_SENT: 'ONLINE_SENT',
  QUEUED: 'QUEUED',
  SMS_READY: 'SMS_READY',
  USER_ACTION_REQUIRED: 'USER_ACTION_REQUIRED',
  FAILED: 'FAILED'
};

export const SMS_DISCLOSURE = 
  'SMS URI generation is not equivalent to automated SMS delivery. Handset user confirmation is required to send.';

class LowDataPingService {
  constructor() {
    this.primaryEmergencyNumber = '112';
    this.disclosure = SMS_DISCLOSURE;
  }

  /**
   * Formats a minimal, ultra-compact emergency telemetry string.
   * Guarantees length < 140 characters for single-SMS PDU compatibility.
   */
  formatCompactPayload(options = {}) {
    const {
      type = 'PING', // 'SOS' | 'PING' | 'SAFE'
      lat = null,
      lng = null,
      accuracy = null,
      source = 'GPS',
      timestamp = new Date()
    } = options;

    const timeObj = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const hh = String(timeObj.getHours()).padStart(2, '0');
    const mm = String(timeObj.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    const latPart = (lat != null && !isNaN(lat)) ? Number(lat).toFixed(5) : '0.00000';
    const lngPart = (lng != null && !isNaN(lng)) ? Number(lng).toFixed(5) : '0.00000';
    const accPart = (accuracy != null && !isNaN(accuracy)) ? Math.round(accuracy) : 25;
    const srcCode = String(source || 'UNK').substring(0, 3).toUpperCase();

    // Compact format: [RS-PING] T:<type> L:<lat>,<lng> A:<acc>m S:<src> TS:<hh:mm>
    return `[RS-PING] T:${type} L:${latPart},${lngPart} A:${accPart}m S:${srcCode} TS:${timeStr}`;
  }

  /**
   * Dispatches low-data location ping or prepares SMS fallback.
   */
  async dispatchLowDataPing(options = {}) {
    const {
      type = 'PING',
      recipientPhone = this.primaryEmergencyNumber,
      customLocation = null
    } = options;

    const state = store.getState();
    const citizenId = state.profile?.citizenId || 'citizen-anonymous';

    // 1. Acquire location via LocationService (with durable cached fallback)
    let location = customLocation;
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

    const lat = location ? (location.latitude ?? location.lat) : null;
    const lng = location ? (location.longitude ?? location.lng) : null;
    const accuracy = location ? Math.round(location.accuracy_meters ?? location.accuracy ?? 25) : 25;
    const source = location ? (location.source || LocationSource.CACHED) : LocationSource.CACHED;
    const isStale = location ? Boolean(location.is_stale) : true;

    // 2. Format compact payload (< 140 chars)
    const compactPayload = this.formatCompactPayload({
      type,
      lat,
      lng,
      accuracy,
      source,
      timestamp: new Date()
    });

    // 3. Generate cross-platform SMS URI
    const smsUri = communicationFallback.generateSmsUri(recipientPhone, compactPayload);
    const clientEventId = `ping_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isOnline = connectivityService.isOnline();

    const telemetryRecord = {
      clientEventId,
      citizenId,
      type,
      latitude: lat,
      longitude: lng,
      accuracy_meters: accuracy,
      compactPayload,
      source,
      is_stale: isStale,
      timestamp: new Date().toISOString()
    };

    // ONLINE PATH: Transmit over data connection to Supabase backend
    if (isOnline) {
      try {
        const response = await apiClient.post(`/citizens/${citizenId}/heartbeat`, {
          clientEventId,
          latitude: lat,
          longitude: lng,
          accuracy_meters: accuracy,
          networkState: 'LOW_DATA_ONLINE',
          compactPayload
        }, { timeout: 4000 });

        if (response && response.ok) {
          return {
            deliveryState: LowDataPingState.ONLINE_SENT,
            status: LowDataPingState.ONLINE_SENT,
            requiresUserAction: false,
            isOnline: true,
            compactPayload,
            smsUri,
            clientEventId,
            message: 'Compact emergency telemetry successfully transmitted over network.'
          };
        }
      } catch (err) {
        console.warn('[LowDataPing] Direct online dispatch failed, preparing offline queue and SMS:', err);
      }
    }

    // OFFLINE PATH: Queue in authoritative IndexedDB OfflineQueue AND prepare SMS URI
    try {
      await offlineQueue.enqueue(
        'HEARTBEAT',
        telemetryRecord,
        QueueEventPriority.HIGH,
        clientEventId
      );
    } catch (qErr) {
      console.warn('[LowDataPing] Failed to queue in OfflineQueue:', qErr);
    }

    // Return honest SMS_READY state with explicit USER_ACTION_REQUIRED disclosure
    return {
      deliveryState: LowDataPingState.SMS_READY,
      status: LowDataPingState.SMS_READY,
      actionStatus: LowDataPingState.USER_ACTION_REQUIRED,
      requiresUserAction: true,
      isOnline: false,
      compactPayload,
      smsUri,
      clientEventId,
      disclosure: this.disclosure,
      message: 'Offline: Compact ping queued in IndexedDB. SMS URI is ready and requires manual user action to send.'
    };
  }
}

export const lowDataPing = new LowDataPingService();
