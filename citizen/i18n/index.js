/**
 * RakshaSetu Citizen PWA - Multilingual Localization Manager
 * Supporting all 23 official Indian languages with RTL support and seamless fallback.
 */

import en from './en.js';
import hi from './hi.js';
import as from './as.js';
import bn from './bn.js';
import brx from './brx.js';
import doi from './doi.js';
import gu from './gu.js';
import kn from './kn.js';
import ks from './ks.js';
import kok from './kok.js';
import mai from './mai.js';
import ml from './ml.js';
import mni from './mni.js';
import mr from './mr.js';
import ne from './ne.js';
import or from './or.js';
import pa from './pa.js';
import sa from './sa.js';
import sat from './sat.js';
import sd from './sd.js';
import ta from './ta.js';
import te from './te.js';
import ur from './ur.js';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', dir: 'ltr' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', dir: 'ltr' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', dir: 'ltr' },
  { code: 'brx', name: 'Bodo', native: 'बर’', dir: 'ltr' },
  { code: 'doi', name: 'Dogri', native: 'डोगरी', dir: 'ltr' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', dir: 'ltr' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', dir: 'ltr' },
  { code: 'ks', name: 'Kashmiri', native: 'कॉशुर / کٲشُر', dir: 'ltr' },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी', dir: 'ltr' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली', dir: 'ltr' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', dir: 'ltr' },
  { code: 'mni', name: 'Manipuri', native: 'মৈতৈলোন্ / ꯃꯤꯇꯩꯂꯣꯟ', dir: 'ltr' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', dir: 'ltr' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', dir: 'ltr' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', dir: 'ltr' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', dir: 'ltr' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्', dir: 'ltr' },
  { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', dir: 'ltr' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', dir: 'rtl' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', dir: 'ltr' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', dir: 'ltr' },
  { code: 'ur', name: 'Urdu', native: 'اردو', dir: 'rtl' }
];

export const translations = {
  en, hi, as, bn, brx, doi, gu, kn, ks, kok, mai, ml, mni, mr, ne, or, pa, sa, sat, sd, ta, te, ur
};

const STORAGE_KEY = 'rakshasetu_language';

const KEY_ALIASES = {
  'auth.portal_title': 'auth.portalTitle',
  'auth.portal_subtitle': 'auth.portalSubtitle',
  'auth.tab_signin': 'auth.signInTab',
  'auth.tab_register': 'auth.registerTab',
  'auth.label_email': 'auth.emailLabel',
  'auth.email_placeholder': 'auth.emailPlaceholder',
  'auth.label_password': 'auth.passwordLabel',
  'auth.password_placeholder': 'auth.passwordPlaceholder',
  'auth.forgot_password': 'auth.forgotPasswordLink',
  'auth.btn_signin': 'auth.signInButton',
  'auth.noAccountPrompt': 'auth.noProfilePrompt',
  'auth.full_name': 'auth.fullNameLabel',
  'auth.name_placeholder': 'auth.fullNamePlaceholder',
  'auth.addressHelp': 'auth.fullNameHelp',
  'auth.signup_email': 'auth.emailLabel',
  'auth.signup_password': 'auth.passwordLabel',
  'auth.min_password_placeholder': 'auth.signupPasswordPlaceholder',
  'auth.phone': 'auth.phoneLabel',
  'auth.blood_group': 'auth.bloodGroupLabel',
  'auth.dob': 'auth.dobLabel',
  'auth.contactHeading': 'auth.emergencyContactHeading',
  'auth.btn_create_account': 'auth.createAccountButton',
  'language.ok_btn': 'language.okButton',
  'header.app_name': 'common.appName',
  'header.sim_btn': 'header.simButton',
  'sim.title': 'sim.sheetTitle',
  'sim.subtitle': 'sim.sheetSubtitle',
  'sim.description': 'sim.desc',
  'family.quickTitle': 'family.imSafeCardTitle',
  'family.quickDesc': 'family.imSafeCardDesc',
  'family.broadcastBtn': 'family.broadcastButton',
  'family.contactsTitle': 'family.savedContactsHeading',
  'resources.call112': 'resources.dial112',
  'resources.call1070': 'resources.dial1070',
  'resources.call108': 'resources.dial108',
  'resources.call1077': 'resources.dial1077',
  'resources.needTypeLabel': 'resources.whatRequireLabel',
  'resources.vulnerableLabel': 'resources.vulnerableCheckLabel',
  'resources.risingWaterLabel': 'resources.waterRisingCheckLabel',
  'resources.submitButton': 'resources.submitRequestBtn',
  'resources.logReportBtn': 'resources.logRebuildBtn',
  'map.liveIncidents': 'map.liveIncidentsBtn',
  'map.bhuvanPortal': 'map.isroPortalBtn',
  'setup.preferred_language': 'setup.preferredLanguage',
  'setup.langHelp': 'setup.languageHelp',
  'setup.locationHelp': 'setup.geolocationHelp',
  'assistant.welcomeMessage': 'assistant.greetingMessage',
  'assistant.sopTag': 'assistant.ndmaSourceTag',
  'assistant.misinfoTitle': 'assistant.misinformationTitle',
  'assistant.misinfoSubtitle': 'assistant.misinformationSubtitle',
  'assistant.misinfoDesc': 'assistant.misinformationDesc',
  'splash.step_pkg': 'splash.checkingOfflinePackage',
  'splash.step_contacts': 'splash.checkingEmergencyContacts',
  'splash.step_location': 'splash.checkingLocationCapability',
  'splash.step_network': 'splash.probingNetworkTier',
  'splash.step_config': 'splash.loadingNdmaProtocols',
  'auth.rememberedPasswordPrompt': 'auth.rememberPasswordPrompt',
  'home.actionFamily': 'home.actionImSafe',
  'home.actionHelp': 'home.actionResource',
  'resources.trackingIdLabel': 'sos.trackingIdLabel'
};

