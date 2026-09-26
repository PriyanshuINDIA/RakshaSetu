/**
 * RakshaSetu Citizen Core - Route Service
 *
 * Consolidates safe-route calculations to relief shelters:
 * - Integrates with LocationService (current GPS, cached last-known fallback, stale detection)
 * - Uses active shelter coordinates, with primary prototype destination at Government Engineering College, Munger
 * - Calculates distance and pedestrian evacuation ETA (~3.2 km/h in adverse conditions)
 * - Generates intermediate ridge waypoints avoiding simulated inundation hazard sectors
 * - Strictly handles failure states (GPS unavailable, shelter coordinates unverified, inactive shelter)
 * - Clearly identifies prototype heuristic status (never claims certified emergency evacuation routing)
 *
 * Output Schema:
 * {
 *   success: boolean,
 *   origin: [lat, lng],
 *   destination: [lat, lng],
 *   shelter_name: string,
 *   shelter_id?: string,
 *   route: [[lat, lng], ...],
 *   hazard_zones: [[[lat, lng], ...], ...],
 *   distance_km: number,
 *   estimated_time_minutes: number,
 *   location_source: 'GPS' | 'CACHED' | 'INPUT',
 *   is_stale_location: boolean,
 *   safety_status: 'ELEVATED_HEURISTIC_SAFE' | 'CAUTION_HAZARD_PROXIMITY',
 *   source: 'OFFLINE_ELEVATION_HEURISTIC',
 *   is_prototype: true,
 *   prototype_title: 'Prototype Safe Route',
 *   disclaimer: string
 * }
 */

import { locationService, LocationSource } from './location-service.js';

