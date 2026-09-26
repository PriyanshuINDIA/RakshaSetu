/**
 * RakshaSetu Central Reactive Store
 * Manages global citizen state, offline packages, emergency contacts, backend status, and active screen
 */

export const STORAGE_KEYS = {
  PROFILE: 'rakshasetu_profile_v1',
  OFFLINE_PKG: 'rakshasetu_offline_pkg_v1',
  LAST_LOCATION: 'rakshasetu_last_location_v1',
  OUTBOX_QUEUE: 'rakshasetu_outbox_queue_v1',
  RESOURCE_REQUESTS: 'rakshasetu_resource_requests_v1',
  HEARTBEAT_LOG: 'rakshasetu_heartbeat_log_v1',
  ACTIVE_EMERGENCY: 'rakshasetu_active_emergency_v1'
};

export const NetworkStates = {
  INTERNET_ONLINE: 'INTERNET_ONLINE',
  OFFLINE_PACKAGE_ACTIVE: 'OFFLINE_PACKAGE_ACTIVE',
  SMS_ONLY: 'SMS_ONLY',
  NEARBY_DEVICE_MESH: 'NEARBY_DEVICE_MESH', // Experimental
  COMMUNITY_RELAY: 'COMMUNITY_RELAY',       // Roadmap
  SATELLITE_RELAY: 'SATELLITE_RELAY',       // Roadmap
  TOTAL_FAILURE: 'TOTAL_FAILURE'
};

export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // RFC4122 v4 compliant fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

class Store {
  constructor() {
    this.listeners = new Set();

    // Default Profile (requires real Supabase authentication)
    const defaultProfile = {
      hasCompletedSetup: false,
      isAuthenticated: false,
      citizenId: null,
      fullName: '',
      email: '',
      phone: '',
      bloodGroup: '',
      dateOfBirth: '',
      address: '',
      district: '',
      state: '',
      language: 'en',
      region: null,
      regionName: null,
      contacts: [],
      heartbeatEnabled: true,
      heartbeatMinutes: 15,
      locationAllowed: true,
      highContrast: false,
      largeText: false
    };

    const savedProfile = this.loadJSON(STORAGE_KEYS.PROFILE, defaultProfile);

    // Remove legacy fake citizen IDs for unauthenticated sessions
    if (savedProfile && !savedProfile.isAuthenticated && savedProfile.citizenId && savedProfile.citizenId.startsWith('citizen-')) {
      savedProfile.citizenId = null;
    }

    // Clear legacy hardcoded demo contacts if present
    if (savedProfile && Array.isArray(savedProfile.contacts)) {
      savedProfile.contacts = savedProfile.contacts.filter(c => {
        const n = (c.name || '').toLowerCase();
        const p = (c.phone || '').replace(/\s+/g, '');
        return !(n.includes('aarav sharma') || n.includes('pooja patel') || n.includes('district emergency contact') || p === '+919437012345' || p === '+919876543210' || p === '+919812345678');
      });
    }

    // Heal legacy hardcoded Coastal Odisha default if not manually chosen
    if (savedProfile) {
      const dist = (savedProfile.district || '').toLowerCase();
      const st = (savedProfile.state || '').toLowerCase();
      const addr = (savedProfile.address || '').toLowerCase();
      if (dist.includes('munger') || st.includes('bihar') || addr.includes('munger') || addr.includes('bihar')) {
        savedProfile.region = 'bihar-munger';
        savedProfile.regionName = 'Munger / Bihar';
      } else if (!savedProfile.hasManuallySelectedRegion && savedProfile.region === 'odisha-coastal' && !dist && !st) {
        // Clear false hardcoded default when no explicit location/profile was provided
        savedProfile.region = null;
        savedProfile.regionName = null;
      }
    }

    const savedLocation = this.loadJSON(STORAGE_KEYS.LAST_LOCATION, null);

    const savedOfflinePkg = this.loadJSON(STORAGE_KEYS.OFFLINE_PKG, {
      downloaded: false,
      version: '2026.4.1',
      lastUpdated: null,
      regionId: null,
      sizeKb: 0
    });

    const savedOutbox = this.loadJSON(STORAGE_KEYS.OUTBOX_QUEUE, []);
    const savedRequests = this.loadJSON(STORAGE_KEYS.RESOURCE_REQUESTS, []);
    const savedActiveEmergency = this.loadJSON(STORAGE_KEYS.ACTIVE_EMERGENCY, null);

    const isSessionActive = Boolean(savedProfile && savedProfile.isAuthenticated && savedProfile.citizenId);
    const hasChosenLanguage = Boolean(localStorage.getItem('rakshasetu_language'));

    this.state = {
      currentScreen: !hasChosenLanguage ? 'language' : (isSessionActive ? 'home' : 'auth'),
      activeSheet: null, // 'assistant', 'health', 'family', 'help', 'shelter-detail', 'sim-drawer'
      networkState: NetworkStates.INTERNET_ONLINE,
      backendConnected: false,
      backendStatus: 'CHECKING', // 'CONNECTED' | 'UNREACHABLE' | 'CHECKING'
      liveTelemetryActive: false,
      activeEmergencySession: savedActiveEmergency,
      syncStatus: {
        pendingCount: (savedOutbox || []).filter(i => i.status !== 'SYNCED').length,
        lastSyncTime: null,
        isSyncing: false
      },
      profile: savedProfile,
      location: savedLocation,
      offlinePackage: savedOfflinePkg,
      regionalData: null,
      outboxQueue: savedOutbox,
      resourceRequests: savedRequests,
      lastHeartbeatTime: Date.now() - (2 * 60 * 1000), // 2 min ago
      selectedShelter: null,
      highContrast: savedProfile.highContrast || false,
      largeText: savedProfile.largeText || false
    };
  }

