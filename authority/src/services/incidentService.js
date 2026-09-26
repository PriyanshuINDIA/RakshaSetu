/* ==========================================================================
   RakshaSetu Authority - Incident & SOS Service (Supabase Powered)
   Source of truth: Supabase public.incidents
   - Maps database columns to existing Authority UI model
   - Preserves strict location semantics (LIVE, LAST_KNOWN, STALE, OFFLINE_CACHED)
   - Realtime channel: authority-incidents
   - Status updates write directly to Supabase
   ========================================================================== */

import { supabase } from './supabase-client.js';
import { isValidCoordinate } from './heartbeatService.js';
import { authorityService } from './authorityService.js';

console.log('[RakshaSetu][Authority][Supabase] Incident service client available:', !!supabase);

export const LOCATION_STATUS = {
  LIVE: 'LIVE',
  LAST_KNOWN: 'LAST_KNOWN',
  STALE: 'STALE',
  OFFLINE_CACHED: 'OFFLINE_CACHED'
};

export const INCIDENT_STATUS = {
  UNASSIGNED: 'Unassigned',
  ASSIGNED: 'Assigned',
  RESPONDING: 'Responding',
  REACHED: 'Reached',
  RESOLVED: 'Resolved',
  CANCELLED: 'Cancelled'
};

export const DB_STATUSES = [
  'UNASSIGNED',
  'ASSIGNED',
  'RESPONDING',
  'REACHED',
  'RESOLVED',
  'CANCELLED'
];

export const VALID_STATUS_TRANSITIONS = {
  'UNASSIGNED': ['ASSIGNED'],
  'ASSIGNED': ['RESPONDING'],
  'RESPONDING': ['REACHED'],
  'REACHED': ['RESOLVED'],
  'RESOLVED': []
};

export function dbToUiStatus(status) {
  const map = {
    'UNASSIGNED': 'Unassigned',
    'ASSIGNED': 'Assigned',
    'RESPONDING': 'Responding',
    'REACHED': 'Reached',
    'RESOLVED': 'Resolved',
    'CANCELLED': 'Cancelled'
  };
  if (!status) return 'Unassigned';
  return map[status] || (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase());
}

export function uiToDbStatus(status) {
  const map = {
    'Unassigned': 'UNASSIGNED',
    'Assigned': 'ASSIGNED',
    'Responding': 'RESPONDING',
    'Reached': 'REACHED',
    'Resolved': 'RESOLVED',
    'Cancelled': 'CANCELLED'
  };
  if (!status) return 'UNASSIGNED';
  return map[status] || String(status).toUpperCase();
}

class IncidentService {
  constructor() {
    this.localIncidents = [];
    this.realtimeChannel = null;
  }

