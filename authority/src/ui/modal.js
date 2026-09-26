/* ==========================================================================
   RakshaSetu Authority - Modal System (Team Assignment & Notes)
   Section 7: Team Assignment Workflow
   Select: Rescue Team, Vehicle/Resource, Estimated response, Notes
   ========================================================================== */

import { state } from '../state/state.js';
import { isValidCoordinate } from '../services/heartbeatService.js';
import { DEMO_SHELTER_NAME } from '../services/shelterService.js';

class ModalManager {
  constructor() {
    this.overlayEl = null;
    this.dialogEl = null;
    this.activeIncidentId = null;
  }

  init() {
    this.overlayEl = document.getElementById('modal-overlay');
    this.dialogEl = document.getElementById('modal-dialog');

    if (this.overlayEl) {
      this.overlayEl.addEventListener('click', (e) => {
        if (e.target === this.overlayEl) this.closeModal();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.closeModal();
      }
    });
  }

  isOpen() {
    return this.overlayEl && this.overlayEl.classList.contains('open');
  }

  closeModal() {
    if (this.overlayEl) this.overlayEl.classList.remove('open');
  }

  openTeamAssignment(incidentId) {
    this.activeIncidentId = incidentId;
    const inc = state.getIncident(incidentId);
    if (!inc) return;

    this.dialogEl.innerHTML = `
      <div style="padding: 16px 20px; background: var(--bg-surface-elevated); border-bottom: 1px solid var(--border-medium); display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🚑</span>
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">Assign Rescue Team</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Incident ${inc.id} &bull; ${inc.locationName}</div>
          </div>
        </div>
        <button id="modal-close-btn" style="background: transparent; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer;">✕</button>
      </div>

      <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px;">
        <!-- Incident Context Quick Summary -->
        <div style="padding: 10px 12px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: var(--radius-md); font-size: 12px;">
          <strong>Distress Summary:</strong> ${inc.message.substring(0, 100)}...
          ${inc.medicalFlag ? '<div style="color: #f87171; font-weight: 700; margin-top: 4px;">🚨 Requires Medical Extraction Support</div>' : ''}
        </div>

        <!-- 1. Select Rescue Team -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
            Available Rescue Team:
          </label>
          <select id="modal-team-select" class="filter-select" style="width: 100%;">
            ${state.rescueTeams.length === 0 ? '<option value="" disabled selected>No rescue teams registered in system</option>' : ''}
            ${state.rescueTeams.map(t => {
              const isAvail = String(t.status || '').toUpperCase() === 'AVAILABLE' && !t.currentIncidentId;
              const teamType = t.teamType || t.type || 'Rescue Unit';
              return `
                <option value="${t.id}" ${isAvail ? '' : 'disabled'}>
                  ${t.name} [${t.status}] &bull; ${teamType}${isAvail ? ' (Available)' : ' (Unavailable)'}
                </option>
              `;
            }).join('')}
          </select>
          ${!state.rescueTeams.some(t => String(t.status || '').toUpperCase() === 'AVAILABLE' && !t.currentIncidentId) ? `
            <div style="font-size: 11px; color: #ef4444; margin-top: 2px;">
              ⚠️ All rescue teams are currently deployed or unavailable in Supabase.
            </div>
          ` : ''}
        </div>

        <!-- 2. Select Vehicle / Equipment -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
            Deployed Vehicle / Primary Equipment:
          </label>
          <select id="modal-vehicle-select" class="filter-select" style="width: 100%;">
            <option value="4x4 Swift-Water Rescue Truck + Inflatable Boat">4x4 Swift-Water Rescue Truck + Inflatable Boat</option>
            <option value="Light Tactical All-Terrain Vehicle (Slope Rig)">Light Tactical All-Terrain Vehicle (Slope Rig)</option>
            <option value="Heavy Troop Carrier &amp; Hydraulic Shoring Unit">Heavy Troop Carrier &amp; Hydraulic Shoring Unit</option>
            <option value="Emergency Rescue Tender with Power Chainsaws">Emergency Rescue Tender with Power Chainsaws</option>
            <option value="Standard Medical Ambulance Carrier">Standard Medical Ambulance Carrier</option>
          </select>
        </div>

        <!-- 3. Estimated Response Time (ETA) -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
            Estimated Arrival Time (Minutes):
          </label>
          <input type="number" id="modal-eta-input" class="search-input" value="15" min="1" max="180" style="width: 100%;" />
        </div>

        <!-- 4. Operational Dispatch Notes -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
            Dispatch Directives / Terrain Notes:
          </label>
          <textarea id="modal-notes-input" class="search-input" rows="2" style="width: 100%; resize: vertical;" placeholder="e.g. Caution: Bridge flooded; enter via Munger bypass road."></textarea>
        </div>
      </div>

      <div style="padding: 16px 20px; background: var(--bg-surface-elevated); border-top: 1px solid var(--border-medium); display: flex; justify-content: flex-end; gap: 10px;">
        <button class="action-btn-secondary" id="modal-cancel-btn">Cancel</button>
        <button class="action-btn-primary" id="modal-confirm-btn" style="background: var(--brand-primary);" ${!state.rescueTeams.some(t => String(t.status || '').toUpperCase() === 'AVAILABLE' && !t.currentIncidentId) ? 'disabled' : ''}>
          Confirm Team Dispatch &rarr;
        </button>
      </div>
    `;

    // Pre-select first available team
    const teamSelectEl = document.getElementById('modal-team-select');
    if (teamSelectEl) {
      const firstAvail = Array.from(teamSelectEl.options).find(opt => !opt.disabled && opt.value);
      if (firstAvail) teamSelectEl.value = firstAvail.value;
    }

    document.getElementById('modal-close-btn').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => this.closeModal());

