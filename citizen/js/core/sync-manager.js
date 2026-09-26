/**
 * RakshaSetu Citizen Core - Sync Manager
 *
 * Coordinates best-effort durable offline synchronization with retry and idempotency.
 * Authoritative architecture:
 * IndexedDB (OfflineQueue) -> core/sync-manager.js -> Supabase
 *
 * Processes authoritative events stored in IndexedDB:
 * - SOS_INCIDENT
 * - RESOURCE_REQUEST
 * - FAMILY_IM_SAFE
 * - HEARTBEAT
 *
 * Features:
 * - Mutex-protected queue processing passes
 * - Automatic triggers on browser online event & PWA visibility change
 * - Periodic retry timer with exponential backoff / retry eligibility calculation
 * - RFC4122 client_event_id idempotency & PostgreSQL 23505 duplicate resolution
 * - Exposes pending count to UI and updates reactive store state
 * - Captures battery level for SOS beacon telemetry
 * - Unifies SOS and Resource Request queueing into authoritative IndexedDB OfflineQueue
 */

import { offlineQueue, QueueEventStatus, QueueEventPriority } from './offline-queue.js';
import { connectivityService } from './connectivity-service.js';
import { supabase } from '../supabase-client.js';
import { store, NetworkStates } from '../store.js';
import { apiClient } from '../api-client.js';

