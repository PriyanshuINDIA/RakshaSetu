/* ==========================================================================
   RakshaSetu Authority - Tactical Geospatial Map System
   Features:
   - Critical operational distinction: Live vs Last-Known vs Stale vs Offline
   - Custom SVG/DivIcon tactical glyphs with dual encoding (text + icons)
   - Radar pulse animations for critical emergency signals
   - Accuracy radius circles matching GPS confidence
   - Layer filtering (All, SOS, Critical, Resource Needs, Shelters, Last Known, Unsafe Roads)
   - Synchronized map views (Dashboard split pane & Full map tab)
   ========================================================================== */

import { state } from './state/state.js';
import { isValidCoordinate } from './services/heartbeatService.js';

class TacticalMapManager {
  constructor() {
    this.mainMap = null;
    this.fullMap = null;
    this.mainMarkers = [];
    this.fullMarkers = [];
    this.accuracyCircles = [];
    this.hazardLayers = [];
    this.activeFilter = 'ALL';
    this.skippedRecordsLogged = new Set();
  }

  logSkippedRecord(type, id, lat, lng) {
    const key = `${type}:${id || 'unknown'}`;
    if (!this.skippedRecordsLogged.has(key)) {
      this.skippedRecordsLogged.add(key);
      console.warn(`[RakshaSetu][Map] Skipping record with invalid coordinates: ${type} ${id || ''} (lat: ${lat}, lng: ${lng})`);
    }
  }

  initMaps() {
    // Default EOC Center: Munger District Command, Bihar (bihar-munger)
    const defaultCenter = [25.3757, 86.4735];
    const defaultZoom = 13;

    if (window.L) {
      this.initLeafletMaps(defaultCenter, defaultZoom);
    } else {
      console.warn("Leaflet not loaded yet; queuing map init");
      window.addEventListener('load', () => this.initLeafletMaps(defaultCenter, defaultZoom));
    }
  }

  initLeafletMaps(center, zoom) {
    const mainMapEl = document.getElementById('eoc-main-map');
    const fullMapEl = document.getElementById('eoc-full-map');

    // OpenStreetMap tile layer (reliable, no API key required watermark)
    const osmTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    const tileOptions = {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | <strong>RakshaSetu EOC</strong>',
      maxZoom: 19
    };

    if (mainMapEl && !this.mainMap) {
      this.mainMap = window.L.map(mainMapEl, {
        center: center,
        zoom: zoom,
        zoomControl: false,
        attributionControl: false
      });
      window.L.tileLayer(osmTileUrl, tileOptions).addTo(this.mainMap);
      window.L.control.zoom({ position: 'bottomright' }).addTo(this.mainMap);
    }

    if (fullMapEl && !this.fullMap) {
      this.fullMap = window.L.map(fullMapEl, {
        center: center,
        zoom: zoom,
        zoomControl: false,
        attributionControl: true
      });
      window.L.tileLayer(osmTileUrl, tileOptions).addTo(this.fullMap);
      window.L.control.zoom({ position: 'bottomright' }).addTo(this.fullMap);
    }

    console.log('[RakshaSetu][Map] Basemap loaded: OpenStreetMap');

    this.renderAllLayers();
    this.setupStateSubscriptions();
  }

  setupStateSubscriptions() {
    state.subscribe('incidentUpdated', () => this.renderAllLayers());
    state.subscribe('incidentAdded', (newInc) => {
      this.renderAllLayers();
      if (this.mainMap && newInc && newInc.coordinates) {
        this.mainMap.flyTo(newInc.coordinates, 14, { duration: 1.2 });
      }
    });
    state.subscribe('resourceUpdated', () => this.renderAllLayers());
    state.subscribe('shelterUpdated', () => this.renderAllLayers());
    state.subscribe('heartbeatAged', () => this.renderAllLayers());
    state.subscribe('dataLoaded', () => this.renderAllLayers());

    // When drawer opens, optionally pan to item
    state.subscribe('drawerOpened', ({ type, id }) => {
      if (type === 'incident') {
        const inc = state.getIncident(id);
        if (inc && this.mainMap && inc.coordinates) {
          this.mainMap.panTo(inc.coordinates, { animate: true });
        }
      }
    });

    // Resize map when tab changes
    state.subscribe('tabChanged', (tab) => {
      setTimeout(() => {
        if (tab === 'dashboard' && this.mainMap) this.mainMap.invalidateSize();
        if (tab === 'map' && this.fullMap) this.fullMap.invalidateSize();
      }, 200);
    });
  }