class LanguageManager {
  constructor() {
    this.currentLanguage = localStorage.getItem(STORAGE_KEY) || 'en';
    this.listeners = [];
  }

  /**
   * Check if language was explicitly selected by user before
   */
  hasSavedLanguage() {
    return !!localStorage.getItem(STORAGE_KEY);
  }

  /**
   * Get current active language code
   */
  getLanguage() {
    return this.currentLanguage;
  }

  /**
   * Get metadata for the current language
   */
  getCurrentLanguageMeta() {
    return SUPPORTED_LANGUAGES.find(l => l.code === this.currentLanguage) || SUPPORTED_LANGUAGES[0];
  }

  /**
   * Check if current language is RTL
   */
  isRTL() {
    const meta = this.getCurrentLanguageMeta();
    return meta ? meta.dir === 'rtl' : false;
  }

  /**
   * Set and switch active language
   */
  setLanguage(langCode, persist = true) {
    if (!translations[langCode]) {
      console.warn(`[i18n] Language code "${langCode}" not found, defaulting to "en".`);
      langCode = 'en';
    }

    this.currentLanguage = langCode;

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, langCode);
      } catch (err) {
        console.warn('[i18n] Failed to persist language to localStorage:', err);
      }
    }

    const meta = this.getCurrentLanguageMeta();
    const isRtl = meta.dir === 'rtl';

    // Update document attributes
    document.documentElement.lang = langCode;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';

    if (isRtl) {
      document.body.classList.add('rtl-layout');
    } else {
      document.body.classList.remove('rtl-layout');
    }

    // Apply translations across DOM
    this.applyTranslations();

    // Notify listeners
    this.listeners.forEach(fn => {
      try {
        fn(langCode, meta);
      } catch (e) {
        console.error('[i18n] Error in language change listener:', e);
      }
    });

    window.dispatchEvent(new CustomEvent('languagechange', { detail: { language: langCode, meta } }));
  }

  /**
   * Subscribe to language change events
   */
  onLanguageChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Resolve dot-delimited key with interpolation
   * e.g. translate('home.greeting', { name: 'Rahul' })
   */
  translate(keyPath, params = {}) {
    if (!keyPath || typeof keyPath !== 'string') return '';

    const resolvedKey = KEY_ALIASES[keyPath] || keyPath;
    const keys = resolvedKey.split('.');
    let val = this.resolveKey(translations[this.currentLanguage], keys);

    // Fallback to English if missing in target language
    if (val === undefined && this.currentLanguage !== 'en') {
      val = this.resolveKey(translations.en, keys);
    }

    // If still missing, return fallback string if provided, or keyPath
    if (val === undefined || val === null) {
      if (typeof params === 'string') {
        return params;
      }
      return keyPath;
    }

    let text = String(val);

    // Variable interpolation: {key} -> value
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v !== undefined && v !== null ? v : '');
      }
    }

    return text;
  }

  resolveKey(obj, keys) {
    if (!obj) return undefined;
    let curr = obj;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (curr && typeof curr === 'object' && k in curr) {
        curr = curr[k];
      } else if (curr && typeof curr === 'object') {
        // Case-insensitive key match
        const lowerK = k.toLowerCase();
        const found = Object.keys(curr).find(ck => ck.toLowerCase() === lowerK);
        if (found) {
          curr = curr[found];
        } else if (i === 0 && (k === 'incident' || k === 'resource') && curr?.status && typeof curr.status === 'object' && k in curr.status) {
          curr = curr.status[k];
        } else if (i === 0 && k === 'status' && keys.length > 1 && keys[1] in curr) {
          // Skip 'status' prefix if keys are at root
          continue;
        } else {
          return undefined;
        }
      } else {
        return undefined;
      }
    }
    return curr;
  }

  /**
   * Traverse DOM and update elements with data-i18n attributes
   */
  applyTranslations(root = document) {
    if (!root || !root.querySelectorAll) return;

    // 1. Text content
    const textEls = root.querySelectorAll('[data-i18n]');
    textEls.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const translated = this.translate(key);
        if (translated && translated !== key) {
          el.textContent = translated;
        }
      }
    });

    // 2. Placeholders
    const placeholderEls = root.querySelectorAll('[data-i18n-placeholder]');
    placeholderEls.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        const translated = this.translate(key);
        if (translated && translated !== key) {
          el.placeholder = translated;
        }
      }
    });

    // 3. Titles / tooltips
    const titleEls = root.querySelectorAll('[data-i18n-title]');
    titleEls.forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        const translated = this.translate(key);
        if (translated && translated !== key) {
          el.title = translated;
        }
      }
    });

    // 4. Accessibility aria-label
    const ariaEls = root.querySelectorAll('[data-i18n-aria]');
    ariaEls.forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) {
        const translated = this.translate(key);
        if (translated && translated !== key) {
          el.setAttribute('aria-label', translated);
        }
      }
    });
  }

  /**
   * Initialize language manager on app startup
   */
  init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const initialLang = saved || 'en';
    this.setLanguage(initialLang, !!saved);
  }
}