  /**
   * STEP 3 — Database -> Existing UI Mapping
   * Maps raw Supabase row into Authority UI incident model
   */
  mapSupabaseIncident(row) {
    if (!row) return null;

    const lat = row.latitude != null ? Number(row.latitude) : null;
    const lng = row.longitude != null ? Number(row.longitude) : null;
    const validCoords = isValidCoordinate(lat, lng);
    const accuracy = Number(row.accuracy_meters) || 15;
    const timestamp = row.location_timestamp || row.created_at || new Date().toISOString();

    // Location telemetry age in seconds
    const timeDiffSec = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));

    // Strict location semantics: LIVE vs LAST_KNOWN vs STALE
    let locStatus = LOCATION_STATUS.LAST_KNOWN;
    const rawNetwork = String(row.network_state || '').toUpperCase();
    if (validCoords && timeDiffSec <= 120 && (rawNetwork.includes('ONLINE') || rawNetwork.includes('4G') || rawNetwork.includes('5G') || rawNetwork.includes('WIFI'))) {
      locStatus = LOCATION_STATUS.LIVE;
    } else if (rawNetwork.includes('OFFLINE') || rawNetwork.includes('CACHED')) {
      locStatus = LOCATION_STATUS.OFFLINE_CACHED;
    } else if (timeDiffSec > 900) {
      locStatus = LOCATION_STATUS.STALE;
    } else {
      locStatus = LOCATION_STATUS.LAST_KNOWN;
    }

    const locationTypeDisplay = locStatus === LOCATION_STATUS.LIVE
      ? 'LIVE LOCATION'
      : (locStatus === LOCATION_STATUS.STALE ? 'STALE LOCATION' : 'LAST-KNOWN LOCATION');

    const uiStatus = dbToUiStatus(row.status);
    const desc = row.description || '';
    const hasMedical = desc.includes('Medical Attention Required: YES') || desc.toLowerCase().includes('medical');

    const displayId = 'RS-' + (row.id ? row.id.slice(0, 6).toUpperCase() : 'SOS');
    const citizenName = 'Citizen ' + (row.citizen_id ? row.citizen_id.slice(0, 8) : 'Unknown');
    const phone = '+91 Confidential';

    const locName = validCoords ? `Sector ${lat.toFixed(3)}, ${lng.toFixed(3)}` : 'Location Pending';

    return {
      // Direct database column mappings
      id: row.id,
      citizenId: row.citizen_id,
      clientEventId: row.client_event_id,
      incidentType: row.incident_type || 'SOS',
      priority: row.priority || 'CRITICAL',
      description: desc,
      latitude: lat,
      longitude: lng,
      accuracyMeters: accuracy,
      locationTimestamp: row.location_timestamp,
      networkState: row.network_state || 'Cellular 4G',
      status: uiStatus,
      rawStatus: row.status,
      assignedTeamId: row.assigned_team_id || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,

      // UI expected derived fields
      displayId,
      citizenName,
      phone,
      locationName: locName,
      locationType: locationTypeDisplay,
      locationStatus: locStatus,
      coordinates: validCoords ? [lat, lng] : null,
      lastHeartbeatTime: timestamp,
      receivedAt: row.created_at || timestamp,
      timestamp: timestamp,
      heartbeatAgeSec: timeDiffSec,
      heartbeatStatus: timeDiffSec < 180 ? 'Recent' : (timeDiffSec < 600 ? 'Aging' : 'Critical'),
      medical: hasMedical,
      medicalFlag: hasMedical,
      assignedTeam: row.assigned_team_id ? (authorityService.getTeamName(row.assigned_team_id) || `Rescue Team #${String(row.assigned_team_id).slice(0, 8)}`) : null,
      message: desc || 'Emergency SOS beacon dispatched via citizen app.',
      vehicleAssigned: null,
      etaMinutes: null,
      resourceNeeds: hasMedical ? ['Medical Attention', 'Rescue Team'] : ['Emergency Evacuation'],
      timeline: [
        {
          step: 'Distress Beacon Received',
          time: new Date(row.created_at || timestamp).toLocaleTimeString('en-IN', { hour12: false }),
          note: `Ingested via Supabase PostgreSQL (Priority: ${row.priority || 'CRITICAL'})`
        }
      ],
      notes: []
    };
  }

  /**
   * STEP 2 — Real Incident Load
   */
  async getAll() {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(
        '[RakshaSetu][Map][Supabase] Incident load failed:',
        error
      );
      throw error;
    }

    console.log(
      `[RakshaSetu][Map][Supabase] Incidents loaded: ${data?.length || 0}`
    );

    const mapped = (data || []).map(r => this.mapSupabaseIncident(r));
    this.localIncidents = mapped;
    return mapped;
  }

  /**
   * Ingest new SOS into Supabase
   */
  async ingestSOS(customData = {}) {
    // 1. Verify authenticated user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      const err = new Error('Authentication required: No active Authority session found.');
      console.error('[RakshaSetu][IncidentService]', err);
      throw err;
    }

    // 2. Verify caller role in public.profiles is 'authority' or 'admin'
    const { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = (profile?.role || '').toLowerCase().trim();
    if (role !== 'authority' && role !== 'admin') {
      const rbacErr = new Error(`Unauthorized: Account role is "${profile?.role || 'citizen'}". Only authority or admin users can ingest demo incidents.`);
      console.error('[RakshaSetu][IncidentService]', rbacErr);
      throw rbacErr;
    }

    const description = customData.description || customData.message || 'Simulated Citizen SOS — Authority demonstration';
    const latitude = customData.latitude ?? (customData.coordinates ? customData.coordinates[0] : 25.3757);
    const longitude = customData.longitude ?? (customData.coordinates ? customData.coordinates[1] : 86.4735);
    const accuracy = customData.accuracyMeters || 15;
    const priority = customData.priority || 'CRITICAL';
    const incidentType = customData.incidentType || 'SOS';
    const networkState = customData.networkState || 'Cellular 4G';

    let createdRecord = null;

    // 3. Preferred Path: Attempt secure RPC call (ingest_authority_demo_incident)
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('ingest_authority_demo_incident', {
        p_description: description,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy_meters: accuracy,
        p_priority: priority,
        p_incident_type: incidentType,
        p_network_state: networkState
      });

      if (!rpcError && rpcData) {
        console.log('[RakshaSetu][IncidentService] Demo incident ingested via RPC:', rpcData.id);
        createdRecord = rpcData;
      } else if (rpcError && rpcError.code !== 'PGRST202') {
        // Legitimate RPC error (e.g., authorization rejection) - propagate error
        console.error('[RakshaSetu][IncidentService] Ingest SOS RPC failed:', rpcError);
        throw new Error(rpcError.message || 'Failed to ingest demo incident via RPC');
      }
    } catch (rpcEx) {
      if (rpcEx.message && !rpcEx.message.includes('PGRST202') && !rpcEx.message.includes('Could not find')) {
        throw rpcEx;
      }
    }

    // 4. Authenticated Direct Insert Path (if RPC not yet applied in DB schema)
    if (!createdRecord) {
      const clientEventId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });

      const payload = {
        citizen_id: user.id,
        client_event_id: clientEventId,
        incident_type: incidentType,
        priority: priority,
        description: description,
        latitude: latitude,
        longitude: longitude,
        accuracy_meters: accuracy,
        network_state: networkState,
        status: 'UNASSIGNED',
        location_timestamp: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('incidents')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[RakshaSetu][IncidentService] Direct Supabase incident insert error:', error);
        throw new Error(error.message || 'Failed to insert incident into Supabase');
      }
      createdRecord = data;
    }

    if (!createdRecord || !createdRecord.id) {
      throw new Error('Supabase incident creation returned no data');
    }

    const mapped = this.mapSupabaseIncident(createdRecord);
    this.updateLocalCache(mapped);
    return mapped;
  }

  /**
   * Get single incident by UUID
   */
  async getById(id) {
    try {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return this.mapSupabaseIncident(data);
    } catch (err) {
      console.warn(`[RakshaSetu][Authority][Supabase] getById failed for ${id}:`, err.message);
      return this.localIncidents.find(i => i.id === id) || null;
    }
  }

  /**
   * STEP 11 — Status Update directly to Supabase
  /**
   * Fetch audit history from Supabase public.incident_status_history
   */
  async fetchIncidentHistory(incidentId) {
    if (!incidentId) return [];
    try {
      const { data, error } = await supabase
        .from('incident_status_history')
        .select('*')
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn(`[RakshaSetu][IncidentService] Failed to load history for ${incidentId}:`, err?.message);
    }
    return [];
  }

  /**
   * STEP 11 — Status Update directly to Supabase
   */
  async updateStatus(incidentId, uiStatus, note = '') {
    const databaseStatus = uiToDbStatus(uiStatus);
    const validStatuses = DB_STATUSES;
    if (!validStatuses.includes(databaseStatus)) {
      throw new Error(`Invalid incident status: ${databaseStatus}`);
    }

    const currentInc = this.localIncidents.find(i => i.id === incidentId);
    const oldDbStatus = currentInc ? uiToDbStatus(currentInc.status) : 'UNASSIGNED';

    // Verify operational sequential rule: UNASSIGNED -> ASSIGNED -> RESPONDING -> REACHED -> RESOLVED
    if (VALID_STATUS_TRANSITIONS[oldDbStatus] && !VALID_STATUS_TRANSITIONS[oldDbStatus].includes(databaseStatus)) {
      console.warn(`[RakshaSetu][Authority][Incident] Invalid transition attempted: ${oldDbStatus} -> ${databaseStatus}`);
      throw new Error(`Operational rule violation: Cannot advance incident directly from ${oldDbStatus} to ${databaseStatus}. Allowed transition: ${VALID_STATUS_TRANSITIONS[oldDbStatus]?.join(', ') || 'None'}`);
    }

    const { data, error } = await supabase
      .from('incidents')
      .update({
        status: databaseStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', incidentId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[RakshaSetu][Authority][Supabase] Status update failed:', error);
      throw error;
    }

    console.log(`[RakshaSetu][Authority][Incident] Status transition: ${oldDbStatus} → ${databaseStatus}`);

    // Persist to public.incident_status_history
    try {
      const { data: authData } = await supabase.auth.getUser();
      await supabase
        .from('incident_status_history')
        .insert([{
          incident_id: incidentId,
          old_status: oldDbStatus,
          new_status: databaseStatus,
          changed_by: authData?.user?.id || null,
          note: note || `Operational status transitioned to ${databaseStatus}`
        }]);
    } catch (histErr) {
      console.warn('[RakshaSetu][Authority][History] Note recording status history:', histErr.message);
    }

    const mapped = this.mapSupabaseIncident(data);
    if (currentInc) {
      mapped.vehicleAssigned = currentInc.vehicleAssigned || null;
      mapped.etaMinutes = currentInc.etaMinutes ?? null;
      mapped.assignedTeam = currentInc.assignedTeam || mapped.assignedTeam;
      mapped.assignedTeamId = data.assigned_team_id || currentInc.assignedTeamId;
      mapped.timeline = currentInc.timeline ? [...currentInc.timeline] : mapped.timeline;
      mapped.notes = currentInc.notes ? [...currentInc.notes] : [];
    }

    const transitionNote = note || `Operational status transitioned to ${databaseStatus}`;
    mapped.timeline = mapped.timeline || [];
    mapped.timeline.push({
      step: `Status: ${oldDbStatus} → ${databaseStatus}`,
      time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
      note: transitionNote
    });

    if (note) {
      mapped.notes = mapped.notes || [];
      mapped.notes.push(`[${new Date().toLocaleTimeString('en-IN', { hour12: false })}] ${note}`);
    }
    this.updateLocalCache(mapped);
    return mapped;
  }

  /**
   * Assign rescue team directly in Supabase
   */
  async assignTeam(incidentId, { teamId, teamName, vehicle, etaMinutes, note = '' }) {
    console.log('[RakshaSetu][Authority][Assignment] Assigning team to incident:', {
      incidentId,
      teamId,
      teamName,
      clientAvailable: !!supabase
    });
    let currentInc = this.localIncidents.find(i => i.id === incidentId) || (window.__rakshaState?.incidents || []).find(i => i.id === incidentId);
    let oldDbStatus = currentInc ? uiToDbStatus(currentInc.status) : 'UNASSIGNED';

    if (oldDbStatus !== 'UNASSIGNED') {
      try {
        const { data: fresh } = await supabase
          .from('incidents')
          .select('status')
          .eq('id', incidentId)
          .maybeSingle();
        if (fresh?.status) {
          oldDbStatus = uiToDbStatus(fresh.status);
        }
      } catch (e) {
        // Proceed with validation
      }
    }

    if (oldDbStatus !== 'UNASSIGNED') {
      throw new Error(`Cannot assign team: incident is already in ${oldDbStatus} status.`);
    }

    const { data, error } = await supabase
      .from('incidents')
      .update({
        status: 'ASSIGNED',
        assigned_team_id: teamId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', incidentId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[RakshaSetu][Authority][Assignment] Assign team update failed:', error);
      throw error;
    }

    console.log('[RakshaSetu][Authority][Assignment] Success');
    console.log(`[RakshaSetu][Authority][Incident] Status transition: ${oldDbStatus} → ASSIGNED`);

    const resolvedTeamName = teamName || (teamId ? authorityService.getTeamName(teamId) : 'Rescue Unit');

    // Persist to public.incident_status_history
    try {
      const { data: authData } = await supabase.auth.getUser();
      await supabase
        .from('incident_status_history')
        .insert([{
          incident_id: incidentId,
          old_status: oldDbStatus,
          new_status: 'ASSIGNED',
          changed_by: authData?.user?.id || null,
          note: note || `Assigned to ${resolvedTeamName}. Vehicle: ${vehicle || 'Standard Unit'}. ETA: ${etaMinutes || 15}m`
        }]);
    } catch (histErr) {
      console.warn('[RakshaSetu][Authority][History] Note recording assignment history:', histErr.message);
    }

    const mapped = this.mapSupabaseIncident(data);
    mapped.assignedTeam = resolvedTeamName;
    mapped.vehicleAssigned = vehicle;
    mapped.etaMinutes = parseInt(etaMinutes, 10) || 15;
    mapped.timeline = (currentInc && currentInc.timeline) ? [...currentInc.timeline] : (mapped.timeline || []);
    mapped.timeline.push({
      step: `Assigned to ${resolvedTeamName}`,
      time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
      note: note || `Dispatched with ${vehicle}. ETA: ${mapped.etaMinutes}m`
    });

    this.updateLocalCache(mapped);
    return mapped;
  }

  /**
   * Add local operational note
   */
  async addNote(incidentId, noteText) {
    if (!noteText) return null;
    const inc = this.localIncidents.find(i => i.id === incidentId);
    if (inc) {
      inc.notes = inc.notes || [];
      inc.notes.push(`[${new Date().toLocaleTimeString('en-IN', { hour12: false })}] ${noteText}`);
      return inc;
    }
    return null;
  }

  /**
   * STEP 9 — Supabase Realtime Subscription
   */
  subscribeRealtime(onInsert, onUpdate, onDelete, onStatusChange, onTeamChange, onShelterChange, onHeartbeatChange) {
    if (this.realtimeChannel) {
      return this.realtimeChannel;
    }

    this.realtimeChannel = supabase
      .channel('authority-incidents')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            console.log(`[RakshaSetu][Authority][Realtime] INSERT received: ${payload.new.id}`);
            const mapped = this.mapSupabaseIncident(payload.new);
            this.updateLocalCache(mapped);
            if (typeof onInsert === 'function') onInsert(mapped);
          } else if (payload.eventType === 'UPDATE') {
            console.log(`[RakshaSetu][Authority][Realtime] UPDATE received: ${payload.new.id}`);
            const mapped = this.mapSupabaseIncident(payload.new);
            this.updateLocalCache(mapped);
            if (typeof onUpdate === 'function') onUpdate(mapped);
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old ? payload.old.id : null;
            if (oldId) {
              console.log(`[RakshaSetu][Authority][Realtime] DELETE received: ${oldId}`);
              this.removeFromLocalCache(oldId);
              if (typeof onDelete === 'function') onDelete(oldId);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rescue_teams'
        },
        (payload) => {
          console.log(`[RakshaSetu][Authority][Realtime] Rescue team ${payload.eventType}: ${payload.new?.id || payload.old?.id}`);
          if (typeof onTeamChange === 'function') onTeamChange(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shelters'
        },
        (payload) => {
          console.log(`[RakshaSetu][Authority][Realtime] Shelter ${payload.eventType}: ${payload.new?.id || payload.old?.id}`);
          if (typeof onShelterChange === 'function') onShelterChange(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'heartbeats'
        },
        (payload) => {
          console.log(`[RakshaSetu][Authority][Realtime] Heartbeat ${payload.eventType}: ${payload.new?.id || payload.old?.id}`);
          if (typeof onHeartbeatChange === 'function') onHeartbeatChange(payload);
        }
      )
      .subscribe((status, err) => {
        if (typeof onStatusChange === 'function') {
          onStatusChange(status, err);
        }
        if (status === 'SUBSCRIBED') {
          console.log('[RakshaSetu][Authority][Realtime] Subscription connected');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[RakshaSetu][Authority][Realtime] Subscription error:', err);
        } else if (status === 'TIMED_OUT') {
          console.warn('[RakshaSetu][Authority][Realtime] Subscription timed out');
        }
      });

    return this.realtimeChannel;
  }

  /**
   * Clean up realtime subscription
   */
  unsubscribeRealtime() {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  updateLocalCache(incident) {
    if (!incident || !incident.id) return;
    const idx = this.localIncidents.findIndex(i => i.id === incident.id);
    if (idx !== -1) {
      const existing = this.localIncidents[idx];
      this.localIncidents[idx] = {
        ...existing,
        ...incident,
        assignedTeam: incident.assignedTeam || existing.assignedTeam || null,
        assignedTeamId: incident.assignedTeamId || existing.assignedTeamId || null,
        vehicleAssigned: incident.vehicleAssigned || existing.vehicleAssigned || null,
        etaMinutes: incident.etaMinutes ?? existing.etaMinutes ?? null,
        timeline: (incident.timeline && incident.timeline.length > 1) ? incident.timeline : (existing.timeline || incident.timeline),
        notes: (incident.notes && incident.notes.length > 0) ? incident.notes : (existing.notes || [])
      };
    } else {
      this.localIncidents.unshift(incident);
    }
  }

  removeFromLocalCache(id) {
    if (!id) return;
    const idx = this.localIncidents.findIndex(i => i.id === id);
    if (idx !== -1) {
      this.localIncidents.splice(idx, 1);
    }
  }

  normalizeLocation(inc) {
    return inc;
  }
}

export const incidentService = new IncidentService();
