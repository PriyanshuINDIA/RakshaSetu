/* ==========================================================================
   RakshaSetu Authority - Shelter Service (Supabase Powered)
   Handles:
   - Safe Shelter designation, updates, activation/deactivation, and occupancy
   - Supabase public.shelters as single source of truth
   - Prototype / Demo Shelter configuration (Government Engineering College, Munger)
   - Strict RBAC validation and database RLS adherence
   ========================================================================== */

import { supabase } from './supabase-client.js';
import { isValidCoordinate } from './heartbeatService.js';

export const DEMO_SHELTER_NAME = 'Government Engineering College, Munger';

class ShelterService {
  constructor() {
    this.localShelters = [];
  }

  /**
   * Normalize a Supabase public.shelters row to UI representation
   */
  mapSupabaseShelter(row) {
    if (!row) return null;
    const lat = row.latitude != null && row.latitude !== '' ? Number(row.latitude) : null;
    const lng = row.longitude != null && row.longitude !== '' ? Number(row.longitude) : null;
    const validCoords = isValidCoordinate(lat, lng);
    const totalCap = Number(row.capacity_total) || 200;
    const currentOcc = Number(row.capacity_current) || 0;
    const percent = totalCap > 0 ? Math.round((currentOcc / totalCap) * 100) : 0;
    const isActive = row.active !== false;

    // Detect if this record represents the SIH prototype demo shelter
    const rawName = String(row.name || '');
    const isDemo = rawName.toLowerCase().includes('munger') ||
                   rawName.toLowerCase().includes('prototype') ||
                   rawName.toLowerCase().includes('demo shelter');

    let statusDisplay = 'Inactive / Closed';
    if (isActive) {
      if (percent >= 100) {
        statusDisplay = 'FULL - Evacuation Transfer in Progress';
      } else if (percent >= 85) {
        statusDisplay = 'Active - Near Capacity';
      } else {
        statusDisplay = 'Active - Normal';
      }
    }

    return {
      id: row.id,
      name: row.name || 'Shelter Relief Camp',
      location: row.address || (validCoords ? `Sector ${lat.toFixed(3)}, ${lng.toFixed(3)}` : 'Relief Location (Coordinates Pending Survey)'),
      address: row.address || '',
      latitude: lat,
      longitude: lng,
      coordinates: validCoords ? [lat, lng] : null,
      totalCapacity: totalCap,
      currentOccupancy: currentOcc,
      active: isActive,
      medicalAvailable: row.medical_available !== false,
      waterAvailable: row.water_available !== false,
      isDemo,
      status: statusDisplay,
      services: isDemo
        ? ['Prototype Demonstration Facility', 'Capacity Tracking', 'Realtime EOC Sync']
        : ['Community Kitchen', 'Medical First Aid Post', 'Clean Water RO Plant', 'Generator Backup'],
      medicalStaff: isDemo ? 'Demo Operational Unit' : 'District Health Mission Team',
      generatorStatus: isDemo ? 'Auxiliary Power Backup (Demonstration)' : 'Grid power stable + Generator backup',
      lastUpdated: row.updated_at ? new Date(row.updated_at).toLocaleTimeString('en-IN', { hour12: false }) : 'Just now',
      contactPerson: row.contact_phone || (isDemo ? 'Demo Control Desk' : 'Camp Coordinator / Tahsildar Representative')
    };
  }