  setFilter(filterType) {
    this.activeFilter = filterType;
    this.renderAllLayers();
  }

  renderAllLayers() {
    this.clearLayers();

    if (this.mainMap) this.renderToMap(this.mainMap, this.mainMarkers);
    if (this.fullMap) this.renderToMap(this.fullMap, this.fullMarkers);
  }

  clearLayers() {
    [...this.mainMarkers, ...this.fullMarkers].forEach(marker => marker.remove());
    this.mainMarkers = [];
    this.fullMarkers = [];

    this.accuracyCircles.forEach(circle => circle.remove());
    this.accuracyCircles = [];

    this.hazardLayers.forEach(layer => layer.remove());
    this.hazardLayers = [];
  }

  renderToMap(mapInstance, markerList) {
    if (!mapInstance || !window.L) return;

    // 1. Render Incidents (Strict Live vs Last-Known vs Stale vs Resolved Distinction)
    if (state.incidents && state.incidents.length) {
      state.incidents.forEach(inc => {
        if (!this.shouldShowIncident(inc)) return;

        const coords = inc.coordinates || (inc.latitude != null && inc.longitude != null ? [inc.latitude, inc.longitude] : null);
        if (!coords || !isValidCoordinate(coords[0], coords[1])) {
          this.logSkippedRecord('incident', inc.id, inc.latitude, inc.longitude);
          return;
        }

        const isResolved = inc.status === 'Resolved' || inc.rawStatus === 'RESOLVED';
        const isCritical = !isResolved && inc.priority === 'CRITICAL';
        const isHigh = !isResolved && inc.priority === 'HIGH';
        const isModerate = !isResolved && (inc.priority === 'MODERATE' || inc.priority === 'MEDIUM');
        const isLive = !isResolved && String(inc.locationType || '').toUpperCase().includes('LIVE');
        const isLastKnown = !isResolved && String(inc.locationType || '').toUpperCase().includes('LAST-KNOWN');
        const isStale = !isResolved && String(inc.locationType || '').toUpperCase().includes('STALE');

        // Format age label
        const ageMinutes = Math.floor((inc.heartbeatAgeSec || 0) / 60);
        const ageText = ageMinutes > 0 ? `${ageMinutes}m ago` : `${inc.heartbeatAgeSec || 0}s ago`;

        const pinClass = isResolved
          ? 'resolved'
          : (isCritical ? 'critical' : (isHigh ? 'high' : (isModerate ? 'moderate' : 'low')));

        const glyphIcon = isResolved
          ? '✓'
          : (isCritical ? '🚨' : (isLastKnown ? '⏱️' : '📍'));

        // Custom Tactical Marker HTML
        const markerHtml = `
          <div class="tactical-marker-wrap" id="marker-${inc.id}">
            ${isCritical ? '<div class="marker-pulse-ring critical"></div>' : (isLive ? '<div class="marker-pulse-ring live"></div>' : '')}
            <div class="marker-pin ${pinClass} ${isLastKnown ? 'last-known' : ''}">
              ${glyphIcon}
            </div>
            <div class="marker-floating-label ${isLastKnown ? 'last-known' : ''}">
              <span>${inc.displayId || inc.id}</span>
              <span>&bull;</span>
              <span>${isResolved ? 'RESOLVED' : (isLive ? 'LIVE' : (isLastKnown ? `LAST-KNOWN (${ageText})` : 'STALE'))}</span>
            </div>
          </div>
        `;

        const customIcon = window.L.divIcon({
          className: 'custom-leaflet-divicon',
          html: markerHtml,
          iconSize: [44, 52],
          iconAnchor: [22, 48]
        });

        const marker = window.L.marker(coords, { icon: customIcon }).addTo(mapInstance);

        // Tactical Popup
        const popupContent = `
          <div class="popup-eoc-box">
            <div class="popup-top-row">
              <span class="priority-badge ${isResolved ? 'resolved' : inc.priority.toLowerCase()}">${isResolved ? 'RESOLVED' : `${inc.priority} SOS`}</span>
              <span class="location-type-badge ${isLive ? 'live' : 'last-known'}">
                ${isResolved ? 'INCIDENT RESOLVED' : inc.locationType}
              </span>
            </div>
            <div class="popup-title">${inc.displayId || inc.id}: ${inc.citizenName}</div>
            <div class="popup-desc"><strong>Status:</strong> ${inc.status}</div>
            <div class="popup-desc">${inc.locationName}</div>
            <div class="popup-accuracy-row">
              <span>Accuracy: &plusmn;${inc.accuracyMeters}m</span>
              <span>&bull;</span>
              <span>Heartbeat: ${ageText} (${inc.heartbeatStatus})</span>
            </div>
            <div class="popup-desc" style="font-style: italic; color: #cbd5e1;">&ldquo;${inc.message}&rdquo;</div>
            ${isLastKnown ? '<div class="ops-callout" style="padding: 4px 8px; font-size: 10px;">⚠️ Position is last-known and not guaranteed current.</div>' : ''}
            <button class="popup-action-btn" onclick="window.__rakshaState.openIncidentDrawer('${inc.id}')">
              Inspect Incident &amp; Assign Team &rarr;
            </button>
          </div>
        `;
        marker.bindPopup(popupContent, { maxWidth: 300 });

        marker.on('click', () => {
          state.openIncidentDrawer(inc.id);
        });

        markerList.push(marker);

        // Accuracy Radius Circle (Mandatory for EOC accuracy visualization)
        const radiusColor = isResolved ? '#64748b' : (isLive ? '#22c55e' : (isLastKnown ? '#f59e0b' : '#8b5cf6'));
        const circle = window.L.circle(coords, {
          radius: inc.accuracyMeters || 20,
          color: radiusColor,
          weight: 1.5,
          fillColor: radiusColor,
          fillOpacity: 0.12,
          dashArray: (isLastKnown || isResolved) ? '4, 4' : null
        }).addTo(mapInstance);

        this.accuracyCircles.push(circle);
      });
    }

    // 2. Render Shelters (Active Only)
    if (this.shouldShowShelters() && state.shelters && state.shelters.length) {
      state.shelters.forEach(sh => {
        // Exclude deactivated / closed shelters from active map
        if (sh.active === false) return;

        const coords = sh.coordinates || (sh.latitude != null && sh.longitude != null ? [sh.latitude, sh.longitude] : null);
        if (!coords || !isValidCoordinate(coords[0], coords[1])) {
          this.logSkippedRecord('shelter', sh.id, sh.latitude, sh.longitude);
          return;
        }

        const percent = sh.totalCapacity > 0 ? Math.round((sh.currentOccupancy / sh.totalCapacity) * 100) : 0;
        const shelterHtml = `
          <div class="tactical-marker-wrap">
            <div class="marker-pin shelter">⛺</div>
            <div class="marker-floating-label" style="background: rgba(2, 132, 199, 0.95); color: white;">
              ${sh.isDemo ? '[DEMO] ' : ''}${sh.name.substring(0, 16)}... (${percent}%)
            </div>
          </div>
        `;
        const icon = window.L.divIcon({
          className: 'custom-leaflet-divicon',
          html: shelterHtml,
          iconSize: [40, 50],
          iconAnchor: [20, 45]
        });

        const marker = window.L.marker(coords, { icon }).addTo(mapInstance);
        marker.bindPopup(`
          <div class="popup-eoc-box">
            <div class="popup-top-row">
              <span class="status-badge" style="color: #38bdf8;">ACTIVE SHELTER</span>
              ${sh.isDemo ? '<span class="status-badge" style="color: #fbbf24;">PROTOTYPE</span>' : ''}
              <span style="font-family: var(--font-mono); font-size: 11px;">${sh.currentOccupancy}/${sh.totalCapacity} (${percent}%)</span>
            </div>
            <div class="popup-title">${sh.name}</div>
            <div class="popup-desc">${sh.address || sh.location}</div>
            <div class="popup-desc"><strong>Services:</strong> ${(sh.services || []).join(', ')}</div>
            <div class="popup-desc"><strong>Power:</strong> ${sh.generatorStatus}</div>
            <button class="popup-action-btn" style="background: #0284c7;" onclick="window.__rakshaState.openShelterDrawer('${sh.id}')">
              View Shelter Details &rarr;
            </button>
          </div>
        `, { maxWidth: 300 });

        marker.on('click', () => state.openShelterDrawer(sh.id));
        markerList.push(marker);
      });
    }

    // 3. Render Resource Needs
    if (this.shouldShowResources() && state.resourceRequests && state.resourceRequests.length) {
      state.resourceRequests.forEach(res => {
        if (res.status === 'Fulfilled' || res.status === 'Closed' || res.status === 'Delivered') return;

        const coords = res.coordinates || (res.latitude != null && res.longitude != null ? [res.latitude, res.longitude] : null);
        if (!coords || !isValidCoordinate(coords[0], coords[1])) {
          this.logSkippedRecord('resource_request', res.id, res.latitude, res.longitude);
          return;
        }

        const resHtml = `
          <div class="tactical-marker-wrap">
            <div class="marker-pin resource">📦</div>
            <div class="marker-floating-label" style="background: rgba(147, 51, 234, 0.95); color: white;">
              ${res.category || res.requestType}: ${res.quantity || 1}
            </div>
          </div>
        `;
        const icon = window.L.divIcon({
          className: 'custom-leaflet-divicon',
          html: resHtml,
          iconSize: [40, 50],
          iconAnchor: [20, 45]
        });

        const marker = window.L.marker(coords, { icon }).addTo(mapInstance);
        marker.bindPopup(`
          <div class="popup-eoc-box">
            <div class="popup-top-row">
              <span class="status-badge" style="color: #c084fc;">${res.category || res.requestType || 'SUPPLY'}</span>
              <span class="priority-badge ${res.priority ? res.priority.toLowerCase() : 'moderate'}">${res.priority || 'Moderate'}</span>
            </div>
            <div class="popup-title">${res.id}: ${res.need}</div>
            <div class="popup-desc"><strong>Type:</strong> ${res.category || res.requestType} &bull; <strong>Qty:</strong> ${res.quantity || 1}</div>
            <div class="popup-desc"><strong>Status:</strong> ${res.status}</div>
            ${res.citizenId ? `<div class="popup-desc"><strong>Citizen ID:</strong> ${res.citizenId}</div>` : ''}
            <div class="popup-desc"><strong>Location:</strong> ${res.location}</div>
            <div class="popup-desc">${res.urgencyContext}</div>
            <button class="popup-action-btn" style="background: #9333ea;" onclick="window.__rakshaState.openResourceDrawer('${res.id}')">
              Coordinate Dispatch &rarr;
            </button>
          </div>
        `, { maxWidth: 320 });

        marker.on('click', () => state.openResourceDrawer(res.id));
        markerList.push(marker);
      });
    }

    // 4. Render Standalone Citizen Heartbeat Signals (Last Known / Telemetry Layer)
    if (this.shouldShowHeartbeats() && state.heartbeats && state.heartbeats.length) {
      state.heartbeats.forEach(hb => {
        const coords = hb.coordinates || (hb.latitude != null && hb.longitude != null ? [hb.latitude, hb.longitude] : null);
        if (!coords || !isValidCoordinate(coords[0], coords[1])) {
          this.logSkippedRecord('heartbeat', hb.id, hb.latitude, hb.longitude);
          return;
        }

        // Avoid stacking duplicate marker over citizen's active incident marker
        const hasActiveIncident = (state.incidents || []).some(i => i.citizenId === hb.citizenId && i.coordinates);
        if (hasActiveIncident) return;

        const isLive = hb.isLive;
        const hbHtml = `
          <div class="tactical-marker-wrap" id="marker-hb-${hb.id}">
            ${isLive ? '<div class="marker-pulse-ring live"></div>' : ''}
            <div class="marker-pin last-known" style="${isLive ? 'background: #059669; border-color: #34d399;' : ''}">
              📡
            </div>
            <div class="marker-floating-label last-known" style="${isLive ? 'color: #34d399; border-color: #059669;' : ''}">
              <span>Citizen ${hb.citizenId ? hb.citizenId.slice(0, 6) : 'Signal'}</span>
              <span>&bull;</span>
              <span>${isLive ? 'LIVE' : 'LAST-KNOWN'}</span>
            </div>
          </div>
        `;
        const icon = window.L.divIcon({
          className: 'custom-leaflet-divicon',
          html: hbHtml,
          iconSize: [40, 50],
          iconAnchor: [20, 45]
        });

        const marker = window.L.marker(coords, { icon }).addTo(mapInstance);
        marker.bindPopup(`
          <div class="popup-eoc-box">
            <div class="popup-top-row">
              <span class="status-badge" style="color: ${isLive ? '#34d399' : '#fbbf24'};">TELEMETRY SIGNAL</span>
              <span class="location-type-badge ${isLive ? 'live' : 'last-known'}">${hb.locationType}</span>
            </div>
            <div class="popup-title">Citizen: ${hb.citizenId || 'Verified Signal'}</div>
            <div class="popup-desc">Telemetry ping received via ${hb.networkState || 'Network'}.</div>
            <div class="popup-accuracy-row">
              <span>Accuracy: &plusmn;${hb.accuracyMeters}m</span>
              <span>&bull;</span>
              <span>Logged: ${new Date(hb.createdAt).toLocaleTimeString('en-IN', { hour12: false })}</span>
            </div>
            <div class="ops-callout" style="padding: 4px 8px; font-size: 10px;">
              ${isLive ? 'Verified recent GPS heartbeat received from citizen device.' : '⚠️ Position is last-known and not guaranteed current.'}
            </div>
          </div>
        `, { maxWidth: 300 });

        markerList.push(marker);

        const circle = window.L.circle(coords, {
          radius: hb.accuracyMeters || 25,
          color: isLive ? '#22c55e' : '#f59e0b',
          weight: 1.5,
          fillColor: isLive ? '#22c55e' : '#f59e0b',
          fillOpacity: 0.1,
          dashArray: isLive ? null : '4, 4'
        }).addTo(mapInstance);
        this.accuracyCircles.push(circle);
      });
    }

    // 5. Render Hazard Areas / Unsafe Roads
    if (this.shouldShowUnsafeRoads() && state.hazardAreas && state.hazardAreas.length) {
      state.hazardAreas.forEach(haz => {
        if (!haz.coordinates || !isValidCoordinate(haz.coordinates[0], haz.coordinates[1])) return;

        const hazHtml = `
          <div class="tactical-marker-wrap">
            <div class="marker-pin unsafe-hazard">⛔</div>
            <div class="marker-floating-label" style="background: rgba(225, 29, 72, 0.95); color: white;">
              ${haz.type}
            </div>
          </div>
        `;
        const icon = window.L.divIcon({
          className: 'custom-leaflet-divicon',
          html: hazHtml,
          iconSize: [40, 50],
          iconAnchor: [20, 45]
        });

        const marker = window.L.marker(haz.coordinates, { icon }).addTo(mapInstance);
        marker.bindPopup(`
          <div class="popup-eoc-box">
            <div class="popup-top-row">
              <span class="priority-badge critical">HAZARD / IMPASSABLE</span>
            </div>
            <div class="popup-title">${haz.name}</div>
            <div class="popup-desc"><strong>Status:</strong> ${haz.status}</div>
            <div class="popup-desc">${haz.description}</div>
            <div class="popup-accuracy-row">Reported by: ${haz.reportedBy} (${haz.reportedAt})</div>
          </div>
        `, { maxWidth: 320 });

        markerList.push(marker);

        // Draw hazard buffer circle
        const circle = window.L.circle(haz.coordinates, {
          radius: 120,
          color: '#f43f5e',
          weight: 2,
          fillColor: '#f43f5e',
          fillOpacity: 0.25,
          dashArray: '6, 6'
        }).addTo(mapInstance);
        this.hazardLayers.push(circle);
      });
    }
  }

  shouldShowIncident(inc) {
    if (this.activeFilter === 'ALL') return true;
    if (this.activeFilter === 'SOS') return true;
    if (this.activeFilter === 'CRITICAL') return inc.priority === 'CRITICAL';
    if (this.activeFilter === 'LAST_KNOWN') {
      return String(inc.locationType || '').toUpperCase().includes('LAST-KNOWN');
    }
    return false;
  }

  shouldShowShelters() {
    return this.activeFilter === 'ALL' || this.activeFilter === 'SHELTERS';
  }

  shouldShowResources() {
    return this.activeFilter === 'ALL' || this.activeFilter === 'RESOURCES';
  }

  shouldShowHeartbeats() {
    return this.activeFilter === 'ALL' || this.activeFilter === 'LAST_KNOWN';
  }

  shouldShowUnsafeRoads() {
    return this.activeFilter === 'ALL' || this.activeFilter === 'UNSAFE';
  }
}

export const tacticalMap = new TacticalMapManager();
window.__rakshaMap = tacticalMap;