export const languageManager = new LanguageManager();
export const t = (key, params) => languageManager.translate(key, params);

// Dynamic Status & Label Display Mappings (Preserves backend DB values, translates UI)
export function mapIncidentStatus(status) {
  if (!status) return t('incident.pending');
  const key = String(status).toUpperCase();
  switch (key) {
    case 'UNASSIGNED':
    case 'PENDING':
      return t('incident.pending');
    case 'ASSIGNED':
      return t('incident.assigned');
    case 'RESPONDING':
      return t('incident.responding');
    case 'REACHED':
      return t('incident.reached');
    case 'RESOLVED':
      return t('incident.resolved');
    case 'CANCELLED':
      return t('incident.cancelled');
    default:
      return status;
  }
}

export function mapResourceStatus(status) {
  if (!status) return t('resource.pending');
  const key = String(status).toUpperCase().replace(/[\s_-]+/g, '');
  switch (key) {
    case 'PENDING':
    case 'PENDINGSYNC':
      return t('resource.pending');
    case 'ASSIGNED':
      return t('resource.assigned');
    case 'INTRANSIT':
      return t('resource.inTransit');
    case 'DELIVERED':
      return t('resource.delivered');
    case 'CANCELLED':
      return t('resource.cancelled');
    default:
      return status;
  }
}

