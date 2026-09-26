/**
 * RakshaSetu Network Manager
 * Implements strict, technically honest multi-tier network state system and simulation engine.
 * Truthfully distinguishes between raw Internet connectivity and true Supabase cloud connectivity.
 */

import { store, NetworkStates } from './store.js';
import { apiClient } from './api-client.js';

export const NetworkTierDetails = {
  [NetworkStates.INTERNET_ONLINE]: {
    id: NetworkStates.INTERNET_ONLINE,
    label: 'Internet Available',
    shortLabel: 'Online',
    subtext: 'Live weather & backend API active',
    dotClass: 'online',
    bannerText: 'Full Connectivity • Live Data & Telemetry Active',
    explanation: 'High-speed data active. Direct emergency API dispatch enabled.',
    canSendApi: true,
    canSendSms: true,
    hasOfflinePackage: true,
    isRoadmap: false
  },
  [NetworkStates.OFFLINE_PACKAGE_ACTIVE]: {
    id: NetworkStates.OFFLINE_PACKAGE_ACTIVE,
    label: 'Offline • Safety Package Active',
    shortLabel: 'Offline (Local)',
    subtext: 'Zero network • Regional NDMA database active',
    dotClass: 'offline-pkg',
    bannerText: 'Offline Mode • Verified Regional Safety Package Active',
    explanation: 'No internet connection. Using verified local shelter & health guides.',
    canSendApi: false,
    canSendSms: false,
    hasOfflinePackage: true,
    isRoadmap: false
  },
  [NetworkStates.SMS_ONLY]: {
    id: NetworkStates.SMS_ONLY,
    label: 'SMS Available (No Data)',
    shortLabel: 'SMS Only',
    subtext: 'Cellular network ready for one-tap SMS outbox',
    dotClass: 'sms-only',
    bannerText: 'Limited Connectivity • SMS Outbox Dispatch Ready',
    explanation: 'Cellular signal detected. SOS and status pings can be sent via pre-formatted SMS.',
    canSendApi: false,
    canSendSms: true,
    hasOfflinePackage: true,
    isRoadmap: false
  },
  [NetworkStates.NEARBY_DEVICE_MESH]: {
    id: NetworkStates.NEARBY_DEVICE_MESH,
    label: 'Nearby Device Mesh',
    shortLabel: 'Mesh (Exp.)',
    subtext: 'Experimental • Nearby compatible device detected',
    dotClass: 'experimental',
    bannerText: 'Experimental Mesh • Peer Device Relay in Range',
    explanation: 'Experimental Bluetooth/Wi-Fi Direct peer protocol. Not for primary 112 routing.',
    canSendApi: false,
    canSendSms: false,
    hasOfflinePackage: true,
    isRoadmap: false,
    isExperimental: true
  },
  [NetworkStates.COMMUNITY_RELAY]: {
    id: NetworkStates.COMMUNITY_RELAY,
    label: 'Community Relay',
    shortLabel: 'Relay (Roadmap)',
    subtext: 'Roadmap • Future store-and-forward infrastructure',
    dotClass: 'experimental',
    bannerText: 'Roadmap Feature • Community Location Snapshot Required',
    explanation: 'Planned architectural capability. Requires community volunteer hub integration.',
    canSendApi: false,
    canSendSms: false,
    hasOfflinePackage: true,
    isRoadmap: true
  },
  [NetworkStates.SATELLITE_RELAY]: {
    id: NetworkStates.SATELLITE_RELAY,
    label: 'Satellite Relay',
    shortLabel: 'Satellite (Roadmap)',
    subtext: 'Future government satellite infrastructure',
    dotClass: 'experimental',
    bannerText: 'Roadmap Feature • Future ISRO / NavIC S-Band Messaging',
    explanation: 'Planned direct-to-handset emergency messaging via national satellite constellation.',
    canSendApi: false,
    canSendSms: false,
    hasOfflinePackage: true,
    isRoadmap: true
  },
  [NetworkStates.TOTAL_FAILURE]: {
    id: NetworkStates.TOTAL_FAILURE,
    label: 'Total Comm Failure',
    shortLabel: 'Total Blackout',
    subtext: 'Complete radio silence • Pure local survival mode',
    dotClass: 'danger',
    bannerText: 'Complete Network Blackout • Local Protocol Only',
    explanation: 'No cellular towers, no internet, no radio contact. Follow pre-cached survival directives.',
    canSendApi: false,
    canSendSms: false,
    hasOfflinePackage: true,
    isRoadmap: false
  }
};

export class NetworkManager {
  constructor() {
    this.healthCheckTimer = null;
    this.initHardwareListeners();
    this.startBackendHealthProbe();
  }

