/* ==========================================================================
   RakshaSetu Authority - Reactive State Store
   Manages incidents, status mutations, rescue workflows, and system state.
   Backed by Service Layer Abstraction (DEMO mode <-> API mode).
   ========================================================================== */

import { api, MODES } from '../services/api.js';
import { incidentService, LOCATION_STATUS, INCIDENT_STATUS } from '../services/incidentService.js';
import { resourceService } from '../services/resourceService.js';
import { shelterService } from '../services/shelterService.js';
import { heartbeatService } from '../services/heartbeatService.js';
import { governmentDataService } from '../services/governmentDataService.js';
import { authorityService } from '../services/authorityService.js';
import { HAZARD_AREAS } from '../data/mockData.js';
import { supabase } from '../services/supabase-client.js';

console.log('[RakshaSetu][Authority][Supabase] State client available:', !!supabase);

class AuthorityState {
  constructor() {
    this.listeners = new Map();

    // Core Domain Data (Supabase public.incidents is primary source of truth)
    this.incidents = [];
    this.resourceRequests = [];
    this.shelters = [];
    this.heartbeats = [];
    this.hazardAreas = JSON.parse(JSON.stringify(HAZARD_AREAS));
    this.rescueTeams = [];

    // Navigation & UI State
    this.activeTab = 'dashboard';
    this.selectedIncidentId = null;
    this.selectedResourceId = null;
    this.selectedShelterId = null;
    this.drawerType = null;
    this.isDrawerOpen = false;

    // Filters
    this.mapFilter = 'ALL';
    this.incidentPriorityFilter = 'ALL';
    this.incidentStatusFilter = 'ALL';
    this.incidentSearchQuery = '';

    // Map Layer Flags
    this.mapLayers = {
      sos: true,
      lastKnown: true,
      resources: true,
      shelters: true,
      unsafeRoads: true,
      safeZones: false,
      stretchTracking: false
    };

    // System Status & Freshness
    this.systemStatus = {
      backend: 'Connected',
      govDataFreshness: '08:15 IST (Fresh)',
      mapTileStatus: 'Available (Vector Base + Offline Cache)',
      citizenSocket: 'Connected (Supabase Realtime)',
      offlinePendingSyncCount: 0,
      lastSyncTimestamp: new Date().toLocaleTimeString('en-IN', { hour12: false })
    };

    // Operations Notifications (populated live from real-time events)
    this.notifications = [];

    // Demo Flow Stepper
    this.demoStep = 0;
  }

  // ========================================================================
  // Asynchronous Initialization from Services
  // ========================================================================
  async loadInitialData() {
    try {
      // Step 1: Load all Supabase tables independently so a failure in one does not crash others
      const [incidentsRes, resourcesRes, sheltersRes, heartbeatsRes, teamsRes, hazardsRes, statusRes] = await Promise.allSettled([
        incidentService.getAll(),
        resourceService.getAll(),
        shelterService.getAll(),
        heartbeatService.getAll(),
        authorityService.getTeams(),
        authorityService.getHazards(),
        authorityService.getStatus()
      ]);

      this.incidents = incidentsRes.status === 'fulfilled' ? (incidentsRes.value || []) : [];
      this.resourceRequests = resourcesRes.status === 'fulfilled' ? (resourcesRes.value || []) : [];
      this.shelters = sheltersRes.status === 'fulfilled' ? (sheltersRes.value || []) : [];
      this.heartbeats = heartbeatsRes.status === 'fulfilled' ? (heartbeatsRes.value || []) : [];

      if (teamsRes.status === 'fulfilled' && teamsRes.value?.length) {
        this.rescueTeams = teamsRes.value;
      }
      if (hazardsRes.status === 'fulfilled' && hazardsRes.value?.length) {
        this.hazardAreas = hazardsRes.value;
      }
      if (statusRes.status === 'fulfilled' && statusRes.value) {
        this.systemStatus = statusRes.value;
      }

      // Re-resolve team names for all incidents with assignedTeamId
      if (this.rescueTeams.length && this.incidents.length) {
        for (const inc of this.incidents) {
          if (inc.assignedTeamId) {
            const matchedTeam = this.rescueTeams.find(t => t.id === inc.assignedTeamId);
            if (matchedTeam) {
              inc.assignedTeam = matchedTeam.name;
            }
          }
        }
      }

      // Step 2: Correlate latest verified citizen heartbeats with incidents to maintain fresh telemetry
      if (this.incidents.length && this.heartbeats.length) {
        for (const inc of this.incidents) {
          if (inc.citizenId) {
            const latestHb = heartbeatService.getLatestForCitizen(inc.citizenId);
            if (latestHb && latestHb.coordinates) {
              const incTime = new Date(inc.locationTimestamp || inc.receivedAt || 0).getTime();
              const hbTime = new Date(latestHb.createdAt || 0).getTime();
              if (hbTime >= incTime || !inc.coordinates) {
                inc.latitude = latestHb.latitude;
                inc.longitude = latestHb.longitude;
                inc.coordinates = latestHb.coordinates;
                inc.accuracyMeters = latestHb.accuracyMeters;
                inc.lastHeartbeatTime = latestHb.createdAt;
                inc.locationType = latestHb.locationType;
                inc.networkState = latestHb.networkState;
              }
            }
          }
        }
      }

      // Start Supabase Realtime for incidents and resource requests
      this.setupSupabaseRealtime();
      this.setupSupabaseResourceRealtime();
      this.startBackgroundSync();

      this.notify('dataLoaded', null);
      this.notify('incidentUpdated', null);
      this.notify('resourceUpdated', null);
      this.notify('shelterUpdated', null);
      this.notify('systemStatusChanged', this.systemStatus);
    } catch (err) {
      console.error('[RakshaSetu][Map][Supabase] Error in loadInitialData:', err);
      this.systemStatus.backend = 'Disconnected';
      this.notify('systemStatusChanged', this.systemStatus);
    }
  }

