/* ==========================================================================
   RakshaSetu Authority - Core Application Coordinator
   Manages tab views, KPI updates, table rendering, heartbeat timers,
   operational status rendering, and DEMO <-> API mode switching.
   ========================================================================== */

import { state } from './state/state.js';
import { tacticalMap } from './map.js';
import { drawer } from './ui/drawer.js';
import { modal } from './ui/modal.js';
import { notifications } from './ui/notifications.js';
import { demoFlow } from './ui/demoFlow.js';
import { api, MODES } from './services/api.js';
import { authService } from './services/authService.js';
import { heartbeatService, getActiveCount } from './services/heartbeatService.js';
import { supabase } from './services/supabase-client.js';
import { GOVERNMENT_DATA_SOURCES } from './data/govSources.js';
import { STRETCH_FEATURES, ROADMAP_FEATURES } from './data/roadmapData.js';

class RakshaSetuApp {
  constructor() {
    this.heartbeatTimer = null;
    this.authFormBound = false;
  }

  async init() {
    console.log('[RakshaSetu][Authority] Build version: sih2026_v3 (StorageKey: rakshasetu-authority-auth-token)');

    // 1. Initialize Subsystems
    drawer.init();
    modal.init();
    notifications.init();
    demoFlow.init();
    tacticalMap.initMaps();

    // 2. Setup Event Listeners
    this.setupNavigation();
    this.setupSidebarCollapse();
    this.setupQueueFilters();
    this.setupIncidentTableFilters();
    this.setupMapFilters();

    // 3. Render Initial Screen Content
    this.renderKPIs();
    this.renderIncidentQueue();
    this.renderIncidentTable();
    this.renderResourceScreen();
    this.renderSheltersScreen();
    this.renderReportsScreen();
    this.renderSettingsScreen();
    this.renderSystemStatusBar();

    // 4. State Subscriptions for Automatic Reactivity
    state.subscribe('tabChanged', (tab) => this.handleTabSwitch(tab));
    state.subscribe('incidentUpdated', () => {
      this.renderKPIs();
      this.renderIncidentQueue();
      this.renderIncidentTable();
    });
    state.subscribe('teamsUpdated', () => {
      this.renderKPIs();
      this.renderIncidentQueue();
      this.renderIncidentTable();
    });
    state.subscribe('incidentAdded', () => {
      this.renderKPIs();
      this.renderIncidentQueue();
      this.renderIncidentTable();
    });
    state.subscribe('resourceUpdated', () => {
      this.renderKPIs();
      this.renderResourceScreen();
    });
    state.subscribe('shelterUpdated', () => {
      this.renderKPIs();
      this.renderSheltersScreen();
    });
    state.subscribe('dataLoaded', () => {
      this.renderKPIs();
      this.renderIncidentQueue();
      this.renderIncidentTable();
      this.renderResourceScreen();
      this.renderSheltersScreen();
    });
    state.subscribe('heartbeatsUpdated', () => {
      this.renderKPIs();
    });
    state.subscribe('systemStatusChanged', () => {
      this.renderSystemStatusBar();
      this.renderSettingsScreen();
    });
    state.subscribe('heartbeatAged', () => {
      this.renderKPIs();
      this.updateIncidentQueueHeartbeats();
    });
    state.subscribe('realtimeStatusChanged', ({ status }) => {
      const streamStatusEl = document.getElementById('footer-stream-status');
      if (status === 'SUBSCRIBED') {
        state.systemStatus.backend = 'Connected';
        if (streamStatusEl) {
          streamStatusEl.textContent = 'Connected';
          streamStatusEl.style.color = 'var(--loc-live)';
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        state.systemStatus.backend = 'Disconnected';
        if (streamStatusEl) {
          streamStatusEl.textContent = 'Disconnected';
          streamStatusEl.style.color = 'var(--color-critical)';
        }
      } else {
        state.systemStatus.backend = 'Connecting';
        if (streamStatusEl) {
          streamStatusEl.textContent = 'Connecting';
          streamStatusEl.style.color = '#fbbf24';
        }
      }
      this.renderSystemStatusBar();
    });
    state.subscribe('modeChanged', () => {
      this.renderKPIs();
      this.renderIncidentQueue();
      this.renderIncidentTable();
      this.renderResourceScreen();
      this.renderSheltersScreen();
      this.renderSettingsScreen();
      this.renderSystemStatusBar();
    });

    // 5. Realtime transport is managed by Supabase subscriptions (legacy WebSocket removed)

    // 6. Start Real-Time Heartbeat Ticker (every 1 second)
    this.heartbeatTimer = setInterval(() => {
      state.tickHeartbeats();
    }, 1000);

    // Initial check for hash or default tab
    this.handleTabSwitch(state.activeTab);

    // Verify Authority session before exposing live operations and loading data
    await this.checkAuthorityAuth();
  }

  // ========================================================================
  // Authority Authentication & RBAC Verification
  // ========================================================================
  async checkAuthorityAuth() {
    this.setupAuthModal();

    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session && session.user) {
        console.log('[RakshaSetu][Authority][Auth] Session detected');
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          console.log('[RakshaSetu][Authority][Auth] Profile loaded');
          if (profile.role === 'authority' || profile.role === 'admin') {
            console.log('[RakshaSetu][Authority][Auth] Authorized authority');
            this.setAuthorityIdentity(session.user, profile);
            this.hideAuthOverlay();
            await state.loadInitialData();
            return;
          } else {
            console.log('[RakshaSetu][Authority][Auth] Authorization failed');
            this.setUnauthorizedIdentity(session.user, profile);
            this.showAuthAlert(`Access Denied: Account role is "${profile.role || 'citizen'}". Authority EOC operations require role 'authority' or 'admin'.`, 'error');
            this.showAuthOverlay();
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[RakshaSetu][Authority][Auth] Authority auth check error:', err);
    }

    this.setUnauthorizedIdentity();
    this.showAuthOverlay();
  }

  setupAuthModal() {
    const form = document.getElementById('authority-auth-form');
    if (form && !this.authFormBound) {
      this.authFormBound = true;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email-input')?.value?.trim();
        const password = document.getElementById('auth-password-input')?.value;
        const submitBtn = document.getElementById('auth-submit-btn');

        if (!email || !password) {
          this.showAuthAlert('Please enter both authority email and password.', 'error');
          return;
        }

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Verifying EOC Credentials...';
          }
          this.showAuthAlert(null);

          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          });
          if (error) throw error;
          const user = data.user;
          const session = data.session;
          if (session) {
            console.log('[RakshaSetu][Authority][Auth] Session detected');
          }

          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, full_name, email, role')
            .eq('id', user.id)
            .single();