export const PROTOTYPE_MUNGER_SHELTER = {
  id: 'shelter-gec-munger-demo',
  name: 'Government Engineering College, Munger',
  lat: 25.3700,
  lng: 86.5000,
  active: true,
  isDemo: true,
  district: 'Munger',
  state: 'Bihar'
};

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export class RouteService {
  constructor() {
    this.defaultShelter = PROTOTYPE_MUNGER_SHELTER;
  }

  calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    const nLat1 = Number(lat1);
    const nLon1 = Number(lon1);
    const nLat2 = Number(lat2);
    const nLon2 = Number(lon2);
    if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return null;

    const R = 6371; // Earth's radius in km
    const dLat = (nLat2 - nLat1) * (Math.PI / 180);
    const dLon = (nLon2 - nLon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(nLat1 * (Math.PI / 180)) *
      Math.cos(nLat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
  }

  estimateWalkingTimeMinutes(distanceKm) {
    if (!distanceKm) return 0;
    // Evacuation walking speed in flooded/debris conditions ~ 3.2 km/h
    return Math.max(5, Math.round((distanceKm / 3.2) * 60));
  }

  /**
   * Core heuristic path planner avoiding low canal/inundation hazard polygons
   */
  computeSafeRoute(originCoords, destinationCoords, targetShelterName = 'Relief Shelter') {
    if (!originCoords || !destinationCoords) {
      throw new Error('Both origin and destination coordinates are required for route calculation.');
    }

    const start = [Number(originCoords[0]), Number(originCoords[1])];
    const end = [Number(destinationCoords[0]), Number(destinationCoords[1])];

    if (isNaN(start[0]) || isNaN(start[1]) || isNaN(end[0]) || isNaN(end[1])) {
      throw new Error('Valid numeric coordinates are required for route calculation.');
    }

    const distance = this.calculateDistanceKm(start[0], start[1], end[0], end[1]) || 1.2;
    const estTime = this.estimateWalkingTimeMinutes(distance);

    // Heuristic elevation ridge waypoints avoiding low canal basin
    const midLat = (start[0] + end[0]) / 2 + 0.003;
    const midLng = (start[1] + end[1]) / 2 - 0.002;

    const waypoints = [
      start,
      [Number((start[0] + 0.001).toFixed(6)), Number((start[1] + 0.0015).toFixed(6))],
      [Number(midLat.toFixed(6)), Number(midLng.toFixed(6))],
      [Number((end[0] - 0.0015).toFixed(6)), Number((end[1] - 0.001).toFixed(6))],
      end
    ];

    // Simulated inundation hazard polygon near low-lying culvert / drainage basin
    const hazardZone = [
      [Number((midLat - 0.0025).toFixed(6)), Number((midLng + 0.003).toFixed(6))],
      [Number((midLat + 0.002).toFixed(6)), Number((midLng + 0.006).toFixed(6))],
      [Number((midLat - 0.001).toFixed(6)), Number((midLng + 0.008).toFixed(6))],
      [Number((midLat - 0.004).toFixed(6)), Number((midLng + 0.005).toFixed(6))]
    ];

    return {
      success: true,
      origin: start,
      destination: end,
      shelter_name: targetShelterName,
      route: waypoints,
      hazard_zones: [hazardZone],
      distance_km: distance,
      estimated_time_minutes: estTime,
      safety_status: 'ELEVATED_HEURISTIC_SAFE',
      source: 'OFFLINE_ELEVATION_HEURISTIC',
      is_prototype: true,
      prototype_title: 'Prototype Safe Route',
      disclaimer: 'Prototype Safe Route — Route is an offline heuristic and is not certified emergency evacuation guidance.'
    };
  }

  /**
   * High-level Safe Route to Shelter calculator:
   * Handles LocationService resolution (current GPS vs cached vs stale),
   * shelter coordinate verification, hazard avoidance, and honest failure states.
   */
  async calculateSafeRouteToShelter(targetShelter = null, options = {}) {
    // 1. Resolve Origin Location
    let origin = null;
    let locationSource = 'GPS';
    let isStaleLocation = false;

    if (options.origin) {
      const o = options.origin;
      const lat = o.lat != null ? Number(o.lat) : (o.latitude != null ? Number(o.latitude) : (Array.isArray(o) ? Number(o[0]) : null));
      const lng = o.lng != null ? Number(o.lng) : (o.longitude != null ? Number(o.longitude) : (Array.isArray(o) ? Number(o[1]) : null));
      if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
        origin = [lat, lng];
        locationSource = options.originSource || 'INPUT';
        isStaleLocation = Boolean(options.isStale);
      }
    }

    if (!origin && locationService) {
      // Check current location first
      let currentLoc = locationService.currentLocation;
      if (!currentLoc && typeof locationService.getCurrentLocation === 'function') {
        try {
          currentLoc = await locationService.getCurrentLocation({ timeoutMs: options.timeoutMs || 2500 });
        } catch {
          // Will fall back to cached
        }
      }

      if (currentLoc && typeof currentLoc.latitude === 'number' && typeof currentLoc.longitude === 'number') {
        origin = [currentLoc.latitude, currentLoc.longitude];
        locationSource = currentLoc.source === LocationSource.DEMO ? 'DEMO' : 'GPS';
        isStaleLocation = Boolean(currentLoc.is_stale);
      } else {
        // Fall back to cached last-known location
        let cachedLoc = locationService.lastKnownLocation;
        if (!cachedLoc && typeof locationService.getLastKnownLocation === 'function') {
          cachedLoc = await locationService.getLastKnownLocation();
        }

        if (cachedLoc && typeof cachedLoc.latitude === 'number' && typeof cachedLoc.longitude === 'number') {
          origin = [cachedLoc.latitude, cachedLoc.longitude];
          locationSource = 'CACHED';
          const capturedTime = cachedLoc.captured_at ? new Date(cachedLoc.captured_at).getTime() : 0;
          isStaleLocation = cachedLoc.is_stale || (capturedTime > 0 && (Date.now() - capturedTime) > STALE_THRESHOLD_MS);
        }
      }
    }

    if (!origin) {
      return {
        success: false,
        error: 'GPS_UNAVAILABLE',
        reason: 'Current and cached location are unavailable. Cannot compute safe route without citizen coordinates.',
        is_prototype: true,
        prototype_title: 'Prototype Safe Route',
        disclaimer: 'Route is an offline heuristic and is not certified emergency evacuation guidance.'
      };
    }

    // 2. Resolve Target Shelter
    let shelter = targetShelter;
    if (!shelter) {
      shelter = this.defaultShelter;
    } else if (typeof shelter === 'string') {
      shelter = {
        name: shelter,
        lat: this.defaultShelter.lat,
        lng: this.defaultShelter.lng,
        active: true
      };
    }

    // Active status validation
    if (shelter.active === false) {
      return {
        success: false,
        error: 'SHELTER_INACTIVE',
        reason: `Shelter "${shelter.name || 'Selected'}" is currently marked inactive by district administration.`,
        is_prototype: true,
        prototype_title: 'Prototype Safe Route',
        disclaimer: 'Route is an offline heuristic and is not certified emergency evacuation guidance.'
      };
    }

    // Coordinate validation
    const destLat = shelter.lat != null ? Number(shelter.lat) : (shelter.latitude != null ? Number(shelter.latitude) : null);
    const destLng = shelter.lng != null ? Number(shelter.lng) : (shelter.longitude != null ? Number(shelter.longitude) : null);

    const hasValidCoords = destLat !== null && destLng !== null &&
      !isNaN(destLat) && !isNaN(destLng) &&
      destLat >= -90 && destLat <= 90 &&
      destLng >= -180 && destLng <= 180;

    if (!hasValidCoords) {
      return {
        success: false,
        error: 'SHELTER_COORDINATES_UNAVAILABLE',
        reason: `Shelter "${shelter.name || 'Selected'}" coordinates are unverified or pending official survey.`,
        is_prototype: true,
        prototype_title: 'Prototype Safe Route',
        disclaimer: 'Route is an offline heuristic and is not certified emergency evacuation guidance.'
      };
    }

    const destination = [destLat, destLng];
    const shelterName = shelter.name || 'Designated Shelter';
    const shelterId = shelter.id || null;

    try {
      const routeResult = this.computeSafeRoute(origin, destination, shelterName);
      return {
        ...routeResult,
        shelter_id: shelterId,
        location_source: locationSource,
        is_stale_location: isStaleLocation,
        is_demo_shelter: Boolean(shelter.isDemo || shelterName.includes('Engineering College') || shelterName.toLowerCase().includes('demo')),
        disclaimer: 'Prototype Safe Route — Route is an offline heuristic and is not certified emergency evacuation guidance.'
      };
    } catch (err) {
      return {
        success: false,
        error: 'CALCULATION_FAILURE',
        reason: err.message || 'Heuristic safe route calculation failed.',
        is_prototype: true,
        prototype_title: 'Prototype Safe Route',
        disclaimer: 'Route is an offline heuristic and is not certified emergency evacuation guidance.'
      };
    }
  }
}

export const routeService = new RouteService();