  // ========================================================================
  // Supabase Realtime Listener (Source of Truth for Live Incidents)
  // ========================================================================
  setupSupabaseRealtime() {
    incidentService.subscribeRealtime(
      (newIncident) => {
        // TASK 5: Deduplicate — DB UUID as primary, clientEventId as secondary
        const exists = this.incidents.some(i => i.id === newIncident.id || (newIncident.clientEventId && i.clientEventId && i.clientEventId === newIncident.clientEventId));
        if (!exists) {
          this.incidents.unshift(newIncident);
          this.addNotification({
            id: `NOTIF-${Date.now()}`,
            title: `CRITICAL SOS: ${newIncident.displayId || newIncident.id}`,
            message: `Emergency SOS signal from ${newIncident.locationName}. Priority: ${newIncident.priority}.`,
            type: 'critical',
            time: 'Just now',
            unread: true,
            incidentId: newIncident.id
          });
          this.notify('incidentAdded', newIncident);
          this.notify('incidentUpdated', newIncident);
        }
      },
      (updatedIncident) => {
        const idx = this.incidents.findIndex(i => i.id === updatedIncident.id || (updatedIncident.clientEventId && i.clientEventId && i.clientEventId === updatedIncident.clientEventId));
        if (idx !== -1) {
          this.incidents[idx] = updatedIncident;
          this.notify('incidentUpdated', updatedIncident);
        }
      },
      (deletedId) => {
        const idx = this.incidents.findIndex(i => i.id === deletedId);
        if (idx !== -1) {
          this.incidents.splice(idx, 1);
          this.notify('incidentUpdated', null);
          if (this.selectedIncidentId === deletedId) {
            this.closeDrawer();
          }
        }
      },
      (channelStatus, err) => {
        this.notify('realtimeStatusChanged', { status: channelStatus, error: err });
      },
      async (teamPayload) => {
        try {
          const freshTeams = await authorityService.getTeams();
          if (Array.isArray(freshTeams) && freshTeams.length) {
            this.rescueTeams = freshTeams;
            this.notify('teamsUpdated', this.rescueTeams);
          }
        } catch (e) {
          console.debug('[AuthorityState] Realtime teams sync notice:', e.message);
        }
      },
      async (shelterPayload) => {
        try {
          const freshShelters = await shelterService.getAll();
          if (Array.isArray(freshShelters)) {
            this.shelters = freshShelters;
            this.notify('shelterUpdated', null);
          }
        } catch (e) {
          console.debug('[AuthorityState] Realtime shelters sync notice:', e.message);
        }
      },
      async (heartbeatPayload) => {
        try {
          const freshHeartbeats = await heartbeatService.getAll();
          if (Array.isArray(freshHeartbeats)) {
            this.heartbeats = freshHeartbeats;
            this.notify('heartbeatsUpdated', null);
          }
        } catch (e) {
          console.debug('[AuthorityState] Realtime heartbeats sync notice:', e.message);
        }
      }
    );
  }

