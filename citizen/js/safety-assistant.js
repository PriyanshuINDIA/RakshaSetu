/**
 * RakshaSetu Multilingual Voice + Text Safety Assistant
 *
 * Implements deterministic safety assistance for citizens:
 * - 100% Deterministic Safety Intent Classification via SafetyGuidanceService
 * - ZERO external AI API, LLM, or paid service dependencies
 * - Voice input via browser Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 * - Voice output via browser SpeechSynthesis with speak / stop playback controls
 * - Works completely offline for local verified disaster safety guidance
 * - Safety guardrail rejecting non-disaster queries
 */

import { store } from './store.js';
import { safetyGuidanceService, SafetyIntent } from './core/safety-guidance-service.js';
import languageManager, { t } from '../i18n/index.js';

export const SPEECH_LANG_MAP = {
  en: 'en-IN',
  hi: 'hi-IN',
  as: 'as-IN',
  bn: 'bn-IN',
  brx: 'hi-IN',
  doi: 'hi-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ks: 'ks-IN',
  kok: 'kok-IN',
  mai: 'hi-IN',
  ml: 'ml-IN',
  mni: 'bn-IN',
  mr: 'mr-IN',
  ne: 'ne-NP',
  or: 'or-IN',
  pa: 'pa-IN',
  sa: 'sa-IN',
  sat: 'sat-IN',
  sd: 'sd-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  ur: 'ur-IN'
};

export class SafetyAssistant {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isSpeaking = false;
    this.activeUtterance = null;
    this.speechSynth = typeof window !== 'undefined' ? (window.speechSynthesis || null) : null;
    this.guidanceEngine = safetyGuidanceService;
    this.initSpeechRecognition();

    // Synchronize languageManager changes with store & speech engine
    if (typeof languageManager !== 'undefined' && languageManager.onLanguageChange) {
      languageManager.onLanguageChange((langCode) => {
        const currentProfile = store.getState()?.profile || {};
        if (currentProfile.language !== langCode) {
          store.setState({ profile: { ...currentProfile, language: langCode } });
        }
        if (this.recognition) {
          this.recognition.lang = SPEECH_LANG_MAP[langCode] || 'hi-IN';
        }
      });
    }

