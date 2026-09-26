/* ==========================================================================
   RakshaSetu Authority - Resource Needs Service (Supabase Powered)
   Source of truth: Supabase public.resource_requests
   - Maps database columns to existing Authority UI model
   - Realtime channel: authority-resource-requests
   - Lifecycle: PENDING -> ASSIGNED -> IN_TRANSIT -> DELIVERED (and CANCELLED)
   ========================================================================== */

import { supabase } from './supabase-client.js';
import { authorityService } from './authorityService.js';
import { isValidCoordinate } from './heartbeatService.js';

export const ALLOWED_TRANSITIONS = {
  'PENDING': ['ASSIGNED', 'CANCELLED'],
  'ASSIGNED': ['IN_TRANSIT', 'CANCELLED'],
  'IN_TRANSIT': ['DELIVERED', 'CANCELLED'],
  'DELIVERED': [],
  'CANCELLED': []
};

export function canonicalDbStatus(status) {
  const s = String(status || 'PENDING').toUpperCase();
  if (s === 'PENDING_SYNC' || s === 'NEW' || s === 'ACKNOWLEDGED' || s === 'ACKNOWLEDGED_BY_AUTHORITY') return 'PENDING';
  if (s === 'PRIORITIZED') return 'ASSIGNED';
  if (s === 'IN_PROGRESS' || s === 'IN-PROGRESS') return 'IN_TRANSIT';
  if (s === 'FULFILLED' || s === 'CLOSED' || s === 'COMPLETED') return 'DELIVERED';
  if (s === 'REJECTED') return 'CANCELLED';
  return s;
}