  initHardwareListeners() {
    window.addEventListener('online', () => {
      const current = store.getState().networkState;
      if (current === NetworkStates.OFFLINE_PACKAGE_ACTIVE || current === NetworkStates.TOTAL_FAILURE) {
        store.setNetworkState(NetworkStates.INTERNET_ONLINE);
      }
      this.probeBackendHealth();
    });

    window.addEventListener('offline', () => {
      const current = store.getState().networkState;
      if (current === NetworkStates.INTERNET_ONLINE) {
        store.setNetworkState(NetworkStates.OFFLINE_PACKAGE_ACTIVE);
      }
      store.setState({
        backendConnected: false,
        backendStatus: 'UNREACHABLE',
        liveTelemetryActive: false
      });
    });
  }

  startBackendHealthProbe() {
    // Probe immediately on startup
    this.probeBackendHealth();

    // Probe every 25 seconds when in online tier
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    this.healthCheckTimer = setInterval(() => {
      const { networkState } = store.getState();
      if (networkState === NetworkStates.INTERNET_ONLINE) {
        this.probeBackendHealth();
      }
    }, 25000);
  }

  async probeBackendHealth() {
    const { networkState } = store.getState();
    if (networkState !== NetworkStates.INTERNET_ONLINE) {
      store.setState({
        backendConnected: false,
        backendStatus: 'UNREACHABLE',
        liveTelemetryActive: false
      });
      return false;
    }

    try {
      const health = await apiClient.checkHealth();
      const wasConnected = store.getState().backendConnected;
      
      store.setState({
        backendConnected: health.connected,
        backendStatus: health.connected ? 'CONNECTED' : 'UNREACHABLE'
      });

      // If backend was unreachable and just came online, trigger auto sync
      if (!wasConnected && health.connected) {
        window.dispatchEvent(new CustomEvent('rakshasetu:backend-reconnected'));
      }

      return health.connected;
    } catch {
      store.setState({
        backendConnected: false,
        backendStatus: 'UNREACHABLE',
        liveTelemetryActive: false
      });
      return false;
    }
  }

  /**
   * Returns technically honest status distinguishing:
   * State A: Internet + Backend Connected
   * State B: Internet Available • Sync Pending
   * State C: Internet Available • Backend Unreachable
   * State D: SMS Fallback
   * State E: Offline • SOS Queued
   */
  getCurrentDetails() {
    const state = store.getState();
    const currentState = state.networkState;
    const baseDetails = NetworkTierDetails[currentState] || NetworkTierDetails[NetworkStates.INTERNET_ONLINE];

    const pendingCount = (state.outboxQueue || []).filter(item => item.status !== 'SYNCED').length;

    // State D: SMS Fallback
    if (currentState === NetworkStates.SMS_ONLY) {
      return {
        ...baseDetails,
        shortLabel: 'SMS Fallback',
        bannerText: pendingCount > 0
          ? `SMS Ready • ${pendingCount} Outbox Pending`
          : 'Cellular Ready • SMS Fallback Active',
        dotClass: 'sms-only'
      };
    }

    // Offline states
    if (currentState !== NetworkStates.INTERNET_ONLINE) {
      if (pendingCount > 0) {
        // State E: Offline • SOS Queued
        return {
          ...baseDetails,
          shortLabel: 'Offline • Queued',
          bannerText: `Offline • ${pendingCount} SOS Event(s) Safely Queued`,
          dotClass: 'offline-pkg'
        };
      }
      return baseDetails;
    }

    // Online Tier: Distinguish between State A, B, and C
    if (state.backendConnected) {
      if (pendingCount > 0) {
        // State B: Internet Available • Sync Pending
        return {
          ...baseDetails,
          shortLabel: 'Sync Pending',
          bannerText: `Internet Available • ${pendingCount} Item(s) Syncing to Backend...`,
          dotClass: 'online'
        };
      }
      // State A: Internet + Backend Connected
      return {
        ...baseDetails,
        shortLabel: 'Live Online',
        bannerText: 'Full Connectivity • Backend Connected & Live Telemetry',
        dotClass: 'online'
      };
    } else {
      // State C: Internet Available • Backend Unreachable
      return {
        ...baseDetails,
        shortLabel: 'Backend Offline',
        bannerText: pendingCount > 0
          ? `Internet Available • Backend Unreachable (${pendingCount} Queued)`
          : 'Internet Available • Backend Server Unreachable (Demo Mode)',
        dotClass: 'sms-only'
      };
    }
  }

  simulateState(stateKey) {
    if (NetworkTierDetails[stateKey]) {
      store.setNetworkState(stateKey);
      if (stateKey !== NetworkStates.INTERNET_ONLINE) {
        store.setState({
          backendConnected: false,
          backendStatus: 'UNREACHABLE',
          liveTelemetryActive: false
        });
      } else {
        this.probeBackendHealth();
      }
    }
  }
}

export const networkManager = new NetworkManager();