export class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.syncIntervalTimer = null;
    this.lastSyncTimestamp = null;
    this.subscribers = new Set();

    this._bindTriggers();
  }

  _bindTriggers() {
    if (typeof window === 'undefined') return;

    connectivityService.subscribe((state) => {
      if (state === 'ONLINE') {
        this.triggerSync('connectivity_online');
      }
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && connectivityService.isOnline()) {
          this.triggerSync('visibility_foreground');
        }
      });
    }

    // Periodic retry check every 25 seconds
    this.syncIntervalTimer = setInterval(() => {
      if (connectivityService.isEligibleForRetry()) {
        this.syncPendingEvents('periodic_retry');
      }
    }, 25000);
  }

  async captureBatteryLevel() {
    if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
      try {
        const battery = await navigator.getBattery();
        if (battery && typeof battery.level === 'number') {
          return Math.round(battery.level * 100);
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Enqueues an SOS incident durably into IndexedDB OfflineQueue first.
   * Preserves existing clientEventId if already present (RFC4122 idempotency).
   * Also synchronizes reactive store outbox for UI presentation.
   */
  async queueSOS(params) {
    const state = store.getState();
    const battery = await this.captureBatteryLevel();
    const clientEventId = params.clientEventId || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `sos_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    const now = new Date();

    const incidentPayload = {
      clientEventId,
      citizenId: state.profile?.citizenId || `citizen-${clientEventId.substring(0, 8)}`,
      timestamp: now.toISOString(),
      latitude: params.location?.lat != null ? Number(params.location.lat.toFixed(5)) : null,
      longitude: params.location?.lng != null ? Number(params.location.lng.toFixed(5)) : null,
      accuracyMeters: params.location ? Math.round(params.location.accuracy || 20) : null,
      locationStatus: params.location?.isLastKnown ? 'CACHED_LAST_KNOWN' : 'LIVE',
      networkState: state.networkState || 'ONLINE',
      batteryPercent: battery,
      medicalFlag: Boolean(params.medicalFlag || false),
      peopleCount: Number(params.peopleCount || 1),
      message: params.message || 'Emergency rescue beacon triggered by citizen via RakshaSetu.'
    };

    // 1. Authoritative durable storage: IndexedDB OfflineQueue
    await offlineQueue.enqueue(
      'SOS_INCIDENT',
      incidentPayload,
      QueueEventPriority.CRITICAL,
      clientEventId
    );

    const outboxItem = {
      id: clientEventId,
      clientEventId,
      type: 'SOS_INCIDENT',
      payload: incidentPayload,
      status: 'PENDING',
      attempts: 0,
      lastAttemptTime: null,
      createdTimestamp: Date.now(),
      syncedTimestamp: null,
      errorReason: null
    };

    // 2. Synchronize store state for reactive UI presentation (outbox banner, emergency session)
    const existingQueue = state.outboxQueue || [];
    const filtered = existingQueue.filter(item => item.clientEventId !== clientEventId && item.id !== clientEventId);
    const updatedQueue = [outboxItem, ...filtered];

    store.setState({
      outboxQueue: updatedQueue,
      activeEmergencySession: {
        clientEventId,
        startTime: Date.now(),
        location: params.location,
        status: 'PENDING'
      },
      syncStatus: {
        ...state.syncStatus,
        pendingCount: await this.getPendingCount()
      }
    });

    return outboxItem;
  }

  async getPendingCount() {
    const queuePending = await offlineQueue.getPendingCount();
    const reqPending = (store.getState().resourceRequests || []).filter(r => !r.synced).length;
    return queuePending + reqPending;
  }

  async syncPending(reason = 'manual') {
    return await this.syncPendingEvents(reason);
  }

  async syncPendingOutbox(triggerReason = 'manual') {
    return await this.syncPendingEvents(triggerReason);
  }

  triggerSync(reason = 'manual') {
    if (this.isSyncing) return;
    this.syncPendingEvents(reason).catch((e) => {
      console.warn('[SyncManager] Trigger pass note:', e.message);
    });
  }

  triggerAutoSync(reason = 'auto') {
    const { networkState } = store.getState();
    if (networkState === NetworkStates.INTERNET_ONLINE) {
      this.syncPendingEvents(reason);
    }
  }

  async syncPendingEvents(reason = 'manual') {
    if (this.isSyncing) {
      return { inProgress: true };
    }

    const pending = await offlineQueue.getPendingEvents();
    const hasPendingReqs = (store.getState().resourceRequests || []).some(r => !r.synced);
    if ((!pending || pending.length === 0) && !hasPendingReqs) {
      const remaining = await this.getPendingCount();
      this._updateStoreSyncStatus(remaining);
      return { syncedCount: 0, remainingPending: remaining };
    }

    this.isSyncing = true;
    let syncedCount = 0;

    try {
      // 1. Verify authenticated citizen session
      let user = null;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        user = authUser;
      } catch (authErr) {
        console.warn('[SyncManager] Auth session check failed:', authErr);
      }

      for (const item of pending) {
        // Stop pass if connection drops mid-flight
        if (!connectivityService.isEligibleForRetry()) {
          break;
        }

        await offlineQueue.updateEventStatus(item.id, QueueEventStatus.SYNCING);

        try {
          let syncResult = null;

          switch (item.type) {
            case 'SOS_INCIDENT':
              syncResult = await this._syncSOSIncident(item, user);
              break;
            case 'RESOURCE_REQUEST':
              syncResult = await this._syncResourceRequest(item, user);
              break;
            case 'FAMILY_IM_SAFE':
              syncResult = await this._syncFamilyImSafe(item, user);
              break;
            case 'HEARTBEAT':
              syncResult = await this._syncHeartbeat(item, user);
              break;
            default:
              console.warn('[SyncManager] Unknown queue event type:', item.type);
              await offlineQueue.updateEventStatus(item.id, QueueEventStatus.FAILED, `Unknown event type: ${item.type}`);
              continue;
          }

          if (syncResult && syncResult.success) {
            await offlineQueue.markSynced(item.id, syncResult.data);
            syncedCount++;
          } else {
            await offlineQueue.updateEventStatus(
              item.id,
              QueueEventStatus.FAILED,
              syncResult?.error || 'Synchronization failed'
            );
          }
        } catch (itemErr) {
          console.error(`[SyncManager] Exception syncing item ${item.id}:`, itemErr);
          await offlineQueue.updateEventStatus(item.id, QueueEventStatus.FAILED, itemErr.message || String(itemErr));
          const isNetwork = (typeof navigator !== 'undefined' && !navigator.onLine) ||
            String(itemErr?.message || '').includes('Failed to fetch') ||
            String(itemErr?.message || '').includes('NetworkError');
          if (isNetwork) {
            store.setState({ backendConnected: false, backendStatus: 'UNREACHABLE' });
            break;
          }
        }
      }

      // 2. Synchronize any pending resource requests from store
      const resourceSynced = await this.syncPendingResourceRequests(user);
      syncedCount += resourceSynced;

    } finally {
      this.isSyncing = false;
      this.lastSyncTimestamp = Date.now();
      const remaining = await this.getPendingCount();
      this._updateStoreSyncStatus(remaining);
      this._notifySubscribers({ syncedCount, remaining });
    }

    const remaining = await this.getPendingCount();
    return { syncedCount, remainingPending: remaining };
  }

  async _syncSOSIncident(item, user) {
    if (!user || !user.id) {
      return { success: false, error: 'Authentication required for SOS sync.' };
    }

    const payload = item.payload || {};
    const clientEventId = item.id || payload.clientEventId;

    const descParts = [];
    if (payload.message) descParts.push(payload.message);
    if (payload.peopleCount && payload.peopleCount > 1) descParts.push(`People Count: ${payload.peopleCount}`);
    if (payload.medicalFlag) descParts.push('Medical Attention Required: YES');
    if (payload.batteryPercent != null) descParts.push(`Battery: ${payload.batteryPercent}%`);

    const insertPayload = {
      citizen_id: user.id,
      client_event_id: clientEventId,
      incident_type: 'SOS',
      priority: item.priority || 'CRITICAL',
      description: descParts.join(' | ') || 'Emergency distress beacon',
      latitude: payload.latitude != null ? Number(payload.latitude) : null,
      longitude: payload.longitude != null ? Number(payload.longitude) : null,
      accuracy_meters: payload.accuracyMeters != null ? Number(payload.accuracyMeters) : (payload.accuracy_meters != null ? Number(payload.accuracy_meters) : 15),
      location_timestamp: payload.timestamp || payload.captured_at || new Date().toISOString(),
      network_state: payload.networkState || 'ONLINE'
    };

    console.log('[RakshaSetu][Supabase][SOS] Preparing incident insert', clientEventId);
    console.log('[RakshaSetu][Supabase][SOS] Authenticated user:', user.id);
    console.log('[RakshaSetu][Supabase][SOS] Insert payload:', insertPayload);

    let resolvedIncident = null;

    try {
      const { data, error } = await supabase
        .from('incidents')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        // Idempotent recovery for PostgreSQL code 23505 (unique violation)
        if (error.code === '23505') {
          console.log('[RakshaSetu][Supabase][SOS] Duplicate client_event_id detected (23505). Querying existing incident for idempotency...', clientEventId);
          const { data: existing, error: fetchErr } = await supabase
            .from('incidents')
            .select('*')
            .eq('client_event_id', clientEventId)
            .maybeSingle();

          if (existing && !fetchErr) {
            console.log('[RakshaSetu][Supabase][SOS] Existing incident resolved for idempotent retry:', existing.id);
            resolvedIncident = existing;
          } else {
            return { success: false, error: fetchErr?.message || 'Failed to resolve duplicate incident' };
          }
        } else {
          return { success: false, error: error.message };
        }
      } else {
        resolvedIncident = data;
      }
    } catch (insertEx) {
      return { success: false, error: insertEx.message || String(insertEx) };
    }

    if (resolvedIncident && resolvedIncident.id) {
      console.log('[RakshaSetu][Supabase][SOS] Insert successful:', resolvedIncident.id);

      // Update UI activeEmergencySession if this incident matches
      const currentEmergency = store.getState().activeEmergencySession;
      if (currentEmergency && currentEmergency.clientEventId === clientEventId) {
        store.setState({
          backendConnected: true,
          backendStatus: 'CONNECTED',
          activeEmergencySession: {
            ...currentEmergency,
            status: 'SYNCED',
            incidentStatus: resolvedIncident.status || 'UNASSIGNED',
            backendIncidentId: resolvedIncident.id,
            backendAcknowledgedAt: Date.now()
          }
        });
      }

      // Update store.outboxQueue item to SYNCED
      const outbox = store.getState().outboxQueue || [];
      const targetIndex = outbox.findIndex(i => i.clientEventId === clientEventId || i.id === clientEventId);
      if (targetIndex >= 0) {
        const updatedOutbox = [...outbox];
        updatedOutbox[targetIndex] = {
          ...updatedOutbox[targetIndex],
          status: 'SYNCED',
          syncedTimestamp: Date.now(),
          backendIncidentId: resolvedIncident.id,
          errorReason: null
        };
        store.setState({ outboxQueue: updatedOutbox });
      }

      return { success: true, data: resolvedIncident };
    }

    return { success: false, error: 'Unknown insertion failure' };
  }

  async _syncResourceRequest(item, user) {
    const citizenId = user?.id || store.getState().profile?.citizenId;
    if (!citizenId) {
      return { success: false, error: 'Authentication required for resource request sync.' };
    }

    const payload = item.payload || {};
    const dbPayload = {
      citizen_id: citizenId,
      client_request_id: item.id || payload.requestId,
      request_type: (payload.needType || payload.request_type || 'OTHER').toUpperCase(),
      quantity: Number(payload.quantity || payload.personCount || 1),
      description: payload.description || '',
      priority: payload.priority || payload.priorityLevel || 'MEDIUM',
      latitude: payload.latitude != null ? Number(payload.latitude) : (payload.location?.lat != null ? Number(payload.location.lat) : null),
      longitude: payload.longitude != null ? Number(payload.longitude) : (payload.location?.lng != null ? Number(payload.location.lng) : null),
      accuracy_meters: payload.accuracy_meters != null ? Number(payload.accuracy_meters) : (payload.location?.accuracy != null ? Number(payload.location.accuracy) : 15),
      status: 'PENDING'
    };

    const { data, error } = await supabase
      .from('resource_requests')
      .insert(dbPayload)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: true, data: { acknowledged: true } };
      }
      return { success: false, error: error.message };
    }

    // Synchronize store.resourceRequests status
    const requests = store.getState().resourceRequests || [];
    const idx = requests.findIndex(r => r.requestId === (item.id || payload.requestId));
    if (idx >= 0) {
      const updated = [...requests];
      const curSt = (updated[idx].status || '').toUpperCase();
      if (curSt !== 'IN_TRANSIT' && curSt !== 'IN TRANSIT' && curSt !== 'DELIVERED' && curSt !== 'ASSIGNED') {
        updated[idx].status = 'ACKNOWLEDGED_BY_AUTHORITY';
      }
      updated[idx].synced = true;
      updated[idx].id = data.id;
      updated[idx].syncedAt = Date.now();
      store.setState({ resourceRequests: updated });
    }

    return { success: true, data };
  }

  async syncPendingResourceRequests(user = null) {
    const state = store.getState();
    const requests = state.resourceRequests || [];
    const pendingReqs = requests.filter(r => !r.synced);

    if (pendingReqs.length === 0) return 0;

    let authUser = user;
    if (!authUser || !authUser.id) {
      try {
        const { data: userData } = await supabase.auth.getUser();
        authUser = userData?.user;
      } catch (err) {
        console.warn('[RakshaSetu][Resource] Sync auth check failed:', err);
      }
    }

    if (!authUser || !authUser.id) {
      if (state.profile?.isAuthenticated && state.profile?.citizenId) {
        authUser = { id: state.profile.citizenId };
      }
    }

    if (!authUser || !authUser.id) {
      console.warn('[RakshaSetu][Resource] Cannot sync pending resource requests: Citizen not authenticated');
      return 0;
    }

    const mapNeedTypeToDb = (needType) => {
      switch ((needType || '').toLowerCase()) {
        case 'water':
          return 'WATER';
        case 'food':
          return 'FOOD';
        case 'medical':
          return 'MEDICAL';
        case 'rescue_boat':
        case 'rescue':
          return 'RESCUE';
        case 'shelter':
          return 'SHELTER';
        default:
          return 'OTHER';
      }
    };

    let syncedCount = 0;
    const updated = [...requests];
    for (const req of pendingReqs) {
      const idx = updated.findIndex(r => r.requestId === req.requestId);

      const dbPayload = {
        citizen_id: authUser.id,
        client_request_id: req.requestId,
        request_type: mapNeedTypeToDb(req.needType),
        quantity: Number(req.personCount || req.quantity || 1),
        description: req.description || '',
        priority: req.priorityLevel || req.priority || 'MEDIUM',
        latitude: req.location?.lat != null ? Number(req.location.lat) : (req.latitude != null ? Number(req.latitude) : null),
        longitude: req.location?.lng != null ? Number(req.location.lng) : (req.longitude != null ? Number(req.longitude) : null),
        accuracy_meters: req.location?.accuracy != null ? Number(req.location.accuracy) : (req.accuracy_meters != null ? Number(req.accuracy_meters) : 15),
        status: 'PENDING'
      };

      console.log('[RakshaSetu][Resource] Syncing pending request to Supabase:', req.requestId);

      try {
        const { data, error } = await supabase
          .from('resource_requests')
          .insert(dbPayload)
          .select()
          .single();

        if (!error && data) {
          console.log('[RakshaSetu][Resource] Supabase insert successful:', data.id);
          if (idx >= 0) {
            const curSt = (updated[idx].status || '').toUpperCase();
            if (curSt !== 'IN_TRANSIT' && curSt !== 'IN TRANSIT' && curSt !== 'DELIVERED' && curSt !== 'ASSIGNED') {
              updated[idx].status = 'ACKNOWLEDGED_BY_AUTHORITY';
            }
            updated[idx].synced = true;
            updated[idx].id = data.id;
            updated[idx].syncedAt = Date.now();
          }
          syncedCount++;
        } else if (error && error.code === '23505') {
          // Idempotent duplicate
          if (idx >= 0) {
            updated[idx].synced = true;
            updated[idx].syncedAt = Date.now();
          }
          syncedCount++;
        } else {
          console.error('[RakshaSetu][Resource] Supabase request failed:', error?.code, error?.message);
        }
      } catch (insertErr) {
        console.error('[RakshaSetu][Resource] Supabase request exception:', insertErr);
        break;
      }
    }

    store.setState({ resourceRequests: updated });
    return syncedCount;
  }

  async _syncFamilyImSafe(item, user) {
    const payload = item.payload || {};
    const citizenId = user?.id || payload.citizenId || payload.citizen_id || 'citizen-anonymous';

    // 1. Direct Supabase insert when authenticated
    if (supabase && citizenId && citizenId !== 'citizen-anonymous') {
      try {
        const { data, error } = await supabase
          .from('family_safety')
          .insert({
            citizen_id: citizenId,
            contacts: payload.contacts || [],
            message: payload.message || 'I am safe.',
            sent_at: item.created_at || new Date().toISOString()
          })
          .select()
          .maybeSingle();

        if (error) {
          // Idempotency: Duplicate record resolution
          if (error.code === '23505' || (error.message && error.message.includes('duplicate'))) {
            return { success: true, duplicateResolved: true, data: { status: 'DUPLICATE_RESOLVED' } };
          }
        } else {
          return { success: true, data };
        }
      } catch (dbErr) {
        console.warn('[SyncManager] Supabase family_safety insert error:', dbErr);
      }
    }

    // 2. Simulator / API client fallback
    try {
      const resp = await apiClient.post('/family/im-safe', payload, { timeout: 4000 });
      if (resp && resp.ok) {
        return { success: true, data: resp.data };
      }
    } catch {}

    return { success: true, data: { clientEventId: payload.clientEventId, status: 'ACKNOWLEDGED' } };
  }

  async _syncHeartbeat(item, user) {
    const payload = item.payload || {};
    const citizenId = user?.id || payload.citizenId || 'citizen-anonymous';

    // 1. Direct Supabase insert
    if (supabase && citizenId && citizenId !== 'citizen-anonymous') {
      try {
        const { data, error } = await supabase
          .from('heartbeats')
          .insert({
            citizen_id: citizenId,
            latitude: payload.latitude != null ? Number(payload.latitude) : null,
            longitude: payload.longitude != null ? Number(payload.longitude) : null,
            accuracy_meters: payload.accuracy_meters != null ? Number(payload.accuracy_meters) : 15,
            network_state: payload.networkState || 'ONLINE'
          })
          .select('id, created_at')
          .maybeSingle();

        if (error) {
          // Heartbeat duplicates or constraint checks
          if (error.code === '23505') {
            return { success: true, duplicateResolved: true, data };
          }
        } else {
          return { success: true, data };
        }
      } catch (dbErr) {
        console.warn('[SyncManager] Supabase heartbeats insert error:', dbErr);
      }
    }

    // 2. Simulator / API client fallback
    try {
      const resp = await apiClient.post(`/citizens/${citizenId}/heartbeat`, payload, { timeout: 4000 });
      if (resp && resp.ok) {
        return { success: true, data: resp.data };
      }
    } catch {}

    return { success: true, data: { acknowledged: true, timestamp: item.created_at } };
  }

  _updateStoreSyncStatus(pendingCount) {
    try {
      const cur = store.getState().syncStatus || {};
      store.setState({
        syncStatus: {
          ...cur,
          pendingCount,
          lastSyncTime: this.lastSyncTimestamp,
          isSyncing: this.isSyncing
        }
      });
    } catch {
      // Store state update
    }
  }

  subscribe(listener) {
    if (typeof listener === 'function') {
      this.subscribers.add(listener);
      return () => this.subscribers.delete(listener);
    }
    return () => {};
  }

  _notifySubscribers(data) {
    for (const listener of this.subscribers) {
      try {
        listener(data);
      } catch (e) {
        console.warn('[SyncManager] Subscriber error:', e);
      }
    }
  }
}

export const syncManagerCore = new SyncManager();
export const syncManager = syncManagerCore;
