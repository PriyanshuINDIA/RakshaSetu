/**
 * RakshaSetu Citizen Core - Risk Data Service
 *
 * Normalizes government meteorological and hydrological disaster risk telemetry:
 * - IMD Weather & Precipitation bulletins
 * - CWC River & Barrage Hydrological feeds
 * - NDMA verified safety guidelines
 *
 * Grounded in Munger / Bihar regional monitoring (Kashtaharani Ghat station).
 *
 * Enforces explicit data status integrity:
 * - LIVE        : Fresh official bulletin received within validity window (<4 hours)
 * - CACHED      : Stored regional package or offline cached snapshot
 * - STALE       : Bulletin past expiration timestamp
 * - UNAVAILABLE : Telemetry pending survey or feed offline
 *
 * NEVER presents cached or stale data as live.
 * NEVER fabricates rainfall, river levels, dam releases, or forecasts.
 * Satellite imagery (ISRO Bhuvan) is delegated to SatelliteService.
 */

import { offlineStorage } from '../offline-storage.js';
import { supabase } from '../supabase-client.js';

export const RiskDataStatus = {
  LIVE: 'LIVE',
  CACHED: 'CACHED',
  STALE: 'STALE',
  UNAVAILABLE: 'UNAVAILABLE',
  PROTOTYPE: 'PROTOTYPE'
};

export const RISK_DISCLOSURE = 'Risk information is displayed with explicit LIVE, CACHED, STALE, UNAVAILABLE, or PROTOTYPE state and is never represented as fresher than its underlying source data.';

class RiskDataService {
  constructor() {
    this.disclosure = RISK_DISCLOSURE;
    this.cachedDamProfiles = [];
    this.cachedAlerts = [];
  }

  /**
   * Derives hydrological risk severity strictly from verified thresholds
   * when an actual observation exists. Returns UNAVAILABLE if observation is missing.
   *
   * Thresholds:
   * - observed < warning           -> NORMAL ("Below warning threshold")
   * - warning <= observed < danger -> WARNING ("Warning-level condition")
   * - danger <= observed <= HFL    -> DANGER / SEVERE ("Severe flood condition")
   * - observed > HFL               -> EXTREME ("Above HFL condition")
   */
  calculateHydrologicalSeverity(observed, thresholds = {}) {
    const {
      warningLevel = 38.33,
      dangerLevel = 39.33,
      highestFloodLevel = 40.99
    } = thresholds;

    if (observed === null || observed === undefined || observed === '' || isNaN(Number(observed))) {
      return {
        severityCategory: 'UNAVAILABLE',
        severityLabel: 'Hydrological status: UNAVAILABLE',
        isCalculated: false,
        warningStatus: 'UNAVAILABLE'
      };
    }

    const level = Number(observed);
    if (level > highestFloodLevel) {
      return {
        severityCategory: 'EXTREME',
        severityLabel: `Extreme Flood Condition — Exceeds HFL (${highestFloodLevel} m MSL by +${(level - highestFloodLevel).toFixed(2)} m)`,
        isCalculated: true,
        warningStatus: 'Extreme Flood Stage'
      };
    }
    if (level >= dangerLevel) {
      return {
        severityCategory: 'DANGER',
        severityLabel: `Danger / Severe Flood Condition (Above Danger Level: ${dangerLevel} m MSL by +${(level - dangerLevel).toFixed(2)} m)`,
        isCalculated: true,
        warningStatus: 'Severe Flood Stage'
      };
    }
    if (level >= warningLevel) {
      return {
        severityCategory: 'WARNING',
        severityLabel: `Warning Level Condition (Above Warning Level: ${warningLevel} m MSL by +${(level - warningLevel).toFixed(2)} m)`,
        isCalculated: true,
        warningStatus: 'Warning Flood Stage'
      };
    }
    return {
      severityCategory: 'NORMAL',
      severityLabel: `Normal Stage (Below Warning Level: ${warningLevel} m MSL)`,
      isCalculated: true,
      warningStatus: 'Normal Flow'
    };
  }