  // ========================================================================
  // Supabase Realtime Listener (Source of Truth for Live Resource Needs)
  // ========================================================================
  setupSupabaseResourceRealtime() {
    resourceService.subscribeRealtime(
      (newResource) => {
        // TASK 5: Deduplicate — DB UUID as primary, clientRequestId as secondary
        const exists = this.resourceRequests.some(
          r => r.id === newResource.id || (newResource.clientRequestId && r.clientRequestId && r.clientRequestId === newResource.clientRequestId)
        );
        if (!exists) {
          this.resourceRequests.unshift(newResource);
          this.addNotification({
            id: `NOTIF-${Date.now()}`,
            title: `RESOURCE NEED: ${newResource.category || 'Supply'}`,
            message: `New ${newResource.category} request: ${newResource.need}. Priority: ${newResource.priority}.`,
            type: 'info',
            time: 'Just now',
            unread: true,
            resourceId: newResource.id
          });
          this.notify('resourceUpdated', newResource);
        }
      },
      (updatedResource) => {
        const idx = this.resourceRequests.findIndex(r => r.id === updatedResource.id || (updatedResource.clientRequestId && r.clientRequestId && r.clientRequestId === updatedResource.clientRequestId));
        if (idx !== -1) {
          this.resourceRequests[idx] = updatedResource;
          this.notify('resourceUpdated', updatedResource);
        }
      },
      (deletedId) => {
        const idx = this.resourceRequests.findIndex(r => r.id === deletedId);
        if (idx !== -1) {
          this.resourceRequests.splice(idx, 1);
          this.notify('resourceUpdated', null);
          if (this.selectedResourceId === deletedId) {
            this.closeDrawer();
          }
        }
      },
      (channelStatus, err) => {
        this.notify('resourceRealtimeStatusChanged', { status: channelStatus, error: err });
      }
    );
  }

  // Background sync fallback: keeps live dashboard synchronized with Supabase
  startBackgroundSync() {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(async () => {
      try {
        // 1. Sync incidents with Supabase
        const freshInc = await incidentService.getAll();
        if (freshInc !== null && freshInc !== undefined) {
          let lastNewInc = null;
          let hasUpdatedInc = false;
          for (const inc of freshInc) {
            const idx = this.incidents.findIndex(i => i.id === inc.id || (inc.clientEventId && i.clientEventId && i.clientEventId === inc.clientEventId));
            if (idx === -1) {
              this.incidents.unshift(inc);
              lastNewInc = inc;
            } else if (this.incidents[idx].status !== inc.status || this.incidents[idx].updatedAt !== inc.updatedAt) {
              this.incidents[idx] = inc;
              hasUpdatedInc = true;
            }
          }
          if (lastNewInc) {
            this.notify('incidentAdded', lastNewInc);
            this.notify('incidentUpdated', lastNewInc);
          } else if (hasUpdatedInc) {
            this.notify('incidentUpdated', null);
          }
        }

        // 2. Sync resource requests with Supabase
        const freshRes = await resourceService.getAll();
        if (freshRes !== null && freshRes !== undefined) {
          let lastNewRes = null;
          let hasUpdatedRes = false;
          for (const res of freshRes) {
            const idx = this.resourceRequests.findIndex(r => r.id === res.id || (res.clientRequestId && r.clientRequestId && r.clientRequestId === res.clientRequestId));
            if (idx === -1) {
              this.resourceRequests.unshift(res);
              lastNewRes = res;
            } else if (this.resourceRequests[idx].status !== res.status || this.resourceRequests[idx].updatedAt !== res.updatedAt) {
              this.resourceRequests[idx] = res;
              hasUpdatedRes = true;
            }
          }
          if (lastNewRes || hasUpdatedRes) {
            this.notify('resourceUpdated', lastNewRes);
          }
        }

        // 3. Sync shelters with Supabase
        const freshShelters = await shelterService.getAll();
        if (Array.isArray(freshShelters)) {
          this.shelters = freshShelters;
          this.notify('shelterUpdated', null);
        }

        // 4. Sync rescue teams with Supabase
        const freshTeams = await authorityService.getTeams();
        if (Array.isArray(freshTeams) && freshTeams.length) {
          this.rescueTeams = freshTeams;
          this.notify('teamsUpdated', this.rescueTeams);
        }

        // 5. Sync heartbeats with Supabase
        const freshHeartbeats = await heartbeatService.getAll();
        if (Array.isArray(freshHeartbeats)) {
          this.heartbeats = freshHeartbeats;
          this.notify('heartbeatsUpdated', null);
        }
      } catch (e) {
        console.debug('[AuthorityState] Background sync check:', e.message);
      }
    }, 10000);
  }

