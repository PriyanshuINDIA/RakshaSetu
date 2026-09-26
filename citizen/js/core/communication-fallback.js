/**
 * RakshaSetu Citizen Core - Communication Fallback Service
 *
 * Implements transparent emergency dispatch triage:
 * 1. Direct Supabase transmission when ONLINE
 * 2. Durable OfflineQueue persistence when OFFLINE / DEGRADED
 * 3. Pre-formatted SMS URI generation for manual cellular fallback
 *
 * Exposes honest delivery states:
 * - SENT_TO_BACKEND : Directly inserted into Supabase cloud table
 * - QUEUED          : Durably stored in IndexedDB offline queue for auto-sync
 * - SMS_READY       : Prepared pre-filled SMS for handset messaging app
 * - FAILED          : Operation could not be completed
 * - UNKNOWN         : Initial or indeterminate state
 *
 * DISCLOSURE: An SMS URI launches the native handset SMS client.
 * It is NOT an automated server-side SMS gateway.
 */

import { connectivityService } from './connectivity-service.js';
import { offlineQueue, QueueEventPriority } from './offline-queue.js';
import { supabase } from '../supabase-client.js';

export const DeliveryState = {
  SENT_TO_BACKEND: 'SENT_TO_BACKEND',
  QUEUED: 'QUEUED',
  SMS_READY: 'SMS_READY',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN'
};

class CommunicationFallback {
  constructor() {
    this.primaryEmergencyNumber = '112';
  }

  generateSmsUri(recipientPhone, messageBody) {
    const cleanPhone = (recipientPhone || this.primaryEmergencyNumber).replace(/[^\d+]/g, '');
    const encodedBody = encodeURIComponent(messageBody || '');

    // Cross-platform detection: iOS uses ';body=' or '&body=', standard RFC5724 uses '?body='
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    const separator = isIOS ? '&body=' : '?body=';

    return `sms:${cleanPhone}${separator}${encodedBody}`;
  }

  formatEmergencySmsPayload(params = {}) {
    const {
      type = 'EMERGENCY_SOS',
      lat,
      lng,
      accuracy,
      batteryPercent,
      message,
      timestamp = new Date()
    } = params;

    const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const locPart = (lat != null && lng != null)
      ? `LOC: ${Number(lat).toFixed(5)},${Number(lng).toFixed(5)} (±${Math.round(accuracy || 25)}m)`
      : 'LOC: UNKNOWN';
    const battPart = batteryPercent != null ? ` BATT:${batteryPercent}%` : '';
    const notePart = message ? ` MSG:${message.substring(0, 80)}` : '';

    return `[RAKSHASETU ${type}] ${timeStr} ${locPart}${battPart}${notePart} MAP: https://maps.google.com/?q=${lat},${lng}`;
  }

  formatCompactPingPayload(params = {}) {
    const {
      type = 'PING',
      lat = null,
      lng = null,
      accuracy = 25,
      source = 'GPS'
    } = params;
    const latPart = (lat != null && !isNaN(lat)) ? Number(lat).toFixed(5) : '0.00000';
    const lngPart = (lng != null && !isNaN(lng)) ? Number(lng).toFixed(5) : '0.00000';
    const accPart = Math.round(accuracy || 25);
    const srcCode = String(source || 'UNK').substring(0, 3).toUpperCase();
    return `[RS-PING] T:${type} L:${latPart},${lngPart} A:${accPart}m S:${srcCode}`;
  }

  async dispatchEmergencyEvent(options = {}) {
    const {
      eventType, // 'SOS_INCIDENT' | 'FAMILY_IM_SAFE' | 'RESOURCE_REQUEST' | 'HEARTBEAT'
      payload,
      recipientPhone = this.primaryEmergencyNumber,
      smsBody = null,
      priority = QueueEventPriority.HIGH,
      directInsertFn = null
    } = options;

    const isOnline = connectivityService.isOnline();

    // 1. Online attempt
    if (isOnline && typeof directInsertFn === 'function') {
      try {
        const result = await directInsertFn();
        if (result && !result.error) {
          return {
            deliveryState: DeliveryState.SENT_TO_BACKEND,
            via: 'SUPABASE_DIRECT',
            result: result.data || result,
            smsUri: null,
            message: 'Distress signal successfully transmitted to Emergency Operations Center.'
          };
        }
      } catch (directErr) {
        console.warn('[CommunicationFallback] Direct online dispatch failed, falling back to durable queue:', directErr);
      }
    }

    // 2. Offline queue persistence (authoritative durable IndexedDB)
    let queueTicket = null;
    try {
      queueTicket = await offlineQueue.enqueue(
        eventType,
        payload,
        priority,
        payload?.clientEventId || payload?.client_event_id
      );
    } catch (qErr) {
      console.error('[CommunicationFallback] Offline queueing failed:', qErr);
    }

    // 3. Prepare SMS fallback
    const body = smsBody || this.formatEmergencySmsPayload({
      type: eventType,
      lat: payload?.latitude || payload?.lat,
      lng: payload?.longitude || payload?.lng,
      accuracy: payload?.accuracy_meters || payload?.accuracy,
      message: payload?.message || payload?.description
    });
    const smsUri = this.generateSmsUri(recipientPhone, body);

    if (queueTicket) {
      return {
        deliveryState: DeliveryState.QUEUED,
        via: 'OFFLINE_QUEUE',
        queueTicket,
        smsUri,
        message: 'Saved to offline outbox. Will automatically synchronize when connection returns. SMS backup ready.'
      };
    }

    // 4. Pure SMS fallback if queue failed
    return {
      deliveryState: DeliveryState.SMS_READY,
      via: 'SMS_URI',
      queueTicket: null,
      smsUri,
      message: 'Network offline. Tap to dispatch emergency SMS via your cellular provider.'
    };
  }
}

export const communicationFallback = new CommunicationFallback();