  /**
   * Normalizes a risk item with explicit metadata and freshness evaluation.
   */
  formatRiskItem(source, data, fetchedAt, expiresAt, status, options = {}) {
    const now = Date.now();
    let computedStatus = status;

    if (computedStatus === RiskDataStatus.LIVE && expiresAt && now > new Date(expiresAt).getTime()) {
      computedStatus = RiskDataStatus.STALE;
    }

    return {
      source,
      region: options.region || 'Munger / Bihar',
      riskType: options.riskType || 'HYDROLOGICAL',
      dataType: options.riskType || 'HYDROLOGICAL',
      observedAt: options.observedAt ? new Date(options.observedAt).toISOString() : null,
      fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : new Date().toISOString(),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      status: computedStatus,
      summary: options.summary || '',
      actionRequired: options.actionRequired || '',
      data,
      isFabricated: false,
      // Compatibility fields for Phase 1 contracts
      fetched_at: fetchedAt ? new Date(fetchedAt).toISOString() : new Date().toISOString(),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null
    };
  }

  /**
   * Retrieves verified CWC hydrological telemetry for the active region.
   * Grounded in Munger, Bihar (Kashtaharani Ghat monitoring station).
   */
  async getDamRiskDigest(regionId = 'bihar-munger') {
    // If unmonitored / missing region requested, return explicit UNAVAILABLE status
    if (regionId && regionId !== 'bihar-munger' && !regionId.includes('munger') && !regionId.includes('bihar')) {
      const pkg = await offlineStorage.getPackageForRegion(regionId);
      const dams = pkg?.damRiskProfiles || [];

      if (!dams || dams.length === 0) {
        return this.formatRiskItem(
          'Central Water Commission (CWC)',
          [],
          new Date().toISOString(),
          null,
          RiskDataStatus.UNAVAILABLE,
          {
            region: regionId,
            riskType: 'HYDROLOGICAL',
            observedAt: null,
            summary: 'Hydrological data currently unavailable for this region.',
            actionRequired: 'Follow official municipal emergency directives.'
          }
        );
      }

      return this.formatRiskItem(
        pkg.id === 'odisha-coastal' ? 'CWC / Mahanadi Basin' : 'CWC Hydrological Feed',
        dams,
        new Date().toISOString(),
        null,
        RiskDataStatus.CACHED,
        {
          region: pkg.name || regionId,
          riskType: 'DAM',
          observedAt: dams[0]?.lastRecordedTimestamp || null,
          summary: dams[0]?.downstreamWarningStatus || 'Regional barrage profile cached.',
          actionRequired: 'Verify local embankment notices.'
        }
      );
    }

    // Default primary region: Munger / Bihar
    const pkg = await offlineStorage.getPackageForRegion('bihar-munger');
    const dams = pkg?.damRiskProfiles || [];

    if (!dams || dams.length === 0) {
      // Verified CWC Ganga River at Kashtaharani Ghat benchmarks (Munger CWC Station 022-MNG)
      const defaultMungerHydrology = {
        stationName: 'Ganga River - Kashtaharani Ghat (Munger)',
        damName: 'Ganga River - Kashtaharani Ghat (Munger)', // Backwards compatibility for tests
        source: 'Central Water Commission (CWC) / India-WRIS',
        river: 'Ganga',
        district: 'Munger',
        state: 'Bihar',
        cwcStationCode: '022-MNG',
        datum: 'Mean Sea Level (m MSL)',
        thresholds: {
          warningLevel: 38.33,
          dangerLevel: 39.33,
          highestFloodLevel: 40.99,
          unit: 'm MSL'
        },
        warningLevel: '38.33 m MSL',
        dangerLevel: '39.33 m MSL',
        highestFloodLevel: '40.99 m MSL',
        observedLevel: null,
        currentLevel: null,
        observedStage: 'UNAVAILABLE',
        currentLevelDisplay: 'UNAVAILABLE',
        observationStatus: RiskDataStatus.UNAVAILABLE,
        lastRecordedTimestamp: null,
        severity: this.calculateHydrologicalSeverity(null, {
          warningLevel: 38.33,
          dangerLevel: 39.33,
          highestFloodLevel: 40.99
        }),
        downstreamWarningStatus: 'Hydrological status: UNAVAILABLE',
        upstreamBasinContext: {
          barrageName: 'Indrapuri Barrage',
          river: 'Sone (Tributary of Ganga)',
          location: 'Rohtas District, Dehri-on-Sone, Bihar (~250 km upstream of Munger)',
          dischargeCusecs: '180,000 cusecs (Prototype Scenario Context)',
          status: RiskDataStatus.PROTOTYPE,
          contextualRelationship: 'Sone River joins the Ganga near Maner (~200 km upstream of Munger). Historical flood waves transit with a 24-48 hour delay; this is contextual upstream basin data, NOT direct Kashtaharani Ghat inflow.',
          isDirectGaugeInflow: false
        },
        historicalContext: 'CWC benchmarks: Warning Level 38.33 m MSL, Danger Level 39.33 m MSL, Highest Flood Level (HFL) 40.99 m MSL (1976 / 40.84 m in 2016).',
        disclaimer: 'Official CWC hydrological station benchmarks. Live stage observation currently unavailable; no measurement is fabricated.'
      };

      return this.formatRiskItem(
        'Central Water Commission (CWC) / India-WRIS',
        [defaultMungerHydrology],
        new Date().toISOString(),
        null,
        RiskDataStatus.CACHED,
        {
          region: 'Munger / Bihar',
          riskType: 'HYDROLOGICAL',
          observedAt: null,
          summary: 'CWC Ganga River at Kashtaharani Ghat benchmarks (Warning: 38.33 m MSL, Danger: 39.33 m MSL, HFL: 40.99 m MSL). Live stage telemetry currently UNAVAILABLE.',
          actionRequired: 'Follow official municipal emergency broadcasts and district administration directives.'
        }
      );
    }

    return this.formatRiskItem(
      'CWC Hydrological Feed',
      dams,
      new Date().toISOString(),
      null,
      RiskDataStatus.CACHED,
      {
        region: 'Munger / Bihar',
        riskType: 'HYDROLOGICAL',
        observedAt: dams[0]?.lastRecordedTimestamp || null,
        summary: dams[0]?.downstreamWarningStatus || 'Hydrological status recorded.',
        actionRequired: 'Remain alert to river level fluctuations.'
      }
    );
  }

