/* ==========================================================================
   RakshaSetu Authority - Heartbeat Telemetry Service (Supabase Powered)
   Source of truth: Supabase public.heartbeats
   - Provides actual location / telemetry information
   - Correlates with citizen_id and incidents
   - Determines LIVE vs LAST-KNOWN vs STALE location status
   - NEVER creates fake SOS incidents from heartbeats
   ========================================================================== */

import { supabase } from './supabase-client.js';

export function isValidCoordinate(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng)) return false;
  if (numLat < -90 || numLat > 90) return false;
  if (numLng < -180 || numLng > 180) return false;
  return true;
}

class HeartbeatService {
  constructor() {
    this.heartbeats = [];
    this.heartbeatsByCitizen = new Map();
    this.getActiveCount = this.getActiveCount.bind(this);
  }

  /**
   * Normalize Supabase heartbeat row
   */
  mapSupabaseHeartbeat(row) {
    if (!row) return null;
    const lat = row.latitude != null ? Number(row.latitude) : null;
    const lng = row.longitude != null ? Number(row.longitude) : null;
    const timestamp = row.created_at || new Date().toISOString();
    const timeDiffSec = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
    const rawNetwork = String(row.network_state || '').toUpperCase();

    // LIVE vs LAST-KNOWN vs STALE semantics based on verified recency
    let isLive = false;
    let locationType = 'LAST-KNOWN LOCATION';
    if (isValidCoordinate(lat, lng) && timeDiffSec <= 120 && (rawNetwork.includes('ONLINE') || rawNetwork.includes('4G') || rawNetwork.includes('5G') || rawNetwork.includes('WIFI'))) {
      isLive = true;
      locationType = 'LIVE LOCATION';
    } else if (timeDiffSec > 900) {
      locationType = 'STALE LOCATION';
    }

    return {
      id: row.id,
      citizenId: row.citizen_id,
      latitude: lat,
      longitude: lng,
      coordinates: isValidCoordinate(lat, lng) ? [lat, lng] : null,
      accuracyMeters: Number(row.accuracy_meters) || 20,
      networkState: row.network_state || 'Cellular',
      createdAt: timestamp,
      timestamp,
      ageSec: timeDiffSec,
      isLive,
      locationType
    };
  }

  /**
   * Load real heartbeats from Supabase public.heartbeats
   */
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('heartbeats')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[RakshaSetu][Map][Supabase] Heartbeats load notice:', error.message || error);
        return [];
      }

      console.log(`[RakshaSetu][Map][Supabase] Heartbeats loaded: ${data?.length || 0}`);

      const mapped = (data || []).map(r => this.mapSupabaseHeartbeat(r));
      this.heartbeats = mapped;
      this.heartbeatsByCitizen.clear();

      // Index newest heartbeat for each citizen
      for (const hb of mapped) {
        if (hb && hb.citizenId && !this.heartbeatsByCitizen.has(hb.citizenId)) {
          this.heartbeatsByCitizen.set(hb.citizenId, hb);
        }
      }

      return mapped;
    } catch (err) {
      console.warn('[RakshaSetu][Map][Supabase] Heartbeats query exception:', err.message);
      return [];
    }
  }

  getLatestForCitizen(citizenId) {
    if (!citizenId) return null;
    return this.heartbeatsByCitizen.get(citizenId) || null;
  }

  /**
   * Determine count of active (non-stale) heartbeats with valid coordinates.
   * Stale threshold is 900 seconds (15 minutes) per existing application semantics.
   * Evaluates either passed-in array or this.heartbeats.
   */
  getActiveCount(heartbeatsList = null) {
    return getActiveCount(heartbeatsList || this.heartbeats);
  }
}

/**
 * Standalone calculation function for active heartbeats.
 * Reuses existing 900s (15 min) freshness window and coordinate validity check.
 */
export function getActiveCount(heartbeatsList = null) {
  const list = heartbeatsList || (typeof heartbeatService !== 'undefined' ? heartbeatService.heartbeats : []);
  if (!Array.isArray(list) || list.length === 0) return 0;

  const now = Date.now();
  const latestByCitizen = new Map();

  for (const hb of list) {
    if (!hb) continue;
    const key = hb.citizenId || hb.id;
    const time = new Date(hb.createdAt || hb.timestamp || 0).getTime();
    if (!latestByCitizen.has(key) || latestByCitizen.get(key).time < time) {
      latestByCitizen.set(key, { ...hb, time });
    }
  }

  let activeCount = 0;
  for (const hb of latestByCitizen.values()) {
    const ageSec = Math.max(0, Math.floor((now - hb.time) / 1000));
    const hasCoords = hb.coordinates || (isValidCoordinate(hb.latitude, hb.longitude));
    if (hasCoords && ageSec <= 900) {
      activeCount++;
    }
  }

  return activeCount;
}

export const heartbeatService = new HeartbeatService();
export default heartbeatService;

if (typeof window !== 'undefined') {
  window.__rakshaHeartbeatService = heartbeatService;
}