  // ========================================================================
  // WebSocket Real-Time Event Handlers (Bypassed — Supabase Realtime is transport)
  // ========================================================================
  setupWebSocketListeners() {
    // Legacy WebSocket flow bypassed. Supabase Realtime is the sole live transport.
  }

  // ========================================================================
  // Event Subscription System
  // ========================================================================
  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  notify(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[AuthorityState] Error in listener for ${event}:`, err);
        }
      });
    }
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(cb => {
        try {
          cb({ event, data });
        } catch (err) {
          console.error('[AuthorityState] Error in wildcard listener:', err);
        }
      });
    }
  }

  // ========================================================================
  // Operational Mode Toggle (DEMO <-> API)
  // ========================================================================
  getMode() {
    return api.getMode();
  }

  setMode(mode) {
    api.setMode(mode);
  }

  // ========================================================================
  // Navigation & Drawers
  // ========================================================================
  setActiveTab(tab) {
    this.activeTab = tab;
    this.notify('tabChanged', tab);
  }

  openIncidentDrawer(id) {
    this.selectedIncidentId = id;
    this.drawerType = 'incident';
    this.isDrawerOpen = true;
    this.notify('drawerOpened', { type: 'incident', id });

    // Asynchronously populate audit history and real operational details
    this.enrichIncidentDrawer(id);
  }

  async enrichIncidentDrawer(id) {
    try {
      const history = await incidentService.fetchIncidentHistory(id);
      const inc = this.getIncident(id);
      if (inc && history && history.length > 0) {
        for (const h of history) {
          if (h.new_status === 'ASSIGNED' && h.note) {
            const vMatch = h.note.match(/Vehicle:\s*([^.]+?)(?:\.|\s*ETA|$)/i);
            const eMatch = h.note.match(/ETA:\s*(\d+)m?/i);
            if (vMatch && !inc.vehicleAssigned) inc.vehicleAssigned = vMatch[1].trim();
            if (eMatch && !inc.etaMinutes) inc.etaMinutes = parseInt(eMatch[1], 10);
          }
        }

        const baseTimeline = [
          {
            step: 'Distress Beacon Received',
            time: new Date(inc.createdAt || inc.receivedAt).toLocaleTimeString('en-IN', { hour12: false }),
            note: `Ingested via Supabase PostgreSQL (Priority: ${inc.priority || 'CRITICAL'})`
          }
        ];

        for (const h of history) {
          let stepLabel = `Status: ${h.old_status} → ${h.new_status}`;
          if (h.new_status === 'ASSIGNED') stepLabel = `Assigned to ${inc.assignedTeam || 'Rescue Unit'}`;
          else if (h.new_status === 'RESPONDING') stepLabel = 'Dispatch / Responding to Location';
          else if (h.new_status === 'REACHED') stepLabel = 'Reached Incident Scene';
          else if (h.new_status === 'RESOLVED') stepLabel = 'Incident Resolved and Closed';

          baseTimeline.push({
            step: stepLabel,
            time: new Date(h.created_at).toLocaleTimeString('en-IN', { hour12: false }),
            note: h.note || `Status transitioned to ${h.new_status}`
          });
        }
        inc.timeline = baseTimeline;
        this.notify('incidentUpdated', inc);
      }
    } catch (e) {
      console.debug('[AuthorityState] Drawer history fetch notice:', e?.message);
    }
  }

  openResourceDrawer(id) {
    this.selectedResourceId = id;
    this.drawerType = 'resource';
    this.isDrawerOpen = true;
    this.notify('drawerOpened', { type: 'resource', id });
  }

  openShelterDrawer(id) {
    this.selectedShelterId = id;
    this.drawerType = 'shelter';
    this.isDrawerOpen = true;
    this.notify('drawerOpened', { type: 'shelter', id });
  }

  closeDrawer() {
    this.isDrawerOpen = false;
    this.drawerType = null;
    this.notify('drawerClosed', null);
  }

  // ========================================================================
  // Incident Operations & Mutations (Service-backed)
  // ========================================================================
  getIncident(id) {
    return this.incidents.find(inc => inc.id === id);
  }

  getResource(id) {
    return this.resourceRequests.find(r => r.id === id);
  }

  getShelter(id) {
    return this.shelters.find(s => s.id === id);
  }

  async assignTeamToIncident(incidentId, teamIdOrName, vehicle = '', etaMinutes = 15, note = '') {
    try {
      let targetIdOrName = teamIdOrName;
      let targetVehicle = vehicle;
      let targetEta = etaMinutes;
      let targetNote = note;

      if (typeof teamIdOrName === 'object' && teamIdOrName !== null) {
        targetIdOrName = teamIdOrName.teamId || teamIdOrName.id || teamIdOrName.teamName;
        targetVehicle = teamIdOrName.vehicle || vehicle || '';
        targetEta = teamIdOrName.etaMinutes || etaMinutes || 15;
        targetNote = teamIdOrName.note || note || '';
      }

      // Find team in state or service
      let teamObj = this.rescueTeams.find(t => t.id === targetIdOrName || t.name === targetIdOrName);
      if (!teamObj) {
        teamObj = authorityService.getTeamById(targetIdOrName);
      }
      if (!teamObj) {
        throw new Error(`Rescue team not found: ${targetIdOrName}`);
      }

      const teamId = teamObj.id;
      const teamName = teamObj.name;

      // STEP 1: Verify authenticated Authority browser session and RBAC (Part 2)
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: userData } = await supabase.auth.getUser();
      const sessionUser = userData?.user || sessionData?.session?.user;
      const currentUserId = sessionUser?.id || null;
      const currentUserEmail = sessionUser?.email || null;
      const projectHostname = new URL(supabase.supabaseUrl || 'https://browmylyinqukfqpcvuv.supabase.co').hostname;

      if (!currentUserId) {
        console.error('[RakshaSetu][Authority][Assignment] Missing authenticated session:', { projectHostname });
        throw new Error('EOC Session Expired: No active authenticated session found. Please re-authenticate as Authority.');
      }

      // Load profile to verify Authority permissions
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('id, role, email')
        .eq('id', currentUserId)
        .maybeSingle();

      const userRole = (profile?.role || '').toLowerCase().trim();
      console.log('[RakshaSetu][Authority][Assignment] Active session diagnostics:', {
        userId: currentUserId,
        email: currentUserEmail,
        role: userRole,
        hostname: projectHostname,
        incidentId,
        teamId,
        teamName,
        targetVehicle,
        targetEta
      });

      if (userRole !== 'authority' && userRole !== 'admin') {
        console.error('[RakshaSetu][Authority][Assignment] RBAC violation - role is not authority/admin:', {
          userId: currentUserId,
          email: currentUserEmail,
          role: userRole
        });
        throw new Error(`Unauthorized: Account role is "${profile?.role || 'citizen'}". Dispatching rescue teams requires role 'authority' or 'admin'.`);
      }

      // STEP 2: Verification query using .maybeSingle() to prevent PGRST116 single-coercion errors
      const { data: dbTeam, error: dbTeamErr } = await supabase
        .from('rescue_teams')
        .select('id, name, status, current_incident_id')
        .eq('id', teamId)
        .maybeSingle();

      if (dbTeamErr) {
        console.error('[RakshaSetu][Authority][Assignment] Database error querying rescue team:', dbTeamErr);
        throw new Error(`Database error verifying rescue team in Supabase: ${dbTeamErr.message || 'Unknown query error'}`);
      }

      if (dbTeam === null) {
        console.error('[RakshaSetu][Authority][Assignment] Rescue team query returned null:', {
          teamId,
          userId: currentUserId,
          role: userRole,
          hostname: projectHostname
        });
        throw new Error(`Rescue team not found in Supabase (ID: ${teamId}). The selected team does not exist in public.rescue_teams or RLS blocked access.`);
      }

      console.log('[RakshaSetu][Authority][Assignment] Rescue team verified in Supabase:', {
        id: dbTeam.id,
        name: dbTeam.name,
        status: dbTeam.status,
        currentIncidentId: dbTeam.current_incident_id
      });

      if (String(dbTeam.status || '').toUpperCase() !== 'AVAILABLE' || dbTeam.current_incident_id) {
        throw new Error(`Team "${dbTeam.name}" is currently ${dbTeam.status} and cannot be assigned simultaneously.`);
      }

      // 1. Assign team on incident in Supabase
      const updated = await incidentService.assignTeam(incidentId, {
        teamId,
        teamName,
        vehicle: targetVehicle,
        etaMinutes: targetEta,
        note: targetNote
      });

      // 2. Update team status in Supabase
      await authorityService.updateTeamStatusInDb(teamId, 'ASSIGNED', incidentId);
      teamObj.status = 'ASSIGNED';
      teamObj.currentIncidentId = incidentId;

      const idx = this.incidents.findIndex(i => i.id === incidentId);
      if (idx !== -1) {
        this.incidents[idx] = updated;
      }

      this.addNotification({
        title: `Team Assigned: ${updated.displayId || updated.id}`,
        message: `${teamName} assigned to ${updated.locationName}. ETA: ${updated.etaMinutes}m.`,
        type: 'info',
        incidentId: updated.id
      });

      this.notify('incidentUpdated', updated);
      this.notify('teamsUpdated', this.rescueTeams);
      return true;
    } catch (err) {
      console.error('[AuthorityState] assignTeamToIncident error:', err);
      this.addNotification({
        title: 'Assignment Failed',
        message: err.message || 'Could not assign rescue team.',
        type: 'critical'
      });
      return false;
    }
  }

  async updateIncidentStatus(incidentId, nextStatus, customNote = '') {
    try {
      const currentInc = this.getIncident(incidentId);
      const prevStatus = currentInc ? String(currentInc.status).toUpperCase() : 'UNASSIGNED';
      const targetDbStatus = String(nextStatus).toUpperCase();

      // 1. Update incident status in Supabase
      const updated = await incidentService.updateStatus(incidentId, nextStatus, customNote);
      const idx = this.incidents.findIndex(i => i.id === incidentId);
      if (idx !== -1) {
        this.incidents[idx] = updated;
      }

      // 2. Manage team status transitions
      const teamId = updated.assignedTeamId || (currentInc && currentInc.assignedTeamId) || this.rescueTeams.find(t => t.name === updated.assignedTeam)?.id;
      const isResponding = targetDbStatus === 'RESPONDING';
      const isResolved = targetDbStatus === 'RESOLVED';

      if (isResponding && teamId) {
        await authorityService.updateTeamStatusInDb(teamId, 'RESPONDING', incidentId);
        const teamObj = this.rescueTeams.find(t => t.id === teamId);
        if (teamObj) {
          teamObj.status = 'RESPONDING';
          teamObj.currentIncidentId = incidentId;
        }
      } else if (isResolved && teamId) {
        await authorityService.updateTeamStatusInDb(teamId, 'AVAILABLE', null);
        const teamObj = this.rescueTeams.find(t => t.id === teamId);
        if (teamObj) {
          teamObj.status = 'AVAILABLE';
          teamObj.currentIncidentId = null;
        }
      }

      this.addNotification({
        title: `Incident ${updated.displayId || updated.id}: ${nextStatus}`,
        message: `Status transitioned to ${nextStatus}. ${customNote || ''}`,
        type: isResolved ? 'success' : 'info',
        incidentId: updated.id
      });

      this.notify('incidentUpdated', updated);
      this.notify('teamsUpdated', this.rescueTeams);
      return true;
    } catch (err) {
      console.error('[AuthorityState] updateIncidentStatus error:', err);
      this.addNotification({
        title: 'Status Update Failed',
        message: err.message || 'Could not update incident status.',
        type: 'critical'
      });
      return false;
    }
  }

  async addIncidentNote(incidentId, noteText) {
    try {
      const updated = await incidentService.addNote(incidentId, noteText);
      const idx = this.incidents.findIndex(i => i.id === incidentId);
      if (idx !== -1 && updated) {
        this.incidents[idx] = updated;
      }
      this.notify('incidentUpdated', updated);
      return true;
    } catch (err) {
      console.error('[AuthorityState] addIncidentNote error:', err);
      return false;
    }
  }

  // ========================================================================
  // Resource Operations & Mutations (Service-backed)
  // ========================================================================
  getResource(id) {
    return this.resourceRequests.find(r => r.id === id);
  }

  async updateResourceStatus(resourceId, nextStatus, teamId = null, teamName = null) {
    try {
      const updated = await resourceService.updateStatus(resourceId, nextStatus, teamId, teamName);
      const idx = this.resourceRequests.findIndex(r => r.id === resourceId);
      if (idx !== -1) {
        this.resourceRequests[idx] = updated;
      }

      this.notify('resourceUpdated', updated);
      return true;
    } catch (err) {
      console.error('[AuthorityState] updateResourceStatus error:', err);
      this.addNotification({
        title: 'Status Update Failed',
        message: err.message || 'Could not persist status change to Supabase.',
        type: 'critical'
      });
      return false;
    }
  }

  async handleAssignResourceTeam(resourceId) {
    const select = document.getElementById('drawer-team-select');
    const teamId = select ? select.value : null;
    const teamName = select ? (select.options[select.selectedIndex]?.dataset?.name || select.options[select.selectedIndex]?.text) : null;
    return this.updateResourceStatus(resourceId, 'Assigned', teamId, teamName);
  }

  // ========================================================================
  // Shelter Operations & Mutations (Service-backed)
  // ========================================================================
  getShelter(id) {
    return this.shelters.find(s => s.id === id);
  }

  async designateShelter(shelterInput) {
    try {
      const created = await shelterService.createShelter(shelterInput);
      const freshShelters = await shelterService.getAll();
      if (Array.isArray(freshShelters)) {
        this.shelters = freshShelters;
      }
      this.notify('shelterUpdated', created);
      this.addNotification({
        type: 'info',
        title: 'Emergency Shelter Designated',
        message: `${created.name} successfully registered in Supabase.`
      });
      return created;
    } catch (err) {
      console.error('[AuthorityState] designateShelter error:', err);
      this.addNotification({
        type: 'critical',
        title: 'Shelter Designation Failed',
        message: err.message ? `Supabase error: ${err.message}` : 'Failed to designate shelter.'
      });
      throw err;
    }
  }

  async updateShelter(id, updates) {
    try {
      const updated = await shelterService.updateShelter(id, updates);
      const freshShelters = await shelterService.getAll();
      if (Array.isArray(freshShelters)) {
        this.shelters = freshShelters;
      }
      this.notify('shelterUpdated', updated);
      this.addNotification({
        type: 'info',
        title: 'Shelter Updated',
        message: `${updated.name} information updated in Supabase.`
      });
      return updated;
    } catch (err) {
      console.error('[AuthorityState] updateShelter error:', err);
      this.addNotification({
        type: 'critical',
        title: 'Shelter Update Failed',
        message: err.message ? `Supabase error: ${err.message}` : 'Failed to update shelter.'
      });
      throw err;
    }
  }

  async setShelterActive(shelterId, active) {
    try {
      const updated = await shelterService.setShelterActive(shelterId, active);
      const freshShelters = await shelterService.getAll();
      if (Array.isArray(freshShelters)) {
        this.shelters = freshShelters;
      }
      this.notify('shelterUpdated', updated);
      this.addNotification({
        type: active ? 'success' : 'warning',
        title: active ? 'Shelter Activated' : 'Shelter Closed / Deactivated',
        message: `${updated.name} is now ${active ? 'ACTIVE for citizen evacuation intake' : 'CLOSED'}.`
      });
      return updated;
    } catch (err) {
      console.error('[AuthorityState] setShelterActive error:', err);
      this.addNotification({
        type: 'critical',
        title: 'Shelter Status Change Failed',
        message: err.message ? `Supabase error: ${err.message}` : 'Failed to update shelter status.'
      });
      throw err;
    }
  }

  async designateDemoShelter() {
    try {
      const demo = await shelterService.ensureDemoShelter(true);
      const freshShelters = await shelterService.getAll();
      if (Array.isArray(freshShelters)) {
        this.shelters = freshShelters;
      }
      this.notify('shelterUpdated', demo);
      this.addNotification({
        type: 'success',
        title: 'Demo Shelter Active',
        message: `${demo.name} designated as active prototype shelter.`
      });
      return demo;
    } catch (err) {
      console.error('[AuthorityState] designateDemoShelter error:', err);
      this.addNotification({
        type: 'critical',
        title: 'Demo Shelter Designation Failed',
        message: err.message ? `Supabase error: ${err.message}` : 'Database blocked demo shelter designation.'
      });
      throw err;
    }
  }

  async updateShelterOccupancy(shelterId, delta) {
    try {
      const updated = await shelterService.updateOccupancy(shelterId, delta);
      const idx = this.shelters.findIndex(s => s.id === shelterId);
      if (idx !== -1 && updated) {
        this.shelters[idx] = updated;
      }
      this.notify('shelterUpdated', updated);
      return true;
    } catch (err) {
      console.error('[AuthorityState] updateShelterOccupancy error:', err);
      return false;
    }
  }

  // ========================================================================
  // Notifications Center
  // ========================================================================
  addNotification(notif) {
    const newNotif = {
      id: `NOTIF-${Date.now()}`,
      time: 'Just now',
      unread: true,
      ...notif
    };
    this.notifications.unshift(newNotif);
    this.notify('notificationAdded', newNotif);
  }

  markAllNotificationsRead() {
    this.notifications.forEach(n => n.unread = false);
    this.notify('notificationsRead', null);
  }

  // ========================================================================
  // Heartbeat Real-Time Aging Logic
  // Ticks elapsed seconds and updates status: Recent | Aging | Stale | Unavailable
  // STRICT: Never changes locationType from LAST-KNOWN to LIVE.
  // ========================================================================
  tickHeartbeats() {
    let changed = false;
    const now = Date.now();
    this.incidents.forEach(inc => {
      const hbTime = new Date(inc.lastHeartbeatTime || inc.receivedAt).getTime();
      const ageSec = Math.max(0, Math.floor((now - hbTime) / 1000));
      inc.heartbeatAgeSec = ageSec;

      let newStatus = 'Recent';
      if (ageSec > 15 * 60) {
        newStatus = 'Stale';
      } else if (ageSec > 5 * 60) {
        newStatus = 'Aging';
      } else {
        newStatus = 'Recent';
      }

      if (inc.heartbeatStatus !== newStatus) {
        inc.heartbeatStatus = newStatus;
        changed = true;
      }
    });

    if (changed) {
      this.notify('heartbeatAged', null);
    }
  }

  // ========================================================================
  // System Status & Offline Simulation Toggle
  // ========================================================================
  toggleBackendConnection() {
    this.systemStatus = authorityService.toggleSimulatedBackend();
    if (this.systemStatus.backend === 'Interrupted') {
      this.addNotification({
        title: 'Backend Connection Interrupted',
        message: 'Operating in Resilient Local Offline Mode. Cached last-known citizen telemetry remains active.',
        type: 'critical'
      });
    } else {
      this.addNotification({
        title: 'Backend Connection Restored',
        message: 'Offline sync completed. Remote command telemetry synchronized.',
        type: 'success'
      });
    }
    this.notify('systemStatusChanged', this.systemStatus);
  }

  // ========================================================================
  // Citizen SOS Triage Simulation (for Demo Flow & Integration Tests)
  // ========================================================================
  async simulateNewCitizenSOS(customData = {}) {
    try {
      const newIncident = await incidentService.ingestSOS(customData);
      if (!newIncident || !newIncident.id || String(newIncident.id).startsWith('local-')) {
        throw new Error('Supabase incident creation failed: No valid database incident returned.');
      }

      // Deduplicate: avoid adding twice if Realtime subscription arrived first
      const exists = this.incidents.some(i => i.id === newIncident.id || (newIncident.clientEventId && i.clientEventId && i.clientEventId === newIncident.clientEventId));
      if (!exists) {
        this.incidents.unshift(newIncident);
      }

      this.addNotification({
        title: 'Citizen SOS Ingested',
        message: 'Citizen SOS ingested successfully',
        type: 'success',
        incidentId: newIncident.id
      });

      this.notify('incidentAdded', newIncident);
      this.notify('incidentUpdated', newIncident);
      return newIncident;
    } catch (err) {
      console.error('[RakshaSetu][AuthorityState] Citizen SOS Ingestion Error:', err);
      this.addNotification({
        title: 'SOS Ingestion Failed',
        message: err.message || 'Failed to ingest Citizen SOS to Supabase.',
        type: 'critical'
      });
      throw err;
    }
  }
}

export const state = new AuthorityState();
window.__rakshaState = state;

// Direct browser query test implementation for Part 3 inspection
if (typeof window !== 'undefined') {
  window.__rakshaDirectBrowserQueryTest = async (targetTeamId = 'c9707038-ea76-4c72-a61a-119d9dac0ea9') => {
    const { data: sessionData } = await supabase.auth.getSession();
    const { data: userData } = await supabase.auth.getUser();
    const activeUser = userData?.user || sessionData?.session?.user;
    const hostname = new URL(supabase.supabaseUrl || 'https://browmylyinqukfqpcvuv.supabase.co').hostname;

    let profileRole = null;
    if (activeUser?.id) {
      const { data: prof } = await supabase.from('profiles').select('id, role').eq('id', activeUser.id).maybeSingle();
      profileRole = prof?.role || null;
    }

    // Direct single query test
    const { data: singleData, error: singleError } = await supabase
      .from('rescue_teams')
      .select('id,name,status,current_incident_id')
      .eq('id', targetTeamId)
      .maybeSingle();

    // Direct all query test
    const { data: allData, error: allError } = await supabase
      .from('rescue_teams')
      .select('id,name,status,current_incident_id');

    const result = {
      projectHostname: hostname,
      authenticatedUserId: activeUser?.id || null,
      authenticatedUserEmail: activeUser?.email || null,
      profileRole,
      singleQuery: {
        queriedId: targetTeamId,
        returnedData: singleData,
        returnedError: singleError
      },
      allQuery: {
        count: allData?.length || 0,
        returnedData: allData,
        returnedError: allError
      }
    };
    console.log('[RakshaSetu][DirectBrowserQueryTest]', result);
    return result;
  };
}