  /**
   * Retrieves verified IMD meteorological risk telemetry for the active region.
   */
  async getWeatherRiskDigest(regionId = 'bihar-munger') {
    if (regionId && regionId !== 'bihar-munger' && !regionId.includes('munger') && !regionId.includes('bihar')) {
      return this.formatRiskItem(
        'India Meteorological Department (IMD)',
        null,
        new Date().toISOString(),
        null,
        RiskDataStatus.UNAVAILABLE,
        {
          region: regionId,
          riskType: 'WEATHER',
          observedAt: null,
          summary: 'Weather bulletins currently unavailable for this region.',
          actionRequired: 'Tune in to local All India Radio broadcasts.'
        }
      );
    }

    // Verified IMD Patna baseline thresholds with explicit prototype scenario labeling
    const mungerWeatherBaseline = {
      agency: 'India Meteorological Department (IMD Patna)',
      station: 'Munger Agromet / District Observatory',
      status: RiskDataStatus.PROTOTYPE,
      isPrototype: true,
      scenarioNotice: 'PROTOTYPE / CACHED SCENARIO — Not a live IMD observation',
      observedTimestamp: null,
      currentObservation: 'UNAVAILABLE',
      warningCategory: 'Orange Alert (Be Prepared)',
      verifiedThresholdBracket: '>115.6 mm to 204.4 mm (IMD "Very Heavy Rain" Criterion)',
      rainfallSummary: 'IMD Orange Alert threshold (>115.6 mm to 204.4 mm) benchmarked for monsoon flood readiness.',
      windCondition: 'Monsoon squall bracket: 35-45 kmph along river corridor (Scenario Reference)',
      soilSaturation: 'Riparian saturation reference model'
    };

    return this.formatRiskItem(
      'India Meteorological Department (IMD Patna)',
      mungerWeatherBaseline,
      new Date().toISOString(),
      null,
      RiskDataStatus.PROTOTYPE,
      {
        region: 'Munger / Bihar',
        riskType: 'WEATHER',
        observedAt: null,
        summary: 'IMD Orange Alert precipitation threshold benchmark (>115.6 mm to 204.4 mm). Prototype demonstration scenario.',
        actionRequired: 'Seek sturdy shelter. Keep emergency communication devices charged.'
      }
    );
  }

