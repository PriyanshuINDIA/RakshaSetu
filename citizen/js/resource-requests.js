/**
 * RakshaSetu Help & Resource Need Module
 * Offline-first emergency resource requests, deterministic priority calculation,
 * direct Supabase backend integration, and community rebuild reports.
 */

import { store, NetworkStates } from './store.js';
import { offlineStorage } from './offline-storage.js';
import { supabase } from './supabase-client.js';
import { realtimeService, mapResourceRequestFromDatabase } from './realtime-service.js';

export class ResourceRequestsManager {
  constructor() {
  }

  mapNeedTypeToDb(needType) {
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
  }

  calculatePriorityScore(needType, personCount, hasVulnerablePersons, waterRising) {
    let score = 50; // base score

    if (needType === 'medical' || needType === 'rescue_boat') score += 35;
    else if (needType === 'water') score += 20;
    else if (needType === 'food') score += 15;
    else if (needType === 'shelter') score += 20;

    if (hasVulnerablePersons) score += 25; // Infants, pregnant, elderly
    if (waterRising) score += 20;
    if (personCount > 5) score += 10;

    let priorityLevel = 'MEDIUM';
    if (score >= 85) priorityLevel = 'CRITICAL';
    else if (score >= 65) priorityLevel = 'HIGH';

    return { score, priorityLevel };
  }

  initRealtimeSubscription(citizenId) {
    if (!citizenId) return;
    realtimeService.startCitizenRealtime(citizenId);
  }

  unsubscribeRealtime() {
    realtimeService.stopCitizenRealtime();
  }

  async submitRequest(formData) {
    console.log('[RakshaSetu][Resource] Submit started');

    const state = store.getState();
    const { location, networkState } = state;
    const isOnline = navigator.onLine && networkState === NetworkStates.INTERNET_ONLINE;

    // 1. Authentication Check: Must have logged-in Supabase user
    let user = null;
    try {
      const {
        data: userData,
        error: userError
      } = await supabase.auth.getUser();

      if (!userError && userData?.user) {
        user = userData.user;
      }
    } catch (authEx) {
      console.warn('[RakshaSetu][Resource] Network auth check notice:', authEx);
    }

    if (!user || !user.id) {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData?.session?.user || null;
    }

    if (!user || !user.id) {
      throw new Error('Authentication required to submit a resource request.');
    }

    console.log(`[RakshaSetu][Resource] Authenticated citizen: ${user.id}`);

    // Subscribe to realtime updates for this user
    this.initRealtimeSubscription(user.id);

    // 2. Deterministic Priority Calculation
    const { score, priorityLevel } = this.calculatePriorityScore(
      formData.needType,
      Number(formData.personCount || 1),
      formData.hasVulnerablePersons,
      formData.waterRising
    );

    const clientRequestId = 'REQ-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);

    // 3. If offline, save to local outbox / pending queue
    if (!isOnline) {
      console.log('[RakshaSetu][Resource] Request queued locally (offline):', clientRequestId);
      const localPayload = {
        requestId: clientRequestId,
        client_request_id: clientRequestId,
        citizen_id: user.id,
        citizenId: user.id,
        request_type: this.mapNeedTypeToDb(formData.needType),
        needType: formData.needType,
        quantity: Number(formData.personCount || 1),
        personCount: Number(formData.personCount || 1),
        description: formData.description || '',
        location: location || null,
        latitude: location?.lat != null ? Number(location.lat) : null,
        longitude: location?.lng != null ? Number(location.lng) : null,
        accuracy_meters: location?.accuracy != null ? Number(location.accuracy) : null,
        timestamp: Date.now(),
        priority: priorityLevel,
        priorityLevel: priorityLevel,
        priorityScore: score,
        synced: false,
        status: 'PENDING_SYNC'
      };

      offlineStorage.queueResourceRequest(localPayload);
      return localPayload;
    }

    // 4. Online Supabase Insert
    const dbPayload = {
      citizen_id: user.id,
      client_request_id: clientRequestId,
      request_type: this.mapNeedTypeToDb(formData.needType),
      quantity: Number(formData.personCount || 1),
      description: formData.description || '',
      priority: priorityLevel,
      latitude: location?.lat != null ? Number(location.lat) : null,
      longitude: location?.lng != null ? Number(location.lng) : null,
      accuracy_meters: location?.accuracy != null ? Number(location.accuracy) : null,
      status: 'PENDING'
    };

    console.log('[RakshaSetu][Resource] Supabase insert started');

    const { data, error } = await supabase
      .from('resource_requests')
      .insert(dbPayload)
      .select()
      .single();

    if (error) {
      console.error('[RakshaSetu][Resource] Supabase insert failed:', error);
      console.error('[RakshaSetu][Supabase] Resource request failed:', error);
      throw error;
    }

    console.log('[RakshaSetu][Resource] Supabase insert successful:', data.id);
    console.log('[RakshaSetu][Supabase] Resource request created:', data);

    const returnRow = {
      ...mapResourceRequestFromDatabase(data),
      priorityScore: score,
      synced: true
    };

    // Update in-memory store
    const requests = store.getState().resourceRequests || [];
    const idx = requests.findIndex(r => (r.id && r.id === data.id) || r.requestId === clientRequestId);
    if (idx >= 0) {
      requests[idx] = returnRow;
      store.setState({ resourceRequests: [...requests] });
    } else {
      store.setState({ resourceRequests: [returnRow, ...requests] });
    }

    return returnRow;
  }

  async submitRebuildFeedback(feedbackData) {
    const feedback = {
      id: 'FDBK-' + Date.now(),
      infrastructureType: feedbackData.type, // 'road_block', 'water_pipe', 'power_line'
      description: feedbackData.text,
      landmark: feedbackData.landmark,
      timestamp: Date.now(),
      status: 'LOGGED_FOR_CIVIC_REVIEW'
    };

    return feedback;
  }
}

export const resourceRequests = new ResourceRequestsManager();
