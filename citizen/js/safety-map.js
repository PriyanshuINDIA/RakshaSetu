/**
 * RakshaSetu Safety Map Engine
 * Leaflet-powered mobile GIS layer for emergency shelters, safe routes, and disaster hazard visualization.
 * Truthfully distinguishes between LIVE government telemetry, CACHED packages, and DEMO/PROTOTYPE models.
 */

import { store, NetworkStates } from './store.js';
import { apiClient } from './api-client.js';
import { offlineStorage } from './offline-storage.js';
import { satelliteService } from './core/satellite-service.js';
import { routeService } from './core/route-service.js';

export class SafetyMapManager {
  constructor() {
    this.map = null;
    this.markersLayer = null;
    this.routeLayer = null;
    this.riskOverlayLayer = null;
    this.incidentOverlayLayer = null;
    this.activeRoute = null;
    this.showingRiskLayer = false;
    this.showingIncidentLayer = false;
    this.liveShelters = null;
  }

  async fetchLiveShelters() {
    const state = store.getState();
    const isOnline = state.networkState === NetworkStates.INTERNET_ONLINE || navigator.onLine;
    if (isOnline) {
      try {
        const response = await apiClient.get('/shelters', { timeout: 6000 });
        if (response && response.ok && Array.isArray(response.data)) {
          this.liveShelters = response.data;
          return this.liveShelters;
        }
      } catch (err) {
        console.warn('[SafetyMap] Live shelters fetch warning:', err);
      }
    }
    return this.liveShelters;
  }

  initMap(containerId = 'safetyLeafletMap') {
    const container = document.getElementById(containerId);
    if (!container || this.map) return;

    // Check Leaflet presence
    if (typeof L === 'undefined') {
      container.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #64748B;">
          <p style="font-weight: bold; margin-bottom: 8px;">Leaflet GIS Engine Initializing...</p>
          <p style="font-size: 13px;">Checking cached map tiles for offline navigation.</p>
        </div>
      `;
      return;
    }

    const { location, profile } = store.getState();
    const pkg = offlineStorage.resolveActiveRegionPackageSync(profile, location);
    let startLat = 20.5937;
    let startLng = 78.9629; // Neutral India geographic center fallback

    if (location && typeof location.lat === 'number' && typeof location.lng === 'number' && !location.error) {
      startLat = location.lat;
      startLng = location.lng;
    } else if (pkg && pkg.centerCoordinates && typeof pkg.centerCoordinates.lat === 'number') {
      startLat = pkg.centerCoordinates.lat;
      startLng = pkg.centerCoordinates.lng;
    }

    this.map = L.map(containerId, {
      center: [startLat, startLng],
      zoom: 13,
      zoomControl: false,
      attributionControl: false
    });

    // High-contrast OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors | NDMA India GIS'
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    this.riskOverlayLayer = L.layerGroup();
    this.incidentOverlayLayer = L.layerGroup();

    this.renderMarkers();
  }

  renderMarkers() {
    if (!this.map || !this.markersLayer) return;
    this.markersLayer.clearLayers();

    const { location, profile } = store.getState();
    const pkg = offlineStorage.resolveActiveRegionPackageSync(profile, location);

    const sheltersList = this.liveShelters !== null ? this.liveShelters : (pkg ? pkg.shelters : []);
    const shelterSourceLabel = this.liveShelters !== null ? 'LIVE EOC Feed' : 'Cached Regional Package';

    // 1. Citizen Location Marker
    if (location && typeof location.lat === 'number' && typeof location.lng === 'number' && !location.error) {
      const userIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `<div class="marker-pin marker-citizen" title="Your Location">📍</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });

      const citizenMarker = L.marker([location.lat, location.lng], { icon: userIcon });
      const transmissionStatusText = store.getState().liveTelemetryActive
        ? '<span style="color: #166534;">✓ Live Telemetry Transmitted to DEOC</span>'
        : '<span style="color: #B45309;">⚠ Local Fix Only • Not Yet Transmitted</span>';

      citizenMarker.bindPopup(`
        <div style="font-size: 13px; font-weight: bold; padding: 4px;">
          <div>You are here</div>
          <div style="font-size: 11px; color: #64748B; margin-top: 2px;">
            ${location.isLastKnown ? '⚠ Last Known Coords' : 'GPS Fix (±' + location.accuracy + 'm)'}
          </div>
          <div style="font-size: 10.5px; margin-top: 3px;">
            ${transmissionStatusText}
          </div>
        </div>
      `);
      this.markersLayer.addLayer(citizenMarker);

