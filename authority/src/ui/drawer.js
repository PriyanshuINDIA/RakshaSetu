/* ==========================================================================
   RakshaSetu Authority - Slide-Over Inspection Drawer
   Handles:
   - Incident Drawer with Response Workflow (Assign -> Responding -> Reached -> Resolve)
   - Pre-blackout Heartbeat Status with explicit accuracy and age
   - Strict Live vs Last-Known Location Disclaimers
   - Resource Request Drawer with Nearest-Need-First Priority Context
   - Shelter Details Drawer with Real-Time Capacity Management
   ========================================================================== */

import { state } from '../state/state.js';

class DrawerController {
  constructor() {
    this.drawerEl = null;
    this.backdropEl = null;
    this.miniMap = null;
  }

  init() {
    this.drawerEl = document.getElementById('ops-drawer');
    this.backdropEl = document.getElementById('drawer-backdrop');

    if (this.backdropEl) {
      this.backdropEl.addEventListener('click', () => state.closeDrawer());
    }

    // Keyboard ESC to close drawer
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isDrawerOpen) {
        state.closeDrawer();
      }
    });

    state.subscribe('drawerOpened', () => this.render());
    state.subscribe('drawerClosed', () => this.hide());
    state.subscribe('incidentUpdated', () => {
      if (state.isDrawerOpen && state.drawerType === 'incident') this.render();
    });
    state.subscribe('resourceUpdated', () => {
      if (state.isDrawerOpen && state.drawerType === 'resource') this.render();
    });
    state.subscribe('shelterUpdated', () => {
      if (state.isDrawerOpen && state.drawerType === 'shelter') this.render();
    });
    state.subscribe('heartbeatAged', () => {
      if (state.isDrawerOpen && state.drawerType === 'incident') this.updateHeartbeatAgeOnly();
    });
  }

  hide() {
    if (this.drawerEl) this.drawerEl.classList.remove('open');
    if (this.backdropEl) this.backdropEl.classList.remove('open');
    if (this.miniMap) {
      this.miniMap.remove();
      this.miniMap = null;
    }
  }

  render() {
    if (!this.drawerEl) return;
    this.drawerEl.classList.add('open');
    if (this.backdropEl) this.backdropEl.classList.add('open');

    if (state.drawerType === 'incident') {
      this.renderIncidentDrawer();
    } else if (state.drawerType === 'resource') {
      this.renderResourceDrawer();
    } else if (state.drawerType === 'shelter') {
      this.renderShelterDrawer();
    }
  }

  // ========================================================================
  // 1. INCIDENT DRAWER
  // ========================================================================
  renderIncidentDrawer() {
    const inc = state.getIncident(state.selectedIncidentId);
    if (!inc) return;

    const isLive = String(inc.locationType || '').toUpperCase().includes('LIVE');
    const isLastKnown = !isLive;
    const ageMin = Math.floor((inc.heartbeatAgeSec || 0) / 60);
    const ageText = ageMin > 0 ? `${ageMin}m ${inc.heartbeatAgeSec % 60}s ago` : `${inc.heartbeatAgeSec || 0}s ago`;

    this.drawerEl.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title-group">
          <div class="drawer-id-row">
            <span class="drawer-id" title="${inc.id}">${inc.displayId || inc.id}</span>
            <span class="priority-badge ${inc.priority.toLowerCase()}">${inc.priority}</span>
            <span class="status-badge ${inc.status.toLowerCase()}">${inc.status}</span>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
            <span>Citizen: <strong>${inc.citizenName}</strong></span>
            <span>&bull;</span>
            <span style="font-family: var(--font-mono);">${inc.phone}</span>
          </div>
        </div>
        <button class="drawer-close-btn" id="drawer-close-trigger" title="Close Drawer (Esc)">
          ✕
        </button>
      </div>

      <div class="drawer-body">
        <!-- CRITICAL CALLOUT: LAST KNOWN LOCATION DISCLAIMER -->
        ${isLastKnown ? `
          <div class="ops-callout">
            <span style="font-size: 16px;">⚠️</span>
            <div>
              <strong>LAST-KNOWN POSITION DISCLAIMER:</strong><br/>
              Last-known location is not guaranteed to represent the citizen's current position. Signal reflects last recorded heartbeat before communication degradation.
            </div>
          </div>
        ` : ''}

        <!-- LOCATION & ACCURACY SECTION -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <span>Geospatial Position &amp; Signal Fix</span>
            <span class="location-type-badge ${isLive ? 'live' : 'last-known'}">${inc.locationType}</span>
          </div>

          <div class="details-grid">
            <div class="detail-item">
              <span class="detail-label">Reported Location</span>
              <span class="detail-value" style="font-family: var(--font-sans); font-size: 12px;">${inc.locationName}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">GPS Coordinates</span>
              <span class="detail-value">${inc.coordinates ? `${inc.coordinates[0].toFixed(4)}° N, ${inc.coordinates[1].toFixed(4)}° E` : 'Coordinates Pending'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Horizontal Accuracy</span>
              <span class="detail-value" style="color: #38bdf8;">&plusmn;${inc.accuracyMeters} meters</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Initial SOS Time</span>
              <span class="detail-value">${new Date(inc.receivedAt).toLocaleTimeString('en-IN', { hour12: false })} IST</span>
            </div>
          </div>

          <!-- Interactive Mini Map Crop -->
          <div class="drawer-map-preview" id="drawer-mini-map"></div>
        </div>

        <!-- OPERATIONAL ASSIGNMENT & RESCUE TEAM SECTION -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <span>Operational Assignment &amp; Rescue Team</span>
            <span class="status-badge ${inc.status.toLowerCase()}">${inc.status}</span>
          </div>

          <div class="details-grid">
            <div class="detail-item">
              <span class="detail-label">Assigned Rescue Team</span>
              <span class="detail-value" style="font-family: var(--font-sans); font-weight: 700; color: ${inc.assignedTeam ? '#38bdf8' : 'var(--text-muted)'};">
                ${inc.assignedTeam ? `🚑 ${inc.assignedTeam}` : '⚠️ Unassigned'}
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Current Status</span>
              <span class="detail-value" style="font-weight: 700;">${inc.status}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Assigned Vehicle</span>
              <span class="detail-value" style="font-family: var(--font-sans); font-size: 12px;">${inc.vehicleAssigned || (inc.assignedTeam ? 'Tactical Logistics Carrier' : 'None Assigned')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Estimated Response ETA</span>
              <span class="detail-value" style="color: #38bdf8;">${inc.etaMinutes ? `${inc.etaMinutes} mins` : (inc.assignedTeam ? '15 mins' : 'N/A')}</span>
            </div>
          </div>
        </div>

        <!-- PRE-BLACKOUT HEARTBEAT & TELEMETRY SECTION -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <span>Pre-Blackout Heartbeat Telemetry</span>
            <span class="status-badge" style="color: #a78bfa;">Section 4 Resilient Engine</span>
          </div>

          <div class="details-grid">
            <div class="detail-item">
              <span class="detail-label">Last Heartbeat Ping</span>
              <span class="detail-value" id="drawer-hb-time">${new Date(inc.lastHeartbeatTime || inc.receivedAt).toLocaleTimeString('en-IN', { hour12: false })}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Heartbeat Age</span>
              <span class="detail-value" id="drawer-hb-age" style="color: ${inc.heartbeatStatus === 'Recent' ? 'var(--loc-live)' : (inc.heartbeatStatus === 'Aging' ? 'var(--loc-last-known)' : 'var(--color-critical)')};">
                ${ageText} (${inc.heartbeatStatus})
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Network Channel</span>
              <span class="detail-value" style="font-family: var(--font-sans); font-size: 12px;">${inc.networkState}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Network Telemetry</span>
              <span class="detail-value" style="font-size: 11px; font-family: var(--font-sans); color: var(--text-secondary);">
                ${inc.networkDetails || 'Emergency telemetry packet'}
              </span>
            </div>
          </div>
        </div>

        <!-- DISTRESS MESSAGE & MEDICAL ALERTS -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <span>Citizen Distress Message</span>
            ${inc.medicalFlag ? '<span class="medical-flag">🚨 MEDICAL EMERGENCY</span>' : ''}
          </div>
          <div style="padding: 12px; background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); border-radius: var(--radius-md); font-size: 13px; line-height: 1.5; color: #f1f5f9;">
            &ldquo;${inc.message}&rdquo;
          </div>
          ${inc.medicalFlag ? `
            <div style="padding: 10px 12px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-md); font-size: 12px; color: #fca5a5;">
              <strong>Medical Context:</strong> ${inc.medicalDetails || 'Medical emergency indicated by citizen.'}
            </div>
          ` : ''}
        </div>

        <!-- RESOURCE REQUIREMENTS -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <span>Identified Resource Needs</span>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${(inc.resourceNeeds || []).map(r => `
              <span class="status-badge" style="background: rgba(147, 51, 234, 0.15); color: #d8b4fe; border-color: rgba(147, 51, 234, 0.35);">
                📦 ${r}
              </span>
            `).join('')}
          </div>
        </div>

        <!-- OPERATIONAL RESCUE TIMELINE -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <span>Response Timeline &amp; Audit Trail</span>
          </div>
          <div class="response-timeline">
            ${(inc.timeline || []).map((item, idx) => {
              const isLast = idx === inc.timeline.length - 1;
              return `
                <div class="timeline-step ${isLast ? 'current' : 'completed'}">
                  <div class="timeline-dot"></div>
                  <div class="timeline-label">${item.step} &bull; <span style="font-family: var(--font-mono); font-size: 11px; font-weight: normal; color: var(--text-muted);">${item.time}</span></div>
                  <div class="timeline-meta">${item.note}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- FIELD NOTES -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            <span>Field Notes &amp; Observations</span>
            <button class="demo-action-btn secondary" style="padding: 2px 8px; font-size: 11px;" id="add-note-btn">
              + Add Note
            </button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${(!inc.notes || inc.notes.length === 0) ? '<div style="font-size: 12px; color: var(--text-muted); font-style: italic;">No notes added yet.</div>' : ''}
            ${(inc.notes || []).map(note => `
              <div style="padding: 8px 10px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); font-size: 12px; color: var(--text-secondary);">
                ${note}
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- WORKFLOW ACTIONS FOOTER -->
      <div class="drawer-footer">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
          Operational Action Sequence:
        </div>
        <div class="drawer-actions-row">
          ${this.renderIncidentActionButtons(inc)}
        </div>
      </div>
    `;

    // Hook Close Button
    document.getElementById('drawer-close-trigger').addEventListener('click', () => state.closeDrawer());

    // Hook Add Note
    document.getElementById('add-note-btn').addEventListener('click', async () => {
      const note = prompt("Enter operational note / field update:");
      if (note) await state.addIncidentNote(inc.id, note);
    });

    // Render Mini Map
    setTimeout(() => this.renderMiniMap(inc.coordinates, inc.accuracyMeters, isLive), 100);
  }

  renderIncidentActionButtons(inc) {
    const rawSt = String(inc.rawStatus || inc.status || '').toUpperCase();

    if (rawSt === 'UNASSIGNED') {
      return `
        <button class="workflow-step-btn" id="drawer-action-assign" style="background: var(--brand-primary); color: white;" onclick="window.__rakshaModal.openTeamAssignment('${inc.id}')">
          🚑 Assign Team
        </button>
      `;
    }
    if (rawSt === 'ASSIGNED') {
      return `
        <button class="workflow-step-btn" id="drawer-action-dispatch" style="background: var(--color-high); color: white;" onclick="window.__rakshaDrawerAdvance('${inc.id}', 'Responding', this)">
          ⚡ Dispatch / Mark Responding
        </button>
      `;
    }
    if (rawSt === 'RESPONDING') {
      return `
        <button class="workflow-step-btn" id="drawer-action-reached" style="background: #059669; color: white;" onclick="window.__rakshaDrawerAdvance('${inc.id}', 'Reached', this)">
          📍 Mark Reached
        </button>
      `;
    }
    if (rawSt === 'REACHED') {
      return `
        <button class="workflow-step-btn" id="drawer-action-resolve" style="background: var(--color-resolved); color: white;" onclick="window.__rakshaDrawerAdvance('${inc.id}', 'Resolved', this)">
          ✅ Resolve Incident
        </button>
      `;
    }
    return `
      <div style="flex: 1; text-align: center; font-size: 12px; font-weight: 700; color: var(--color-resolved); padding: 8px;">
        ✨ Incident Resolved and Closed
      </div>
    `;
  }

  renderMiniMap(coordinates, accuracyMeters, isLive) {
    const container = document.getElementById('drawer-mini-map');
    if (!container || !window.L) return;

    if (this.miniMap) {
      this.miniMap.remove();
      this.miniMap = null;
    }

    this.miniMap = window.L.map(container, {
      center: coordinates,
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });

    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.miniMap);

    const markerColor = isLive ? '#22c55e' : '#f59e0b';
    window.L.circleMarker(coordinates, {
      radius: 8,
      color: 'white',
      weight: 2,
      fillColor: markerColor,
      fillOpacity: 1
    }).addTo(this.miniMap);

    window.L.circle(coordinates, {
      radius: accuracyMeters,
      color: markerColor,
      weight: 1.5,
      dashArray: isLive ? null : '4, 4',
      fillColor: markerColor,
      fillOpacity: 0.15
    }).addTo(this.miniMap);
  }

  updateHeartbeatAgeOnly() {
    const inc = state.getIncident(state.selectedIncidentId);
    if (!inc) return;
    const ageMin = Math.floor((inc.heartbeatAgeSec || 0) / 60);
    const ageText = ageMin > 0 ? `${ageMin}m ${(inc.heartbeatAgeSec || 0) % 60}s ago` : `${inc.heartbeatAgeSec || 0}s ago`;

    const el = document.getElementById('drawer-hb-age');
    if (el) {
      el.textContent = `${ageText} (${inc.heartbeatStatus})`;
      el.style.color = inc.heartbeatStatus === 'Recent' ? 'var(--loc-live)' : (inc.heartbeatStatus === 'Aging' ? 'var(--loc-last-known)' : 'var(--color-critical)');
    }
  }

  // ========================================================================
  // 2. RESOURCE REQUEST DRAWER
  // ========================================================================
  renderResourceDrawer() {
    const res = state.getResource(state.selectedResourceId);
    if (!res) return;

    this.drawerEl.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title-group">
          <div class="drawer-id-row">
            <span class="drawer-id">${res.id}</span>
            <span class="priority-badge ${res.priority.toLowerCase()}">${res.priority}</span>
            <span class="status-badge">${res.status}</span>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary);">
            Category: <strong>${res.category} Supply</strong>
          </div>
        </div>
        <button class="drawer-close-btn" id="drawer-close-trigger">✕</button>
      </div>

      <div class="drawer-body">
        <!-- STRETCH EXPLAINABLE HEURISTIC CALLOUT -->
        <div class="ops-callout info">
          <span style="font-size: 16px;">ℹ️</span>
          <div>
            <strong>STRETCH: NEAREST-NEED-FIRST PRIORITIZATION</strong><br/>
            Prioritization based on need, urgency and location. <em>No unverified AI-based automated optimization.</em><br/>
            <strong>Rationale:</strong> ${res.stretchPrioritizationRationale || 'Optimized by proximity and critical need.'}
          </div>
        </div>

        <div class="drawer-section">
          <div class="drawer-section-title">Requested Supply Spec</div>
          <div style="padding: 12px; background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); border-radius: var(--radius-md); font-size: 14px; font-weight: 700; color: #e2e8f0;">
            📦 ${res.need}
          </div>
        </div>

        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Delivery Location</span>
            <span class="detail-value" style="font-family: var(--font-sans); font-size: 12px;">${res.location}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Logged Timestamp</span>
            <span class="detail-value">${new Date(res.requestedAt).toLocaleTimeString('en-IN', { hour12: false })}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Assigned Carrier / Team</span>
            <span class="detail-value" style="font-family: var(--font-sans); font-size: 12px; font-weight: 700; color: ${res.assignedTeam ? '#60a5fa' : 'var(--text-muted)'};">${res.assignedTeam || 'Unassigned'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Urgency Context</span>
            <span class="detail-value" style="font-family: var(--font-sans); font-size: 12px; color: #fbbf24;">${res.urgencyContext}</span>
          </div>
        </div>

        <div class="drawer-section">
          <div class="drawer-section-title">Logistics Notes</div>
          <div style="padding: 10px; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); font-size: 12px; color: var(--text-secondary);">
            ${res.notes}
          </div>
        </div>
      </div>

      <div class="drawer-footer">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">
          Supply Workflow Progression:
        </div>
        ${this.renderResourceActionControls(res)}
      </div>
    `;

    document.getElementById('drawer-close-trigger').addEventListener('click', () => state.closeDrawer());
  }

  renderResourceActionControls(res) {
    const teams = state.rescueTeams || [];
    const availableTeams = teams.filter(t => String(t.status || '').toUpperCase() === 'AVAILABLE' && !t.currentIncidentId);
    const teamOptions = (availableTeams.length > 0 ? availableTeams : teams).map(t => `
      <option value="${t.id}" data-name="${t.name}" ${res.assignedTeamId === t.id || res.assignedTeam === t.name ? 'selected' : ''}>
        ${t.name} (${t.status || 'AVAILABLE'})
      </option>
    `).join('');

    if (res.status === 'Pending') {
      return `
        <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label for="drawer-team-select" style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">
              Assign Rescue / Relief Team:
            </label>
            <select id="drawer-team-select" class="filter-select" style="width: 100%; padding: 8px; background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 12px;">
              ${teamOptions}
            </select>
          </div>
          <button class="workflow-step-btn" style="background: var(--brand-primary); color: white; width: 100%; justify-content: center; padding: 10px;" onclick="window.__rakshaState.handleAssignResourceTeam('${res.id}')">
            🚑 Assign Team (Pending &rarr; Assigned)
          </button>
          <button class="workflow-step-btn" style="background: transparent; border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; width: 100%; justify-content: center; padding: 6px 10px; font-size: 11px;" onclick="window.__rakshaState.updateResourceStatus('${res.id}', 'Cancelled')">
            ✕ Cancel Request (Pending &rarr; Cancelled)
          </button>
        </div>
      `;
    }

    if (res.status === 'Assigned') {
      return `
        <div class="drawer-actions-row" style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
          <button class="workflow-step-btn" style="background: #d97706; color: white; width: 100%; justify-content: center; padding: 10px;" onclick="window.__rakshaState.updateResourceStatus('${res.id}', 'In Transit')">
            🚚 MARK IN TRANSIT (ASSIGNED &rarr; IN TRANSIT)
          </button>
          <button class="workflow-step-btn" style="background: transparent; border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; width: 100%; justify-content: center; padding: 6px 10px; font-size: 11px;" onclick="window.__rakshaState.updateResourceStatus('${res.id}', 'Cancelled')">
            ✕ Cancel Request (Assigned &rarr; Cancelled)
          </button>
        </div>
      `;
    }

    if (res.status === 'In Transit' || res.status === 'In Progress') {
      return `
        <div class="drawer-actions-row" style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
          <button class="workflow-step-btn" style="background: #2563eb; color: white; width: 100%; justify-content: center; padding: 10px;" onclick="window.__rakshaState.updateResourceStatus('${res.id}', 'Delivered')">
            📦 Mark Delivered (In Transit &rarr; Delivered)
          </button>
        </div>
      `;
    }

    if (res.status === 'Delivered' || res.status === 'Fulfilled') {
      return `
        <div style="flex: 1; text-align: center; color: var(--color-resolved); font-weight: 700; padding: 10px; font-size: 13px;">
          ✅ Resource Request Delivered
        </div>
      `;
    }

    if (res.status === 'Cancelled') {
      return `
        <div style="flex: 1; text-align: center; color: var(--color-critical); font-weight: 700; padding: 10px; font-size: 13px;">
          ✕ Resource Request Cancelled
        </div>
      `;
    }

    return `
      <div style="flex: 1; text-align: center; color: var(--color-resolved); font-weight: 700; padding: 8px;">
        ✅ Resource Request Completed
      </div>
    `;
  }

  // ========================================================================
  // 3. SHELTER DRAWER
  // ========================================================================
  renderShelterDrawer() {
    const sh = state.getShelter(state.selectedShelterId);
    if (!sh) return;

    const percent = Math.round((sh.currentOccupancy / sh.totalCapacity) * 100);
    const isActive = sh.active !== false;
    const statusColor = isActive ? '#22c55e' : '#ef4444';

    this.drawerEl.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title-group">
          <div class="drawer-id-row" style="flex-wrap: wrap; gap: 6px; align-items: center;">
            <span class="drawer-id">${sh.id}</span>
            <span class="status-badge" style="color: ${statusColor}; border-color: ${statusColor};">
              ${isActive ? '🟢 ACTIVE' : '🔴 CLOSED / INACTIVE'}
            </span>
            ${sh.isDemo ? `
              <span class="status-badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border-color: rgba(245, 158, 11, 0.4); font-weight: 700;">
                PROTOTYPE SHELTER
              </span>
            ` : ''}
          </div>
          <div style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin-top: 4px;">
            ${sh.name}
          </div>
        </div>
        <button class="drawer-close-btn" id="drawer-close-trigger">✕</button>
      </div>

      <div class="drawer-body">
        ${sh.isDemo ? `
          <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: var(--radius-md); font-size: 11px; line-height: 1.45; color: #fde68a;">
            <strong>⚠️ SIH Prototype Demonstration Data</strong><br>
            Configured strictly for demonstrating authority-controlled shelter designation and citizen synchronization. This is prototype data and not an official emergency shelter designation by the Munger district administration.
          </div>
        ` : ''}

        <div class="drawer-section">
          <div class="drawer-section-title">Capacity &amp; Intake Status</div>
          <div style="padding: 16px; background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 13px;">
              <span>Occupants: <strong>${sh.currentOccupancy}</strong> / ${sh.totalCapacity}</span>
              <strong style="color: ${percent > 90 ? 'var(--color-critical)' : 'var(--loc-live)'};">${percent}% Capacity</strong>
            </div>
            <div style="height: 8px; width: 100%; background: #334155; border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${Math.min(100, percent)}%; background: ${percent > 90 ? 'var(--color-critical)' : 'var(--brand-primary)'};"></div>
            </div>
          </div>
        </div>

        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Address / Landmark</span>
            <span class="detail-value" style="font-family: var(--font-sans); font-size: 12px;">${sh.address || sh.location}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">GIS Coordinates</span>
            <span class="detail-value" style="font-family: var(--font-mono); font-size: 11px; color: ${sh.coordinates ? 'var(--text-primary)' : '#fbbf24'};">
              ${sh.coordinates ? `${sh.coordinates[0].toFixed(4)}, ${sh.coordinates[1].toFixed(4)}` : 'Pending Survey (Unmapped)'}
            </span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Medical Staff</span>
            <span class="detail-value" style="font-family: var(--font-sans); font-size: 12px;">${sh.medicalStaff}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Power Status</span>
            <span class="detail-value" style="font-family: var(--font-sans); font-size: 12px;">${sh.generatorStatus}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Contact Coordination</span>
            <span class="detail-value" style="font-family: var(--font-sans); font-size: 11px;">${sh.contactPerson}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Intake Availability</span>
            <span class="detail-value" style="font-family: var(--font-sans); font-size: 12px; font-weight: 700; color: ${statusColor};">
              ${isActive ? 'Active (Open for Intake)' : 'Closed / Inactive'}
            </span>
          </div>
        </div>

        <div class="drawer-section">
          <div class="drawer-section-title">Available Active Facilities</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${(sh.services || []).map(s => `
              <span class="status-badge" style="background: rgba(2, 132, 199, 0.15); color: #7dd3fc; border-color: rgba(2, 132, 199, 0.35);">
                ✓ ${s}
              </span>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="drawer-footer">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">
          Authority Operational Controls:
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div class="drawer-actions-row">
            ${isActive ? `
              <button class="workflow-step-btn" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.5); flex: 1; justify-content: center;" onclick="window.__rakshaState.setShelterActive('${sh.id}', false)">
                🔴 Deactivate / Close Shelter
              </button>
            ` : `
              <button class="workflow-step-btn" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.5); flex: 1; justify-content: center;" onclick="window.__rakshaState.setShelterActive('${sh.id}', true)">
                🟢 Activate Shelter for Public Intake
              </button>
            `}
            <button class="workflow-step-btn" style="background: var(--bg-surface-active); color: var(--text-primary); flex: 1; justify-content: center;" onclick="window.__rakshaModal.openDesignateShelterModal('${sh.id}')">
              ✏️ Edit Information
            </button>
          </div>

          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-top: 4px;">
            Intake Adjustment:
          </div>
          <div class="drawer-actions-row">
            <button class="workflow-step-btn" style="background: var(--bg-surface-active); color: var(--text-primary); flex: 1; justify-content: center;" onclick="window.__rakshaState.updateShelterOccupancy('${sh.id}', 10)">
              +10 Evacuees Arrived
            </button>
            <button class="workflow-step-btn" style="background: var(--bg-surface-active); color: var(--text-primary); flex: 1; justify-content: center;" onclick="window.__rakshaState.updateShelterOccupancy('${sh.id}', -10)">
              -10 Transferred Out
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('drawer-close-trigger').addEventListener('click', () => state.closeDrawer());
  }
}

export const drawer = new DrawerController();

window.__rakshaDrawerAdvance = async function(incidentId, nextStatus, btnEl) {
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.dataset.originalHtml = btnEl.innerHTML;
    btnEl.innerHTML = `<span>⏳ Updating Supabase...</span>`;
  }
  try {
    const ok = await window.__rakshaState.updateIncidentStatus(incidentId, nextStatus);
    if (!ok && btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = btnEl.dataset.originalHtml || nextStatus;
    }
  } catch (err) {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = btnEl.dataset.originalHtml || nextStatus;
    }
  }
};