  loadJSON(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.warn(`[Store] Failed to read ${key}:`, e);
      return fallback;
    }
  }

  saveJSON(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn(`[Store] Failed to write ${key}:`, e);
    }
  }

  getState() {
    return this.state;
  }

  setState(partialState) {
    if (partialState.resourceRequests) {
      const summary = (partialState.resourceRequests || []).map(r => `${r.id || r.requestId}:${r.status}`).join(', ');
      console.log('[RakshaSetu][State] resourceRequests WRITE', summary);
    }
    if ('activeEmergencySession' in partialState) {
      console.log('[RakshaSetu][State] activeEmergencySession WRITE', partialState.activeEmergencySession?.incidentStatus || partialState.activeEmergencySession?.status || 'null');
    }

    this.state = { ...this.state, ...partialState };
    
    // Auto-persist specific slices
    if (partialState.profile) {
      this.saveJSON(STORAGE_KEYS.PROFILE, this.state.profile);
    }
    if (partialState.location) {
      this.saveJSON(STORAGE_KEYS.LAST_LOCATION, this.state.location);
    }
    if (partialState.offlinePackage) {
      this.saveJSON(STORAGE_KEYS.OFFLINE_PKG, this.state.offlinePackage);
    }
    if (partialState.outboxQueue) {
      this.saveJSON(STORAGE_KEYS.OUTBOX_QUEUE, this.state.outboxQueue);
    }
    if (partialState.resourceRequests) {
      this.saveJSON(STORAGE_KEYS.RESOURCE_REQUESTS, this.state.resourceRequests);
    }
    if ('activeEmergencySession' in partialState) {
      this.saveJSON(STORAGE_KEYS.ACTIVE_EMERGENCY, this.state.activeEmergencySession);
    }

    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[Store] Listener error:', err);
      }
    }
  }

  setNetworkState(newState) {
    if (NetworkStates[newState]) {
      this.setState({ networkState: newState });
    }
  }

  navigateTo(screenId) {
    this.setState({ currentScreen: screenId, activeSheet: null });
  }

  openSheet(sheetId, payload = null) {
    this.setState({ activeSheet: sheetId, selectedShelter: payload || this.state.selectedShelter });
  }

  closeSheet() {
    this.setState({ activeSheet: null });
  }
}

export const store = new Store();
if (typeof window !== 'undefined') {
  window.store = store;
}
