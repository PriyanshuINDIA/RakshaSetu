/**
 * RakshaSetu Supabase API Compatibility Client
 *
 * Replaces the old localhost:8080 Kotlin REST backend.
 *
 * Existing application modules can continue using:
 *   apiClient.get(...)
 *   apiClient.post(...)
 *   apiClient.patch(...)
 *   apiClient.delete(...)
 *
 * Internally all supported operations use Supabase.
 */

import { supabase } from './supabase-client.js';

export class ApiClient {
  constructor() {
    this.defaultTimeoutMs = 6000;

    // Supabase is now the backend/data layer.
    this.backendType = 'SUPABASE';
  }

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async signUp(options = {}) {
    const { data, error } = await supabase.auth.signUp(options);
    if (error) throw error;
    return data;
  }

  getBaseUrl() {
    return 'SUPABASE';
  }

  setBaseUrl() {
    console.info(
      '[RakshaSetu] Base URL configuration is not required. Supabase is the backend.'
    );
  }

  generateRequestId() {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }

    return (
      'req-' +
      Date.now() +
      '-' +
      Math.random().toString(36).substring(2, 9)
    );
  }

  /**
   * Convert frontend SOS payload into Supabase incidents row.
   */
  mapIncidentPayload(payload = {}) {
    return {
      client_event_id: payload.clientEventId,
      citizen_id: payload.citizenId,

      received_at:
        payload.timestamp || new Date().toISOString(),

      latitude: Number(payload.latitude),
      longitude: Number(payload.longitude),

      accuracy_meters:
        payload.accuracyMeters != null
          ? Number(payload.accuracyMeters)
          : null,

      location_status:
        payload.locationStatus || 'LIVE',

      network_state:
        payload.networkState || null,

      battery_percent:
        payload.batteryPercent != null
          ? Number(payload.batteryPercent)
          : null,

      medical_flag:
        Boolean(payload.medicalFlag),

      people_count:
        Number(payload.peopleCount || 1),

      message:
        payload.message || null,

      priority: 'CRITICAL',

      status: 'UNASSIGNED'
    };
  }

  /**
   * Convert frontend resource request into Supabase row.
   */
  mapResourcePayload(payload = {}) {
    const location = payload.location || {};

    const mapNeedType = (needType) => {
      switch ((needType || '').toLowerCase()) {
        case 'water': return 'WATER';
        case 'food': return 'FOOD';
        case 'medical': return 'MEDICAL';
        case 'rescue_boat':
        case 'rescue': return 'RESCUE';
        case 'shelter': return 'SHELTER';
        default: return 'OTHER';
      }
    };

    return {
      client_request_id: payload.requestId,
      citizen_id: payload.citizenId,
      request_type: mapNeedType(payload.needType),
      quantity: Number(payload.personCount || 1),
      description: payload.description || null,
      latitude: location.lat != null ? Number(location.lat) : null,
      longitude: location.lng != null ? Number(location.lng) : null,
      accuracy_meters: location.accuracy != null ? Number(location.accuracy) : 15,
      priority: payload.priorityLevel || 'MEDIUM',
      status: 'PENDING'
    };
  }

  /**
   * Convert a Supabase incident row into the response shape
   * expected by the existing Citizen application.
   */
  mapIncidentResponse(row) {
    if (!row) return null;

    return {
      id: row.id,

      clientEventId: row.client_event_id,

      citizenId: row.citizen_id,

      status:
        row.status || 'UNASSIGNED',

      authorityEocStatus:
        row.status || 'UNASSIGNED',

      receivedAt:
        row.received_at || row.created_at,

      lastHeartbeatTime:
        row.last_heartbeat_at || row.received_at || row.created_at,

      latitude: row.latitude,
      longitude: row.longitude,

      accuracyMeters:
        row.accuracy_meters,

      locationStatus:
        row.location_status,

      networkState:
        row.network_state,

      medicalFlag:
        row.medical_flag,

      peopleCount:
        row.people_count,

      message:
        row.message,

      priority:
        row.priority
    };
  }

  /**
   * Convert a Supabase resource row into the response shape
   * expected by the existing Citizen application.
   */
  mapResourceResponse(row) {
    if (!row) return null;

    return {
      id: row.id,
      requestId: row.client_request_id,
      citizenId: row.citizen_id,
      needType: row.request_type,
      personCount: row.quantity,
      description: row.description,
      location: {
        lat: row.latitude,
        lng: row.longitude,
        isLastKnown: false
      },
      priorityLevel: row.priority,
      status: row.status,
      assignedTeam: row.assigned_team_id || null,
      createdAt: row.created_at
    };
  }

  /**
   * Standard response wrapper.
   *
   * This intentionally preserves the response contract
   * expected by core/sync-manager.js and resource-requests.js.
   */
  success(data, status = 200, requestId) {
    return {
      ok: true,
      status,
      data,
      error: null,
      isNetworkError: false,
      requestId
    };
  }

  failure(error, status = 500, requestId, isNetworkError = false) {
    return {
      ok: false,
      status,
      data: null,
      error:
        error?.message ||
        String(error) ||
        'Supabase request failed.',
      isNetworkError,
      requestId
    };
  }

  /**
   * Main compatibility request router.
   *
   * No request is sent to localhost:8080 anymore.
   */
  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      timeout = this.defaultTimeoutMs,
      requestId = this.generateRequestId()
    } = options;

    const cleanEndpoint = String(endpoint || '/')
      .split('?')[0]
      .replace(/^\/+/, '');

    if (!cleanEndpoint.includes('heartbeat')) {
      console.log(
        `[RakshaSetu][Supabase] ${method} /${cleanEndpoint}`
      );
    }

    try {
      // =========================================================
      // HEALTH
      // =========================================================

      if (
        cleanEndpoint === 'health' ||
        cleanEndpoint === ''
      ) {
        return await this.checkHealth(requestId);
      }

      // =========================================================
      // INCIDENTS
      // =========================================================

      if (cleanEndpoint === 'incidents') {
        if (method === 'POST') {
          return await this.createIncident(
            body,
            requestId
          );
        }

        if (method === 'GET') {
          return await this.getIncidents(requestId);
        }
      }

      // =========================================================
      // RESOURCE REQUESTS
      // =========================================================

      if (cleanEndpoint === 'resources') {
        if (method === 'POST') {
          return await this.createResourceRequest(
            body,
            requestId
          );
        }

        if (method === 'GET') {
          return await this.getResourceRequests(
            requestId
          );
        }
      }

      // =========================================================
      // HEARTBEAT
      // /citizens/:id/heartbeat
      // =========================================================

      const heartbeatMatch =
        cleanEndpoint.match(
          /^citizens\/([^/]+)\/heartbeat$/
        );

      if (heartbeatMatch && method === 'POST') {
        return await this.createHeartbeat(
          heartbeatMatch[1],
          body,
          requestId
        );
      }

      // =========================================================
      // FAMILY SAFETY
      // =========================================================

      if (
        cleanEndpoint === 'family/im-safe' &&
        method === 'POST'
      ) {
        return await this.familySafety(
          body,
          requestId
        );
      }

      // =========================================================
      // ALERTS
      // =========================================================

      if (
        cleanEndpoint === 'alerts' &&
        method === 'GET'
      ) {
        return await this.getAlerts(requestId);
      }

      // =========================================================
      // SHELTERS
      // =========================================================

      if (
        cleanEndpoint === 'shelters' &&
        method === 'GET'
      ) {
        return await this.getShelters(requestId);
      }

      // =========================================================
      // UNSUPPORTED OLD BACKEND ENDPOINT
      // =========================================================

      console.warn(
        `[RakshaSetu][Supabase] Unsupported endpoint: ${method} /${cleanEndpoint}`
      );

      return this.failure(
        new Error(
          `Endpoint /${cleanEndpoint} is not implemented in the Supabase data layer.`
        ),
        501,
        requestId
      );

    } catch (error) {
      console.error(
        '[RakshaSetu][Supabase] Request failed:',
        error
      );

      return this.failure(
        error,
        error?.status || 500,
        requestId,
        this.isNetworkError(error)
      );
    }
  }

  // ===========================================================
  // INCIDENTS
  // ===========================================================

  async createIncident(payload, requestId) {
    if (!payload) {
      return this.failure(
        new Error('Incident payload is missing.'),
        400,
        requestId
      );
    }

    const {
      data: userData,
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return this.failure(
        new Error('Authentication required for SOS incident.'),
        401,
        requestId
      );
    }

    const row = this.mapIncidentPayload(payload);
    row.citizen_id = userData.user.id;

    // client_event_id is used for idempotency.
    if (!row.client_event_id) {
      return this.failure(
        new Error('clientEventId is required for SOS idempotency.'),
        400,
        requestId
      );
    }

    const {
      data: existing,
      error: existingError
    } = await supabase
      .from('incidents')
      .select('*')
      .eq(
        'client_event_id',
        row.client_event_id
      )
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    // Existing event = return it instead of creating duplicate.
    if (existing) {
      console.info(
        '[RakshaSetu][Supabase] Duplicate SOS prevented:',
        row.client_event_id
      );

      return this.success(
        this.mapIncidentResponse(existing),
        200,
        requestId
      );
    }

    const {
      data,
      error
    } = await supabase
      .from('incidents')
      .insert(row)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    console.info(
      '[RakshaSetu][Supabase] SOS incident created:',
      data.id
    );

    return this.success(
      this.mapIncidentResponse(data),
      201,
      requestId
    );
  }

  async getIncidents(requestId) {
    const {
      data,
      error
    } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', {
        ascending: false
      });

    if (error) {
      throw error;
    }

    return this.success(
      data.map(row =>
        this.mapIncidentResponse(row)
      ),
      200,
      requestId
    );
  }

  // ===========================================================
  // RESOURCE REQUESTS
  // ===========================================================

  async createResourceRequest(payload, requestId) {
    if (!payload) {
      return this.failure(
        new Error('Resource request payload is missing.'),
        400,
        requestId
      );
    }

    const {
      data: userData,
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return this.failure(
        new Error('Authentication required for resource request.'),
        401,
        requestId
      );
    }

    const row =
      this.mapResourcePayload(payload);
    row.citizen_id = userData.user.id;

    if (!row.client_request_id) {
      return this.failure(
        new Error('client_request_id is required.'),
        400,
        requestId
      );
    }

    // Idempotency check.
    const {
      data: existing,
      error: existingError
    } = await supabase
      .from('resource_requests')
      .select('*')
      .eq(
        'client_request_id',
        row.client_request_id
      )
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      return this.success(
        this.mapResourceResponse(existing),
        200,
        requestId
      );
    }

    const {
      data,
      error
    } = await supabase
      .from('resource_requests')
      .insert(row)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.success(
      this.mapResourceResponse(data),
      201,
      requestId
    );
  }

  async getResourceRequests(requestId) {
    const {
      data,
      error
    } = await supabase
      .from('resource_requests')
      .select('*')
      .order('created_at', {
        ascending: false
      });

    if (error) {
      throw error;
    }

    return this.success(
      data.map(row =>
        this.mapResourceResponse(row)
      ),
      200,
      requestId
    );
  }

  // ===========================================================
  // HEARTBEAT
  // ===========================================================

  async createHeartbeat(
    citizenId,
    payload,
    requestId
  ) {
    let user = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData?.session?.user || null;
    } catch {
      // Ignore auth check error
    }

    if (!user) {
      return {
        ok: false,
        status: 401,
        data: null,
        error: 'AUTH_REQUIRED',
        statusText: 'NOT_SENT',
        deliveryState: 'AUTH_REQUIRED',
        acknowledged: false,
        delivered: false,
        isNetworkError: false,
        requestId
      };
    }

    const row = {
      citizen_id: user.id,

      latitude:
        payload?.latitude != null
          ? Number(payload.latitude)
          : null,

      longitude:
        payload?.longitude != null
          ? Number(payload.longitude)
          : null,

      accuracy_meters:
        payload?.accuracyMeters != null
          ? Number(payload.accuracyMeters)
          : null,

      network_state:
        payload?.networkState || null
    };

    try {
      const {
        data,
        error
      } = await supabase
        .from('heartbeats')
        .insert(row)
        .select('id, created_at')
        .maybeSingle();

      if (error) {
        return this.failure(error, 400, requestId);
      }

      return this.success(
        {
          acknowledged: true,
          timestamp:
            data?.created_at ||
            new Date().toISOString()
        },
        200,
        requestId
      );
    } catch (dbErr) {
      return this.failure(dbErr, 400, requestId);
    }
  }

  // ===========================================================
  // FAMILY SAFETY
  // ===========================================================

  async familySafety(payload, requestId) {
    let userData = null;
    try {
      const res = await supabase.auth.getUser();
      userData = res.data;
    } catch {
      // Session missing in unauthenticated / guest mode
    }

    if (!userData?.user) {
      return {
        ok: false,
        status: 401,
        data: null,
        error: 'AUTH_REQUIRED',
        statusText: 'NOT_SENT',
        deliveryState: 'AUTH_REQUIRED',
        acknowledged: false,
        delivered: false,
        isNetworkError: false,
        requestId
      };
    }

    const {
      data,
      error
    } = await supabase
      .from('family_safety')
      .insert({
        citizen_id: userData.user.id,
        contacts:
          payload?.contacts || [],
        message:
          payload?.message ||
          'I am safe.',
        sent_at:
          new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.success(
      {
        delivered: true,
        recipientCount:
          Array.isArray(payload?.contacts)
            ? payload.contacts.length
            : 0,
        timestamp:
          data?.sent_at ||
          new Date().toISOString()
      },
      200,
      requestId
    );
  }

  // ===========================================================
  // ALERTS
  // ===========================================================

  async getAlerts(requestId) {
    const {
      data,
      error
    } = await supabase
      .from('alerts')
      .select('*')
      .eq('active', true)
      .order('created_at', {
        ascending: false
      });

    if (error) {
      throw error;
    }

    return this.success(
      data || [],
      200,
      requestId
    );
  }

  // ===========================================================
  // SHELTERS
  // ===========================================================

  mapShelterRow(row) {
    if (!row) return null;
    const lat = row.latitude != null && !isNaN(Number(row.latitude)) ? Number(row.latitude) : null;
    const lng = row.longitude != null && !isNaN(Number(row.longitude)) ? Number(row.longitude) : null;
    const hasValidCoords = lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    const nameLower = (row.name || '').toLowerCase();
    const isDemo = nameLower.includes('demo') || nameLower.includes('prototype') || nameLower.includes('munger');

    return {
      id: row.id,
      name: row.name,
      address: row.address || '',
      latitude: lat,
      longitude: lng,
      lat: lat,
      lng: lng,
      hasValidCoords,
      capacityTotal: row.capacity_total != null ? Number(row.capacity_total) : (row.capacityTotal != null ? Number(row.capacityTotal) : null),
      capacityCurrent: row.capacity_current != null ? Number(row.capacity_current) : (row.capacityCurrent != null ? Number(row.capacityCurrent) : 0),
      capacity_total: row.capacity_total != null ? Number(row.capacity_total) : null,
      capacity_current: row.capacity_current != null ? Number(row.capacity_current) : 0,
      active: Boolean(row.active),
      contact: row.contact_phone || row.contact || null,
      contact_phone: row.contact_phone || row.contact || null,
      isDemo,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getShelters(requestId) {
    const {
      data,
      error
    } = await supabase
      .from('shelters')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    const mapped = (data || []).map(row => this.mapShelterRow(row)).filter(Boolean);

    return this.success(
      mapped,
      200,
      requestId
    );
  }

  // ===========================================================
  // HEALTH
  // ===========================================================

  async checkHealth(requestId = this.generateRequestId()) {
    try {
      // getSession verifies that the Supabase client/auth API
      // is reachable without requiring a logged-in user.
      const {
        data,
        error
      } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      return {
        connected: true,

        details: {
          backend: 'SUPABASE',
          project: 'RakshaSetu',
          authenticated:
            Boolean(data?.session),
          timestamp:
            new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        connected: false,

        details: {
          backend: 'SUPABASE',
          error:
            error?.message ||
            'Supabase unavailable.'
        }
      };
    }
  }

  // ===========================================================
  // GENERIC HTTP-COMPATIBILITY METHODS
  // ===========================================================

  async get(endpoint, options = {}) {
    return this.request(
      endpoint,
      {
        ...options,
        method: 'GET'
      }
    );
  }

  async post(
    endpoint,
    body = {},
    options = {}
  ) {
    return this.request(
      endpoint,
      {
        ...options,
        method: 'POST',
        body
      }
    );
  }

  async patch(
    endpoint,
    body = {},
    options = {}
  ) {
    // PATCH operations are not currently required by the
    // Citizen PWA's Supabase flow.
    return this.failure(
      new Error(
        `PATCH ${endpoint} is not yet implemented in the Citizen Supabase layer.`
      ),
      501,
      options.requestId ||
      this.generateRequestId()
    );
  }

  async delete(
    endpoint,
    options = {}
  ) {
    return this.failure(
      new Error(
        `DELETE ${endpoint} is not yet implemented in the Citizen Supabase layer.`
      ),
      501,
      options.requestId ||
      this.generateRequestId()
    );
  }

  isNetworkError(error) {
    if (!error) return false;

    const message =
      String(error.message || '').toLowerCase();

    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('failed to fetch') ||
      message.includes('connection') ||
      message.includes('timeout')
    );
  }
}

export const apiClient = new ApiClient();

// Helpful for browser debugging.
window.__rakshaSupabaseApi = apiClient;