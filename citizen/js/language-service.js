/**
 * RakshaSetu Multilingual Language Service
 * Clear abstraction between local demo language heuristics and live Bhashini integration.
 * Truthfully identifies service mode without fabricating live translation claims.
 */

import { apiClient } from './api-client.js';

export class BaseLanguageService {
  async translate(text, targetLang, sourceLang = 'en') {
    throw new Error('Method translate() must be implemented by subclass.');
  }

  getServiceMode() {
    throw new Error('Method getServiceMode() must be implemented by subclass.');
  }
}

/**
 * Local Rule-based Demo Language Service
 * Provides instantaneous offline phrases and transparent prototype badge
 */
export class DemoLanguageService extends BaseLanguageService {
  constructor() {
    super();
    this.phrases = {
      hi: {
        'Flood': 'बाढ़',
        'Cyclone': 'चक्रवात',
        'Emergency SOS': 'आपातकालीन सहायता',
        'Relief Shelter': 'राहत शिविर',
        'I Am Safe': 'मैं सुरक्षित हूँ'
      },
      or: {
        'Flood': 'ବନ୍ୟା',
        'Cyclone': 'ବାତ୍ୟା',
        'Emergency SOS': 'ଜରୁରୀକାଳୀନ ସାହାଯ୍ୟ',
        'Relief Shelter': 'ଆଶ୍ରୟସ୍ଥଳୀ',
        'I Am Safe': 'ମୁଁ ସୁରକ୍ଷିତ ଅଛି'
      }
    };
  }

  async translate(text, targetLang, sourceLang = 'en') {
    if (targetLang === 'en' || !this.phrases[targetLang]) {
      return {
        translatedText: text,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        mode: 'DEMO_LOCAL',
        provider: 'Local Static Dictionary (Prototype)',
        isLiveService: false
      };
    }

    const matched = this.phrases[targetLang][text];
    return {
      translatedText: matched || text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      mode: 'DEMO_LOCAL',
      provider: 'Local Static Dictionary (Prototype)',
      isLiveService: false
    };
  }

  getServiceMode() {
    return {
      name: 'Demo / Offline Lexicon',
      isLive: false,
      disclaimer: 'Prototype language gateway • Real-time Bhashini API not yet connected.'
    };
  }
}

/**
 * Live Bhashini National Language Translation Integration
 */
export class BhashiniLanguageService extends BaseLanguageService {
  constructor() {
    super();
    this.endpoint = '/bhashini/translate';
  }

  async translate(text, targetLang, sourceLang = 'en') {
    try {
      const response = await apiClient.post(this.endpoint, {
        text,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang
      }, { timeout: 4000 });

      if (response.ok && response.data && response.data.translatedText) {
        return {
          translatedText: response.data.translatedText,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          mode: 'BHASHINI_LIVE',
          provider: 'Bhashini National AI Gateway',
          isLiveService: true
        };
      }
    } catch {
      // Fallback
    }

    // Fallback to Demo if live service is unavailable
    const fallback = new DemoLanguageService();
    return fallback.translate(text, targetLang, sourceLang);
  }

  getServiceMode() {
    return {
      name: 'Bhashini Government Gateway',
      isLive: true,
      disclaimer: 'Live national multilingual gateway active.'
    };
  }
}

export const demoLanguageService = new DemoLanguageService();
export const bhashiniLanguageService = new BhashiniLanguageService();

// Defaults to DemoLanguageService until active backend Bhashini key/endpoint is wired
export const languageService = demoLanguageService;