    // Synchronize store profile changes with languageManager & speech engine
    store.subscribe((state) => {
      const pLang = state?.profile?.language;
      if (pLang && typeof languageManager !== 'undefined' && languageManager.getLanguage && languageManager.getLanguage() !== pLang) {
        if (languageManager.setLanguage) {
          languageManager.setLanguage(pLang, false);
        }
        if (this.recognition) {
          this.recognition.lang = SPEECH_LANG_MAP[pLang] || 'hi-IN';
        }
      }
    });
  }

  initSpeechRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = this.getRecognitionLang();

        this.recognition.onstart = () => {
          this.isListening = true;
          this.notifySpeechState(true);
        };

        this.recognition.onend = () => {
          this.isListening = false;
          this.notifySpeechState(false);
        };

        this.recognition.onerror = (event) => {
          console.warn('[SafetyAssistant] Speech recognition error:', event.error);
          this.isListening = false;
          this.notifySpeechState(false);
        };
      } catch (e) {
        console.warn('[SafetyAssistant] Speech recognition initialization failed:', e);
        this.recognition = null;
      }
    }
  }

  getRecognitionLang(overrideLang) {
    if (overrideLang) return SPEECH_LANG_MAP[overrideLang] || 'hi-IN';
    const i18nLang = (typeof languageManager !== 'undefined' && languageManager?.getLanguage) ? languageManager.getLanguage() : null;
    const storeLang = store.getState()?.profile?.language;
    const langCode = i18nLang || storeLang || 'hi';
    return SPEECH_LANG_MAP[langCode] || 'hi-IN';
  }

  notifySpeechState(isListening) {
    if (typeof document === 'undefined') return;
    const micBtn = document.getElementById('assistantMicBtn');
    const waveElem = document.getElementById('assistantVoiceWave');
    if (micBtn) {
      micBtn.classList.toggle('listening', isListening);
      micBtn.setAttribute('aria-label', isListening ? t('assistant.listeningAria', 'Listening... Tap to stop') : t('assistant.micAriaLabel', 'Tap to speak'));
    }
    if (waveElem) {
      waveElem.style.display = isListening ? 'flex' : 'none';
    }
  }

  startListening(onResultCallback, onErrorCallback) {
    if (!this.recognition) {
      if (onErrorCallback) {
        onErrorCallback('UNSUPPORTED');
      } else if (typeof alert !== 'undefined') {
        alert(t('assistant.voiceNotSupported', 'Voice speech recognition is not supported in this browser engine. Please type your emergency question.'));
      }
      return false;
    }

    if (this.isListening) {
      this.stopListening();
      return true;
    }

    // Refresh language from current store preference
    this.recognition.lang = this.getRecognitionLang();

    this.recognition.onresult = (event) => {
      if (event.results && event.results[0] && event.results[0][0]) {
        const transcript = event.results[0][0].transcript;
        if (onResultCallback) onResultCallback(transcript);
      }
    };

    if (onErrorCallback) {
      const origOnError = this.recognition.onerror;
      this.recognition.onerror = (event) => {
        this.isListening = false;
        this.notifySpeechState(false);
        onErrorCallback(event.error);
        if (origOnError) origOnError(event);
      };
    }

    try {
      this.recognition.start();
      return true;
    } catch (e) {
      console.warn('[SafetyAssistant] Could not start speech recognition:', e);
      this.isListening = false;
      this.notifySpeechState(false);
      if (onErrorCallback) onErrorCallback(e.message);
      return false;
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        console.warn('[SafetyAssistant] Error stopping recognition:', e);
      }
      this.isListening = false;
      this.notifySpeechState(false);
    }
  }

  /**
   * Voice synthesis using browser SpeechSynthesis with speak/stop toggle
   */
  speak(text, options = {}) {
    if (!this.speechSynth) {
      console.warn('[SafetyAssistant] Speech synthesis is not supported on this browser/device.');
      return false;
    }

    // If currently speaking, stop first
    this.stopSpeaking();

    if (!text || typeof text !== 'string') return false;

    try {
      const langCode = options.lang || store.getState()?.profile?.language || 'hi';
      const bcpLang = SPEECH_LANG_MAP[langCode] || 'hi-IN';

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options.rate || 0.95; // Slightly slower pace for clear emergency comprehension
      utterance.pitch = options.pitch || 1.0;
      utterance.lang = bcpLang;

      this.activeUtterance = utterance;
      this.isSpeaking = true;

      utterance.onend = () => {
        this.isSpeaking = false;
        this.activeUtterance = null;
        if (options.onEnd) options.onEnd();
      };

      utterance.onerror = (err) => {
        console.warn('[SafetyAssistant] Speech synthesis utterance error:', err);
        this.isSpeaking = false;
        this.activeUtterance = null;
        if (options.onError) options.onError(err);
      };

      this.speechSynth.speak(utterance);
      return true;
    } catch (e) {
      console.warn('[SafetyAssistant] Speech synthesis failed:', e);
      this.isSpeaking = false;
      return false;
    }
  }

  stopSpeaking() {
    if (this.speechSynth) {
      try {
        this.speechSynth.cancel();
      } catch (e) {
        console.warn('[SafetyAssistant] Speech cancel error:', e);
      }
    }
    this.isSpeaking = false;
    this.activeUtterance = null;
  }

  /**
   * Unified Assistant query handler for text and voice:
   * Uses deterministic intent classification and verified local guidance.
   */
  async answerQuery(userPrompt) {
    const prompt = String(userPrompt || '').trim();
    const currentLang = store.getState()?.profile?.language || 'en';

    // Query core guidance engine (deterministic, non-generative, 100% offline-ready)
    const guidance = this.guidanceEngine.getGuidance(prompt, currentLang);

    // Format human-readable text block for backward compatibility
    let textSummary = `${guidance.title}\n\n`;
    if (guidance.immediateActions && guidance.immediateActions.length > 0) {
      textSummary += `MANDATORY ACTIONS:\n${guidance.immediateActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n`;
    }
    if (guidance.dontActions && guidance.dontActions.length > 0) {
      textSummary += `DO NOT:\n${guidance.dontActions.map(d => `• ${d}`).join('\n')}\n\n`;
    }
    if (guidance.whenToSeekHelp && guidance.whenToSeekHelp.length > 0) {
      textSummary += `WHEN TO CALL EMERGENCY (${guidance.emergencyContact}):\n${guidance.whenToSeekHelp.map(w => `🚨 ${w}`).join('\n')}\n\n`;
    }
    textSummary += `Source: ${guidance.source}`;

    return {
      ...guidance,
      text: textSummary,
      mode: 'DETERMINISTIC_SAFETY_GUIDANCE',
      warningNote: guidance.disclaimer,
      isLive: false // Local verified dataset
    };
  }
}

export const safetyAssistant = new SafetyAssistant();
