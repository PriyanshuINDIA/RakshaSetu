/* ==========================================================================
   RakshaSetu Authority - Government Data Service (Repository Layer)
   Handles:
   - IMD rainfall and synoptic bulletins
   - CWC river water level and flood forecasting
   - NDMA standard operating procedures
   - NRSC / ISRO Bhuvan satellite inundation layers
   - Dual-mode operation: DEMO (govSources) <-> API (REST endpoints)
   ========================================================================== */

import { api } from './api.js';
import { GOVERNMENT_DATA_SOURCES } from '../data/govSources.js';

class GovernmentDataService {
  constructor() {
    this.localSources = JSON.parse(JSON.stringify(GOVERNMENT_DATA_SOURCES));
  }

  async getAll() {
    if (api.isDemo()) {
      return [...this.localSources];
    }

    try {
      const data = await api.get('/government/sources');
      const list = Array.isArray(data) ? data : (data.sources || []);
      this.localSources = list;
      return list;
    } catch (err) {
      console.warn('[GovernmentDataService] Failed to fetch government data from API; using local cache:', err.message);
      return [...this.localSources];
    }
  }

  async getImd() {
    if (api.isDemo()) {
      return this.localSources.find(s => s.id === 'GOV-IMD') || null;
    }

    try {
      return await api.get('/government/imd');
    } catch (err) {
      console.warn('[GovernmentDataService] Failed to fetch IMD data from API:', err.message);
      return this.localSources.find(s => s.id === 'GOV-IMD') || null;
    }
  }

  async getCwc() {
    if (api.isDemo()) {
      return this.localSources.find(s => s.id === 'GOV-CWC') || null;
    }

    try {
      return await api.get('/government/cwc');
    } catch (err) {
      console.warn('[GovernmentDataService] Failed to fetch CWC data from API:', err.message);
      return this.localSources.find(s => s.id === 'GOV-CWC') || null;
    }
  }

  async getNdma() {
    if (api.isDemo()) {
      return this.localSources.find(s => s.id === 'GOV-NDMA') || null;
    }

    try {
      return await api.get('/government/ndma');
    } catch (err) {
      console.warn('[GovernmentDataService] Failed to fetch NDMA data from API:', err.message);
      return this.localSources.find(s => s.id === 'GOV-NDMA') || null;
    }
  }
}

export const governmentDataService = new GovernmentDataService();