export function isValidTransition(currentDbStatus, nextDbStatus) {
  const current = canonicalDbStatus(currentDbStatus);
  const next = canonicalDbStatus(nextDbStatus);
  // Idempotent assignment/re-save allowed
  if (current === next) return true;
  const allowed = ALLOWED_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

export function mapRequestTypeToCategory(type) {
  const t = String(type || '').toUpperCase();
  switch (t) {
    case 'WATER': return 'Water';
    case 'FOOD': return 'Food';
    case 'MEDICAL': return 'Medical';
    case 'SHELTER': return 'Shelter';
    case 'RESCUE':
    case 'RESCUE_BOAT': return 'Rescue';
    default:
      if (!type) return 'Other';
      return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  }
}

export function dbToUiPriority(priority) {
  const p = String(priority || '').toUpperCase();
  switch (p) {
    case 'CRITICAL': return 'Critical';
    case 'HIGH': return 'High';
    case 'MEDIUM':
    case 'MODERATE': return 'Moderate';
    case 'LOW': return 'Low';
    default:
      if (!priority) return 'Moderate';
      return priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase();
  }
}

export function dbToUiStatus(status) {
  const map = {
    'PENDING': 'Pending',
    'PENDING_SYNC': 'Pending',
    'ASSIGNED': 'Assigned',
    'PRIORITIZED': 'Assigned',
    'IN_TRANSIT': 'In Transit',
    'IN_PROGRESS': 'In Transit',
    'DELIVERED': 'Delivered',
    'FULFILLED': 'Delivered',
    'CLOSED': 'Delivered',
    'CANCELLED': 'Cancelled',
    'REJECTED': 'Cancelled',
    'ACKNOWLEDGED': 'Pending',
    'ACKNOWLEDGED_BY_AUTHORITY': 'Pending'
  };
  if (!status) return 'Pending';
  return map[String(status).toUpperCase()] || (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase());
}

export function uiToDbStatus(uiStatus) {
  const map = {
    'Pending': 'PENDING',
    'Assigned': 'ASSIGNED',
    'In Transit': 'IN_TRANSIT',
    'In Progress': 'IN_TRANSIT',
    'Delivered': 'DELIVERED',
    'Fulfilled': 'DELIVERED',
    'Cancelled': 'CANCELLED',
    'Closed': 'DELIVERED'
  };
  if (!uiStatus) return 'PENDING';
  return map[uiStatus] || String(uiStatus).toUpperCase();
}

function isValidUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

class ResourceService {
  constructor() {
    this.localResources = [];
    this.realtimeChannel = null;
    this.isLiveConnected = false;
  }

  /**
   * Map raw Supabase row from public.resource_requests to Authority UI model.
   * Preserves database schema unchanged while providing camelCase and UI properties.
   */
  mapSupabaseResource(row) {
    if (!row) return null;

    const lat = row.latitude != null ? Number(row.latitude) : null;
    const lng = row.longitude != null ? Number(row.longitude) : null;
    const qty = Number(row.quantity) || 1;
    const category = mapRequestTypeToCategory(row.request_type);
    const priority = dbToUiPriority(row.priority);
    const status = dbToUiStatus(row.status);
    const desc = row.description || '';

    let needText = desc;
    if (!needText) {
      needText = `${category} Supply Request (${qty} unit${qty > 1 ? 's' : ''})`;
    } else if (!needText.toLowerCase().includes(category.toLowerCase())) {
      needText = `${category} (${qty}) — ${desc}`;
    }

    const locationText = (lat && lng)
      ? `Sector ${lat.toFixed(3)}, ${lng.toFixed(3)}`
      : 'Relief Sector Coordination Zone';

    const validCoords = isValidCoordinate(lat, lng);
    const coords = validCoords ? [lat, lng] : null;

    // Resolve assigned team name from loaded rescue teams
    let teamName = null;
    if (row.assigned_team_id) {
      teamName = authorityService.getTeamName(row.assigned_team_id);
    } else if (row.assigned_team) {
      teamName = row.assigned_team;
    }

    return {
      // Direct column mappings
      id: row.id,
      citizenId: row.citizen_id,
      clientRequestId: row.client_request_id,
      requestType: row.request_type,
      quantity: qty,
      description: desc,
      latitude: lat,
      longitude: lng,
      accuracyMeters: Number(row.accuracy_meters) || 15,
      priority,
      rawPriority: row.priority,
      status,
      rawStatus: row.status,
      assignedTeamId: row.assigned_team_id || null,
      assignedTeam: teamName,
      createdAt: row.created_at,
      updatedAt: row.updated_at,

      // UI expected derived properties
      category,
      need: needText,
      location: locationText,
      coordinates: coords,
      requestedAt: row.created_at || new Date().toISOString(),
      urgencyContext: desc || `Urgent ${category} support requested by citizen via RakshaSetu portal.`,
      notes: `Ingested via Supabase public.resource_requests (Ref: ${row.client_request_id || (row.id ? row.id.slice(0, 8) : 'REQ')})`,
      stretchPrioritizationRationale: `Priority Level: ${priority}. Nearest-Need-First dispatch calculation recommends routing from nearest taluk depot.`
    };
  }

  /**
   * Fetch all resource requests from Supabase public.resource_requests
   * Ordered by newest first.
   */
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('resource_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[RakshaSetu][Map][Supabase] Resource requests query failed:', error);
        throw error;
      }

      console.log(`[RakshaSetu][Map][Supabase] Resource requests loaded: ${data?.length || 0}`);
      const mapped = (data || []).map(r => this.mapSupabaseResource(r));
      this.localResources = mapped;
      this.isLiveConnected = true;
      return mapped;
    } catch (err) {
      console.error('[RakshaSetu][Map][Supabase] Failed to load from Supabase:', err.message);
      this.isLiveConnected = false;
      this.localResources = [];
      return [];
    }
  }

  /**
   * Get single resource request by ID
   */
  async getById(id) {
    try {
      const { data, error } = await supabase
        .from('resource_requests')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return data ? this.mapSupabaseResource(data) : (this.localResources.find(r => r.id === id) || null);
    } catch (err) {
      console.warn(`[RakshaSetu][ResourceRequests] getById fallback for ${id}:`, err.message);
      return this.localResources.find(r => r.id === id) || null;
    }
  }

  /**
   * Update resource status and assigned team directly in Supabase.
   * Validates allowed lifecycle transitions:
   * PENDING -> ASSIGNED -> IN_TRANSIT -> DELIVERED (and CANCELLED)
   */
  async updateStatus(id, status, assignedTeamId = null, assignedTeamName = null) {
    // Determine current database status
    let currentRequest = this.localResources.find(r => r.id === id) || (window.__rakshaState?.resourceRequests || []).find(r => r.id === id);
    let currentDbStatus = canonicalDbStatus(currentRequest?.rawStatus || uiToDbStatus(currentRequest?.status) || 'PENDING');
    const targetDbStatus = canonicalDbStatus(uiToDbStatus(status));

    // If local cache does not reflect a valid transition, query Supabase for actual current row status before rejecting
    if (!isValidTransition(currentDbStatus, targetDbStatus)) {
      try {
        const { data: fresh } = await supabase
          .from('resource_requests')
          .select('status')
          .eq('id', id)
          .maybeSingle();
        if (fresh?.status) {
          currentDbStatus = canonicalDbStatus(fresh.status);
        }
      } catch (e) {
        // proceed to validation
      }
    }

    // Validate lifecycle transition
    if (!isValidTransition(currentDbStatus, targetDbStatus)) {
      const err = new Error(`Invalid status transition from ${currentDbStatus} to ${targetDbStatus}. Allowed: ${(ALLOWED_TRANSITIONS[currentDbStatus] || []).join(', ') || 'None'}`);
      console.error('[RakshaSetu][Authority][Supabase] Status update failed', {
        code: 'INVALID_TRANSITION',
        message: err.message,
        details: `Current: ${currentDbStatus}, Target: ${targetDbStatus}`,
        hint: 'Allowed: PENDING -> ASSIGNED/CANCELLED, ASSIGNED -> IN_TRANSIT/CANCELLED, IN_TRANSIT -> DELIVERED/CANCELLED'
      });
      throw err;
    }

    // Preserve local demo behavior for static demo flow requests (e.g. RR-208)
    const isMockId = typeof id === 'string' && id.startsWith('RR-');
    if (isMockId) {
      const res = this.localResources.find(r => r.id === id);
      if (res) {
        res.status = dbToUiStatus(status);
        res.rawStatus = targetDbStatus;
        if (assignedTeamName) {
          res.assignedTeam = assignedTeamName;
        } else if (assignedTeamId) {
          res.assignedTeam = authorityService.getTeamName(assignedTeamId) || assignedTeamId;
        }
        return res;
      }
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData?.session?.user;
    const projectHostname = new URL(supabase.supabaseUrl || 'https://browmylyinqukfqpcvuv.supabase.co').hostname;

    console.log('[RakshaSetu][Authority][Supabase] Updating resource request status', {
      id,
      from: currentDbStatus,
      to: targetDbStatus,
      assignedTeamId,
      userId: sessionUser?.id || null,
      userEmail: sessionUser?.email || null,
      hostname: projectHostname
    });

    const updatePayload = {
      status: targetDbStatus,
      updated_at: new Date().toISOString()
    };

    // Determine valid team UUID
    if (assignedTeamId) {
      if (isValidUuid(assignedTeamId)) {
        updatePayload.assigned_team_id = assignedTeamId;
      } else {
        const found = authorityService.localTeams.find(t => t.id === assignedTeamId || t.name === assignedTeamId);
        if (found && isValidUuid(found.id)) {
          updatePayload.assigned_team_id = found.id;
        }
      }
    }

    // STEP 2: Separate UPDATE from response representation parsing.
    // Do NOT require a returned JSON object merely to consider the UPDATE successful.
    // Avoid .select().single() chained to .update().
    let updateError = null;
    try {
      const res = await supabase
        .from('resource_requests')
        .update(updatePayload)
        .eq('id', id);
      updateError = res.error;
    } catch (err) {
      updateError = err;
    }

    // STEP 3: Verify the actual row in Supabase public.resource_requests.
    // Safe follow-up SELECT using maybeSingle() to avoid coercion failures.
    let verifiedRow = null;
    let verifyError = null;
    try {
      const res = await supabase
        .from('resource_requests')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      verifiedRow = res.data;
      verifyError = res.error;
    } catch (err) {
      verifyError = err;
    }

    const databaseStatus = verifiedRow?.status || null;
    const reportedError = updateError || verifyError || null;

    // STEP 3 Required Log:
    console.log(
      `[RakshaSetu][Authority][ResourceRequests]\nSTATUS UPDATE RESULT\n\nrequestId: ${id}\nrequestedStatus: ${targetDbStatus}\ndatabaseStatus: ${databaseStatus}\nerror: ${reportedError ? (reportedError.message || JSON.stringify(reportedError)) : 'null'}`
    );

    // STEP 4: Do not create false failure.
    // If the database status matches the requested status, the operation must be treated as SUCCESS.
    const isDbStatusMatched = databaseStatus && String(databaseStatus).toUpperCase() === targetDbStatus;
    const isUpdateSuccessful = isDbStatusMatched || (!updateError && verifiedRow);

    if (isUpdateSuccessful) {
      console.log('[RakshaSetu][Authority][Supabase] Status update successful', {
        id,
        status: databaseStatus || targetDbStatus,
        updated_at: verifiedRow?.updated_at || updatePayload.updated_at
      });

      let mapped;
      if (verifiedRow) {
        mapped = this.mapSupabaseResource(verifiedRow);
      } else {
        mapped = {
          ...(currentRequest || {}),
          id,
          status: dbToUiStatus(targetDbStatus),
          rawStatus: targetDbStatus,
          updatedAt: updatePayload.updated_at
        };
      }

      if (assignedTeamName) {
        mapped.assignedTeam = assignedTeamName;
      } else if (assignedTeamId && !mapped.assignedTeam) {
        mapped.assignedTeam = authorityService.getTeamName(assignedTeamId) || assignedTeamId;
      }

      this.updateLocalCache(mapped);
      return mapped;
    }

    // Only throw genuine failure if status in DB did NOT change and an error occurred
    const errorToThrow = updateError || verifyError || new Error(`Database status (${databaseStatus}) does not match requested status (${targetDbStatus})`);
    console.error('[RakshaSetu][Authority][Supabase] Status update failed', {
      code: errorToThrow.code || 'UPDATE_FAILED',
      message: errorToThrow.message,
      details: errorToThrow.details,
      hint: errorToThrow.hint,
      requestId: id,
      requestedStatus: targetDbStatus,
      databaseStatus
    });
    throw errorToThrow;
  }

  /**
   * Assign carrier or team
   */
  async assign(id, teamId, teamName = null) {
    return this.updateStatus(id, 'Assigned', teamId, teamName);
  }

  /**
   * Supabase Realtime Subscription for public.resource_requests
   */
  subscribeRealtime(onInsert, onUpdate, onDelete, onStatusChange) {
    if (this.realtimeChannel) {
      return this.realtimeChannel;
    }

    try {
      this.realtimeChannel = supabase
        .channel('authority-resource-requests')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'resource_requests'
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              console.log(`[RakshaSetu][ResourceRequests] Realtime INSERT: ${payload.new.id}`);
              const mapped = this.mapSupabaseResource(payload.new);
              this.updateLocalCache(mapped);
              if (typeof onInsert === 'function') onInsert(mapped);
            } else if (payload.eventType === 'UPDATE') {
              console.log(`[RakshaSetu][ResourceRequests] Realtime UPDATE: ${payload.new.id}`);
              const mapped = this.mapSupabaseResource(payload.new);
              this.updateLocalCache(mapped);
              if (typeof onUpdate === 'function') onUpdate(mapped);
            } else if (payload.eventType === 'DELETE') {
              const oldId = payload.old ? payload.old.id : null;
              if (oldId) {
                console.log(`[RakshaSetu][ResourceRequests] Realtime DELETE: ${oldId}`);
                this.removeFromLocalCache(oldId);
                if (typeof onDelete === 'function') onDelete(oldId);
              }
            }
          }
        )
        .subscribe((status, err) => {
          if (typeof onStatusChange === 'function') {
            onStatusChange(status, err);
          }
          if (status === 'SUBSCRIBED') {
            console.log('[RakshaSetu][ResourceRequests] Realtime subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[RakshaSetu][ResourceRequests] Realtime subscription error:', err);
          } else if (status === 'TIMED_OUT') {
            console.warn('[RakshaSetu][ResourceRequests] Realtime subscription timed out');
          }
        });
    } catch (realtimeErr) {
      console.warn('[RakshaSetu][ResourceRequests] Realtime channel setup notice:', realtimeErr.message);
    }

    return this.realtimeChannel;
  }

  /**
   * Tear down realtime channel
   */
  unsubscribeRealtime() {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  updateLocalCache(item) {
    if (!item || !item.id) return;
    const idx = this.localResources.findIndex(r => r.id === item.id);
    if (idx !== -1) {
      this.localResources[idx] = { ...this.localResources[idx], ...item };
    } else {
      this.localResources.unshift(item);
    }
  }

  removeFromLocalCache(id) {
    if (!id) return;
    const idx = this.localResources.findIndex(r => r.id === id);
    if (idx !== -1) {
      this.localResources.splice(idx, 1);
    }
  }
}

export const resourceService = new ResourceService();
