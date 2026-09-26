/**
 * RakshaSetu Citizen Core - Satellite Service
 *
 * Provides context-aware external launcher to ISRO National Remote Sensing Centre (NRSC)
 * Bhuvan Disaster Management Support Services (DMSS) flood inundation portal.
 *
 * Operational Notice:
 * Bhuvan is an external satellite/disaster-visualization context launcher and is not
 * treated as a live RakshaSetu sensor feed. RakshaSetu does not perform local satellite
 * image processing, raster generation, or fake telemetry rendering.
 */

export const BHUVAN_NRSC_DISASTER_PORTAL_URL = 'https://bhuvan-app1.nrsc.gov.in/disaster/disaster.php';
export const BHUVAN_DISCLOSURE = 'Bhuvan is an external satellite/disaster-visualization context launcher and is not treated as a live RakshaSetu sensor feed.';

class SatelliteService {
  constructor() {
    this.defaultBhuvanUrl = BHUVAN_NRSC_DISASTER_PORTAL_URL;
    this.portalUrl = BHUVAN_NRSC_DISASTER_PORTAL_URL;
    this.disclosure = BHUVAN_DISCLOSURE;
    this.isLiveSensorFeed = false;
  }

  /**
   * Generates normalized satellite portal context for the designated region coordinates.
   * Single entry point adhering to disaster intelligence specifications.
   */
  getBhuvanDisasterContext(options = {}) {
    const ctx = this.getLaunchContext(options);
    return {
      title: 'ISRO Bhuvan Disaster Services',
      portalUrl: this.defaultBhuvanUrl,
      serviceProvider: 'National Remote Sensing Centre (NRSC) / ISRO',
      targetCoordinates: { lat: ctx.coordinates[0], lng: ctx.coordinates[1] },
      disclosure: this.disclosure,
      actionText: 'Open Official ISRO Bhuvan Portal',
      isLiveSensorFeed: false,
      ...ctx
    };
  }

  /**
   * Generates satellite portal context for the designated region coordinates.
   * Defaults to Munger, Bihar: [25.3757, 86.4735].
   */
  getLaunchContext(options = {}) {
    const {
      lat = 25.3757,
      lng = 86.4735,
      regionName = 'Munger / Bihar',
      regionId = 'bihar-munger'
    } = options;

    return {
      portalName: 'ISRO Bhuvan Disaster Management Geo-Portal',
      agency: 'National Remote Sensing Centre (NRSC / ISRO)',
      targetRegion: regionName,
      regionId: regionId,
      coordinates: [Number(lat), Number(lng)],
      url: this.defaultBhuvanUrl,
      satellitePlatforms: [
        'RISAT-1A (EOS-04) SAR C-band Imagery',
        'Resourcesat-2A LISS-IV Optical Sensor'
      ],
      notice: this.disclosure,
      isLiveSensorFeed: false,
      isLocalRasterProcessing: false
    };
  }

  /**
   * Launches the official external Bhuvan portal in a new browser tab with robust error handling.
   */
  launchBhuvanPortal(options = {}) {
    const context = this.getLaunchContext(options);

    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'ENVIRONMENT_UNSUPPORTED',
        message: 'Satellite portal launcher requires a browser window environment.',
        context
      };
    }

    try {
      const openedWindow = window.open(context.url, '_blank', 'noopener,noreferrer');

      // Popup blocked or window failed to open
      if (!openedWindow || openedWindow.closed || typeof openedWindow.closed === 'undefined') {
        return {
          launched: false,
          success: false,
          fallbackUrl: context.url,
          error: 'POPUP_BLOCKED_OR_OFFLINE',
          message: 'External satellite portal could not be launched. Please check popup permissions or network connectivity.',
          context
        };
      }

      return {
        launched: true,
        success: true,
        url: context.url,
        message: 'External Bhuvan disaster support portal opened in a new secure tab.',
        context
      };
    } catch (launchErr) {
      return {
        success: false,
        error: 'LAUNCH_EXCEPTION',
        message: `Failed to open external satellite portal: ${launchErr.message}`,
        context
      };
    }
  }
}

export const satelliteService = new SatelliteService();