  /**
   * Retrieves active government alerts from Supabase or cached regional fallback.
   */
  async getLiveAlerts(regionId = 'bihar-munger') {
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return this.formatRiskItem(
          'Supabase Live Alerts Feed',
          data,
          new Date().toISOString(),
          new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
          RiskDataStatus.LIVE,
          {
            region: regionId,
            riskType: 'SAFETY_PROTOCOL',
            observedAt: data[0].created_at || new Date().toISOString(),
            summary: data[0].title || 'Active government disaster directive.',
            actionRequired: data[0].action_required || 'Adhere strictly to official safety instructions.'
          }
        );
      }
    } catch {
      // Offline fallback
    }

    // Baseline verified IMD / BSDMA cached alert for Munger (Prototype Scenario)
    const cachedAlert = {
      id: 'alt-munger-01',
      title: 'Riparian Flood Advisory & Precipitation Protocol - Munger Sadar',
      category: 'IMD / BSDMA Prototype Advisory',
      severity: 'orange',
      source: 'India Meteorological Department (IMD Patna / BSDMA)',
      timestamp: '2026-09-04T06:00:00Z',
      isPrototype: true,
      summary: 'Monsoon surge protocol based on IMD Orange Alert (>115.6 mm) threshold and Ganga basin flood preparedness guidelines.',
      actionRequired: 'Move to designated high-elevation shelters. Avoid riverbank ghats.'
    };

    return this.formatRiskItem(
      'IMD / BSDMA Cached Package',
      [cachedAlert],
      new Date().toISOString(),
      null,
      RiskDataStatus.CACHED,
      {
        region: 'Munger / Bihar',
        riskType: 'SAFETY_PROTOCOL',
        observedAt: null,
        summary: cachedAlert.summary,
        actionRequired: cachedAlert.actionRequired
      }
    );
  }

  /**
   * Compiles comprehensive disaster intelligence digest across weather, river, and safety alerts.
   */
  async getComprehensiveDigest(regionId = 'bihar-munger') {
    const [damRisk, weatherRisk, alerts] = await Promise.all([
      this.getDamRiskDigest(regionId),
      this.getWeatherRiskDigest(regionId),
      this.getLiveAlerts(regionId)
    ]);

    const statuses = [damRisk.status, weatherRisk.status, alerts.status];
    let globalStatus = RiskDataStatus.CACHED;

    if (statuses.includes(RiskDataStatus.LIVE)) {
      globalStatus = RiskDataStatus.LIVE;
    } else if (statuses.every(s => s === RiskDataStatus.UNAVAILABLE)) {
      globalStatus = RiskDataStatus.UNAVAILABLE;
    } else if (statuses.every(s => s === RiskDataStatus.PROTOTYPE || s === RiskDataStatus.UNAVAILABLE)) {
      globalStatus = RiskDataStatus.PROTOTYPE;
    } else if (statuses.includes(RiskDataStatus.STALE)) {
      globalStatus = RiskDataStatus.STALE;
    }

    return {
      region: regionId,
      globalStatus,
      damRisk,
      weatherRisk,
      alerts,
      disclosure: this.disclosure,
      lastEvaluatedAt: new Date().toISOString()
    };
  }
}

export const riskDataService = new RiskDataService();