export function mapPriority(priority) {
  if (!priority) return t('priority.medium');
  const key = String(priority).toUpperCase();
  switch (key) {
    case 'CRITICAL':
      return t('priority.critical');
    case 'HIGH':
      return t('priority.high');
    case 'MEDIUM':
      return t('priority.medium');
    case 'LOW':
      return t('priority.low');
    default:
      return priority;
  }
}

export function mapResourceType(type) {
  if (!type) return t('resources.needGeneral');
  const key = String(type).toUpperCase();
  if (key.includes('FOOD')) return t('resources.needFood');
  if (key.includes('WATER')) return t('resources.needWater');
  if (key.includes('MED')) return t('resources.needMedical');
  if (key.includes('SHELT')) return t('resources.needShelter');
  if (key.includes('RESCUE') || key.includes('BOAT') || key.includes('EVAC')) return t('resources.needRescue');
  return `${type} ${t('resources.needSuffix')}`;
}

export function getTierDetailsI18n(tierId) {
  switch (tierId) {
    case 'INTERNET_ONLINE':
      return {
        label: t('sim.tierOnlineLabel'),
        subtext: t('sim.tierOnlineSubtext'),
        banner: t('sim.tierOnlineBanner'),
        shortLabel: t('common.online')
      };
    case 'OFFLINE_PACKAGE_ACTIVE':
      return {
        label: t('sim.tierOfflineLabel'),
        subtext: t('sim.tierOfflineSubtext'),
        banner: t('sim.tierOfflineBanner'),
        shortLabel: t('common.offline')
      };
    case 'SMS_ONLY':
      return {
        label: t('sim.tierSmsLabel'),
        subtext: t('sim.tierSmsSubtext'),
        banner: t('sim.tierSmsBanner'),
        shortLabel: t('common.sms')
      };
    case 'NEARBY_DEVICE_MESH':
      return {
        label: t('sim.tierMeshLabel'),
        subtext: t('sim.tierMeshSubtext'),
        banner: t('sim.tierMeshBanner'),
        shortLabel: t('sim.tierMeshLabel')
      };
    case 'COMMUNITY_RELAY':
      return {
        label: t('sim.tierRelayLabel'),
        subtext: t('sim.tierRelaySubtext'),
        banner: t('sim.tierRelayBanner'),
        shortLabel: t('sim.tierRelayLabel')
      };
    case 'SATELLITE_RELAY':
      return {
        label: t('sim.tierSatLabel'),
        subtext: t('sim.tierSatSubtext'),
        banner: t('sim.tierSatBanner'),
        shortLabel: t('sim.tierSatLabel')
      };
    case 'TOTAL_FAILURE':
      return {
        label: t('sim.tierBlackoutLabel'),
        subtext: t('sim.tierBlackoutSubtext'),
        banner: t('sim.tierBlackoutBanner'),
        shortLabel: t('sim.tierBlackoutLabel')
      };
    default:
      return null;
  }
}

export function getRegionI18nKey(regionId) {
  if (!regionId) return 'region.selectPackage';
  switch (regionId) {
    case 'bihar-munger':
      return 'region.mungerBihar';
    case 'odisha-coastal':
      return 'region.odishaCoastal';
    case 'mumbai-metro':
      return 'region.mumbaiMetro';
    default:
      return null;
  }
}

export function getRegionNameI18n(regionId) {
  if (!regionId) return t('region.selectPackage');
  switch (regionId) {
    case 'bihar-munger':
      return t('region.mungerBihar');
    case 'odisha-coastal':
      return t('region.odishaCoastal');
    case 'mumbai-metro':
      return t('region.mumbaiMetro');
    default:
      return regionId;
  }
}

// Attach globally to window for frictionless usage across vanilla scripts
if (typeof window !== 'undefined') {
  window.languageManager = languageManager;
  window.t = t;
  window.mapIncidentStatus = mapIncidentStatus;
  window.mapResourceStatus = mapResourceStatus;
  window.mapPriority = mapPriority;
  window.mapResourceType = mapResourceType;
  window.getTierDetailsI18n = getTierDetailsI18n;
  window.getRegionNameI18n = getRegionNameI18n;
  window.getRegionI18nKey = getRegionI18nKey;
  window.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
}

export default languageManager;


