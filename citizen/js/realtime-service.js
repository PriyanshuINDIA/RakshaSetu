/**
 * RakshaSetu Citizen Realtime Service
 * Manages Supabase Realtime postgres_changes subscriptions for:
 * 1. public.incidents (Citizen SOS distress beacons)
 * 2. public.resource_requests (Citizen emergency relief needs)
 *
 * Ensures:
 * - Single authenticated citizen scoping (citizen_id = userId)
 * - Prevention of duplicate channel subscriptions
 * - Automatic cleanup on logout / component destruction
 * - Live non-refresh UI state hydration and toast notifications
 * - Persistence on reload via initial Supabase sync
 */

import { supabase } from './supabase-client.js';
import { store } from './store.js';
import { t, mapResourceType } from '../i18n/index.js';

// Status display mappings conforming strictly to specifications (translated for citizen UI)
export function mapIncidentStatus(status) {
  switch ((status || '').toUpperCase()) {
    case 'UNASSIGNED':
      return t('incident.pending');
    case 'ASSIGNED':
      return t('incident.assigned');
    case 'RESPONDING':
      return t('incident.responding');
    case 'REACHED':
      return t('incident.reached');
    case 'RESOLVED':
      return t('incident.resolved');
    case 'CANCELLED':
      return t('incident.cancelled');
    default:
      return status || t('incident.pending');
  }
}

export function mapResourceStatus(status) {
  switch ((status || '').toUpperCase()) {
    case 'PENDING':
      return t('resource.pending');
    case 'ASSIGNED':
      return t('resource.assigned');
    case 'IN_TRANSIT':
    case 'IN TRANSIT':
      return t('resource.inTransit');
    case 'DELIVERED':
      return t('resource.delivered');
    case 'CANCELLED':
      return t('resource.cancelled');
    default:
      return status || t('resource.pending');
  }
}

/**
 * Maps a resource request database row into the standardized state model.
 * Preserves both snake_case and camelCase accessors for seamless compatibility.
 */
export function mapResourceRequestFromDatabase(row) {
  if (!row) return {};
  const trackingId = row.client_request_id || row.trackingId || row.tracking_id || row.requestId || row.id;
  const reqType = row.request_type || row.requestType || 'RESOURCE';
  const qty = row.quantity != null ? row.quantity : (row.personCount != null ? row.personCount : 1);
  const prio = row.priority || row.priorityLevel || 'MEDIUM';

  return {
    id: row.id,
    trackingId: trackingId,
    requestId: trackingId,
    client_request_id: trackingId,
    requestType: reqType,
    request_type: reqType,
    needType: (reqType || '').toLowerCase(),
    quantity: Number(qty),
    personCount: Number(qty),
    description: row.description || '',
    priority: prio,
    priorityLevel: prio,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    accuracy_meters: row.accuracy_meters != null ? Number(row.accuracy_meters) : 15,
    status: row.status,
    assignedTeamId: row.assigned_team_id !== undefined ? row.assigned_team_id : (row.assignedTeamId || null),
    assigned_team_id: row.assigned_team_id !== undefined ? row.assigned_team_id : (row.assignedTeamId || null),
    createdAt: row.created_at || row.createdAt,
    created_at: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
    updated_at: row.updated_at || row.updatedAt || new Date().toISOString(),
    synced: true
  };
}

/**
 * Lightweight, non-blocking toast notification matching RakshaSetu design tokens.
 */