      // Accuracy radius circle
      L.circle([location.lat, location.lng], {
        radius: location.accuracy || 25,
        color: '#0288D1',
        fillColor: '#81D4FA',
        fillOpacity: 0.15,
        weight: 1
      }).addTo(this.markersLayer);
    }

    // 2. Shelters with data source disclosure & coordinate validation
    if (sheltersList && sheltersList.length > 0) {
      sheltersList.forEach(shelter => {
        const lat = shelter.lat != null ? Number(shelter.lat) : (shelter.latitude != null ? Number(shelter.latitude) : null);
        const lng = shelter.lng != null ? Number(shelter.lng) : (shelter.longitude != null ? Number(shelter.longitude) : null);
        const hasValidCoords = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

        if (!hasValidCoords) {
          console.warn('[SafetyMap] Skipping map marker for shelter with pending or unverified coordinates:', shelter.name);
          return;
        }

        const isDemo = shelter.isDemo || (shelter.name && (shelter.name.toLowerCase().includes('demo') || shelter.name.toLowerCase().includes('prototype') || shelter.name.toLowerCase().includes('munger')));
        const pinEmoji = isDemo ? '⛺' : '🏠';

        const shelterIcon = L.divIcon({
          className: 'custom-map-icon',
          html: `<div class="marker-pin marker-shelter" title="${shelter.name}">${pinEmoji}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        });

        const marker = L.marker([lat, lng], { icon: shelterIcon });
        marker.on('click', () => {
          this.openShelterBottomSheet({ ...shelter, lat, lng, dataSourceLabel: shelterSourceLabel });
        });
        this.markersLayer.addLayer(marker);
      });
    }

    // 3. Hospitals
    if (pkg && pkg.hospitals) {
      pkg.hospitals.forEach(hosp => {
        const hospIcon = L.divIcon({
          className: 'custom-map-icon',
          html: `<div class="marker-pin marker-hospital" title="${hosp.name}">🏥</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        });

        const marker = L.marker([hosp.lat, hosp.lng], { icon: hospIcon });
        marker.bindPopup(`
          <div style="font-size: 13px; padding: 4px;">
            <strong style="color: #C62828;">${hosp.name}</strong><br>
            <span style="font-size: 11px; color: #475569;">Trauma Post: ${hosp.emergencyTraumaUnit ? 'Available' : 'Standard Care'}</span><br>
            <span style="font-size: 11px; color: #475569;">Tel: ${hosp.phone}</span><br>
            <span style="font-size: 10px; color: #94A3B8;">Source: Cached Directory</span>
          </div>
        `);
        this.markersLayer.addLayer(marker);
      });
    }
  }

  openShelterBottomSheet(shelter) {
    store.openSheet('shelter-detail', shelter);
  }

  calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null || isNaN(Number(lat1)) || isNaN(Number(lon1)) || isNaN(Number(lat2)) || isNaN(Number(lon2))) {
      return null;
    }
    const R = 6371; // Earth's radius in km
    const dLat = (Number(lat2) - Number(lat1)) * Math.PI / 180;
    const dLon = (Number(lon2) - Number(lon1)) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(Number(lat1) * Math.PI / 180) * Math.cos(Number(lat2) * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(1);
  }

  /**
   * Find Safest Route — Truthfully discloses Prototype vs Live Engine
   * Powered by RouteService offline elevation heuristics with hazard avoidance.
   */
  async plotSafestRoute(targetShelter) {
    if (!this.map || !this.routeLayer) return null;
    this.routeLayer.clearLayers();

    // Delegate calculation to RouteService
    const routeResult = await routeService.calculateSafeRouteToShelter(targetShelter);

    if (!routeResult || !routeResult.success) {
      console.warn('[SafetyMap] Route calculation unavailable:', routeResult?.reason || 'Unknown error');
      alert(routeResult?.reason || 'Cannot compute safe route: Required coordinates unavailable.');
      return routeResult;
    }

    const { route, hazard_zones, distance_km, estimated_time_minutes, shelter_name, location_source, is_stale_location, disclaimer, prototype_title } = routeResult;

    // High-visibility emerald safe route path
    const safePolyline = L.polyline(route, {
      color: '#1B5E20',
      weight: 6,
      opacity: 0.85,
      dashArray: '8, 8'
    });

    const staleWarning = is_stale_location ? '<br><span style="color:#B45309;font-size:11px;">⚠️ Using Stale Location (>15 min)</span>' : '';
    const popupContent = `
      <div style="font-size:12.5px;padding:4px;max-width:240px;">
        <strong style="color:#166534;">🧭 ${prototype_title || 'Prototype Safe Route'}</strong><br>
        Destination: <strong>${shelter_name}</strong><br>
        <span style="font-size:11.5px;color:#334155;">Distance: <strong>${distance_km} km</strong> • Walking ETA: <strong>~${estimated_time_minutes} min</strong></span><br>
        <span style="font-size:11px;color:#64748B;">Fix: ${location_source}</span>${staleWarning}
        <div style="font-size:10.5px;color:#78350F;background:#FFFBEB;padding:4px 6px;border-radius:4px;margin-top:6px;border:1px solid #FDE68A;">
          ${disclaimer}
        </div>
      </div>
    `;

    safePolyline.bindPopup(popupContent);
    this.routeLayer.addLayer(safePolyline);

    // Inundation hazard warning zones
    if (hazard_zones && hazard_zones.length > 0) {
      hazard_zones.forEach(zone => {
        const hazardPolygon = L.polygon(zone, {
          color: '#D32F2F',
          fillColor: '#FFCDD2',
          fillOpacity: 0.45,
          weight: 2
        }).bindPopup(`
          <div style="font-size:12px;padding:3px;">
            <strong style="color:#C62828;">⚠ Inundated Hazard Zone (Simulated)</strong><br>
            <span style="font-size:11px;color:#475569;">Simulated waterlogging > 0.8m depth. Safe route waypoints navigate around this basin.</span>
          </div>
        `);
        this.routeLayer.addLayer(hazardPolygon);
      });
    }

    try {
      this.map.fitBounds(safePolyline.getBounds(), { padding: [40, 40] });
    } catch (e) {
      console.warn('[SafetyMap] FitBounds error:', e);
    }

    this.activeRoute = routeResult;
    return this.activeRoute;
  }

  toggleHistoricalRiskLayer() {
    this.showingRiskLayer = !this.showingRiskLayer;
    if (this.showingRiskLayer) {
      // Historical Ganga riparian inundation boundary (Clearly marked as Demo / Prototype Model)
      const surgeZone = L.polygon([
        [25.375, 86.465],
        [25.390, 86.475],
        [25.385, 86.490],
        [25.368, 86.480]
      ], {
        color: '#F57C00',
        fillColor: '#FFE082',
        fillOpacity: 0.3,
        weight: 2,
        dashArray: '4, 4'
      }).bindPopup('<b>Historical Riparian Inundation Zone (2016 Ganga High Flood)</b><br><span style="font-size:11px;color:#B45309;">DEMO / HISTORICAL MODEL: Kashtaharani Ghat 104.28m flood stage baseline.</span>');
      this.riskOverlayLayer.addLayer(surgeZone);
      this.riskOverlayLayer.addTo(this.map);
    } else {
      this.riskOverlayLayer.clearLayers();
      this.map.removeLayer(this.riskOverlayLayer);
    }
    return this.showingRiskLayer;
  }

  toggleIncidentLayer() {
    this.showingIncidentLayer = !this.showingIncidentLayer;
    if (this.showingIncidentLayer) {
      // Incident Layer (Marked as Prototype Demonstration)
      const incidentMarker = L.marker([25.3780, 86.4700], {
        icon: L.divIcon({
          className: 'custom-map-icon',
          html: `<div style="background:#E65100;color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid #fff;">⚡</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26]
        })
      }).bindPopup('<b>Incident Marker (Prototype Demonstration)</b><br>Simulated waterlogging along Kashtaharani Ghat Road, Munger. SDRF clearance in progress.');
      this.incidentOverlayLayer.addLayer(incidentMarker);
      this.incidentOverlayLayer.addTo(this.map);
    } else {
      this.incidentOverlayLayer.clearLayers();
      this.map.removeLayer(this.incidentOverlayLayer);
    }
    return this.showingIncidentLayer;
  }

  openISROBhuvanPortal() {
    const { location, profile } = store.getState();
    const lat = location?.lat || 25.3757;
    const lng = location?.lng || 86.4735;
    const regionName = profile?.region === 'bihar-munger' ? 'Munger / Bihar' : (profile?.region || 'Munger / Bihar');
    return satelliteService.launchBhuvanPortal({ lat, lng, regionName });
  }
}

export const safetyMap = new SafetyMapManager();