    document.getElementById('modal-confirm-btn').addEventListener('click', async () => {
      const teamSelect = document.getElementById('modal-team-select');
      const teamId = teamSelect ? teamSelect.value : null;
      const vehicle = document.getElementById('modal-vehicle-select')?.value || 'Emergency Rescue Tender';
      const eta = document.getElementById('modal-eta-input')?.value || 15;
      const note = document.getElementById('modal-notes-input')?.value || '';

      if (!teamId) {
        alert('Please select an available rescue team.');
        return;
      }

      console.log('[RakshaSetu][Authority][Modal] Confirm dispatch clicked with team ID:', {
        incidentId: this.activeIncidentId,
        selectedTeamId: teamId,
        vehicle,
        eta,
        note
      });

      const confirmBtn = document.getElementById('modal-confirm-btn');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Dispatching to Supabase...';
      }

      const success = await state.assignTeamToIncident(this.activeIncidentId, teamId, vehicle, eta, note);
      if (success) {
        this.closeModal();
      } else {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = 'Confirm Team Dispatch &rarr;';
        }
      }
    });

    this.overlayEl.classList.add('open');
  }

  // ========================================================================
  // Safe Shelter Designation & Management Modal
  // ========================================================================
  openDesignateShelterModal(shelterIdToEdit = null) {
    const isEdit = Boolean(shelterIdToEdit);
    const existing = isEdit ? state.getShelter(shelterIdToEdit) : null;

    const modalTitle = isEdit ? 'Update Shelter Information' : 'Designate Emergency Shelter';
    const confirmLabel = isEdit ? 'Save Changes &rarr;' : 'Designate Shelter &rarr;';

    const defaultName = existing ? existing.name : '';
    const defaultAddress = existing ? (existing.address || existing.location || '') : '';
    const defaultTotalCap = existing ? existing.totalCapacity : 200;
    const defaultCurrentOcc = existing ? existing.currentOccupancy : 0;
    const defaultActive = existing ? existing.active : true;
    const defaultLat = existing && existing.latitude != null ? existing.latitude : '';
    const defaultLng = existing && existing.longitude != null ? existing.longitude : '';
    const defaultPhone = existing ? (existing.contactPerson || '') : '';

    this.dialogEl.innerHTML = `
      <div style="padding: 16px 20px; background: var(--bg-surface-elevated); border-bottom: 1px solid var(--border-medium); display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">⛺</span>
          <div>
            <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${modalTitle}</div>
            <div style="font-size: 11px; color: var(--text-secondary);">Authority Emergency Operations Console &bull; Supabase public.shelters</div>
          </div>
        </div>
        <button id="modal-shelter-close-btn" style="background: transparent; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer;">✕</button>
      </div>

      <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px; max-height: 70vh; overflow-y: auto;">
        ${!isEdit ? `
          <!-- Quick Fill Demo Prototype Banner -->
          <div style="padding: 12px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
            <div>
              <div style="font-size: 12px; font-weight: 700; color: var(--text-primary);">SIH Prototype Demonstration</div>
              <div style="font-size: 11px; color: var(--text-secondary);">Populate prototype data for Government Engineering College, Munger.</div>
            </div>
            <button type="button" id="modal-shelter-quickfill-btn" style="padding: 6px 12px; background: rgba(59, 130, 246, 0.25); border: 1px solid rgba(59, 130, 246, 0.5); border-radius: var(--radius-sm); color: #93c5fd; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap;">
              ⚡ Quick-Fill GEC Munger
            </button>
          </div>
        ` : ''}

        <div id="modal-shelter-alert" style="display: none; padding: 10px 12px; border-radius: var(--radius-sm); font-size: 12px; line-height: 1.4; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5;"></div>

        <!-- 1. Shelter Name -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
            Shelter Name <span style="color: #ef4444;">*</span>
          </label>
          <input type="text" id="modal-shelter-name" class="search-input" value="${defaultName}" placeholder="e.g. Government Engineering College, Munger" style="width: 100%;" required />
        </div>

        <!-- 2. Address / Sector Location -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
            Address / Sector Landmark
          </label>
          <input type="text" id="modal-shelter-address" class="search-input" value="${defaultAddress}" placeholder="e.g. Munger, Bihar (Demonstration Site)" style="width: 100%;" />
        </div>

        <!-- 3. Capacity & Occupancy -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
              Total Capacity (Beds/Persons) <span style="color: #ef4444;">*</span>
            </label>
            <input type="number" id="modal-shelter-capacity" class="search-input" value="${defaultTotalCap}" min="1" max="10000" style="width: 100%;" required />
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
              Current Evacuees (Intake)
            </label>
            <input type="number" id="modal-shelter-occupancy" class="search-input" value="${defaultCurrentOcc}" min="0" max="10000" style="width: 100%;" />
          </div>
        </div>

        <!-- 4. Operational Status -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
            Intake Status:
          </label>
          <select id="modal-shelter-status" class="filter-select" style="width: 100%;">
            <option value="true" ${defaultActive ? 'selected' : ''}>Active (Open for Citizen Intake)</option>
            <option value="false" ${!defaultActive ? 'selected' : ''}>Inactive / Closed (Intake Suspended)</option>
          </select>
        </div>

        <!-- 5. Coordinates (Optional & Verified Only) -->
        <div style="padding: 12px; background: var(--bg-surface-elevated); border: 1px solid var(--border-medium); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
              GIS Coordinates (Verified GPS Fix Only)
            </label>
            <span style="font-size: 10px; color: #fbbf24;">Leave blank if unverified</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <input type="number" step="any" id="modal-shelter-lat" class="search-input" value="${defaultLat}" placeholder="Latitude (e.g. 25.3757)" style="width: 100%;" />
            </div>
            <div>
              <input type="number" step="any" id="modal-shelter-lng" class="search-input" value="${defaultLng}" placeholder="Longitude (e.g. 86.4735)" style="width: 100%;" />
            </div>
          </div>
          <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.3;">
            Unverified coordinates remain empty to prevent misdirecting evacuees to incorrect locations.
          </div>
        </div>

        <!-- 6. Emergency Contact -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
            Emergency Contact Coordination
          </label>
          <input type="text" id="modal-shelter-phone" class="search-input" value="${defaultPhone}" placeholder="e.g. Camp Coordinator / Demo Control Desk" style="width: 100%;" />
        </div>
      </div>

      <div style="padding: 16px 20px; background: var(--bg-surface-elevated); border-top: 1px solid var(--border-medium); display: flex; justify-content: flex-end; gap: 10px;">
        <button class="action-btn-secondary" id="modal-shelter-cancel-btn">Cancel</button>
        <button class="action-btn-primary" id="modal-shelter-confirm-btn" style="background: var(--brand-primary);">
          ${confirmLabel}
        </button>
      </div>
    `;

    const closeBtn = document.getElementById('modal-shelter-close-btn');
    const cancelBtn = document.getElementById('modal-shelter-cancel-btn');
    const quickfillBtn = document.getElementById('modal-shelter-quickfill-btn');
    const confirmBtn = document.getElementById('modal-shelter-confirm-btn');
    const alertEl = document.getElementById('modal-shelter-alert');

    const showAlert = (msg) => {
      if (!alertEl) return;
      if (!msg) {
        alertEl.style.display = 'none';
        return;
      }
      alertEl.style.display = 'block';
      alertEl.textContent = msg;
    };

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());

    if (quickfillBtn) {
      quickfillBtn.addEventListener('click', () => {
        document.getElementById('modal-shelter-name').value = `${DEMO_SHELTER_NAME} (Demo Shelter)`;
        document.getElementById('modal-shelter-address').value = 'Munger, Bihar (Prototype Facility)';
        document.getElementById('modal-shelter-capacity').value = 500;
        document.getElementById('modal-shelter-occupancy').value = 0;
        document.getElementById('modal-shelter-status').value = 'true';
        document.getElementById('modal-shelter-lat').value = '';
        document.getElementById('modal-shelter-lng').value = '';
        document.getElementById('modal-shelter-phone').value = 'Demo Control Desk';
        showAlert(null);
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const nameVal = document.getElementById('modal-shelter-name')?.value?.trim();
        const addressVal = document.getElementById('modal-shelter-address')?.value?.trim();
        const capVal = Number(document.getElementById('modal-shelter-capacity')?.value);
        const occVal = Number(document.getElementById('modal-shelter-occupancy')?.value || 0);
        const activeVal = document.getElementById('modal-shelter-status')?.value === 'true';
        const latVal = document.getElementById('modal-shelter-lat')?.value?.trim();
        const lngVal = document.getElementById('modal-shelter-lng')?.value?.trim();
        const phoneVal = document.getElementById('modal-shelter-phone')?.value?.trim();

        if (!nameVal) {
          showAlert('Please enter a valid Shelter Name.');
          return;
        }

        if (!capVal || capVal < 1) {
          showAlert('Total Capacity must be at least 1 person.');
          return;
        }

        if (occVal < 0) {
          showAlert('Current occupancy cannot be negative.');
          return;
        }

        // Validate coordinates if entered
        let validLat = null;
        let validLng = null;
        if (latVal !== '' || lngVal !== '') {
          if (latVal === '' || lngVal === '') {
            showAlert('Both Latitude and Longitude must be provided, or both left blank.');
            return;
          }
          const parsedLat = Number(latVal);
          const parsedLng = Number(lngVal);
          if (!isValidCoordinate(parsedLat, parsedLng)) {
            showAlert('Invalid GPS coordinates. Latitude must be -90 to 90, Longitude -180 to 180.');
            return;
          }
          validLat = parsedLat;
          validLng = parsedLng;
        }

        showAlert(null);
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Saving to Supabase...';

        try {
          const payload = {
            name: nameVal,
            address: addressVal || null,
            capacity_total: capVal,
            capacity_current: occVal,
            active: activeVal,
            latitude: validLat,
            longitude: validLng,
            contact_phone: phoneVal || null
          };

          if (isEdit) {
            await state.updateShelter(shelterIdToEdit, payload);
          } else {
            await state.designateShelter(payload);
          }

          this.closeModal();
        } catch (err) {
          console.error('[Modal] Shelter save error:', err);
          showAlert(err.message || 'Failed to save shelter to Supabase.');
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = confirmLabel;
        }
      });
    }

    this.overlayEl.classList.add('open');
  }
}

export const modal = new ModalManager();
window.__rakshaModal = modal;