export function showRealtimeToast(message, type = 'info') {
  if (typeof document === 'undefined') return;

  let container = document.getElementById('rakshasetu-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'rakshasetu-toast-container';
    container.style.cssText = `
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      z-index: var(--z-toast, 700);
      width: calc(100% - 32px);
      max-width: 480px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `state-banner ${type === 'error' ? 'error' : type === 'success' ? 'success' : 'pending-sync'}`;
  toast.style.cssText = `
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
    border-radius: var(--radius-md, 8px);
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 500;
    opacity: 0;
    transform: translateY(-8px);
    transition: opacity 0.25s ease, transform 0.25s ease;
    pointer-events: auto;
  `;
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger smooth entrance
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Auto remove after 4.5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 4500);
}

class RealtimeService {
  constructor() {
    this.currentUserId = null;
    this.incidentChannel = null;
    this.incidentDebugChannel = null;
    this.resourceChannel = null;
    this.resourceDebugChannel = null;
    this.isSubscribed = false;
    this.isHydrating = false;
    this._processedResourceUpdates = new Set();
    this._processedIncidentUpdates = new Set();
  }

  /**
   * Set realtime authentication JWT token on the Supabase Realtime client.
   * This ensures postgres_changes respects RLS policies for the citizen.
   */
  async setRealtimeAuth() {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token && supabase.realtime && typeof supabase.realtime.setAuth === 'function') {
        await supabase.realtime.setAuth(token);
      }
    } catch (err) {
      console.warn('[RakshaSetu][Realtime] Warning setting auth on realtime socket:', err);
    }
  }

  /**
   * Start citizen realtime subscriptions for both incidents and resource requests.
   * Only subscribes AFTER authenticated session is verified and realtime auth token attached.
   */
  async startCitizenRealtime(userId) {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;

    if (!session || !session.access_token) {
      console.error('[RakshaSetu][Realtime] NO AUTH SESSION');
      return;
    }

    const currentUserId = (userId || session.user.id).toLowerCase().trim();

    // Attach JWT to Supabase Realtime client
    if (supabase.realtime && typeof supabase.realtime.setAuth === 'function') {
      try {
        await supabase.realtime.setAuth(session.access_token);
      } catch (err) {
        console.warn('[RakshaSetu][Realtime] Warning setting auth on realtime socket:', err);
      }
    }

    // Step 2 & Final Acceptance logging
    console.log('[RakshaSetu][Realtime] AUTH READY');
    console.log(`[RakshaSetu][Realtime] AUTH READY\nuserId: ${currentUserId}`);
    console.log('[Realtime] AUTH READY');
    console.log(`[Realtime] AUTH READY\nuserId: ${currentUserId}`);

    // Prevent duplicate subscriptions for the same user
    if (this.isSubscribed && this.currentUserId === currentUserId && this.resourceChannel) {
      console.log('[RakshaSetu][Realtime] Subscription already active for citizen:', currentUserId);
      return;
    }

    // Clean up any stale subscription before starting new one
    if (this.isSubscribed || (this.currentUserId && this.currentUserId !== currentUserId)) {
      await this.stopCitizenRealtime();
    }

    this.currentUserId = currentUserId;
    this.isSubscribed = true;

    // Hydrate latest data from Supabase so reload/page refresh has the latest truth
    await this.hydrateLatestState(currentUserId);

    // Step 3 & Step 9: Test debug subscriptions without filter first
    this.subscribeResourceRequestsDebug(currentUserId);
    this.subscribeIncidentsDebug(currentUserId);

    // Step 6 & Step 9: Production subscriptions with citizen_id filter
    this.subscribeResourceRequests(currentUserId);
    this.subscribeIncidents(currentUserId);
  }

  /**
   * Hydrates the latest active incident and resource requests directly from Supabase
   * to guarantee the reload test displays current server state.
   */
  async hydrateLatestState(userId) {
    if (this.isHydrating) return;
    this.isHydrating = true;

    try {
      // 1. Hydrate latest incident
      const { data: incident, error: incError } = await supabase
        .from('incidents')
        .select('*')
        .eq('citizen_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!incError && incident) {
        const currentEmergency = store.getState().activeEmergencySession;
        if (currentEmergency || incident.status !== 'RESOLVED') {
          store.setState({
            activeEmergencySession: {
              ...(currentEmergency || {}),
              clientEventId: incident.client_event_id || currentEmergency?.clientEventId || incident.id,
              backendIncidentId: incident.id,
              status: 'SYNCED',
              incidentStatus: incident.status,
              startTime: currentEmergency?.startTime || new Date(incident.created_at).getTime(),
              location: currentEmergency?.location || {
                lat: Number(incident.latitude),
                lng: Number(incident.longitude),
                accuracy: incident.accuracy_meters || 15
              }
            }
          });
        }
      }

      // 2. Hydrate resource requests
      const { data: requests, error: reqError } = await supabase
        .from('resource_requests')
        .select('*')
        .eq('citizen_id', userId)
        .order('created_at', { ascending: false });

      if (!reqError && Array.isArray(requests)) {
        const localRequests = store.getState().resourceRequests || [];
        const mergedRequests = [...localRequests];

        for (const remote of requests) {
          const formatted = mapResourceRequestFromDatabase(remote);
          const targetId = String(remote.id || '').toLowerCase().trim();

          const idx = mergedRequests.findIndex(r => {
            const existingId = String(r.id || '').toLowerCase().trim();
            if (existingId && existingId === targetId) return true;
            if (remote.client_request_id) {
              const cId = String(r.client_request_id || r.requestId || r.trackingId || '').toLowerCase().trim();
              return cId && cId === String(remote.client_request_id).toLowerCase().trim();
            }
            return false;
          });

          if (idx >= 0) {
            mergedRequests[idx] = { ...mergedRequests[idx], ...formatted };
          } else {
            mergedRequests.push(formatted);
          }
        }

        store.setState({ resourceRequests: mergedRequests });
      }
    } catch (err) {
      console.warn('[RakshaSetu][Realtime] Hydration warning:', err);
    } finally {
      this.isHydrating = false;
    }
  }

  /**
   * FEATURE 1: Subscribe to public.incidents UPDATE events
  /**
   * STEP 9: Test debug subscription for public.incidents WITHOUT filter first
   */
  subscribeIncidentsDebug(userId) {
    const normalizedUserId = String(userId).toLowerCase().trim();
    const channelName = `citizen-incident-debug-${normalizedUserId}`;

    if (this.incidentDebugChannel) {
      try {
        supabase.removeChannel(this.incidentDebugChannel);
      } catch (err) {}
      this.incidentDebugChannel = null;
    }

    this.incidentDebugChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'incidents'
        },
        (payload) => {
          console.log(
            '[RakshaSetu][Realtime][DEBUG] INCIDENT UPDATE RECEIVED',
            payload
          );
          this.handleIncidentUpdate(payload);
        }
      )
      .subscribe((status, err) => {
        console.log(
          '[RakshaSetu][Realtime][DEBUG] INCIDENT CHANNEL STATUS',
          status,
          err || ''
        );
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] INCIDENT CHANNEL STATUS SUBSCRIBED');
        }
      });
  }

  /**
   * STEP 9: Production filtered subscription for public.incidents
   */
  subscribeIncidents(userId) {
    const normalizedUserId = String(userId).toLowerCase().trim();
    const channelName = `citizen-incidents-${normalizedUserId}`;

    console.log('[RakshaSetu][Realtime] SUBSCRIBING: incidents');

    if (this.incidentChannel) {
      try {
        supabase.removeChannel(this.incidentChannel);
      } catch (err) {}
      this.incidentChannel = null;
    }

    this.incidentChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'incidents',
          filter: `citizen_id=eq.${normalizedUserId}`
        },
        (payload) => {
          if (!payload || !payload.new) return;
          this.handleIncidentUpdate(payload);
        }
      )
      .subscribe((status, err) => {
        console.log('[RakshaSetu][Realtime][Incidents] CHANNEL STATUS:', status, err || '');
        if (status === 'SUBSCRIBED') {
          console.log('[RakshaSetu][Realtime] SUBSCRIBED: incidents');
          console.log('[Realtime] INCIDENT CHANNEL STATUS SUBSCRIBED');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' || err) {
          console.error('[RakshaSetu][Realtime] incidents channel error:', status, err);
        }
      });
  }

  /**
   * Handle incident update payload (Step 4 & Step 9)
   */
  handleIncidentUpdate(payloadOrRow, maybeOld) {
    const payload = (payloadOrRow && (payloadOrRow.new || payloadOrRow.old))
      ? payloadOrRow
      : { new: payloadOrRow, old: maybeOld || {} };
    const row = payload.new;
    const oldRow = payload.old || {};

    if (!row || !row.id) return;

    // Deduplication check
    const updateKey = `${row.id}_${row.status}_${row.updated_at || ''}`;
    if (this._processedIncidentUpdates && this._processedIncidentUpdates.has(updateKey)) {
      return;
    }
    if (!this._processedIncidentUpdates) {
      this._processedIncidentUpdates = new Set();
    }
    this._processedIncidentUpdates.add(updateKey);

    if (this.currentUserId && row.citizen_id && 
        String(row.citizen_id).toLowerCase().trim() !== String(this.currentUserId).toLowerCase().trim()) {
      return;
    }

    console.log('[RakshaSetu][Realtime] UPDATE RECEIVED: incidents', {
      incidentId: row.id,
      citizenId: row.citizen_id,
      oldStatus: oldRow.status,
      newStatus: row.status
    });
    console.log('[Realtime] INCIDENT UPDATE RECEIVED', {
      incidentId: row.id,
      status: row.status
    });

    const state = store.getState();
    const currentEmergency = state.activeEmergencySession;
    const mappedStatus = mapIncidentStatus(row.status);

    // Match by database UUID: payload.new.id === existingIncident.id
    const matchesCurrent =
      !currentEmergency ||
      currentEmergency.id === row.id ||
      currentEmergency.backendIncidentId === row.id ||
      (currentEmergency.id && String(currentEmergency.id).toLowerCase().trim() === String(row.id).toLowerCase().trim()) ||
      (currentEmergency.backendIncidentId && String(currentEmergency.backendIncidentId).toLowerCase().trim() === String(row.id).toLowerCase().trim());

    if (matchesCurrent) {
      const updatedEmergency = {
        ...(currentEmergency || {}),
        ...row,
        id: row.id,
        backendIncidentId: row.id,
        clientEventId: row.client_event_id || currentEmergency?.clientEventId || row.id,
        status: 'SYNCED',
        incidentStatus: row.status,
        updatedAt: Date.now()
      };

      console.log('[RakshaSetu][State] activeEmergencySession WRITE', 'realtimeService.handleIncidentUpdate', row.status);
      store.setState({ activeEmergencySession: updatedEmergency });
      showRealtimeToast(t('realtime.sosStatusToast', { status: mappedStatus }) || `🚨 SOS Status: ${mappedStatus}`, row.status === 'RESOLVED' ? 'success' : 'pending-sync');
    }

    const outbox = state.outboxQueue || [];
    const outboxIdx = outbox.findIndex(
      item => item.backendIncidentId === row.id || (item.backendIncidentId && String(item.backendIncidentId).toLowerCase().trim() === String(row.id).toLowerCase().trim())
    );
    if (outboxIdx >= 0) {
      const updatedOutbox = [...outbox];
      updatedOutbox[outboxIdx] = {
        ...updatedOutbox[outboxIdx],
        ...row,
        status: 'SYNCED',
        backendIncidentId: row.id,
        incidentStatus: row.status
      };
      store.setState({ outboxQueue: updatedOutbox });
    }

    console.log('[RakshaSetu][Realtime] INCIDENT STORE UPDATED', {
      id: row.id,
      status: row.status
    });
    console.log('[Realtime] INCIDENT STORE UPDATED', {
      id: row.id,
      status: row.status
    });

    // Immediately trigger existing SOS/incident UI renderer
    if (typeof window !== 'undefined' && window.app) {
      const currentState = store.getState();
      if (typeof window.app.render === 'function') {
        window.app.render(currentState);
      }
      if (typeof window.app.renderSOS === 'function' && currentState.currentScreen === 'sos') {
        window.app.renderSOS(currentState);
      }
      if (typeof window.app.renderHome === 'function' && currentState.currentScreen === 'home') {
        window.app.renderHome(currentState);
      }
    }

    console.log('[RakshaSetu][Realtime] INCIDENT UI UPDATED');
    console.log('[Realtime] INCIDENT UI UPDATED');
    console.log(`[RakshaSetu][Realtime] UI UPDATED: incident ${row.id} -> ${row.status}`);
  }

  /**
   * STEP 3: Test debug subscription for public.resource_requests WITHOUT filter first
   */
  subscribeResourceRequestsDebug(userId) {
    const normalizedUserId = String(userId).toLowerCase().trim();
    const channelName = `citizen-resource-debug-${normalizedUserId}`;

    if (this.resourceDebugChannel) {
      try {
        supabase.removeChannel(this.resourceDebugChannel);
      } catch (err) {}
      this.resourceDebugChannel = null;
    }

    this.resourceDebugChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'resource_requests'
        },
        (payload) => {
          console.log(
            '[RakshaSetu][Realtime][DEBUG] RESOURCE UPDATE RECEIVED',
            payload
          );
          this.handleResourceRequestUpdate(payload);
        }
      )
      .subscribe((status, err) => {
        console.log(
          '[RakshaSetu][Realtime][DEBUG] RESOURCE CHANNEL STATUS',
          status,
          err || ''
        );
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] RESOURCE CHANNEL STATUS SUBSCRIBED');
        }
      });
  }

  /**
   * STEP 6: Production filtered subscription for public.resource_requests
   */
  subscribeResourceRequests(userId) {
    const normalizedUserId = String(userId).toLowerCase().trim();
    const channelName = `citizen-resource-requests-${normalizedUserId}`;

    console.log('[RakshaSetu][Realtime][ResourceRequests] SUBSCRIBING');
    console.log('[RakshaSetu][Realtime] SUBSCRIBING: resource_requests');

    if (this.resourceChannel) {
      try {
        supabase.removeChannel(this.resourceChannel);
      } catch (err) {}
      this.resourceChannel = null;
    }

    this.resourceChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'resource_requests',
          filter: `citizen_id=eq.${normalizedUserId}`
        },
        payload => {
          this.handleResourceRequestUpdate(payload);
        }
      )
      .subscribe((status, err) => {
        console.log(
          '[RakshaSetu][Realtime][ResourceRequests] CHANNEL STATUS:',
          status,
          err || ''
        );

        if (status === 'SUBSCRIBED') {
          console.log('[RakshaSetu][Realtime] SUBSCRIBED: resource_requests');
          console.log('[Realtime] RESOURCE CHANNEL STATUS SUBSCRIBED');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' || err) {
          console.error('[RakshaSetu][Realtime][ResourceRequests] CHANNEL ERROR:', status, err);
        }
      });
  }

  /**
   * Handle resource request payload (Step 7)
   */
  handleResourceRequestUpdate(payloadOrRow, maybeOld) {
    const payload = (payloadOrRow && (payloadOrRow.new || payloadOrRow.old))
      ? payloadOrRow
      : { new: payloadOrRow, old: maybeOld || {} };
    const updatedRow = payload.new;

    if (!updatedRow || !updatedRow.id) return;

    // Deduplication check
    const updateKey = `${updatedRow.id}_${updatedRow.status}_${updatedRow.updated_at || ''}`;
    if (this._processedResourceUpdates && this._processedResourceUpdates.has(updateKey)) {
      return;
    }
    if (!this._processedResourceUpdates) {
      this._processedResourceUpdates = new Set();
    }
    this._processedResourceUpdates.add(updateKey);

    // Verify citizen_id matches current authenticated user if provided
    if (this.currentUserId && updatedRow.citizen_id && 
        String(updatedRow.citizen_id).toLowerCase().trim() !== String(this.currentUserId).toLowerCase().trim()) {
      return;
    }

    console.log('[RakshaSetu][Realtime] UPDATE RECEIVED: resource_requests', {
      requestId: updatedRow.id,
      citizenId: updatedRow.citizen_id,
      oldStatus: payload.old?.status,
      newStatus: updatedRow.status
    });
    console.log('[Realtime] RESOURCE UPDATE RECEIVED', {
      requestId: updatedRow.id,
      status: updatedRow.status
    });

    const state = store.getState();
    const requests = state.resourceRequests || [];

    // Step 7: Match by DATABASE UUID: payload.new.id === existing.id
    const targetId = String(updatedRow.id).toLowerCase().trim();
    const index = requests.findIndex(request => {
      const rId = String(request.id || '').toLowerCase().trim();
      return rId === targetId;
    });

    const mapped = mapResourceRequestFromDatabase(updatedRow);
    let updatedRequests = requests.map(request => {
      const rId = String(request.id || '').toLowerCase().trim();
      if (rId === targetId) {
        return {
          ...request,
          ...mapped,
          ...updatedRow,
          id: updatedRow.id,
          status: updatedRow.status,
          assigned_team_id: updatedRow.assigned_team_id !== undefined ? updatedRow.assigned_team_id : (request.assigned_team_id || request.assignedTeamId),
          assignedTeamId: updatedRow.assigned_team_id !== undefined ? updatedRow.assigned_team_id : (request.assignedTeamId || request.assigned_team_id),
          updated_at: updatedRow.updated_at || new Date().toISOString()
        };
      }
      return request;
    });

    if (index === -1) {
      updatedRequests = [
        {
          ...mapped,
          ...updatedRow,
          id: updatedRow.id,
          status: updatedRow.status,
          updated_at: updatedRow.updated_at || new Date().toISOString()
        },
        ...updatedRequests
      ];
    }

    // Step 7 & 8: Write updated request list back into existing store/state with source log
    console.log('[RakshaSetu][State] resourceRequests WRITE', 'realtimeService.handleResourceRequestUpdate', updatedRow.status);
    store.setState({
      resourceRequests: updatedRequests
    });

    console.log('[RakshaSetu][Realtime] RESOURCE STORE UPDATED', {
      id: updatedRow.id,
      status: updatedRow.status
    });
    console.log('[Realtime] RESOURCE STORE UPDATED', {
      id: updatedRow.id,
      status: updatedRow.status
    });

    // Step 7: Immediately trigger EXISTING resource request renderer
    if (typeof window !== 'undefined' && window.app && typeof window.app.renderResourceRequests === 'function') {
      window.app.renderResourceRequests(store.getState());
    }

    console.log('[RakshaSetu][Realtime] RESOURCE UI UPDATED');
    console.log('[Realtime] RESOURCE UI UPDATED');
    console.log(`[RakshaSetu][Realtime] UI UPDATED: resource ${updatedRow.id} -> ${updatedRow.status}`);

    // Show toast notification using existing styling
    const mappedStatus = mapResourceStatus(updatedRow.status);
    const rawCategory = updatedRow.request_type || mapped.requestType || 'RESOURCE';
    const category = mapResourceType(rawCategory);
    const toastType = updatedRow.status === 'DELIVERED' ? 'success' : updatedRow.status === 'CANCELLED' ? 'error' : 'pending-sync';
    showRealtimeToast(t('realtime.resourceStatusToast', { category, status: mappedStatus }) || `📦 Resource Request (${category}): ${mappedStatus}`, toastType);
  }

  /**
   * Cleanup all citizen realtime channels on logout or component teardown
   */
  async stopCitizenRealtime() {
    console.log('[RakshaSetu][Realtime] Stopping realtime subscriptions...');

    const channels = [
      this.incidentChannel,
      this.incidentDebugChannel,
      this.resourceChannel,
      this.resourceDebugChannel
    ];

    for (const ch of channels) {
      if (ch) {
        try {
          await supabase.removeChannel(ch);
        } catch (err) {
          console.warn('[RakshaSetu][Realtime] Error removing channel:', err);
        }
      }
    }

    this.incidentChannel = null;
    this.incidentDebugChannel = null;
    this.resourceChannel = null;
    this.resourceDebugChannel = null;
    this.currentUserId = null;
    this.isSubscribed = false;

    console.log('[RakshaSetu][Realtime] Disconnected');
  }
}

export const realtimeService = new RealtimeService();

// Section 17: Expose browser diagnostic function
if (typeof window !== 'undefined') {
  window.__rakshaRealtimeDebug = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[Realtime Debug] user:', session?.user?.id);
    console.log('[Realtime Debug] hasAccessToken:', !!session?.access_token);
    console.log('[Realtime Debug] channels:', supabase.getChannels());
  };
}
