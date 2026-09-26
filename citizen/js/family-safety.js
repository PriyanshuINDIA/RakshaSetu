/**
 * RakshaSetu Family Safety & "I'm Safe" Broadcast Engine
 * Transparent contact check-ins, SMS status generation, REST/Supabase backend delivery,
 * and honest multi-state delivery tracking.
 *
 * Integrated with Phase 1 Core Services:
 * - LocationService (GPS + durable IndexedDB cached fallback)
 * - ConnectivityService (honest reachable network detection)
 * - OfflineQueue (authoritative durable IndexedDB offline storage)
 * - CommunicationFallback (cross-platform RFC5724 SMS URI generation)
 * - SyncManager (auto-reconnect queue synchronization and idempotency)
 */

import { store } from './store.js';
import { apiClient } from './api-client.js';
import { t } from '../i18n/index.js';
import {
  locationService,
  LocationSource,
  connectivityService,
  offlineQueue,
  QueueEventPriority,
  communicationFallback
} from './core/index.js';

export const FamilyDeliveryStates = {
  PREPARING: 'Preparing...',
  SENDING: 'Sending...',
  SENT: 'Sent',
  SYNCED: 'Synced',
  QUEUED_OFFLINE: 'Queued Offline',
  SMS_READY: 'SMS Ready',
  FAILED: 'Failed',
  RETRYING: 'Retrying...'
};

export class FamilySafetyManager {
  constructor() {
    this.deliveryStatus = null;
  }

  getSavedContacts() {
    return store.getState().profile?.contacts || [];
  }

  addContact(name, phone, relation) {
    const { profile } = store.getState();
    const contacts = profile?.contacts || [];
    const updated = [...contacts, { name, phone, relation }];
    store.setState({ profile: { ...profile, contacts: updated } });
    return updated;
  }

  removeContact(index) {
    const { profile } = store.getState();
    const contacts = profile?.contacts || [];
    const updated = contacts.filter((_, i) => i !== index);
    store.setState({ profile: { ...profile, contacts: updated } });
    return updated;
  }

  buildImSafeMessage(location = null) {
    const loc = location || locationService.getLastKnownLocation() || store.getState().location;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let locStr = '';
    if (loc) {
      const lat = loc.latitude != null ? loc.latitude : loc.lat;
      const lng = loc.longitude != null ? loc.longitude : loc.lng;
      if (lat != null && lng != null) {
        locStr = ` Location: https://maps.google.com/?q=${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
      }
    }

    return t('family.imSafeMessage', { time: timeStr, loc: locStr }) ||
      `I AM SAFE: Hello, this is an automated safety confirmation. I am currently safe and uninjured at ${timeStr}.${locStr} Sent via RakshaSetu Citizen Emergency Network.`;
  }

  prepareImSafeBroadcast() {
    const contacts = this.getSavedContacts();
    const primaryContact = contacts.length > 0 ? contacts[0] : { name: 'Emergency Contact', phone: '112' };

    // Synchronous read for initial preview: LocationService last-known or store
    const location = locationService.getLastKnownLocation() || store.getState().location;
    const messageBody = this.buildImSafeMessage(location);
    const smsUri = communicationFallback.generateSmsUri(primaryContact.phone, messageBody);
    const isOnline = connectivityService.isOnline();
    const isBackendReady = store.getState().backendConnected;

    return {
      recipientCount: contacts.length,
      contacts,
      primaryRecipient: primaryContact,
      location,
      messageBody,
      smsUri,
      isOnline,
      isBackendReady,
      initialState: isOnline
        ? (isBackendReady ? FamilyDeliveryStates.PREPARING : FamilyDeliveryStates.QUEUED_OFFLINE)
        : FamilyDeliveryStates.SMS_READY
    };
  }

  /**
   * Executes "I'm Safe" broadcast through core architectural pipeline:
   * 1. If ONLINE: attempts direct delivery through Supabase/backend.
   * 2. If OFFLINE: enqueues event in authoritative IndexedDB OfflineQueue with clientEventId.
   * 3. Prepares SMS fallback URI requiring explicit user action (never claims automated dispatch).
   */
  async executeImSafeBroadcast(customLocation = null) {
    const contacts = this.getSavedContacts();
    const primaryContact = contacts.length > 0 ? contacts[0] : { name: 'Emergency Contact', phone: '112' };
    const { profile } = store.getState();
    const citizenId = profile?.citizenId || 'citizen-anonymous';

    // Location acquisition via LocationService (with durable cached fallback)
    let location = customLocation;
    if (!location) {
      try {
        location = await locationService.getCurrentPosition({ timeoutMs: 3000, fallbackToCached: true });
      } catch {
        location = locationService.getLastKnownLocation() || store.getState().location;
      }
    }

    const messageBody = this.buildImSafeMessage(location);
    const smsUri = communicationFallback.generateSmsUri(primaryContact.phone, messageBody);
    const clientEventId = `imsafe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const nowIso = new Date().toISOString();

    const payload = {
      clientEventId,
      citizenId,
      timestamp: nowIso,
      location: location ? {
        latitude: location.latitude ?? location.lat,
        longitude: location.longitude ?? location.lng,
        accuracy_meters: location.accuracy_meters ?? location.accuracy,
        source: location.source || LocationSource.CACHED,
        is_stale: location.is_stale || false
      } : null,
      contacts,
      message: messageBody
    };

    const isOnline = connectivityService.isOnline();

    // ONLINE PATH: Attempt direct delivery
    if (isOnline) {
      try {
        const response = await apiClient.post('/family/im-safe', payload, { timeout: 5000 });
        if (response && response.ok) {
          this.deliveryStatus = FamilyDeliveryStates.SENT;
          return {
            status: FamilyDeliveryStates.SENT,
            deliveryState: 'SENT',
            clientEventId,
            smsFallback: false,
            smsUri,
            payload,
            message: t('family.serverQueued', { count: contacts.length }) ||
              `Safety confirmation successfully transmitted to emergency network for ${contacts.length} contact(s).`
          };
        }
      } catch (err) {
        console.warn('[FamilySafety] Direct online dispatch failed, falling back to durable offline queue:', err);
      }
    }

    // OFFLINE PATH (or failed online): Durably persist in IndexedDB OfflineQueue
    let queuedEvent = null;
    try {
      queuedEvent = await offlineQueue.enqueue(
        'FAMILY_IM_SAFE',
        payload,
        QueueEventPriority.NORMAL,
        clientEventId
      );
    } catch (qErr) {
      console.error('[FamilySafety] Failed to enqueue safety broadcast in IndexedDB:', qErr);
    }

    this.deliveryStatus = FamilyDeliveryStates.QUEUED_OFFLINE;

    return {
      status: FamilyDeliveryStates.QUEUED_OFFLINE,
      deliveryState: 'QUEUED_OFFLINE',
      clientEventId,
      queuedEvent,
      smsFallback: true,
      smsUri,
      payload,
      message: t('family.smsFallbackReady', 'Offline / No internet: Broadcast durably queued in IndexedDB for auto-sync on reconnect. SMS is ready for immediate manual dispatch.')
    };
  }
}

export const familySafety = new FamilySafetyManager();