          if (profile) {
            console.log('[RakshaSetu][Authority][Auth] Profile loaded');
          }

          if (profile && (profile.role === 'authority' || profile.role === 'admin')) {
            console.log('[RakshaSetu][Authority][Auth] Authorized authority');
            this.setAuthorityIdentity(user, profile);
            this.hideAuthOverlay();
            await state.loadInitialData();
          } else {
            console.log('[RakshaSetu][Authority][Auth] Authorization failed');
            await supabase.auth.signOut();
            throw new Error(`Access Denied: Account role is "${profile?.role || 'citizen'}". Only 'authority' or 'admin' users may access the EOC.`);
          }
        } catch (err) {
          console.error('[RakshaSetu][Authority][Auth] Login rejected:', err);
          this.showAuthAlert(err.message || 'Invalid credentials or unauthorized.', 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Authenticate EOC Access</span><span>&rarr;</span>';
          }
        }
      });
    }

    if (!this.authStateBound) {
      this.authStateBound = true;
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const pillText = document.getElementById('auth-status-pill')?.textContent;
          if (pillText !== 'VERIFIED') {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, full_name, email, role')
              .eq('id', session.user.id)
              .single();

            if (profile && (profile.role === 'authority' || profile.role === 'admin')) {
              this.setAuthorityIdentity(session.user, profile);
              this.hideAuthOverlay();
              await state.loadInitialData();
            }
          }
        }
      });
    }
  }

  showAuthOverlay() {
    const overlay = document.getElementById('authority-auth-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.classList.add('open');
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
    }
  }

  hideAuthOverlay() {
    const overlay = document.getElementById('authority-auth-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.style.display = 'none';
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
    }
  }

  showAuthAlert(message, type = 'error') {
    const alertBox = document.getElementById('authority-auth-alert');
    if (!alertBox) return;
    if (!message) {
      alertBox.style.display = 'none';
      return;
    }
    alertBox.style.display = 'block';
    alertBox.textContent = message;
    if (type === 'error') {
      alertBox.style.background = 'rgba(239, 68, 68, 0.15)';
      alertBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
      alertBox.style.color = '#fca5a5';
    } else {
      alertBox.style.background = 'rgba(16, 185, 129, 0.15)';
      alertBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
      alertBox.style.color = '#6ee7b7';
    }
  }

  setAuthorityIdentity(user, profile) {
    state.currentUser = user;
    state.userProfile = profile;
    const pill = document.getElementById('auth-status-pill');
    const nameText = document.getElementById('auth-user-name-text');
    const roleText = document.getElementById('auth-user-role-text');
    const identityCard = document.getElementById('authority-identity-card');

    if (identityCard) {
      identityCard.style.cursor = 'default';
      identityCard.onclick = null;
      identityCard.title = 'Verified EOC Authority Identity';
    }

    if (pill) {
      pill.textContent = 'VERIFIED';
      pill.style.background = '#059669';
      pill.style.color = '#ecfdf5';
    }

    if (nameText) {
      nameText.textContent = profile.full_name || user.email;
    }

    if (roleText) {
      roleText.innerHTML = `Role: <strong>${(profile.role || 'authority').toUpperCase()}</strong> &bull; <button id="auth-signout-btn" style="background: none; border: none; color: var(--color-critical); cursor: pointer; text-decoration: underline; padding: 0; font-size: inherit;">Sign Out</button>`;
      const signoutBtn = document.getElementById('auth-signout-btn');
      if (signoutBtn) {
        signoutBtn.onclick = async () => {
          await supabase.auth.signOut();
          window.location.reload();
        };
      }
    }
  }

  setUnauthorizedIdentity(user = null, profile = null) {
    state.currentUser = user;
    state.userProfile = profile;
    const pill = document.getElementById('auth-status-pill');
    const nameText = document.getElementById('auth-user-name-text');
    const roleText = document.getElementById('auth-user-role-text');
    const identityCard = document.getElementById('authority-identity-card');

    if (pill) {
      pill.textContent = user ? 'UNAUTHORIZED' : 'LOGIN REQUIRED';
      pill.style.background = '#dc2626';
      pill.style.color = '#ffffff';
    }

    if (nameText) {
      nameText.textContent = user ? (user.email || 'Unauthorized Account') : 'Authentication Required';
    }

    if (roleText) {
      roleText.innerHTML = user 
        ? `Role: <strong>${(profile?.role || 'citizen').toUpperCase()}</strong> (Unauthorized for EOC)`
        : `Enter EOC credentials with role 'authority' or 'admin'. <button id="auth-open-modal-btn" style="margin-top: 6px; width: 100%; padding: 6px; background: var(--brand-primary); color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; display: block;">Log In to EOC &rarr;</button>`;
      
      const openBtn = document.getElementById('auth-open-modal-btn');
      if (openBtn) {
        openBtn.onclick = (e) => {
          e.stopPropagation();
          this.showAuthOverlay();
        };
      }
    }

    if (identityCard) {
      identityCard.style.cursor = 'pointer';
      identityCard.title = 'Click to open Authority Login modal';
      identityCard.onclick = () => {
        const pillText = document.getElementById('auth-status-pill')?.textContent;
        if (pillText !== 'VERIFIED') {
          this.showAuthOverlay();
        }
      };
    }
  }

  // ========================================================================
  // Navigation & Tabs
  // ========================================================================
  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.dataset.tab;
        if (tab) state.setActiveTab(tab);
      });
    });
  }

  setupSidebarCollapse() {
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const sidebar = document.getElementById('app-sidebar');
    if (collapseBtn && sidebar) {
      collapseBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }
  }

  handleTabSwitch(tab) {
    // Update nav links
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.dataset.tab === tab) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Toggle tab views
    document.querySelectorAll('.tab-view').forEach(view => {
      if (view.id === `tab-${tab}`) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    // If switching to full map tab, invalidate Leaflet canvas
    if (tab === 'map' && window.__rakshaMap && window.__rakshaMap.fullMap) {
      setTimeout(() => window.__rakshaMap.fullMap.invalidateSize(), 150);
    }
    if (tab === 'dashboard' && window.__rakshaMap && window.__rakshaMap.mainMap) {
      setTimeout(() => window.__rakshaMap.mainMap.invalidateSize(), 150);
    }
  }

  // ========================================================================
  // 1. Dashboard: KPIs & Active Queue
  // ========================================================================
  renderKPIs() {
    const isResolved = inc => {
      const s = String(inc?.status || inc?.rawStatus || '').toUpperCase();
      return s === 'RESOLVED';
    };
    const isCancelled = inc => {
      const s = String(inc?.status || inc?.rawStatus || '').toUpperCase();
      return s === 'CANCELLED';
    };
    const isActive = inc => !isResolved(inc) && !isCancelled(inc);

    // 1. Critical SOS (Active Critical Incidents — Immediate Threat)
    const criticalCount = (state.incidents || []).filter(i => {
      const p = String(i?.priority || i?.rawPriority || '').toUpperCase();
      return p === 'CRITICAL' && isActive(i);
    }).length;

    // 2. High Priority (Active High Severity Incidents — Urgent Response)
    const highCount = (state.incidents || []).filter(i => {
      const p = String(i?.priority || i?.rawPriority || '').toUpperCase();
      return p === 'HIGH' && isActive(i);
    }).length;

    // 3. Moderate (Active Moderate Incidents — Stable Isolation)
    const moderateCount = (state.incidents || []).filter(i => {
      const p = String(i?.priority || i?.rawPriority || '').toUpperCase();
      return (p === 'MODERATE' || p === 'MEDIUM') && isActive(i);
    }).length;

    // 4. Resolved (COUNT(incidents where status = RESOLVED))
    const resolvedCount = (state.incidents || []).filter(isResolved).length;

    // 5. Location Signals: Active Heartbeats from public.heartbeats
    let signalsCount = 0;
    try {
      if (typeof heartbeatService?.getActiveCount === 'function') {
        signalsCount = heartbeatService.getActiveCount(state.heartbeats);
      } else if (typeof getActiveCount === 'function') {
        signalsCount = getActiveCount(state.heartbeats);
      } else if (typeof window?.__rakshaHeartbeatService?.getActiveCount === 'function') {
        signalsCount = window.__rakshaHeartbeatService.getActiveCount(state.heartbeats);
      } else {
        signalsCount = 0;
      }
    } catch (err) {
      console.warn('[RakshaSetu][Dashboard][Stats] Heartbeat signals count notice:', err?.message || err);
      signalsCount = 0;
    }

    // 6. Active Shelters from public.shelters
    let sheltersActive = 0;
    let totalEvacuees = 0;
    try {
      if (Array.isArray(state.shelters)) {
        const activeShelters = state.shelters.filter(s => {
          if (!s) return false;
          const sStatus = String(s.status || '').toLowerCase();
          return s.active !== false && !sStatus.includes('inactive');
        });
        sheltersActive = activeShelters.length;
        totalEvacuees = activeShelters.reduce((sum, s) => sum + (Number(s.currentOccupancy) || 0), 0);
      }
    } catch (err) {
      console.warn('[RakshaSetu][Dashboard][Stats] Shelters count error:', err);
      sheltersActive = 0;
      totalEvacuees = 0;
    }

    // 7. Pending Supplies from public.resource_requests
    let pendingResources = 0;
    try {
      pendingResources = (state.resourceRequests || []).filter(r => {
        if (!r) return false;
        const s = String(r.rawStatus || r.status || '').toUpperCase();
        return s === 'PENDING' || s === 'PENDING_SYNC' || s === 'NEW' || s === 'ACKNOWLEDGED' || s === 'ACKNOWLEDGED_BY_AUTHORITY';
      }).length;
    } catch (err) {
      console.warn('[RakshaSetu][Dashboard][Stats] Resource requests count error:', err);
      pendingResources = 0;
    }

    // Rescue team metrics
    const totalTeams = (state.rescueTeams || []).length;
    const availableTeams = (state.rescueTeams || []).filter(t => String(t?.status || '').toUpperCase() === 'AVAILABLE').length;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('kpi-val-critical', criticalCount);
    setVal('kpi-val-high', highCount);
    setVal('kpi-val-moderate', moderateCount);
    setVal('kpi-val-resolved', resolvedCount);
    setVal('kpi-val-signals', signalsCount);
    setVal('kpi-val-shelters', sheltersActive);
    setVal('kpi-subtext-shelters', `${totalEvacuees} Total Evacuees`);
    setVal('kpi-val-resources', pendingResources);

    const criticalBadge = document.getElementById('sidebar-critical-badge');
    if (criticalBadge) {
      criticalBadge.textContent = criticalCount;
      criticalBadge.style.display = criticalCount > 0 ? 'inline-block' : 'none';
    }

    console.log(`[RakshaSetu][Dashboard][Stats] Incidents: ${state.incidents?.length || 0}`);
    console.log(`[RakshaSetu][Dashboard][Stats] Critical active: ${criticalCount}`);
    console.log(`[RakshaSetu][Dashboard][Stats] Resolved: ${resolvedCount}`);
    console.log(`[RakshaSetu][Dashboard][Stats] Resource requests pending: ${pendingResources}`);
    console.log(`[RakshaSetu][Dashboard][Stats] Rescue teams available: ${availableTeams}`);
  }

  setupQueueFilters() {
    const pills = document.querySelectorAll('.queue-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.renderIncidentQueue(pill.dataset.filter);
      });
    });
  }

  renderIncidentQueue(filter = 'ALL') {
    const queueList = document.getElementById('ops-queue-list');
    if (!queueList) return;

    // Active Incident Queue strictly excludes RESOLVED and CANCELLED incidents
    let filtered = (state.incidents || []).filter(i => {
      const s = String(i?.status || i?.rawStatus || '').toUpperCase();
      return s !== 'RESOLVED' && s !== 'CANCELLED';
    });

    if (filter === 'CRITICAL') filtered = filtered.filter(i => String(i?.priority || i?.rawPriority || '').toUpperCase() === 'CRITICAL');
    if (filter === 'HIGH') filtered = filtered.filter(i => String(i?.priority || i?.rawPriority || '').toUpperCase() === 'HIGH');
    if (filter === 'MODERATE') filtered = filtered.filter(i => {
      const p = String(i?.priority || i?.rawPriority || '').toUpperCase();
      return p === 'MODERATE' || p === 'MEDIUM';
    });
    if (filter === 'UNASSIGNED') filtered = filtered.filter(i => String(i?.status || i?.rawStatus || '').toUpperCase() === 'UNASSIGNED');

    if (filtered.length === 0) {
      queueList.innerHTML = `
        <div class="ops-empty-state">
          <div class="ops-empty-icon">✓</div>
          <div class="ops-empty-title">Queue Clear</div>
          <div class="ops-empty-sub">No incidents match this filter.</div>
        </div>
      `;
      return;
    }

    queueList.innerHTML = filtered.map(inc => {
      const isLive = String(inc.locationType || '').toUpperCase().includes('LIVE');
      const ageMin = Math.floor((inc.heartbeatAgeSec || 0) / 60);
      const ageText = ageMin > 0 ? `${ageMin}m ago` : `${inc.heartbeatAgeSec || 0}s ago`;

      return `
        <div class="incident-card ${inc.priority.toLowerCase()} ${state.selectedIncidentId === inc.id ? 'active' : ''}"
             onclick="window.__rakshaState.openIncidentDrawer('${inc.id}')">
          <div class="incident-card-header">
            <div class="incident-id-time">
              <span class="incident-id" title="${inc.id}">${inc.displayId || inc.id}</span>
              <span class="incident-time-ago">${new Date(inc.receivedAt).toLocaleTimeString('en-IN', { hour12: false })}</span>
            </div>
            <span class="priority-badge ${inc.priority.toLowerCase()}">${inc.priority}</span>
          </div>

          <div class="incident-card-body">
            <div class="incident-location-line">
              <span>📍</span>
              <span style="font-weight: 600;">${inc.locationName}</span>
            </div>

            <div class="incident-badges-row">
              <span class="location-type-badge ${isLive ? 'live' : 'last-known'}">
                ${isLive ? 'LIVE' : `LAST-KNOWN (${ageText})`}
              </span>
              <span class="status-badge ${inc.status.toLowerCase()}">${inc.status}</span>
              ${inc.medicalFlag ? '<span class="medical-flag">🚨 MEDICAL</span>' : ''}
              <span class="network-pill ${(inc.networkState || '').toLowerCase().includes('sms') ? 'sms' : ((inc.networkState || '').toLowerCase().includes('4g') ? 'cellular' : 'offline')}">
                📶 ${(inc.networkState || '4G').split(' ')[0]}
              </span>
            </div>

            <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.3; font-style: italic;">
              &ldquo;${(inc.message || '').substring(0, 75)}...&rdquo;
            </div>
          </div>

          <div class="incident-footer-row">
            <span class="assigned-team-text">
              ${inc.assignedTeam ? `🚑 ${inc.assignedTeam}` : '⚠️ Unassigned'}
            </span>
            <span style="font-family: var(--font-mono); color: var(--text-muted); font-size: 10px;">
              &plusmn;${inc.accuracyMeters}m
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  updateIncidentQueueHeartbeats() {
    const activePill = document.querySelector('.queue-pill.active');
    const filter = activePill ? activePill.dataset.filter : 'ALL';
    this.renderIncidentQueue(filter);
  }

  // ========================================================================
  // 2. SOS & Incidents: Master Table
  // ========================================================================
  setupIncidentTableFilters() {
    const searchInput = document.getElementById('incident-search-input');
    const priorityFilter = document.getElementById('incident-priority-filter');
    const statusFilter = document.getElementById('incident-status-filter');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.incidentSearchQuery = e.target.value.toLowerCase();
        this.renderIncidentTable();
      });
    }

    if (priorityFilter) {
      priorityFilter.addEventListener('change', (e) => {
        state.incidentPriorityFilter = e.target.value;
        this.renderIncidentTable();
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        state.incidentStatusFilter = e.target.value;
        this.renderIncidentTable();
      });
    }
  }

  renderIncidentTable() {
    const tbody = document.getElementById('incident-table-body');
    if (!tbody) return;

    let list = [...state.incidents];

    if (state.incidentSearchQuery) {
      list = list.filter(i =>
        i.id.toLowerCase().includes(state.incidentSearchQuery) ||
        (i.citizenName || '').toLowerCase().includes(state.incidentSearchQuery) ||
        (i.locationName || '').toLowerCase().includes(state.incidentSearchQuery) ||
        (i.message || '').toLowerCase().includes(state.incidentSearchQuery)
      );
    }

    if (state.incidentPriorityFilter !== 'ALL') {
      list = list.filter(i => i.priority === state.incidentPriorityFilter);
    }

    if (state.incidentStatusFilter !== 'ALL') {
      list = list.filter(i => i.status === state.incidentStatusFilter);
    }

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No emergency incidents match the current criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(inc => {
      const isLive = String(inc.locationType || '').toUpperCase().includes('LIVE');
      const ageMin = Math.floor((inc.heartbeatAgeSec || 0) / 60);
      const ageText = ageMin > 0 ? `${ageMin}m ago` : `${inc.heartbeatAgeSec || 0}s ago`;

      return `
        <tr onclick="window.__rakshaState.openIncidentDrawer('${inc.id}')" class="${state.selectedIncidentId === inc.id ? 'selected' : ''}">
          <td style="font-family: var(--font-mono); font-weight: 700; color: var(--text-primary);" title="${inc.id}">${inc.displayId || inc.id}</td>
          <td><span class="priority-badge ${inc.priority.toLowerCase()}">${inc.priority}</span></td>
          <td style="font-weight: 600; color: var(--text-primary);">${inc.locationName}</td>
          <td style="font-family: var(--font-mono); font-size: 11px;">${new Date(inc.receivedAt).toLocaleTimeString('en-IN', { hour12: false })}</td>
          <td>
            <span class="location-type-badge ${isLive ? 'live' : 'last-known'}">
              ${inc.locationType}
            </span>
          </td>
          <td style="font-family: var(--font-mono);">&plusmn;${inc.accuracyMeters}m</td>
          <td>
            <div class="heartbeat-status-box" style="padding: 2px 6px; font-size: 11px;">
              <span class="heartbeat-indicator ${(inc.heartbeatStatus || 'recent').toLowerCase()}"></span>
              <span>${ageText}</span>
            </div>
          </td>
          <td>
            <span class="network-pill ${(inc.networkState || '').toLowerCase().includes('sms') ? 'sms' : ((inc.networkState || '').toLowerCase().includes('4g') ? 'cellular' : 'offline')}">
              ${inc.networkState}
            </span>
          </td>
          <td>
            ${inc.medicalFlag ? '<span class="medical-flag">🚨 YES</span>' : '<span style="color: var(--text-muted);">No</span>'}
          </td>
          <td style="font-weight: 600; color: ${inc.assignedTeam ? 'var(--text-primary)' : 'var(--color-critical)'};">
            ${inc.assignedTeam ? `🚑 ${inc.assignedTeam}` : 'None'}
          </td>
          <td>
            <span class="status-badge ${inc.status.toLowerCase()}">${inc.status}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ========================================================================
  // 3. Map Filters & Layer Controls
  // ========================================================================
  setupMapFilters() {
    const filterBtns = document.querySelectorAll('.map-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.mapFilter;
        tacticalMap.setFilter(filter);
      });
    });
  }

  // ========================================================================
  // 5. Resource Coordination Screen
  // ========================================================================
  renderResourceScreen() {
    const tbody = document.getElementById('resource-table-body');
    if (!tbody) return;

    const pendingCount = state.resourceRequests.filter(r => r.status === 'Pending').length;
    const highCount = state.resourceRequests.filter(r => r.priority === 'High' || r.priority === 'Critical').length;
    const assignedCount = state.resourceRequests.filter(r => r.status === 'Assigned' || r.status === 'In Transit' || r.status === 'In Progress').length;
    const fulfilledCount = state.resourceRequests.filter(r => r.status === 'Delivered' || r.status === 'Fulfilled' || r.status === 'Closed').length;

    const setResVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setResVal('res-kpi-pending', pendingCount);
    setResVal('res-kpi-high', highCount);
    setResVal('res-kpi-assigned', assignedCount);
    setResVal('res-kpi-fulfilled', fulfilledCount);

    if (state.resourceRequests.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No active resource requests recorded in operations center.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.resourceRequests.map(r => `
      <tr onclick="window.__rakshaState.openResourceDrawer('${r.id}')">
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--text-primary);">${r.id}</td>
        <td style="font-weight: 600; color: var(--text-primary);">
          📦 ${r.need}
          <div style="font-size: 11px; color: var(--text-muted); font-weight: normal;">${r.category} Supply Category</div>
        </td>
        <td>${r.location}</td>
        <td><span class="priority-badge ${r.priority.toLowerCase()}">${r.priority}</span></td>
        <td style="font-family: var(--font-mono); font-size: 11px;">${new Date(r.requestedAt).toLocaleTimeString('en-IN', { hour12: false })}</td>
        <td><span class="status-badge">${r.status}</span></td>
        <td style="font-weight: 600;">${r.assignedTeam || '<span style="color: var(--text-muted);">Unassigned</span>'}</td>
      </tr>
    `).join('');
  }

  // ========================================================================
  // 6. Shelters Screen
  // ========================================================================
  renderSheltersScreen() {
    if (typeof window !== 'undefined' && !window.__handleDesignateDemo) {
      window.__handleDesignateDemo = async (btn) => {
        if (btn) {
          btn.disabled = true;
          btn.textContent = '⏳ Designating...';
        }
        try {
          await window.__rakshaState.designateDemoShelter();
        } catch (err) {
          if (btn) {
            btn.disabled = false;
            btn.textContent = '⚡ Designate GEC Munger (Demo Shelter)';
          }
        }
      };
    }

    const listContainer = document.getElementById('shelter-cards-grid');
    if (!listContainer) return;

    const hasMungerDemo = state.shelters.some(sh => {
      const name = String(sh.name || '').toLowerCase();
      return name.includes('munger') || name.includes('demo shelter');
    });

    const demoBannerHtml = !hasMungerDemo ? `
      <div class="sih-demo-banner" style="grid-column: 1 / -1; padding: 14px 18px; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 24px;">🏛️</span>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 13px; font-weight: 700; color: var(--text-primary);">SIH Prototype Demonstration Shelter</span>
              <span class="status-badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border-color: rgba(245, 158, 11, 0.4); font-size: 10px;">PROTOTYPE</span>
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              Designate <strong>Government Engineering College, Munger</strong> as an active prototype shelter to demonstrate authority-controlled shelter designation and citizen sync.
            </div>
          </div>
        </div>
        <button class="action-btn-primary" style="background: var(--brand-primary); font-size: 12px; padding: 6px 14px;" onclick="event.stopPropagation(); (window.__handleDesignateDemo ? window.__handleDesignateDemo(this) : window.__rakshaState.designateDemoShelter())">
          ⚡ Designate GEC Munger (Demo Shelter)
        </button>
      </div>
    ` : '';

    if (state.shelters.length === 0) {
      listContainer.innerHTML = `
        ${demoBannerHtml}
        <div class="ops-empty-state" style="grid-column: 1 / -1; padding: 40px;">
          <div class="ops-empty-icon">⛺</div>
          <div class="ops-empty-title">No Shelters Registered</div>
          <div class="ops-empty-sub">No relief camps or shelters currently in database. Click "Designate Shelter" or the prototype quick-action above.</div>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = demoBannerHtml + state.shelters.map(sh => {
      const percent = sh.totalCapacity > 0 ? Math.round((sh.currentOccupancy / sh.totalCapacity) * 100) : 0;
      const isCriticalCapacity = percent >= 95;
      const isActive = sh.active !== false;
      const borderCol = !isActive ? '#64748b' : (isCriticalCapacity ? 'var(--color-critical)' : 'var(--brand-primary)');
      const statusBadgeCol = isActive ? '#22c55e' : '#ef4444';

      return `
        <div class="incident-card" style="border-left: 4px solid ${borderCol}; cursor: pointer;"
             onclick="window.__rakshaState.openShelterDrawer('${sh.id}')">
          <div class="incident-card-header" style="align-items: flex-start;">
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${sh.name}</span>
                ${sh.isDemo ? `
                  <span class="status-badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border-color: rgba(245, 158, 11, 0.4); font-size: 9px; padding: 1px 5px;">
                    PROTOTYPE
                  </span>
                ` : ''}
              </div>
            </div>
            <span class="status-badge" style="color: ${statusBadgeCol}; border-color: ${statusBadgeCol}; font-weight: 700; white-space: nowrap;">
              ${isActive ? '🟢 ACTIVE' : '🔴 CLOSED'}
            </span>
          </div>

          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            📍 ${sh.address || sh.location}
          </div>

          <div style="font-size: 11px; margin-top: 2px;">
            ${sh.coordinates ? `
              <span style="color: var(--text-muted); font-family: var(--font-mono);">GPS: ${sh.coordinates[0].toFixed(3)}, ${sh.coordinates[1].toFixed(3)}</span>
            ` : `
              <span style="color: #fbbf24;">⚠️ Coordinates Pending Official Survey</span>
            `}
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span>Occupancy: <strong>${sh.currentOccupancy}</strong> / ${sh.totalCapacity}</span>
              <span style="font-weight: 700; color: ${isCriticalCapacity ? 'var(--color-critical)' : 'var(--loc-live)'};">${percent}%</span>
            </div>
            <div style="height: 6px; width: 100%; background: #334155; border-radius: 3px; overflow: hidden;">
              <div style="height: 100%; width: ${Math.min(100, percent)}%; background: ${isCriticalCapacity ? 'var(--color-critical)' : 'var(--brand-primary)'};"></div>
            </div>
          </div>

          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px;">
            ${(sh.services || []).map(s => `
              <span class="status-badge" style="font-size: 10px; padding: 1px 6px;">${s}</span>
            `).join('')}
          </div>

          <!-- Authority Quick Action Controls -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-medium);">
            <div style="display: flex; gap: 6px;">
              ${isActive ? `
                <button class="action-btn-secondary" style="font-size: 11px; padding: 3px 8px; color: #f87171; border-color: rgba(239, 68, 68, 0.4);" onclick="event.stopPropagation(); window.__rakshaState.setShelterActive('${sh.id}', false)">
                  Close / Deactivate
                </button>
              ` : `
                <button class="action-btn-secondary" style="font-size: 11px; padding: 3px 8px; color: #4ade80; border-color: rgba(34, 197, 94, 0.4);" onclick="event.stopPropagation(); window.__rakshaState.setShelterActive('${sh.id}', true)">
                  Activate
                </button>
              `}
              <button class="action-btn-secondary" style="font-size: 11px; padding: 3px 8px;" onclick="event.stopPropagation(); window.__rakshaModal.openDesignateShelterModal('${sh.id}')">
                Edit
              </button>
            </div>
            <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">Updated ${sh.lastUpdated}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // ========================================================================
  // 9 & 13. Government Data & Operational Reports
  // ========================================================================
  renderReportsScreen() {
    const govGrid = document.getElementById('gov-sources-container');
    if (govGrid) {
      govGrid.innerHTML = GOVERNMENT_DATA_SOURCES.map(src => `
        <div class="gov-source-card">
          <div class="gov-source-header">
            <div class="gov-agency-name">
              <span>🏛️</span>
              <span>${src.agency}</span>
            </div>
            <span class="gov-status-badge">${src.status}</span>
          </div>

          <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">
            ${src.bulletinTitle}
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${src.dataPoints.map(dp => `
              <div style="display: flex; justify-content: space-between; font-size: 12px; border-bottom: 1px dashed var(--border-subtle); padding-bottom: 3px;">
                <span style="color: var(--text-muted);">${dp.label}:</span>
                <span style="font-weight: 600; color: var(--text-primary); text-align: right; max-width: 60%;">${dp.value}</span>
              </div>
            `).join('')}
          </div>

          <div class="gov-source-desc">
            ${src.disclaimer}
          </div>

          <div class="gov-source-footer">
            <span>Last Updated: <strong>${src.lastUpdated}</strong></span>
            ${src.actionLabel ? `
              <a href="${src.officialUrl}" target="_blank" class="demo-action-btn" style="text-decoration: none;">
                🛰️ ${src.actionLabel} &nearr;
              </a>
            ` : `
              <a href="${src.officialUrl}" target="_blank" style="color: var(--brand-primary); text-decoration: none; font-weight: 600;">
                Official Portal &nearr;
              </a>
            `}
          </div>
        </div>
      `).join('');
    }
  }

  // ========================================================================
  // 10, 11, 12. Settings, Mode Architecture & Roadmap Panel
  // ========================================================================
  renderSettingsScreen() {
    // 0. Render Integration Mode Control Card
    let modeContainer = document.getElementById('eoc-integration-mode-card');
    if (!modeContainer) {
      const settingsTab = document.querySelector('#tab-settings .table-view-container');
      if (settingsTab) {
        modeContainer = document.createElement('div');
        modeContainer.id = 'eoc-integration-mode-card';
        modeContainer.style.maxWidth = '800px';
        modeContainer.style.marginBottom = '24px';
        settingsTab.insertBefore(modeContainer, settingsTab.firstChild);
      }
    }

    if (modeContainer) {
      modeContainer.innerHTML = `
        <h2 style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">
          Production Backend Architecture &amp; Telemetry
        </h2>
        <div class="incident-card" style="padding: 16px; gap: 14px; border-left: 4px solid var(--loc-live);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-weight: 700; font-size: 14px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                <span>🛡️ Source of Truth:</span>
                <span class="auth-badge-pill" style="background: rgba(34, 197, 94, 0.2); color: #4ade80;">
                  SUPABASE PRODUCTION
                </span>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                Connected directly to Supabase PostgreSQL &amp; Realtime pipeline. Database rows are the authoritative source of truth.
              </div>
            </div>

            <div style="display: flex; gap: 8px;">
              <span class="auth-badge-pill" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; padding: 6px 12px;">
                REALTIME ACTIVE
              </span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 10px; background: var(--bg-surface-elevated); border-radius: var(--radius-sm);">
            <div>
              <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 4px;">
                Supabase Project Endpoint:
              </label>
              <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-primary);">
                https://browmylyinqukfqpcvuv.supabase.co
              </div>
            </div>
            <div>
              <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 4px;">
                Authoritative Tables:
              </label>
              <div style="font-family: var(--font-mono); font-size: 12px; color: var(--loc-live);">
                public.incidents &bull; public.resource_requests
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // 1. Render Stretch Features List
    const stretchContainer = document.getElementById('stretch-features-list');
    if (stretchContainer) {
      stretchContainer.innerHTML = STRETCH_FEATURES.map(sf => `
        <div class="roadmap-card" style="border-left: 3px solid #c084fc;">
          <div class="roadmap-card-top">
            <span class="roadmap-card-title">${sf.name}</span>
            <span class="stretch-badge">${sf.badgeLabel}</span>
          </div>
          <div class="roadmap-card-desc">${sf.description}</div>
          <div style="font-size: 11px; color: #d8b4fe; font-style: italic;">
            <strong>Implementation Status:</strong> ${sf.operationalClarification}
          </div>
        </div>
      `).join('');
    }

    // 2. Render Dedicated Roadmap Panel (8 Items)
    const roadmapContainer = document.getElementById('roadmap-features-list');
    if (roadmapContainer) {
      roadmapContainer.innerHTML = ROADMAP_FEATURES.map(rf => `
        <div class="roadmap-card" style="border-left: 3px solid var(--brand-primary);">
          <div class="roadmap-card-top">
            <span class="roadmap-card-title">${rf.name}</span>
            <span class="roadmap-badge">ROADMAP</span>
          </div>
          <div class="roadmap-card-desc">${rf.shortExplanation}</div>
          <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">
            Integrations pending official telecommunications / state infrastructure binding.
          </div>
        </div>
      `).join('');
    }

    // 3. System Connection Toggle Hook
    const toggleBackendBtn = document.getElementById('toggle-backend-btn');
    if (toggleBackendBtn) {
      toggleBackendBtn.onclick = () => state.toggleBackendConnection();
      toggleBackendBtn.textContent = state.systemStatus.backend === 'Connected'
        ? 'Simulate Connection Interruption'
        : 'Restore Backend Connection';
    }
  }

  // ========================================================================
  // 8. Global System Status Bar (Fixed Bottom)
  // ========================================================================
  renderSystemStatusBar() {
    const isConnected = state.systemStatus.backend === 'Connected';
    const isConnecting = state.systemStatus.backend === 'Connecting';
    const statusPulse = document.getElementById('footer-status-pulse');
    const backendText = document.getElementById('footer-backend-text');
    const syncText = document.getElementById('footer-sync-text');
    const freshnessText = document.getElementById('footer-freshness-text');

    if (statusPulse) {
      statusPulse.className = `status-pulse-dot ${isConnected ? '' : (isConnecting ? 'connecting' : 'interrupted')}`;
    }

    if (backendText) {
      const modeBadge = `<span style="font-family: var(--font-mono); font-size: 10px; padding: 1px 4px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 3px; margin-right: 4px; color: #34d399;">SUPABASE</span>`;
      const statusLabel = isConnected
        ? `<span style="color: var(--color-resolved);">Live EOC Connected</span>`
        : (isConnecting
          ? `<span style="color: #fbbf24;">Connecting to Realtime...</span>`
          : `<span style="color: var(--color-critical);">Disconnected</span>`);
      backendText.innerHTML = `${modeBadge}${statusLabel}`;
    }

    if (syncText) {
      syncText.innerHTML = state.systemStatus.offlinePendingSyncCount > 0
        ? `<span style="color: #fbbf24; font-weight: 700;">${state.systemStatus.offlinePendingSyncCount} Pending (Cached Ops Active)</span>`
        : `0 Pending`;
    }

    if (freshnessText) {
      freshnessText.textContent = state.systemStatus.govDataFreshness;
    }
  }
}

// Instantiate and start
export const app = new RakshaSetuApp();
window.__rakshaApp = app;

window.addEventListener('DOMContentLoaded', () => {
  app.init();
});