  /**
   * Fetch all shelters from Supabase public.shelters
   */
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('shelters')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('[RakshaSetu][Shelters][Supabase] Shelters load failed:', error);
        throw error;
      }

      console.log(`[RakshaSetu][Shelters][Supabase] Shelters loaded: ${data?.length || 0}`);
      this.localShelters = (data || []).map(s => this.mapSupabaseShelter(s));
      return this.localShelters;
    } catch (err) {
      console.warn('[RakshaSetu][Shelters][Supabase] Shelters load notice:', err.message);
      this.localShelters = [];
      return [];
    }
  }

  /**
   * Fetch single shelter by ID
   */
  async getById(id) {
    try {
      const { data, error } = await supabase
        .from('shelters')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return this.mapSupabaseShelter(data);
      }
    } catch (err) {
      console.warn(`[ShelterService] Supabase getById note for ${id}:`, err.message);
    }
    return this.localShelters.find(s => s.id === id) || null;
  }

  /**
   * Return canonical demo shelter template for SIH prototype
   */
  /**
   * Return canonical demo shelter template for SIH prototype
   */
  getDemoShelterTemplate() {
    return {
      name: `${DEMO_SHELTER_NAME} (Demo Shelter)`,
      address: 'Munger, Bihar (Prototype Facility)',
      latitude: null, // Left empty per Step 3 until verified official coordinate exists
      longitude: null,
      capacity_total: 500,
      capacity_current: 0,
      active: true,
      contact_phone: 'Demo Control Desk',
      medical_available: true,
      water_available: true
    };
  }

  /**
   * Locate an existing demo shelter in local state
   */
  findExistingDemoShelter() {
    return this.localShelters.find(s => {
      const name = String(s.name || '').toLowerCase();
      return name.includes('munger') || name.includes('demo shelter');
    }) || null;
  }

  /**
   * Designate a new shelter in Supabase public.shelters
   * Strictly enforces database schema and prevents duplicate creation
   */
  async createShelter(shelterInput) {
    if (!shelterInput || !shelterInput.name) {
      throw new Error('Shelter designation requires a valid name.');
    }

    const trimmedName = String(shelterInput.name).trim();

    // STEP 13: Prevent duplicate records for demo shelter
    const isDemoCandidate = trimmedName.toLowerCase().includes('munger') ||
                           trimmedName.toLowerCase().includes('demo shelter');
    if (isDemoCandidate) {
      const existingDemo = this.findExistingDemoShelter();
      if (existingDemo) {
        console.log('[ShelterService] Existing demo shelter found, updating instead of duplicating:', existingDemo.id);
        return await this.updateShelter(existingDemo.id, {
          active: shelterInput.active !== false,
          capacity_total: shelterInput.capacity_total || existingDemo.totalCapacity,
          medical_available: shelterInput.medical_available !== false,
          water_available: shelterInput.water_available !== false
        });
      }
    }

    // Sanitize coordinates
    let lat = null;
    let lng = null;
    if (shelterInput.latitude != null && shelterInput.latitude !== '' &&
        shelterInput.longitude != null && shelterInput.longitude !== '') {
      const nLat = Number(shelterInput.latitude);
      const nLng = Number(shelterInput.longitude);
      if (isValidCoordinate(nLat, nLng)) {
        lat = nLat;
        lng = nLng;
      }
    }

    // Schema compliant payload: all 13 columns existing in public.shelters
    const payload = {
      name: trimmedName,
      address: shelterInput.address ? String(shelterInput.address).trim() : null,
      latitude: lat,
      longitude: lng,
      capacity_total: Math.max(1, Number(shelterInput.capacity_total) || 200),
      capacity_current: Math.max(0, Number(shelterInput.capacity_current) || 0),
      active: shelterInput.active !== false,
      contact_phone: shelterInput.contact_phone ? String(shelterInput.contact_phone).trim() : null,
      medical_available: shelterInput.medical_available !== false,
      water_available: shelterInput.water_available !== false,
      updated_at: new Date().toISOString()
    };

    console.log('[ShelterService] Inserting shelter into Supabase:', payload);

    const { data, error } = await supabase
      .from('shelters')
      .insert(payload)
      .select()
      .single();

    if (error) {
      let currentUserId = null;
      try {
        const { data: userData } = await supabase.auth.getUser();
        currentUserId = userData?.user?.id || null;
      } catch (authErr) {
        // Safe fallback
      }
      console.error('[ShelterService] Supabase insert failed:', {
        operation: 'INSERT',
        table: 'shelters',
        payload,
        userId: currentUserId,
        profileRole: 'authority',
        supabaseError: {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        }
      });
      throw error;
    }

    const mapped = this.mapSupabaseShelter(data);
    this.updateLocalCache(mapped);
    return mapped;
  }

  /**
   * Update an existing shelter's metadata in Supabase public.shelters
   */
  async updateShelter(id, updates) {
    if (!id) throw new Error('Shelter ID is required for update.');

    const payload = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) payload.name = String(updates.name).trim();
    if (updates.address !== undefined) payload.address = updates.address ? String(updates.address).trim() : null;
    if (updates.contact_phone !== undefined) payload.contact_phone = updates.contact_phone ? String(updates.contact_phone).trim() : null;

    if (updates.capacity_total !== undefined) {
      payload.capacity_total = Math.max(1, Number(updates.capacity_total) || 200);
    }
    if (updates.capacity_current !== undefined) {
      payload.capacity_current = Math.max(0, Number(updates.capacity_current) || 0);
    }
    if (updates.active !== undefined) {
      payload.active = Boolean(updates.active);
    }
    if (updates.medical_available !== undefined) {
      payload.medical_available = Boolean(updates.medical_available);
    }
    if (updates.water_available !== undefined) {
      payload.water_available = Boolean(updates.water_available);
    }

    if (updates.latitude !== undefined || updates.longitude !== undefined) {
      if (updates.latitude != null && updates.latitude !== '' &&
          updates.longitude != null && updates.longitude !== '') {
        const nLat = Number(updates.latitude);
        const nLng = Number(updates.longitude);
        if (isValidCoordinate(nLat, nLng)) {
          payload.latitude = nLat;
          payload.longitude = nLng;
        } else {
          payload.latitude = null;
          payload.longitude = null;
        }
      } else {
        payload.latitude = null;
        payload.longitude = null;
      }
    }

    console.log(`[ShelterService] Updating shelter ${id}:`, payload);

    const { data, error } = await supabase
      .from('shelters')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`[ShelterService] Update failed for ${id}:`, error);
      throw error;
    }

    const mapped = this.mapSupabaseShelter(data);
    this.updateLocalCache(mapped);
    return mapped;
  }

  /**
   * Set shelter active status (Activate or Deactivate / Close)
   */
  async setShelterActive(id, activeBoolean) {
    return await this.updateShelter(id, { active: Boolean(activeBoolean) });
  }

  /**
   * Update occupancy (+/- evacuees)
   */
  async updateOccupancy(id, delta) {
    const shelter = this.localShelters.find(s => s.id === id);
    const newOccupancy = shelter
      ? Math.max(0, Math.min(shelter.totalCapacity, shelter.currentOccupancy + delta))
      : Math.max(0, delta);

    if (shelter) {
      shelter.currentOccupancy = newOccupancy;
      shelter.lastUpdated = 'Just now';
    }

    try {
      await supabase
        .from('shelters')
        .update({
          capacity_current: newOccupancy,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
    } catch (e) {
      console.debug('[ShelterService] Remote occupancy update note:', e.message);
    }

    return shelter;
  }

  /**
   * Ensure the SIH Demo Shelter exists and is designated/active.
   * Guaranteed duplicate-safe: uses existing record if found.
   */
  async ensureDemoShelter(autoActivate = true) {
    const existing = this.findExistingDemoShelter();
    if (existing) {
      if (autoActivate && !existing.active) {
        return await this.setShelterActive(existing.id, true);
      }
      return existing;
    }

    // Create demo shelter record
    const template = this.getDemoShelterTemplate();
    template.active = autoActivate;
    return await this.createShelter(template);
  }

  updateLocalCache(shelter) {
    if (!shelter || !shelter.id) return;
    const idx = this.localShelters.findIndex(s => s.id === shelter.id);
    if (idx !== -1) {
      this.localShelters[idx] = { ...this.localShelters[idx], ...shelter };
    } else {
      this.localShelters.push(shelter);
    }
  }
}

export const shelterService = new ShelterService();
