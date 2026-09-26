/**
 * RakshaSetu Main Application Orchestrator
 * Integrates 11 major screens, 4 bottom nav items, 7 network tiers, and accessibility modes.
 * Full enterprise integration with Supabase backend, persistent outbox sync, and Realtime telemetry.
 */

import { store, NetworkStates } from './store.js';
import { networkManager, NetworkTierDetails } from './network-manager.js';
import { offlineStorage } from './offline-storage.js';
import { emergencySOS } from './emergency-sos.js';
import { safetyAssistant } from './safety-assistant.js';
import { safetyMap } from './safety-map.js';
import { alertsManager, DataSourceState } from './alerts-manager.js';
import { EmergencyHealthProtocols } from './health-guide.js';
import { familySafety, FamilyDeliveryStates } from './family-safety.js';
import { resourceRequests } from './resource-requests.js';
import { apiClient } from './api-client.js';
import { syncManager } from './core/sync-manager.js';
import { languageService } from './language-service.js';
import { authService } from './auth-service.js';
import { supabase } from './supabase-client.js';
import { realtimeService } from './realtime-service.js';
import languageManager, { SUPPORTED_LANGUAGES, t, mapIncidentStatus, mapResourceStatus, mapPriority, mapResourceType, getTierDetailsI18n, getRegionNameI18n, getRegionI18nKey } from '../i18n/index.js';

class RakshaSetuApp {
  constructor() {
    this.store = store;
    this.offlineStorage = offlineStorage;
    this.safetyMap = safetyMap;
    this.authService = authService;
    this.emergencySOS = emergencySOS;
    this.resourceRequests = resourceRequests;
    this.realtimeService = realtimeService;
    this.supabase = supabase;
    this.languageManager = languageManager;
    this.selectedLanguageCode = localStorage.getItem('rakshasetu_language') || 'hi';
    this.initApp();
  }

  showScreen(screenId) {
    const cleanId = (screenId || '').replace(/^screen-/, '');
    this.store.navigateTo(cleanId);
  }

  async triggerSafeRouteToShelter(targetShelter = null) {
    this.store.navigateTo('map');
    if (!this.safetyMap.map) {
      this.safetyMap.initMap();
    }
    await this.safetyMap.plotSafestRoute(targetShelter);
  }

  async initApp() {
    console.log('[RakshaSetu] Initializing application core...');

    // 0. Initialize Multilingual Localization Engine
    languageManager.init();
    languageManager.onLanguageChange(() => {
      this.updateHeaderRegion(this.store.getState().profile?.region, this.store.getState().profile?.regionName);
      this.render(this.store.getState());
    });

    // Immediately synchronize header from initial store state
    const initialProf = this.store.getState().profile || {};
    this.updateHeaderRegion(initialProf.region, initialProf.regionName);

    // 1. Register Service Worker for PWA (with active update check)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.log('[SW] Registered successfully:', reg.scope);
          reg.update().catch(() => {});
        })
        .catch(err => console.warn('[SW] Registration failed:', err));
    }

    // 2. Load pre-packaged regional data & resolve initial region
    await offlineStorage.loadRegionalData();
    const currentProfile = store.getState().profile || {};
    const currentLocation = store.getState().location;
    const resolvedPkg = await offlineStorage.resolveActiveRegionPackage(currentProfile, currentLocation);
    if (resolvedPkg) {
      if (!currentProfile.region || (currentProfile.region === 'odisha-coastal' && !currentProfile.hasManuallySelectedRegion && ((currentProfile.district || '').toLowerCase().includes('munger') || (currentProfile.state || '').toLowerCase().includes('bihar')))) {
        store.setState({
          profile: {
            ...currentProfile,
            region: resolvedPkg.id,
            regionName: resolvedPkg.name
          },
          offlinePackage: {
            downloaded: true,
            version: resolvedPkg.version || '2026.4.1',
            lastUpdated: resolvedPkg.releaseDate || new Date().toISOString(),
            regionId: resolvedPkg.id,
            sizeKb: resolvedPkg.sizeKb || 185
          }
        });
      }
    }
    // Update header with resolved package
    this.updateHeaderRegion(store.getState().profile?.region, store.getState().profile?.regionName);

    // 3. Bind Global Store Subscription
    store.subscribe((state) => this.render(state));

    // 4. Attach Event Listeners (DOM)
    this.attachDomListeners();

    // 5. Initialize Supabase Auth & Session Verification
    await this.initAuth();

    // 6. Backend Connectivity & WebSocket Startup Probing
    this.initBackendConnections();

    // 7. Run Splash Screen Diagnostic Sequence
    this.runSplashSequence();

    // 8. Initial Render
    this.render(store.getState());
  }

  async initBackendConnections() {
    // 1. Probe Supabase cloud backend
    await networkManager.probeBackendHealth();

    // 2. Auto-sync any pending outbox items from previous sessions
    await syncManager.syncPendingOutbox('startup_recovery');

    // 3. Listen for backend reconnect events
    window.addEventListener('rakshasetu:backend-reconnected', () => {
      syncManager.syncPendingOutbox('backend_reconnected');
    });

    // 5. Listen for WebSocket alert and shelter updates
    window.addEventListener('rakshasetu:alert-broadcast', () => {
      alertsManager.fetchLiveAlerts().then(() => {
        if (store.getState().currentScreen === 'alerts') {
          this.renderAlerts(store.getState());
        }
      });
    });

    window.addEventListener('rakshasetu:shelter-updated', () => {
      safetyMap.fetchLiveShelters().then(() => {
        if (store.getState().currentScreen === 'map') {
          if (safetyMap.map) safetyMap.renderMarkers();
          this.renderActiveSheltersList();
        }
      });
    });

    // Supabase Realtime channel for public.shelters table
    if (supabase) {
      try {
        supabase
          .channel('public-shelters-live')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'shelters' },
            (payload) => {
              console.log('[RakshaSetu][Realtime] Shelters change received:', payload);
              window.dispatchEvent(new CustomEvent('rakshasetu:shelter-updated'));
            }
          )
          .subscribe((status) => {
            console.log('[RakshaSetu][Realtime] Shelters channel status:', status);
          });
      } catch (e) {
        console.warn('[RakshaSetu] Shelters realtime subscription error:', e);
      }
    }
  }

  attachDomListeners() {
    // Multilingual Language Selection Cards
    const langCards = document.querySelectorAll('.language-option-card');
    const activeLang = this.selectedLanguageCode || (languageManager.hasSavedLanguage() ? languageManager.getLanguage() : 'hi');
    this.selectedLanguageCode = activeLang;
    langCards.forEach(c => {
      c.classList.toggle('selected', c.getAttribute('data-lang-code') === activeLang);
    });

    const selectLanguageOption = (card) => {
      const langCode = card.getAttribute('data-lang-code');
      if (langCode) {
        this.selectedLanguageCode = langCode;
        langCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        // Live preview selected language on current screen without persisting yet
        languageManager.setLanguage(langCode, false);
      }
    };

    langCards.forEach(card => {
      card.addEventListener('click', () => selectLanguageOption(card));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectLanguageOption(card);
        }
      });
    });

    // Multilingual Language Selection Screen OK Confirmation Button
    const langOkBtn = document.getElementById('languageSelectOkBtn');
    if (langOkBtn) {
      langOkBtn.addEventListener('click', () => {
        const chosen = this.selectedLanguageCode || languageManager.getLanguage() || 'hi';
        languageManager.setLanguage(chosen, true);
        const currentProfile = store.getState().profile || {};
        store.setState({ profile: { ...currentProfile, language: chosen } });

        // Update settings dropdowns if present
        const profileLang = document.getElementById('profileLangSelect');
        if (profileLang) profileLang.value = chosen;
        const setupLang = document.getElementById('setupLanguage');
        if (setupLang) setupLang.value = chosen;

        // Navigate to auth (or home if already authenticated)
        const isAuth = Boolean(currentProfile.isAuthenticated && currentProfile.citizenId);
        store.navigateTo(isAuth ? 'home' : 'auth');
      });
    }

    // Profile Settings Language Dropdown (Allows changing language anytime)
    const profileLang = document.getElementById('profileLangSelect');
    if (profileLang) {
      profileLang.value = languageManager.getLanguage();
      profileLang.addEventListener('change', (e) => {
        const newLang = e.target.value;
        languageManager.setLanguage(newLang, true);
        const currentProfile = store.getState().profile || {};
        store.setState({ profile: { ...currentProfile, language: newLang } });
        this.selectedLanguageCode = newLang;
        document.querySelectorAll('.language-option-card').forEach(c => {
          c.classList.toggle('selected', c.getAttribute('data-lang-code') === newLang);
        });
      });
    }

    // Initial Setup Language Dropdown
    const setupLang = document.getElementById('setupLanguage');
    if (setupLang) {
      setupLang.value = languageManager.getLanguage();
      setupLang.addEventListener('change', (e) => {
        const newLang = e.target.value;
        languageManager.setLanguage(newLang, true);
        const currentProfile = store.getState().profile || {};
        store.setState({ profile: { ...currentProfile, language: newLang } });
        this.selectedLanguageCode = newLang;
        document.querySelectorAll('.language-option-card').forEach(c => {
          c.classList.toggle('selected', c.getAttribute('data-lang-code') === newLang);
        });
      });
    }

    // Profile Regional Disaster Package Dropdown (Allows changing region anytime)
    const profileRegSelect = document.getElementById('profileRegionSelect');
    if (profileRegSelect) {
      profileRegSelect.value = store.getState().profile?.region || '';
      profileRegSelect.addEventListener('change', async (e) => {
        const chosenId = e.target.value;
        const currentProf = store.getState().profile || {};
        if (!chosenId) {
          store.setState({
            profile: {
              ...currentProf,
              region: null,
              regionName: null,
              hasManuallySelectedRegion: true
            },
            offlinePackage: {
              downloaded: false,
              version: '2026.4.1',
              lastUpdated: null,
              regionId: null,
              sizeKb: 0
            }
          });
          this.updateHeaderRegion(null, null);
        } else {
          const pkg = await offlineStorage.getPackageForRegion(chosenId);
          const regName = pkg ? pkg.name : (chosenId === 'bihar-munger' ? 'Munger / Bihar' : chosenId);
          store.setState({
            profile: {
              ...currentProf,
              region: chosenId,
              regionName: regName,
              hasManuallySelectedRegion: true
            },
            offlinePackage: {
              downloaded: true,
              version: pkg?.version || '2026.4.1',
              lastUpdated: pkg?.releaseDate || new Date().toISOString(),
              regionId: chosenId,
              sizeKb: pkg?.sizeKb || 185
            }
          });
          this.updateHeaderRegion(chosenId, regName);
        }
        const setupReg = document.getElementById('setupRegion');
        if (setupReg) setupReg.value = chosenId || '';
      });
    }

    // Bottom Navigation Tabs (4 Items Only)
    document.querySelectorAll('.bottom-nav-bar .nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!store.getState().profile?.isAuthenticated) {
          store.navigateTo('auth');
          return;
        }
        const screen = e.currentTarget.getAttribute('data-screen');
        if (screen) store.navigateTo(screen);
      });
    });

    // Network Simulator Trigger
    const simTrigger = document.getElementById('networkSimTrigger');
    if (simTrigger) {
      simTrigger.addEventListener('click', () => store.openSheet('sim-drawer'));
    }

    const networkBanner = document.getElementById('globalNetworkBanner');
    if (networkBanner) {
      networkBanner.addEventListener('click', () => store.openSheet('sim-drawer'));
    }

    // Sheet Close Buttons & Backdrop
    document.querySelectorAll('[data-action="close-sheet"]').forEach(btn => {
      btn.addEventListener('click', () => store.closeSheet());
    });
    const backdrop = document.getElementById('globalSheetBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => store.closeSheet());
    }

    // Dialog Backdrop
    const dialogBackdrop = document.getElementById('globalDialogBackdrop');
    if (dialogBackdrop) {
      dialogBackdrop.addEventListener('click', (e) => {
        if (e.target === dialogBackdrop) {
          dialogBackdrop.classList.remove('active');
        }
      });
    }

    // Main SOS Button on Home Screen
    const mainSosBtn = document.getElementById('mainSosButton');
    if (mainSosBtn) {
      mainSosBtn.addEventListener('click', () => this.startSOSWorkflow());
    }

    // Live SOS Broadcast Button on SOS Screen
    const liveSosBtn = document.getElementById('sosLiveBroadcastBtn');
    if (liveSosBtn) {
      liveSosBtn.addEventListener('click', () => this.dispatchOnlineSOS());
    }

    // Voice Assistant Mic Button
    const micBtn = document.getElementById('assistantMicBtn');
    if (micBtn) {
      micBtn.addEventListener('click', () => {
        safetyAssistant.startListening((text) => {
          const input = document.getElementById('assistantTextInput');
          if (input) input.value = text;
          this.handleAssistantSend(text);
        });
      });
    }

    // Assistant Send Button
    const sendBtn = document.getElementById('assistantSendBtn');
    const textInput = document.getElementById('assistantTextInput');
    if (sendBtn && textInput) {
      sendBtn.addEventListener('click', () => {
        const val = textInput.value.trim();
        if (val) {
          this.handleAssistantSend(val);
          textInput.value = '';
        }
      });
      textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = textInput.value.trim();
          if (val) {
            this.handleAssistantSend(val);
            textInput.value = '';
          }
        }
      });
    }

    // Health Guide Category Tabs
    document.querySelectorAll('.health-tab-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        document.querySelectorAll('.health-tab-pill').forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const category = e.currentTarget.getAttribute('data-category');
        this.renderHealthCategory(category);
      });
    });

    // Resource Request Form
    const resourceForm = document.getElementById('resourceRequestForm');
    if (resourceForm) {
      resourceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const needType = document.getElementById('reqNeedType').value;
        const personCount = document.getElementById('reqPersonCount').value;
        const hasVulnerable = document.getElementById('reqVulnerableCheck').checked;
        const waterRising = document.getElementById('reqWaterRisingCheck').checked;
        const desc = document.getElementById('reqDescription').value;

        const result = await resourceRequests.submitRequest({
          needType,
          personCount,
          hasVulnerablePersons: hasVulnerable,
          waterRising,
          description: desc
        });

        this.showRequestConfirmation(result);
        resourceForm.reset();
      });
    }

    // Rebuild Feedback Form
    const rebuildForm = document.getElementById('rebuildFeedbackForm');
    if (rebuildForm) {
      rebuildForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('rebuildInfraType').value;
        const landmark = document.getElementById('rebuildLandmark').value;
        const text = document.getElementById('rebuildDescription').value;

        await resourceRequests.submitRebuildFeedback({ type, landmark, text });
        alert(t('resources.rebuildReportSaved', 'Thank you. Your civic infrastructure report has been recorded locally for recovery coordination.'));
        rebuildForm.reset();
      });
    }

    // Initial Setup Form
    const setupForm = document.getElementById('initialSetupForm');
    if (setupForm) {
      setupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const lang = document.getElementById('setupLanguage').value;
        const reg = document.getElementById('setupRegion').value;
        const regName = reg ? (document.getElementById('setupRegion').options[document.getElementById('setupRegion').selectedIndex]?.text || getRegionNameI18n(reg)) : null;
        const heartbeat = document.getElementById('setupHeartbeat').checked;
        const locationOk = document.getElementById('setupLocation').checked;

        const profile = {
          ...store.getState().profile,
          hasCompletedSetup: true,
          language: lang,
          region: reg || null,
          regionName: regName,
          hasManuallySelectedRegion: !!reg,
          heartbeatEnabled: heartbeat,
          locationAllowed: locationOk
        };

        if (reg) {
          offlineStorage.getPackageForRegion(reg).then(pkg => {
            if (pkg) {
              store.setState({
                offlinePackage: {
                  downloaded: true,
                  version: pkg.version || '2026.4.1',
                  lastUpdated: pkg.releaseDate || new Date().toISOString(),
                  regionId: pkg.id,
                  sizeKb: pkg.sizeKb || 185
                }
              });
            }
          });
        }

        store.setState({ profile, currentScreen: 'home' });
        this.updateHeaderRegion(profile.region, profile.regionName);
      });
    }

    const syncOutboxBtn = document.getElementById('profileSyncOutboxBtn');
    if (syncOutboxBtn) {
      syncOutboxBtn.addEventListener('click', async () => {
        const feedback = document.getElementById('profileBackendFeedback');
        if (feedback) feedback.textContent = t('profile.syncingOutbox', 'Syncing local outbox...');

        const result = await syncManager.syncPendingOutbox('profile_button');
        if (feedback) {
          feedback.textContent = t('profile.syncPassComplete', { synced: result.syncedCount, remaining: result.remainingPending }) || `Sync pass complete: ${result.syncedCount} synced, ${result.remainingPending} remaining.`;
          feedback.style.color = result.remainingPending === 0 ? '#166534' : '#B45309';
        }
      });
    }

    // ========================================================================
    // AUTHENTICATION EVENT LISTENERS (LOGIN / SIGNUP / LOGOUT)
    // ========================================================================
    const tabLogin = document.getElementById('authTabLogin');
    const tabSignup = document.getElementById('authTabSignup');
    const switchToSignup = document.getElementById('authSwitchToSignupBtn');
    const switchToLogin = document.getElementById('authSwitchToLoginBtn');
    const forgotPasswordLink = document.getElementById('authForgotPasswordLink');
    const switchBackToLogin = document.getElementById('authSwitchBackToLoginBtn');

    if (tabLogin) tabLogin.addEventListener('click', () => this.switchAuthTab('login'));
    if (tabSignup) tabSignup.addEventListener('click', () => this.switchAuthTab('signup'));
    if (switchToSignup) switchToSignup.addEventListener('click', () => this.switchAuthTab('signup'));
    if (switchToLogin) switchToLogin.addEventListener('click', () => this.switchAuthTab('login'));
    if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', () => this.switchAuthTab('forgot'));
    if (switchBackToLogin) switchBackToLogin.addEventListener('click', () => this.switchAuthTab('login'));

    // Forgot Password Form Submit
    const forgotPasswordForm = document.getElementById('authForgotPasswordForm');
    if (forgotPasswordForm) {
      forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotPasswordEmail')?.value?.trim();
        const submitBtn = document.getElementById('forgotPasswordSubmitBtn');

        if (!email) {
          this.showAuthAlert(t('auth.enterEmailError', 'Please enter your registered email address.'), 'error');
          return;
        }

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = `${t('common.loading')}`;
          }
          this.showAuthAlert(null);

          await authService.resetPasswordForEmail(email);

          this.showAuthAlert(t('auth.resetLinkSent', { email }) || `Password reset link sent! Check the inbox of ${email} to proceed.`, 'success');
          const emailInput = document.getElementById('forgotPasswordEmail');
          if (emailInput) emailInput.value = '';
        } catch (err) {
          console.error('[RakshaSetu][Auth] Password reset request failed:', err);
          this.showAuthAlert(err.message || t('auth.resetLinkFailed', 'Unable to send password reset link. Please try again.'), 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = t('auth.sendResetLinkButton');
          }
        }
      });
    }

    // Login Form Submit
    const loginForm = document.getElementById('authLoginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail')?.value?.trim();
        const password = document.getElementById('loginPassword')?.value;
        const submitBtn = document.getElementById('loginSubmitBtn');

        if (!email || !password) {
          this.showAuthAlert(t('auth.enterBothError', 'Please enter both email and password.'), 'error');
          return;
        }

        console.log('[RakshaSetu][Auth] Login attempt:', {
          email,
          hasPassword: Boolean(password)
        });

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = `${t('common.loading')}`;
          }
          this.showAuthAlert(null);

          const authData = await authService.signIn(email, password);
          const user = authData?.user || authData?.session?.user || (await authService.getCurrentUser());
          console.log('[RakshaSetu][Auth] Login successful');

          let profile = null;
          if (user?.id) {
            profile = await authService.getCurrentProfile(user.id);
            if (profile) {
              console.log('[RakshaSetu][Auth] Profile loaded');
            }
          }

          // Enforce Citizen PWA role restriction: Authority accounts are forbidden here
          if (profile && (profile.role === 'authority' || profile.role === 'admin')) {
            console.warn('[RakshaSetu][Auth] Authority user rejected from Citizen PWA');
            await authService.signOut();
            this.clearAuthState();
            this.showAuthAlert(t('auth.accessDeniedEoc', 'Access Denied: Authority accounts must access through the District EOC dashboard.'), 'error');
            return;
          }

          this.hydrateStoreProfile(user, profile);
          if (user?.id) {
            realtimeService.startCitizenRealtime(user.id);
          }
          store.navigateTo('home');
        } catch (err) {
          console.error('[RakshaSetu][Auth] Supabase sign-in error:', {
            message: err?.message,
            status: err?.status,
            code: err?.code
          });
          this.showAuthAlert(err?.message || t('auth.invalidCredentials', 'Invalid email or password.'), 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = t('auth.signInButton');
          }
        }
      });
    }

    // Signup Form Submit
    const signupForm = document.getElementById('authSignupForm');
    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('signupFullName')?.value?.trim();
        const email = document.getElementById('signupEmail')?.value?.trim();
        const password = document.getElementById('signupPassword')?.value;
        const phone = document.getElementById('signupPhone')?.value?.trim() || null;
        const bloodGroup = document.getElementById('signupBloodGroup')?.value || null;
        const dateOfBirth = document.getElementById('signupDob')?.value || null;
        const address = document.getElementById('signupAddress')?.value?.trim() || null;
        const district = document.getElementById('signupDistrict')?.value?.trim() || null;
        const state = document.getElementById('signupState')?.value?.trim() || null;
        const contactName = document.getElementById('signupContactName')?.value?.trim();
        const contactPhone = document.getElementById('signupContactPhone')?.value?.trim();
        const contactRelation = document.getElementById('signupContactRelation')?.value?.trim();

        const emergencyContacts = [];
        if (contactName || contactPhone) {
          emergencyContacts.push({
            name: contactName || 'Emergency Contact',
            phone: contactPhone || '',
            relation: contactRelation || 'Contact'
          });
        }

        const submitBtn = document.getElementById('signupSubmitBtn');

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = `${t('common.loading')}`;
          }
          this.showAuthAlert(null);

          const data = await authService.signUp({
            email,
            password,
            fullName,
            phone,
            bloodGroup,
            dateOfBirth,
            address,
            district,
            state,
            emergencyContacts
          });

          let session = data?.session;
          let user = data?.user;

          if (session && user) {
            const profile = await authService.getCurrentProfile(user.id);
            if (profile && (profile.role === 'authority' || profile.role === 'admin')) {
              await authService.signOut();
              this.clearAuthState();
              this.showAuthAlert(t('auth.accessDeniedCitizen', 'Access Denied: Authority accounts cannot be registered from Citizen portal.'), 'error');
              return;
            }
            console.log('[RakshaSetu][Auth] Login successful');
            this.hydrateStoreProfile(user, profile);
            store.navigateTo('home');
          } else if (user) {
            // Citizen email confirmation required: No immediate sign-in bypass
            console.log('[RakshaSetu][Auth] Citizen account created, awaiting email confirmation');
            this.showAuthAlert(t('auth.accountCreatedVerify', { email }) || ('Citizen account created! A confirmation email has been sent to ' + email + '. Please verify your email before signing in.'), 'success');
            this.switchAuthTab('login');
            const emailInput = document.getElementById('loginEmail');
            if (emailInput) emailInput.value = email;
            const passInput = document.getElementById('loginPassword');
            if (passInput) passInput.value = '';
          }
        } catch (err) {
          console.error('[RakshaSetu][Auth] Sign up failed:', err);
          this.showAuthAlert(err.message || t('auth.registrationFailed', 'Registration failed. Please try again.'), 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = t('auth.signUpButton');
          }
        }
      });
    }

    // Logout Button in Profile Screen
    const logoutBtn = document.getElementById('profileLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          logoutBtn.disabled = true;
          logoutBtn.textContent = t('profile.signingOut');
          await authService.signOut();
          console.log('[RakshaSetu][Auth] Logout successful');
          this.clearAuthState();
          store.navigateTo('auth');
        } catch (err) {
          console.error('[RakshaSetu][Auth] Logout error:', err);
          this.clearAuthState();
          store.navigateTo('auth');
        } finally {
          logoutBtn.disabled = false;
          logoutBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span data-i18n="profile.logoutButton">${t('profile.logoutButton')}</span>
          `;
        }
      });
    }
  }

  // ==========================================================================
  // AUTHENTICATION LIFECYCLE & STATE HYDRATION
  // ==========================================================================
  async initAuth() {
    try {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;

      if (session && session.user) {
        console.log('[RakshaSetu][Auth] Session detected');

        const profile = await authService.getCurrentProfile(session.user.id);
        if (profile) {
          console.log('[RakshaSetu][Auth] Profile loaded');
        }

        // Enforce RBAC: reject authority accounts from Citizen PWA
        if (profile && (profile.role === 'authority' || profile.role === 'admin')) {
          console.warn('[RakshaSetu][Auth] Authority user rejected from Citizen PWA');
          await authService.signOut();
          this.clearAuthState();
          this.showAuthAlert(t('auth.accessDeniedConsole', 'Access Denied: Authority accounts must access through the District EOC console.'), 'error');
          store.navigateTo('auth');
          return;
        }

        // Check if URL hash indicates email confirmation return or recovery
        const hash = window.location.hash || '';
        if (hash.includes('type=recovery')) {
          window.location.href = './auth/reset-password.html' + hash;
          return;
        }
        if (hash.includes('type=signup') || hash.includes('type=email_change')) {
          this.showAuthAlert(t('auth.emailVerifiedSuccess', 'Email verified successfully! Welcome to RakshaSetu Citizen Portal.'), 'success');
          window.history.replaceState(null, '', window.location.pathname);
        } else if (hash.includes('forgot')) {
          this.switchAuthTab('forgot');
        }

        // Set Realtime token to pass RLS checks
        if (session.access_token && supabase.realtime && typeof supabase.realtime.setAuth === 'function') {
          try {
            await supabase.realtime.setAuth(session.access_token);
          } catch (e) {}
        }

        this.hydrateStoreProfile(session.user, profile);
        // Start citizen realtime subscriptions
        realtimeService.startCitizenRealtime(session.user.id);
        if (store.getState().currentScreen === 'auth' || store.getState().currentScreen === 'language') {
          store.navigateTo('home');
        }
      } else {
        realtimeService.stopCitizenRealtime();
        this.clearAuthState();
        if (languageManager.hasSavedLanguage()) {
          store.navigateTo('auth');
        } else {
          store.navigateTo('language');
        }
      }
    } catch (err) {
      console.warn('[RakshaSetu][Auth] Startup session check notice:', err);
      const current = store.getState().profile;
      if (current && current.isAuthenticated && current.citizenId) {
        console.log('[RakshaSetu][Auth] Offline authenticated session restored');
        realtimeService.startCitizenRealtime(current.citizenId);
        if (store.getState().currentScreen === 'auth' || store.getState().currentScreen === 'language') {
          store.navigateTo('home');
        }
      } else {
        realtimeService.stopCitizenRealtime();
        this.clearAuthState();
        if (languageManager.hasSavedLanguage()) {
          store.navigateTo('auth');
        } else {
          store.navigateTo('language');
        }
      }
    }

    // Subscribe to Supabase Auth State Changes
    authService.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        if (session.access_token && supabase.realtime && typeof supabase.realtime.setAuth === 'function') {
          try {
            await supabase.realtime.setAuth(session.access_token);
          } catch (e) {}
        }

        const currentCitizenId = store.getState().profile?.citizenId;
        if (currentCitizenId !== session.user.id) {
          console.log('[RakshaSetu][Auth] Session detected');
          const profile = await authService.getCurrentProfile(session.user.id);
          if (profile) {
            console.log('[RakshaSetu][Auth] Profile loaded');
          }

          // Enforce RBAC: reject authority accounts
          if (profile && (profile.role === 'authority' || profile.role === 'admin')) {
            console.warn('[RakshaSetu][Auth] Authority user rejected from Citizen PWA');
            await authService.signOut();
            this.clearAuthState();
            this.showAuthAlert(t('auth.accessDeniedConsole', 'Access Denied: Authority accounts must access through the District EOC console.'), 'error');
            store.navigateTo('auth');
            return;
          }

          this.hydrateStoreProfile(session.user, profile);
          if (store.getState().currentScreen === 'auth' || store.getState().currentScreen === 'language') {
            store.navigateTo('home');
          }
        }
        // Ensure realtime subscription is active for authenticated citizen
        realtimeService.startCitizenRealtime(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        console.log('[RakshaSetu][Auth] Logout successful');
        realtimeService.stopCitizenRealtime();
        this.clearAuthState();
        store.navigateTo('auth');
      }
    });
  }

  hydrateStoreProfile(user, profile) {
    if (!user) return;
    const current = store.getState().profile || {};

    let contacts = [];
    if (profile?.emergency_contacts) {
      contacts = typeof profile.emergency_contacts === 'string'
        ? JSON.parse(profile.emergency_contacts)
        : profile.emergency_contacts;
    } else if (user.user_metadata?.emergency_contacts) {
      contacts = typeof user.user_metadata.emergency_contacts === 'string'
        ? JSON.parse(user.user_metadata.emergency_contacts)
        : user.user_metadata.emergency_contacts;
    } else if (current.contacts && current.contacts.length > 0) {
      contacts = current.contacts;
    }

    const candidateProfile = {
      ...current,
      district: profile?.district || user.user_metadata?.district || current.district || '',
      state: profile?.state || user.user_metadata?.state || current.state || '',
      address: profile?.address || user.user_metadata?.address || current.address || ''
    };
    const resolvedPkg = offlineStorage.resolveActiveRegionPackageSync(candidateProfile, store.getState().location);
    const resolvedRegion = current.hasManuallySelectedRegion ? current.region : (resolvedPkg ? resolvedPkg.id : current.region || null);
    const resolvedRegionName = resolvedRegion ? (resolvedPkg?.name || current.regionName || getRegionNameI18n(resolvedRegion)) : null;

    const updatedProfile = {
      ...current,
      isAuthenticated: true,
      hasCompletedSetup: true,
      citizenId: user.id, // Supabase user.id / auth.uid() is canonical
      email: user.email || profile?.email || current.email || '',
      fullName: profile?.full_name || user.user_metadata?.full_name || current.fullName || '',
      phone: profile?.phone || user.user_metadata?.phone || current.phone || '',
      bloodGroup: profile?.blood_group || user.user_metadata?.blood_group || current.bloodGroup || '',
      dateOfBirth: profile?.date_of_birth || user.user_metadata?.date_of_birth || current.dateOfBirth || '',
      address: candidateProfile.address,
      district: candidateProfile.district,
      state: candidateProfile.state,
      contacts: Array.isArray(contacts) ? contacts : [],
      // Preserve local interface preferences
      language: current.language || 'en',
      region: resolvedRegion,
      regionName: resolvedRegionName,
      heartbeatEnabled: current.heartbeatEnabled ?? true,
      heartbeatMinutes: current.heartbeatMinutes || 15,
      locationAllowed: current.locationAllowed ?? true,
      highContrast: current.highContrast || false,
      largeText: current.largeText || false
    };

    if (resolvedPkg && (!current.hasManuallySelectedRegion || current.region === resolvedPkg.id)) {
      store.setState({
        offlinePackage: {
          downloaded: true,
          version: resolvedPkg.version || '2026.4.1',
          lastUpdated: resolvedPkg.releaseDate || new Date().toISOString(),
          regionId: resolvedPkg.id,
          sizeKb: resolvedPkg.sizeKb || 185
        }
      });
    }

    store.setState({ profile: updatedProfile });
    this.updateHeaderRegion(updatedProfile.region, updatedProfile.regionName);
    return updatedProfile;
  }

  clearAuthState() {
    const current = store.getState().profile || {};
    const unauthenticatedProfile = {
      ...current,
      isAuthenticated: false,
      citizenId: null,
      fullName: '',
      email: '',
      phone: '',
      bloodGroup: '',
      dateOfBirth: '',
      address: '',
      district: '',
      state: ''
    };
    realtimeService.stopCitizenRealtime();
    store.setState({ profile: unauthenticatedProfile });
  }

  switchAuthTab(tab) {
    const tabLogin = document.getElementById('authTabLogin');
    const tabSignup = document.getElementById('authTabSignup');
    const formLogin = document.getElementById('authLoginForm');
    const formSignup = document.getElementById('authSignupForm');
    const formForgot = document.getElementById('authForgotPasswordForm');
    this.showAuthAlert(null);

    if (tab === 'signup') {
      if (tabLogin) tabLogin.classList.remove('active');
      if (tabSignup) tabSignup.classList.add('active');
      if (formLogin) formLogin.style.display = 'none';
      if (formForgot) formForgot.style.display = 'none';
      if (formSignup) formSignup.style.display = 'block';
    } else if (tab === 'forgot') {
      if (tabLogin) tabLogin.classList.remove('active');
      if (tabSignup) tabSignup.classList.remove('active');
      if (formLogin) formLogin.style.display = 'none';
      if (formSignup) formSignup.style.display = 'none';
      if (formForgot) formForgot.style.display = 'block';
    } else {
      if (tabSignup) tabSignup.classList.remove('active');
      if (tabLogin) tabLogin.classList.add('active');
      if (formSignup) formSignup.style.display = 'none';
      if (formForgot) formForgot.style.display = 'none';
      if (formLogin) formLogin.style.display = 'block';
    }
  }

  showAuthAlert(message, type = 'error') {
    const banner = document.getElementById('authAlertBanner');
    if (!banner) return;
    if (!message) {
      banner.style.display = 'none';
      banner.textContent = '';
      return;
    }
    banner.className = `state-banner ${type === 'success' ? 'success' : 'error'}`;
    banner.textContent = message;
    banner.style.display = 'flex';
  }

  async runSplashSequence() {
    const splash = document.getElementById('splashOverlay');
    if (!splash) return;

    const steps = [
      { id: 'initStepPkg', delay: 200 },
      { id: 'initStepContacts', delay: 400 },
      { id: 'initStepLocation', delay: 650 },
      { id: 'initStepNetwork', delay: 850 },
      { id: 'initStepConfig', delay: 1100 }
    ];

    for (const step of steps) {
      await new Promise(r => setTimeout(r, 200));
      const el = document.getElementById(step.id);
      if (el) el.classList.add('done');
    }

    // Hide splash after brief completion verification
    setTimeout(() => {
      splash.classList.add('hidden');
    }, 700);
  }

  updateHeaderRegion(regionId, regionName) {
    const headerRegion = document.getElementById('headerRegionName');
    if (!headerRegion) return;
    const key = getRegionI18nKey(regionId);
    if (key) {
      headerRegion.setAttribute('data-i18n', key);
      headerRegion.textContent = getRegionNameI18n(regionId);
    } else {
      headerRegion.removeAttribute('data-i18n');
      headerRegion.textContent = regionName || regionId || t('region.selectPackage');
    }
  }

  render(state) {
    // 1. Theme and Accessibility Modes
    document.body.classList.toggle('high-contrast-mode', state.highContrast);
    document.body.classList.toggle('large-text-mode', state.largeText);

    // 2. Technically Honest Network Status Indicators
    const details = networkManager.getCurrentDetails();
    const tierI18n = getTierDetailsI18n(state.networkState);
    const networkBadge = document.getElementById('headerNetworkPill');
    if (networkBadge) {
      const shortText = tierI18n ? tierI18n.shortLabel : (state.networkState === NetworkStates.INTERNET_ONLINE
        ? t('common.online')
        : (state.networkState === NetworkStates.OFFLINE_PACKAGE_ACTIVE ? t('common.offline') : details.shortLabel));
      networkBadge.innerHTML = `<span class="status-dot ${details.dotClass}"></span> <span>${shortText}</span>`;
    }

    const networkBanner = document.getElementById('globalNetworkBanner');
    if (networkBanner) {
      const bannerText = tierI18n ? tierI18n.banner : details.bannerText;
      networkBanner.innerHTML = `
        <div class="network-banner-left">
          <span class="status-dot ${details.dotClass}"></span>
          <span>${bannerText}</span>
        </div>
        <span class="network-banner-badge" style="background: rgba(255,255,255,0.1); font-size: 11px;">${t('common.change')}</span>
      `;
    }

    // 3. Screen Switching
    document.querySelectorAll('.app-screen').forEach(screen => {
      screen.classList.remove('active');
    });
    const currentScreenEl = document.getElementById(`screen-${state.currentScreen}`);
    if (currentScreenEl) {
      currentScreenEl.classList.add('active');
    }

    // Toggle app header and network status banner visibility on language screen
    const appHeader = document.querySelector('.app-header');
    const netBanner = document.getElementById('globalNetworkBanner');
    if (state.currentScreen === 'language') {
      if (appHeader) appHeader.style.display = 'none';
      if (netBanner) netBanner.style.display = 'none';
    } else {
      if (appHeader) appHeader.style.display = 'flex';
      if (netBanner) netBanner.style.display = 'flex';
    }

    // Toggle bottom nav visibility based on authentication and active screen
    const bottomNav = document.querySelector('.bottom-nav-bar');
    if (bottomNav) {
      bottomNav.style.display = (state.currentScreen === 'auth' || state.currentScreen === 'language') ? 'none' : 'flex';
    }

    // 4. Update Bottom Nav Active Indicator
    document.querySelectorAll('.bottom-nav-bar .nav-item').forEach(item => {
      const screen = item.getAttribute('data-screen');
      item.classList.toggle('active', screen === state.currentScreen);
    });

    // 5. Update Header Region
    this.updateHeaderRegion(state.profile?.region, state.profile?.regionName);

    // 6. Handle Bottom Sheets
    const backdrop = document.getElementById('globalSheetBackdrop');
    document.querySelectorAll('.bottom-sheet').forEach(sheet => sheet.classList.remove('active'));
    if (state.activeSheet) {
      if (backdrop) backdrop.classList.add('active');
      const activeSheetEl = document.getElementById(`sheet-${state.activeSheet}`);
      if (activeSheetEl) activeSheetEl.classList.add('active');
    } else {
      if (backdrop) backdrop.classList.remove('active');
    }

    // 7. Screen Specific Renderers
    if (state.currentScreen === 'home') this.renderHome(state);
    if (state.currentScreen === 'sos') this.renderSOS(state);
    if (state.currentScreen === 'alerts') this.renderAlerts(state);
    if (state.currentScreen === 'map') this.renderMap(state);
    if (state.currentScreen === 'profile') this.renderProfile(state);
    if (state.activeSheet === 'shelter-detail') this.renderShelterSheet(state.selectedShelter);
    if (state.activeSheet === 'sim-drawer') this.renderSimDrawer(state);
    if (state.activeSheet === 'assistant') this.renderAssistantMode(state);
    if (state.activeSheet === 'family') this.renderFamilySafety(state);
    if (state.activeSheet === 'health') this.renderHealthCategory('flood');
    this.renderResourceRequests(state);

    // 8. Apply Multilingual Translations
    languageManager.applyTranslations(document);
  }

  /* ==========================================================================
     Screen Renderers
     ========================================================================== */

  renderHome(state) {
    // Heartbeat status
    const hbElem = document.getElementById('homeHeartbeatText');
    if (hbElem) {
      const minutesAgo = Math.max(1, Math.round((Date.now() - state.lastHeartbeatTime) / 60000));
      const telemetryStatus = state.liveTelemetryActive
        ? ` • ${t('home.liveTelemetryStream')}`
        : ` • ${t('home.localCacheStream')}`;
      hbElem.textContent = `${t('home.heartbeatAgo', { mins: minutesAgo, lat: state.location.lat.toFixed(4), lng: state.location.lng.toFixed(4) })}${telemetryStatus}`;
    }

    // Queued messages badge
    const queueBanner = document.getElementById('homeOfflineQueueBanner');
    if (queueBanner) {
      const outboxCount = (state.outboxQueue || []).filter(i => i.status !== 'SYNCED').length;
      const reqCount = (state.resourceRequests || []).filter(r => !r.synced).length;
      const totalPending = outboxCount + reqCount;

      if (totalPending > 0) {
        queueBanner.style.display = 'flex';
        queueBanner.innerHTML = `
          <span>${t('home.offlineQueueNotice', { count: totalPending })}</span>
        `;
      } else {
        queueBanner.style.display = 'none';
      }
    }

    // Update Dominant SOS Button subtitle if emergency session active
    const mainSosBtn = document.getElementById('mainSosButton');
    if (mainSosBtn) {
      const sosSubtitle = mainSosBtn.querySelector('.sos-subtitle');
      if (sosSubtitle) {
        if (state.activeEmergencySession && state.activeEmergencySession.incidentStatus) {
          const mapped = mapIncidentStatus(state.activeEmergencySession.incidentStatus);
          sosSubtitle.textContent = t('home.sosLiveStatus', { status: mapped });
        } else {
          sosSubtitle.textContent = t('home.sosButtonSubtitle');
        }
      }
    }
  }

  async startSOSWorkflow() {
    store.navigateTo('sos');
    const captureBox = document.getElementById('sosLocationCaptureBox');
    const readyBox = document.getElementById('sosReadyBox');

    if (captureBox && readyBox) {
      captureBox.style.display = 'block';
      readyBox.style.display = 'none';

      // Capture GPS location
      const loc = await emergencySOS.captureLocation();
      captureBox.style.display = 'none';
      readyBox.style.display = 'block';

      this.renderSOSReady(loc);
    }
  }

  renderSOS(state) {
    this.renderSOSReady(state.location);
  }

  renderSOSReady(location) {
    const coordsElem = document.getElementById('sosCoordsDisplay');
    const isCachedElem = document.getElementById('sosLocationCachedWarning');
    const smsOutboxCard = document.getElementById('sosSmsOutboxCard');
    const onlineSosCard = document.getElementById('sosOnlineCard');
    const offlineQueueCard = document.getElementById('sosOfflineQueueCard');
    const statusBox = document.getElementById('sosTransmissionStatusBox');
    const liveSosBtn = document.getElementById('sosLiveBroadcastBtn');

    if (coordsElem) {
      coordsElem.textContent = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} (±${location.accuracy}m)`;
    }

    if (isCachedElem) {
      if (location.isLastKnown) {
        isCachedElem.style.display = 'block';
        const minsAgo = Math.max(1, Math.round((Date.now() - location.timestamp) / 60000));
        isCachedElem.textContent = t('sos.cachedLocationWarning', { mins: minsAgo });
      } else {
        isCachedElem.style.display = 'none';
      }
    }

    const { networkState, profile, activeEmergencySession, backendConnected } = store.getState();
    const primaryContact = profile.contacts && profile.contacts.length > 0
      ? profile.contacts[0]
      : { name: 'Emergency Contact', phone: '112' };

    const body = emergencySOS.buildSOSMessage(location, profile.contacts);
    const smsUri = emergencySOS.generateSmsUri(primaryContact.phone, body);

    // Active Emergency Session status box
    if (statusBox) {
      if (activeEmergencySession) {
        statusBox.style.display = 'block';
        const isSynced = activeEmergencySession.status === 'SYNCED';
        const rawStatus = (activeEmergencySession.incidentStatus || '').toUpperCase();
        const displayStatus = rawStatus
          ? mapIncidentStatus(rawStatus)
          : (isSynced ? t('incident.pending') : t('sos.savedLocallyStatus'));

        let bg = '#FEF3C7';
        let border = '#FDE68A';
        let text = '#92400E';

        if (rawStatus === 'ASSIGNED') {
          bg = '#EFF6FF';
          border = '#BFDBFE';
          text = '#1E40AF';
        } else if (rawStatus === 'RESPONDING') {
          bg = '#FFFBEB';
          border = '#FCD34D';
          text = '#B45309';
        } else if (rawStatus === 'REACHED') {
          bg = '#ECFDF5';
          border = '#A7F3D0';
          text = '#047857';
        } else if (rawStatus === 'RESOLVED') {
          bg = '#F0FDF4';
          border = '#BBF7D0';
          text = '#166534';
        }

        statusBox.style.background = bg;
        statusBox.style.border = `1px solid ${border}`;
        statusBox.style.color = text;
        statusBox.innerHTML = `
          <strong>${t('sos.trackingIdLabel')}</strong> <code>${(activeEmergencySession.clientEventId || '').substring(0, 18)}...</code><br>
          <strong>${t('sos.statusLabel')}</strong> <span class="incident-status-badge" style="font-weight: 700;">${displayStatus}</span>
        `;
        if (liveSosBtn) {
          liveSosBtn.textContent = rawStatus === 'RESOLVED'
            ? `${t('incident.resolved')} (${t('sos.retryDispatch')})`
            : (isSynced ? `✓ ${t('home.sosButtonTitle')}: ${displayStatus}` : t('sos.retryDispatch'));
        }
      } else {
        statusBox.style.display = 'none';
        if (liveSosBtn) {
          liveSosBtn.textContent = t('sos.broadcastLiveButton');
        }
      }
    }

    // Dynamic Tier Display based on network state
    if (networkState === NetworkStates.INTERNET_ONLINE) {
      if (onlineSosCard) onlineSosCard.style.display = 'block';
      if (smsOutboxCard) smsOutboxCard.style.display = 'none';
      if (offlineQueueCard) offlineQueueCard.style.display = 'none';
    } else if (networkState === NetworkStates.SMS_ONLY) {
      if (onlineSosCard) onlineSosCard.style.display = 'none';
      if (smsOutboxCard) {
        smsOutboxCard.style.display = 'block';
        const preview = document.getElementById('smsBodyPreviewText');
        const sendBtn = document.getElementById('sendSmsDirectBtn');
        if (preview) preview.textContent = body;
        if (sendBtn) {
          sendBtn.onclick = () => {
            window.location.href = smsUri;
          };
        }
      }
      if (offlineQueueCard) offlineQueueCard.style.display = 'none';
    } else {
      // Offline / Blackout
      if (onlineSosCard) onlineSosCard.style.display = 'none';
      if (smsOutboxCard) smsOutboxCard.style.display = 'none';
      if (offlineQueueCard) {
        offlineQueueCard.style.display = 'block';
      }
    }

    // Low data SMS ping button
    const pingBtn = document.getElementById('sendLocationPingBtn');
    if (pingBtn) {
      pingBtn.onclick = () => {
        const pingUri = emergencySOS.sendLocationPingSms(location, primaryContact.phone);
        window.location.href = pingUri;
      };
    }
  }

  async dispatchOnlineSOS() {
    const liveSosBtn = document.getElementById('sosLiveBroadcastBtn');
    if (liveSosBtn) {
      liveSosBtn.disabled = true;
      liveSosBtn.textContent = t('sos.transmittingBeacon');
    }

    const result = await emergencySOS.dispatchSOS({
      medicalFlag: false,
      peopleCount: 1,
      message: 'Citizen distress beacon dispatched via RakshaSetu emergency interface.'
    });

    if (liveSosBtn) {
      liveSosBtn.disabled = false;
      liveSosBtn.textContent = result.status === 'SYNCED' ? t('sos.sosAcknowledged') : t('sos.retryDispatch');
    }

    // Present honest confirmation dialog
    const dialog = document.getElementById('globalDialogBackdrop');
    const title = document.getElementById('dialogTitle');
    const body = document.getElementById('dialogBody');
    const confirmBtn = document.getElementById('dialogConfirmBtn');
    const cancelBtn = document.getElementById('dialogCancelBtn');

    if (dialog && title && body) {
      const isSynced = result.status === 'SYNCED';
      title.textContent = isSynced ? t('sos.dialogSyncedTitle') : t('sos.dialogSavedTitle');
      body.innerHTML = `
        <div class="state-banner ${isSynced ? 'success' : 'pending-sync'}" style="margin-bottom: 12px;">
          <span>${isSynced ? t('sos.dialogSyncedBanner', result.message) : t('sos.dialogSavedBanner', result.message)}</span>
        </div>
        <p style="font-size: 13px; color: #1E293B;">
          <strong>${t('sos.trackingIdLabel')}</strong> <code>${result.clientEventId}</code><br>
          <strong>${t('sos.coordinatesLabel')}</strong> ${result.location.lat.toFixed(5)}, ${result.location.lng.toFixed(5)}<br>
          <strong>${t('sos.statusLabel')}</strong> ${isSynced ? t('sos.liveTelemetryStatus') : t('sos.savedLocallyStatus')}
        </p>
      `;

      confirmBtn.textContent = t('sos.acknowledgeButton');
      cancelBtn.style.display = 'none';
      dialog.classList.add('active');

      confirmBtn.onclick = () => {
        dialog.classList.remove('active');
        cancelBtn.style.display = 'inline-flex';
      };
    }

    this.renderSOSReady(result.location);
  }

  renderAlerts(state) {
    const list = document.getElementById('alertsListContainer');
    if (!list) return;

    const { items: alerts, globalStatus, statusNotice } = alertsManager.getAlerts();
    const damInfo = alertsManager.getDamDigest();

    let html = '';

    // 1. Official Warnings Section with Honest Status Header
    html += `
      <div class="section-heading">
        <span>${t('alerts.warningsHeading')}</span>
        <span class="source-badge ${globalStatus === DataSourceState.LIVE ? 'government-badge' : 'cached-badge'}">
          ${globalStatus === DataSourceState.LIVE ? (t('alerts.liveBadge') || 'LIVE') : (t('alerts.cachedBadge') || 'CACHED')}
        </span>
      </div>
      <div style="font-size: 11.5px; color: ${globalStatus === DataSourceState.LIVE ? '#166534' : '#B45309'}; margin: -4px 0 12px 0;">
        ${statusNotice}
      </div>
    `;

    alerts.forEach(alert => {
      const badgeClass = alert.dataSource === DataSourceState.LIVE ? 'government-badge' : 'cached-badge';
      const badgeText = alert.dataSource === DataSourceState.LIVE ? (t('alerts.liveBadge') || 'LIVE') : (t('alerts.cachedBadge') || 'CACHED');

      html += `
        <div class="app-card alert-card severity-${alert.severity}">
          <div class="card-header">
            <div class="card-title-group">
              <span class="card-icon">⚡</span>
              <div>
                <div class="card-title">${alert.title}</div>
                <div class="card-subtitle">${alert.category} • ${alert.lastUpdatedText}</div>
              </div>
            </div>
            <span class="source-badge ${badgeClass}">${badgeText}</span>
          </div>
          <p style="font-size: 13.5px; color: #334155; margin-bottom: 8px;">${alert.summary}</p>
          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; padding: 8px 12px; border-radius: 6px; font-size: 12px; color: #0F172A;">
            <strong>${t('alerts.actionRequiredLabel')}</strong> ${alert.actionRequired}
          </div>
          <div style="font-size: 11px; color: #64748B; margin-top: 8px; display: flex; justify-content: space-between;">
            <span>${t('alerts.sourceLabel')} ${alert.source}</span>
            <span>${t('alerts.recordedLabel')} ${alert.timestamp.substring(11, 16)} UTC</span>
          </div>
        </div>
      `;
    });

    // 2. Dam & Hydrological Risk Digest Section
    html += `
      <div class="section-heading" style="margin-top: 24px;">
        <span>${t('alerts.damHeading')}</span>
        <span class="source-badge government-badge">${t('alerts.cwcBadge')}</span>
      </div>
    `;

    if (damInfo && damInfo.dams && damInfo.dams.length > 0) {
      damInfo.dams.forEach(dam => {
        html += `
          <div class="app-card" style="border-left: 6px solid #0288D1;">
            <div class="card-header">
              <div class="card-title-group">
                <span class="card-icon">🌊</span>
                <div>
                  <div class="card-title">${dam.damName}</div>
                  <div class="card-subtitle">${dam.source}</div>
                </div>
              </div>
              <span class="source-badge cached-badge">${damInfo.dataSource === DataSourceState.LIVE ? (t('alerts.liveBadge') || 'LIVE') : (t('alerts.cachedBadge') || 'CACHED')}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12.5px; margin: 10px 0; background: #F8FAFC; padding: 10px; border-radius: 8px;">
              <div><strong>${t('alerts.currentLevelLabel')}</strong> ${dam.currentLevel}</div>
              <div><strong>${t('alerts.capacityLabel')}</strong> ${dam.storagePercentage}% Full</div>
              <div><strong>${t('alerts.inflowLabel')}</strong> ${dam.inflowCusecs}</div>
              <div><strong>${t('alerts.outflowLabel')}</strong> ${dam.outflowCusecs}</div>
            </div>
            <div style="font-size: 12px; color: #B45309; background: #FFFBEB; border: 1px solid #FDE68A; padding: 6px 10px; border-radius: 6px; margin-bottom: 8px;">
              <strong>${t('alerts.statusLabel')}</strong> ${dam.downstreamWarningStatus}
            </div>
            <p style="font-size: 12px; color: #64748B; line-height: 1.4;">
              <strong>${t('alerts.historicalContextLabel')}</strong> ${dam.historicalContext}
            </p>
            <div style="font-size: 11px; color: #94A3B8; margin-top: 6px; font-style: italic;">
              ${dam.disclaimer}
            </div>
          </div>
        `;
      });
    } else {
      html += `
        <div class="empty-state" style="padding: 16px; text-align: center; background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px;">
          <p style="font-size: 12.5px; color: #64748B; margin: 0;">
            ${t('alerts.hydrologicalUnavailable') || 'Hydrological telemetry currently unavailable for this region. Consult local district administration bulletins.'}
          </p>
        </div>
      `;
    }

    // 3. Satellite Context & ISRO Bhuvan Launcher (Explicit non-sensor feed disclosure)
    html += `
      <div class="section-heading" style="margin-top: 24px;">
        <span>${t('alerts.satelliteHeading') || 'Satellite Imagery Context'}</span>
        <span class="source-badge government-badge">ISRO / NRSC</span>
      </div>
      <div class="app-card" style="border-left: 6px solid #7C3AED; background: #FAF5FF;">
        <div class="card-header">
          <div class="card-title-group">
            <span class="card-icon">🛰️</span>
            <div>
              <div class="card-title">${t('alerts.satellitePortalTitle') || 'ISRO Bhuvan Disaster Services'}</div>
              <div class="card-subtitle">National Remote Sensing Centre (NRSC)</div>
            </div>
          </div>
          <span class="source-badge" style="background: #EDE9FE; color: #6D28D9;">External Portal</span>
        </div>
        <p style="font-size: 12px; color: #581C87; line-height: 1.4; margin: 8px 0;">
          <strong>Notice:</strong> ${t('alerts.satelliteNotice') || 'Bhuvan is an external disaster-visualization portal. RakshaSetu does not synthesize or simulate real-time satellite sensor feeds.'}
        </p>
        <button id="openBhuvanPortalBtn" class="btn btn-secondary btn-full" style="margin-top: 10px; background: #7C3AED; color: #FFFFFF; border: none; font-weight: 600;" onclick="window.app?.safetyMap?.openISROBhuvanPortal?.();">
          <span>🌐</span> <span>${t('alerts.satelliteOpenBtn') || 'Open ISRO Bhuvan Portal'}</span>
        </button>
      </div>
    `;

    list.innerHTML = html;
  }

  renderMap(state) {
    setTimeout(() => {
      safetyMap.initMap('safetyLeafletMap');
    }, 100);
    this.refreshShelters();
  }

  async refreshShelters() {
    const refreshBtn = document.getElementById('refreshSheltersBtn');
    if (refreshBtn) refreshBtn.classList.add('loading');

    try {
      await safetyMap.fetchLiveShelters();
      if (safetyMap.map) {
        safetyMap.renderMarkers();
      }
      this.renderActiveSheltersList();
    } catch (err) {
      console.warn('[App] refreshShelters failed:', err);
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('loading');
    }
  }

  renderActiveSheltersList() {
    const container = document.getElementById('activeSheltersContainer');
    const badge = document.getElementById('activeSheltersCountBadge');
    if (!container) return;

    const { location, profile, regionalData } = store.getState();
    const pkg = offlineStorage?.resolveActiveRegionPackageSync?.(profile, location) ||
                (regionalData?.packages ? regionalData.packages.find(p => p.id === (profile.region || 'bihar-munger')) : null);

    const rawList = safetyMap.liveShelters !== null ? safetyMap.liveShelters : (pkg ? pkg.shelters : []);
    // Filter strictly to ACTIVE shelters only (Step 7)
    const activeShelters = (rawList || []).filter(s => s.active !== false);

    if (badge) {
      badge.textContent = `${activeShelters.length} ${t('shelters.active') || 'Active'}`;
    }

    if (activeShelters.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 24px 16px; text-align: center; background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 12px;">
          <div style="font-size: 32px; margin-bottom: 8px;">🏠</div>
          <p style="font-size: 13.5px; font-weight: 600; color: #475569; margin: 0 0 4px 0;" data-i18n="shelters.noActiveShelters">
            ${t('shelters.noActiveShelters') || 'No active shelters are currently available.'}
          </p>
          <span style="font-size: 11.5px; color: #94A3B8;">
            ${t('shelters.shelterInfoUnavailable') || 'Designated relief shelters will appear when activated by district authorities.'}
          </span>
        </div>
      `;
      return;
    }

    let html = '';
    activeShelters.forEach(shelter => {
      const lat = shelter.lat != null ? Number(shelter.lat) : (shelter.latitude != null ? Number(shelter.latitude) : null);
      const lng = shelter.lng != null ? Number(shelter.lng) : (shelter.longitude != null ? Number(shelter.longitude) : null);
      const hasValidCoords = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

      const isDemo = shelter.isDemo || (shelter.name && (shelter.name.toLowerCase().includes('demo') || shelter.name.toLowerCase().includes('prototype') || shelter.name.toLowerCase().includes('munger')));

      const distance = (location && hasValidCoords) ? safetyMap.calculateDistanceKm(location.lat, location.lng, lat, lng) : null;

      const capCurrent = shelter.capacityCurrent != null ? Number(shelter.capacityCurrent) : (shelter.capacity_current != null ? Number(shelter.capacity_current) : null);
      const capTotal = shelter.capacityTotal != null ? Number(shelter.capacityTotal) : (shelter.capacity_total != null ? Number(shelter.capacity_total) : null);
      const hasCap = capTotal != null && capTotal > 0;
      const capacityPct = hasCap ? Math.min(100, Math.round(((capCurrent || 0) / capTotal) * 100)) : null;

      html += `
        <div class="app-card shelter-card" style="margin-bottom: 8px; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px;" onclick="window.app?.openShelterDetailsById?.('${shelter.id || shelter.name}');">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-size: 14.5px; font-weight: 700; color: #0F172A;">${shelter.name}</span>
                ${isDemo ? `<span class="source-badge" style="background: #FEF3C7; color: #B45309; font-weight: 700; font-size: 10.5px;">${t('shelters.demoShelter') || 'Demo Shelter'}</span>` : ''}
              </div>
              ${shelter.address ? `<p style="font-size: 12px; color: #64748B; margin: 4px 0 0 0;">${shelter.address}</p>` : ''}
            </div>
            <span class="source-badge government-badge" style="flex-shrink: 0; font-size: 11px;">
              🟢 ${t('shelters.active') || 'Active'}
            </span>
          </div>

          <div class="shelter-meta-row" style="margin: 6px 0;">
            ${distance !== null ? `<span class="meta-chip">📏 <strong>${t('shelters.distanceAway', { distance })}</strong></span>` : ''}
            ${hasValidCoords ? `<span class="meta-chip" style="color: #166534; background: #F0FDF4;">📍 ${t('shelters.onMap') || 'On Map'}</span>` : `<span class="meta-chip" style="color: #64748B;">⏳ ${t('shelters.coordsPending') || 'Coordinates Pending Survey'}</span>`}
            ${shelter.contact ? `<span class="meta-chip">📞 ${shelter.contact}</span>` : ''}
          </div>

          ${hasCap ? `
            <div style="margin: 8px 0 4px 0;">
              <div style="display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 600; color: #475569; margin-bottom: 3px;">
                <span>${t('shelters.occupancyCapacity') || 'Capacity'}</span>
                <span>${capCurrent || 0} / ${capTotal} (${capacityPct}%)</span>
              </div>
              <div class="capacity-meter" style="height: 6px; margin: 0;">
                <div class="capacity-fill ${capacityPct > 80 ? 'high' : ''}" style="width: ${capacityPct}%;"></div>
              </div>
            </div>
          ` : ''}

          <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
            <span style="font-size: 11.5px; color: #0284C7; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
              ${t('shelters.viewDetails') || 'View Details'} →
            </span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  openShelterDetailsById(identifier) {
    const { location, profile, regionalData } = store.getState();
    const pkg = offlineStorage?.resolveActiveRegionPackageSync?.(profile, location) ||
                (regionalData?.packages ? regionalData.packages.find(p => p.id === (profile.region || 'bihar-munger')) : null);
    const sheltersList = safetyMap.liveShelters !== null ? safetyMap.liveShelters : (pkg ? pkg.shelters : []);
    const shelter = (sheltersList || []).find(s => (s.id && s.id === identifier) || s.name === identifier);
    if (shelter) {
      safetyMap.openShelterBottomSheet({
        ...shelter,
        dataSourceLabel: safetyMap.liveShelters !== null ? 'LIVE EOC Feed' : 'Cached Regional Package'
      });
    }
  }

  renderShelterSheet(shelter) {
    const container = document.getElementById('shelterSheetBody');
    if (!container || !shelter) return;

    const { location } = store.getState();
    const lat = shelter.lat != null ? Number(shelter.lat) : (shelter.latitude != null ? Number(shelter.latitude) : null);
    const lng = shelter.lng != null ? Number(shelter.lng) : (shelter.longitude != null ? Number(shelter.longitude) : null);
    const hasValidCoords = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    const distance = (location && hasValidCoords) ? safetyMap.calculateDistanceKm(location.lat, location.lng, lat, lng) : null;

    const capCurrent = shelter.capacityCurrent != null ? Number(shelter.capacityCurrent) : (shelter.capacity_current != null ? Number(shelter.capacity_current) : null);
    const capTotal = shelter.capacityTotal != null ? Number(shelter.capacityTotal) : (shelter.capacity_total != null ? Number(shelter.capacity_total) : null);
    const hasCap = capTotal != null && capTotal > 0;
    const capacityPct = hasCap ? Math.min(100, Math.round(((capCurrent || 0) / capTotal) * 100)) : null;
    const availableCap = hasCap ? Math.max(0, capTotal - (capCurrent || 0)) : null;

    const isDemo = shelter.isDemo || (shelter.name && (shelter.name.toLowerCase().includes('demo') || shelter.name.toLowerCase().includes('prototype') || shelter.name.toLowerCase().includes('munger')));

    const facilitiesList = Array.isArray(shelter.facilities)
      ? shelter.facilities
      : (typeof shelter.facilities === 'string' && shelter.facilities.trim().length > 0 ? [shelter.facilities] : []);

    container.innerHTML = `
      <div style="margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div>
            <h3 style="font-size: 18px; font-weight: bold; color: #0F172A; margin-bottom: 4px;">${shelter.name}</h3>
            ${isDemo ? `
              <span class="source-badge" style="background: #FEF3C7; color: #B45309; font-weight: 700; font-size: 11px; margin-top: 2px;">
                ${t('shelters.demoShelter') || 'Demo Shelter'}
              </span>
            ` : ''}
          </div>
          <span class="source-badge government-badge" style="font-size: 11px; flex-shrink: 0;">
            🟢 ${t('shelters.active') || 'Active'}
          </span>
        </div>
        ${shelter.address ? `<p style="font-size: 13px; color: #64748B; margin-top: 6px;">${shelter.address}</p>` : ''}
      </div>

      ${isDemo ? `
        <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 10px 12px; font-size: 11.5px; color: #92400E; margin-bottom: 14px; line-height: 1.4;">
          <strong>ℹ ${t('shelters.prototypeShelter') || 'Prototype Shelter'}:</strong>
          <span>${t('shelters.demoNotice') || 'Configured for demonstrating authority shelter designation and citizen synchronization. Prototype data only.'}</span>
        </div>
      ` : ''}

      <div class="shelter-meta-row" style="margin-bottom: 14px;">
        ${distance !== null ? `<span class="meta-chip">📏 <strong>${t('shelters.distanceAway', { distance })}</strong></span>` : ''}
        ${hasValidCoords
          ? `<span class="meta-chip" style="color: #166534; background: #F0FDF4;">📍 ${t('shelters.onMap') || 'On Map'}</span>`
          : `<span class="meta-chip" style="color: #64748B;">⏳ ${t('shelters.coordsPending') || 'Coordinates Pending Survey'}</span>`}
        ${hasCap && availableCap !== null ? `<span class="meta-chip">🛏 <strong>${availableCap}</strong> ${t('shelters.availableCapacity') || 'Available'}</span>` : ''}
        ${shelter.contact ? `<span class="meta-chip">📞 ${shelter.contact}</span>` : ''}
      </div>

      ${hasCap ? `
        <div style="margin: 14px 0;">
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; margin-bottom: 4px;">
            <span>${t('shelters.occupancyCapacity') || 'Capacity'}</span>
            <span>${capCurrent || 0} / ${capTotal} (${capacityPct}%)</span>
          </div>
          <div class="capacity-meter">
            <div class="capacity-fill ${capacityPct > 80 ? 'high' : ''}" style="width: ${capacityPct}%;"></div>
          </div>
        </div>
      ` : ''}

      ${facilitiesList.length > 0 ? `
        <div style="margin: 12px 0;">
          <strong style="font-size: 12px; color: #475569;">${t('shelters.facilities') || 'Facilities'}:</strong>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
            ${facilitiesList.map(f => `<span class="meta-chip">✓ ${f}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      ${shelter.description ? `
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px; border-radius: 8px; font-size: 12px; color: #334155; margin-bottom: 14px;">
          ${shelter.description}
        </div>
      ` : ''}

      <div style="display: flex; gap: 10px; margin-top: 14px;">
        ${hasValidCoords ? `
          <button id="findRouteBtn" class="btn btn-safe btn-full">
            <span>🧭</span> <span>${t('shelters.findRouteBtn') || 'Find Safest Route'}</span>
          </button>
        ` : `
          <button class="btn btn-secondary btn-full" disabled style="opacity: 0.6; cursor: not-allowed;">
            <span>⏳</span> <span>${t('shelters.coordsPending') || 'Coordinates Pending Survey'}</span>
          </button>
        `}
        ${shelter.contact ? `
          <a href="tel:${shelter.contact}" class="btn btn-secondary" style="min-width: 90px; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
            <span>📞</span> <span>${t('shelters.callBtn') || 'Call'}</span>
          </a>
        ` : ''}
      </div>
    `;

    const routeBtn = document.getElementById('findRouteBtn');
    if (routeBtn && hasValidCoords) {
      routeBtn.onclick = async () => {
        await safetyMap.plotSafestRoute(shelter);
        store.closeSheet();
        store.navigateTo('map');
      };
    }
  }

  renderAssistantMode(state) {
    const banner = document.getElementById('assistantModeBanner');
    if (banner) {
      banner.className = 'assistant-mode-banner online';
      banner.innerHTML = `
        <span style="display:flex; align-items:center; gap:6px;">
          <span>🛡️</span>
          <span><strong>Deterministic Safety Intent Classification</strong> • Verified NDMA Guidance (Zero External AI API)</span>
        </span>
      `;
    }
  }

  async handleAssistantSend(prompt) {
    const history = document.getElementById('assistantChatHistory');
    if (!history) return;

    // Append user bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = prompt;
    history.appendChild(userBubble);
    history.scrollTop = history.scrollHeight;

    // Loading bubble
    const loadingBubble = document.createElement('div');
    loadingBubble.className = 'chat-bubble assistant';
    loadingBubble.innerHTML = '<em>Matching disaster safety intent & verified NDMA corpus...</em>';
    history.appendChild(loadingBubble);
    history.scrollTop = history.scrollHeight;

    // Query assistant via core deterministic guidance engine
    const response = await safetyAssistant.answerQuery(prompt);

    let actionsHtml = '';
    if (response.immediateActions && response.immediateActions.length > 0) {
      actionsHtml = `
        <div style="margin: 8px 0;">
          <div style="font-size: 12px; font-weight: 700; color: #166534; margin-bottom: 4px;">✓ MANDATORY IMMEDIATE ACTIONS:</div>
          <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; color: #1E293B;">
            ${response.immediateActions.map(a => `<li style="margin-bottom: 3px;">${a}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    let dontsHtml = '';
    if (response.dontActions && response.dontActions.length > 0) {
      dontsHtml = `
        <div style="margin: 8px 0;">
          <div style="font-size: 12px; font-weight: 700; color: #991B1B; margin-bottom: 4px;">✕ WHAT NOT TO DO:</div>
          <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; color: #1E293B;">
            ${response.dontActions.map(d => `<li style="margin-bottom: 3px;">${d}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    let helpHtml = '';
    if (response.whenToSeekHelp && response.whenToSeekHelp.length > 0) {
      helpHtml = `
        <div style="background: #FFF1F2; border: 1px solid #FECDD3; border-radius: 6px; padding: 8px 10px; margin: 8px 0;">
          <div style="font-size: 11.5px; font-weight: 700; color: #9F1239; margin-bottom: 3px;">🚨 WHEN TO SEEK PROFESSIONAL EMERGENCY HELP:</div>
          <ul style="margin: 0; padding-left: 16px; font-size: 12px; color: #881337;">
            ${response.whenToSeekHelp.map(w => `<li style="margin-bottom: 2px;">${w}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    let contactHtml = '';
    if (response.emergencyContact) {
      contactHtml = `
        <div style="margin-top: 8px;">
          <a href="tel:${response.emergencyContact}" class="btn btn-sos" style="min-height: 36px; font-size: 12.5px; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%;">
            <span>📞 Call Emergency Helpline:</span> <strong>${response.emergencyContactLabel || response.emergencyContact}</strong>
          </a>
        </div>
      `;
    }

    // Replace loading bubble with structured response card
    loadingBubble.innerHTML = `
      <div class="assistant-response-card" style="width: 100%;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
          <div>
            <h4 style="font-size: 14.5px; font-weight: 700; color: #0F172A; margin: 0 0 2px 0;">${response.title}</h4>
            <span class="source-badge" style="background: #E0F2FE; color: #0369A1; font-size: 10px; font-weight: 700;">
              ${response.intent}
            </span>
          </div>
          <div style="display: flex; gap: 4px; flex-shrink: 0;">
            <button type="button" class="btn btn-secondary voice-speak-btn" style="min-height: 28px; padding: 0 8px; font-size: 11.5px;" title="Listen to summary">
              🔊 Speak
            </button>
            <button type="button" class="btn btn-secondary voice-stop-btn" style="min-height: 28px; padding: 0 8px; font-size: 11.5px; display: none;" title="Stop audio">
              ⏹ Stop
            </button>
          </div>
        </div>

        ${actionsHtml}
        ${dontsHtml}
        ${helpHtml}
        ${contactHtml}

        <div style="font-size: 10.5px; color: #64748B; margin-top: 8px; border-top: 1px solid #E2E8F0; padding-top: 6px;">
          <div>📖 <strong>Source:</strong> ${response.source}</div>
          <div style="color: #92400E; margin-top: 2px;">ℹ ${response.disclaimer}</div>
        </div>
      </div>
    `;

    const speakBtn = loadingBubble.querySelector('.voice-speak-btn');
    const stopBtn = loadingBubble.querySelector('.voice-stop-btn');

    if (speakBtn && stopBtn) {
      speakBtn.onclick = () => {
        const textToSpeak = response.voiceSummary || response.title;
        safetyAssistant.speak(textToSpeak, {
          onEnd: () => {
            speakBtn.style.display = 'inline-flex';
            stopBtn.style.display = 'none';
          },
          onError: () => {
            speakBtn.style.display = 'inline-flex';
            stopBtn.style.display = 'none';
          }
        });
        speakBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
      };

      stopBtn.onclick = () => {
        safetyAssistant.stopSpeaking();
        speakBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'none';
      };
    }

    history.scrollTop = history.scrollHeight;
  }

  renderHealthCategory(categoryId) {
    const container = document.getElementById('healthProtocolContainer');
    if (!container) return;

    const protocol = EmergencyHealthProtocols[categoryId] || EmergencyHealthProtocols.flood;

    let dosHtml = protocol.dos.map(d => `
      <li class="guide-list-item">
        <span class="guide-badge-do">✓</span>
        <span>${d}</span>
      </li>
    `).join('');

    let dontsHtml = protocol.donts.map(d => `
      <li class="guide-list-item">
        <span class="guide-badge-dont">✕</span>
        <span>${d}</span>
      </li>
    `).join('');

    let redFlagsHtml = protocol.redFlags.map(r => `
      <li style="margin-bottom: 6px; font-size: 13px; color: #991B1B;">
        🚨 <strong>Seek Emergency Care:</strong> ${r}
      </li>
    `).join('');

    container.innerHTML = `
      <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h3 style="font-size: 17px; font-weight: bold; color: #0F172A;">${protocol.title}</h3>
          <p style="font-size: 12px; color: #64748B;">Source: ${protocol.source} (Verified Standard)</p>
        </div>
        <span class="source-badge government-badge">NDMA Protocol</span>
      </div>

      <div class="dos-donts-container">
        <div class="do-column">
          <div style="font-size: 13px; font-weight: bold; color: #166534; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
            <span>✓</span> <span>WHAT TO DO (MANDATORY ACTIONS)</span>
          </div>
          <ul>${dosHtml}</ul>
        </div>

        <div class="dont-column">
          <div style="font-size: 13px; font-weight: bold; color: #991B1B; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
            <span>✕</span> <span>WHAT NOT TO DO (AVOID DANGER)</span>
          </div>
          <ul>${dontsHtml}</ul>
        </div>
      </div>

      <div style="background: #FFF1F2; border: 1px solid #FECDD3; border-radius: 8px; padding: 12px; margin-top: 14px;">
        <div style="font-size: 13px; font-weight: bold; color: #9F1239; margin-bottom: 6px;">
          WHEN TO CALL PROFESSIONAL MEDICAL EMERGENCY (108 / 112)
        </div>
        <ul>${redFlagsHtml}</ul>
      </div>

      <div style="margin-top: 16px; padding: 12px; background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-size: 13px; font-weight: bold; color: #0369A1;">eSanjeevani National Telemedicine</div>
          <div style="font-size: 11px; color: #0284C7;">Consult licensed doctors online via MoHFW portal</div>
        </div>
        <a href="https://esanjeevani.mohfw.gov.in" target="_blank" class="btn btn-primary" style="min-height: 38px; font-size: 12px;">
          Connect
        </a>
      </div>
    `;
  }

  renderFamilySafety(state) {
    const list = document.getElementById('familyContactsList');
    if (!list) return;

    const contacts = state.profile.contacts || [];

    let html = '';
    contacts.forEach((contact) => {
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 8px;">
          <div>
            <div style="font-size: 14px; font-weight: bold; color: #0F172A;">${contact.name}</div>
            <div style="font-size: 12px; color: #64748B;">${contact.phone} • ${contact.relation}</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <a href="tel:${contact.phone}" class="btn btn-secondary" style="min-height: 36px; padding: 0 10px; font-size: 12px;">${t('family.callBtn', '📞 Call')}</a>
            <a href="sms:${contact.phone}" class="btn btn-secondary" style="min-height: 36px; padding: 0 10px; font-size: 12px;">${t('family.smsBtn', '💬 SMS')}</a>
          </div>
        </div>
      `;
    });

    list.innerHTML = html;

    const imSafeBtn = document.getElementById('familyImSafeBtn');
    if (imSafeBtn) {
      imSafeBtn.onclick = () => {
        this.triggerImSafeFlow();
      };
    }
  }

  triggerImSafeFlow() {
    const dialog = document.getElementById('globalDialogBackdrop');
    const title = document.getElementById('dialogTitle');
    const body = document.getElementById('dialogBody');
    const confirmBtn = document.getElementById('dialogConfirmBtn');
    const cancelBtn = document.getElementById('dialogCancelBtn');

    if (!dialog) return;

    const broadcast = familySafety.prepareImSafeBroadcast();
    const isOnline = store.getState().networkState === NetworkStates.INTERNET_ONLINE;

    title.textContent = t('family.confirmDialogTitle', 'Confirm "I\'m Safe" Broadcast');
    body.innerHTML = `
      <p style="font-size: 13.5px; color: #334155; margin-bottom: 12px;">
        ${t('family.confirmDialogDesc', { count: broadcast.recipientCount })}
      </p>
      <div class="sms-body-preview">${broadcast.messageBody}</div>
      <p style="font-size: 11.5px; color: #64748B; margin-top: 8px;">
        ${isOnline ? t('family.onlineNotice', '✓ Internet connected: Will attempt emergency server dispatch with instant SMS fallback.') : t('family.offlineNotice', '⚠ Offline/SMS tier: Will launch pre-formatted SMS in your messaging app.')}
      </p>
    `;

    confirmBtn.textContent = t('family.confirmBroadcastBtn', 'Confirm Broadcast');
    cancelBtn.textContent = t('common.cancel', 'Cancel');
    cancelBtn.style.display = 'inline-flex';
    dialog.classList.add('active');

    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = t('family.broadcastingBtn', 'Broadcasting...');

      const result = await familySafety.executeImSafeBroadcast();
      confirmBtn.disabled = false;

      if (result.smsFallback) {
        dialog.classList.remove('active');
        window.location.href = result.smsUri;
      } else {
        body.innerHTML = `
          <div class="state-banner success" style="margin-bottom: 10px;">
            <span>${result.message || t('family.broadcastSuccess', '✓ "I\'m Safe" broadcast dispatched successfully.')}</span>
          </div>
          <p style="font-size: 12.5px; color: #475569;">
            ${t('common.status', 'Status')}: <strong>${result.status ? mapIncidentStatus(result.status) : t('common.done', 'Done')}</strong> • ${t('family.relayAcknowledged', 'Verified emergency relay acknowledgment.')}
          </p>
        `;
        confirmBtn.textContent = t('common.done', 'Done');
        cancelBtn.style.display = 'none';
        confirmBtn.onclick = () => dialog.classList.remove('active');
      }
    };

    cancelBtn.onclick = () => {
      dialog.classList.remove('active');
    };
  }

  showRequestConfirmation(result) {
    const dialog = document.getElementById('globalDialogBackdrop');
    const title = document.getElementById('dialogTitle');
    const body = document.getElementById('dialogBody');
    const confirmBtn = document.getElementById('dialogConfirmBtn');
    const cancelBtn = document.getElementById('dialogCancelBtn');

    if (!dialog) return;

    title.textContent = t('resources.requestRegisteredTitle', 'Resource Request Registered');
    body.innerHTML = `
      <div class="state-banner ${result.synced ? 'success' : 'pending-sync'}" style="margin-bottom: 12px;">
        <span>${result.synced ? t('resources.submittedToQueue', '✓ Request Submitted to Emergency Queue') : t('resources.savedLocally', '📦 Request Saved Locally — Will sync when connectivity returns.')}</span>
      </div>
      <p style="font-size: 13.5px; color: #1E293B; margin-bottom: 8px;">
        <strong>${t('resources.trackingIdLabel', 'Tracking ID:')}</strong> <code>${result.requestId}</code><br>
        <strong>${t('resources.categoryLabel', 'Category:')}</strong> ${mapResourceType(result.needType)}<br>
        <strong>${t('resources.peopleInDistressLabel', 'People in Distress:')}</strong> ${result.personCount}
      </p>
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px; border-radius: 8px; font-size: 12px; margin-bottom: 8px;">
        <strong>${t('resources.priorityAssessmentLabel', 'Priority Assessment (Nearest-Need-First):')}</strong><br>
        ${t('resources.priorityLabel', 'Priority:')} <span style="font-weight: bold; color: ${result.priorityLevel === 'CRITICAL' ? '#C62828' : '#D97706'}">${mapPriority(result.priorityLevel)}</span> (${t('common.score', 'Score')}: ${result.priorityScore}/100)<br>
        <span style="font-size: 11px; color: #64748B;">${t('resources.priorityAssessmentDesc', 'Calculated from need type, water level urgency, and vulnerable household dependents. Not an AI projection.')}</span>
      </div>
    `;

    confirmBtn.textContent = t('common.close', 'Close');
    cancelBtn.style.display = 'none';

    dialog.classList.add('active');

    confirmBtn.onclick = () => {
      dialog.classList.remove('active');
      cancelBtn.style.display = 'inline-flex';
    };
  }

  renderProfile(state) {
    // Authenticated Citizen Identity Information
    const authBadge = document.getElementById('profileAuthStatusBadge');
    const citizenName = document.getElementById('profileCitizenName');
    const citizenEmail = document.getElementById('profileCitizenEmail');
    const citizenId = document.getElementById('profileCitizenId');
    const citizenPhone = document.getElementById('profileCitizenPhone');
    const citizenBlood = document.getElementById('profileCitizenBlood');
    const citizenDistrict = document.getElementById('profileCitizenDistrict');
    const citizenState = document.getElementById('profileCitizenState');

    if (authBadge) {
      authBadge.textContent = state.profile?.isAuthenticated ? t('profile.authenticatedBadge') : t('profile.unauthenticatedBadge');
      authBadge.className = `source-badge ${state.profile?.isAuthenticated ? 'government-badge' : 'cached-badge'}`;
    }
    if (citizenName) citizenName.textContent = state.profile?.fullName || (state.profile?.isAuthenticated ? t('profile.citizenNameDefault') : t('common.guest'));
    if (citizenEmail) citizenEmail.textContent = state.profile?.email || '--';
    if (citizenId) citizenId.textContent = state.profile?.citizenId || t('common.unauthenticated');
    if (citizenPhone) citizenPhone.textContent = state.profile?.phone || '--';
    if (citizenBlood) citizenBlood.textContent = state.profile?.bloodGroup || '--';
    if (citizenDistrict) citizenDistrict.textContent = state.profile?.district || '--';
    if (citizenState) citizenState.textContent = state.profile?.state || '--';

    // Emergency Contacts List
    const contactsList = document.getElementById('profileContactsList');
    if (contactsList) {
      const contacts = state.profile?.contacts || [];
      if (contacts.length === 0) {
        contactsList.innerHTML = `<div style="color: #94A3B8;">${t('profile.noContacts')}</div>`;
      } else {
        contactsList.innerHTML = contacts.map((c, idx) => `
          <div>${idx + 1}. ${c.name} (${c.phone || '--'})${c.relation ? ` — ${c.relation}` : ''}</div>
        `).join('');
      }
    }

    const pkgStatus = document.getElementById('profilePkgStatus');
    if (pkgStatus) {
      if (state.profile.region && state.offlinePackage.downloaded) {
        pkgStatus.textContent = t('profile.downloadedVersion', {
          version: state.offlinePackage.version,
          size: state.offlinePackage.sizeKb
        });
        pkgStatus.style.color = '#166534';
      } else {
        pkgStatus.textContent = t('profile.noActivePackage', 'No regional package active • Select below');
        pkgStatus.style.color = '#B45309';
      }
    }

    const regSelect = document.getElementById('profileRegionSelect');
    if (regSelect) {
      regSelect.value = state.profile.region || '';
    }

    const langSelect = document.getElementById('profileLangSelect');
    if (langSelect) {
      langSelect.value = state.profile.language || languageManager.getLanguage();
    }

    const hcToggle = document.getElementById('profileHighContrastToggle');
    if (hcToggle) {
      hcToggle.checked = state.highContrast;
      hcToggle.onchange = (e) => {
        store.setState({ highContrast: e.target.checked });
      };
    }

    const ltToggle = document.getElementById('profileLargeTextToggle');
    if (ltToggle) {
      ltToggle.checked = state.largeText;
      ltToggle.onchange = (e) => {
        store.setState({ largeText: e.target.checked });
      };
    }

    const backendStatusBadge = document.getElementById('profileBackendStatusBadge');
    if (backendStatusBadge) {
      if (state.backendConnected) {
        backendStatusBadge.className = 'source-badge government-badge';
        backendStatusBadge.textContent = `✓ ${t('common.online')}`;
      } else if (state.networkState !== NetworkStates.INTERNET_ONLINE) {
        backendStatusBadge.className = 'source-badge cached-badge';
        backendStatusBadge.textContent = t('common.offline');
      } else {
        backendStatusBadge.className = 'source-badge cached-badge';
        backendStatusBadge.textContent = t('common.sim');
      }
    }
  }

  renderSimDrawer(state) {
    const container = document.getElementById('networkSimOptionsContainer');
    if (!container) return;

    let html = '';
    Object.values(NetworkTierDetails).forEach(tier => {
      const isSelected = state.networkState === tier.id;
      const tierI18n = getTierDetailsI18n(tier.id);
      const tierTitle = tierI18n ? tierI18n.label : tier.label;
      const tierDesc = tierI18n ? tierI18n.subtext : tier.subtext;
      html += `
        <div class="sim-state-option ${isSelected ? 'selected' : ''}" data-state="${tier.id}">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="status-dot ${tier.dotClass}"></span>
            <div>
              <div class="sim-state-title">${tierTitle} ${tier.isRoadmap ? `<span class="maturity-badge roadmap">${t('common.roadmap')}</span>` : ''}</div>
              <div class="sim-state-desc">${tierDesc}</div>
            </div>
          </div>
          <div>${isSelected ? `✓ ${t('common.active')}` : ''}</div>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.sim-state-option').forEach(opt => {
      opt.onclick = () => {
        const target = opt.getAttribute('data-state');
        networkManager.simulateState(target);
        store.closeSheet();
      };
    });
  }

  renderResourceRequests(state) {
    const container = document.getElementById('citizenRequestsListContainer');
    if (!container) return;

    const requests = state.resourceRequests || [];
    if (requests.length === 0) {
      container.innerHTML = '';
      return;
    }

    // UI status log before rendering
    requests.forEach(request => {
      console.log('[RakshaSetu][Realtime] UI STATUS', { requestId: request.id, status: request.status });
      console.log('[Realtime] UI STATUS', { requestId: request.id, status: request.status });
    });

    const itemsHtml = requests.map(req => {
      const rawStatus = (req.status || 'PENDING').toUpperCase();
      const mapped = mapResourceStatus(rawStatus);
      const rawCategory = req.request_type || req.needType || req.requestType || 'Resource';
      const categoryTitle = mapResourceType(rawCategory);

      let badgeBg = '#FEF3C7';
      let badgeColor = '#92400E';
      let badgeBorder = '#FDE68A';

      if (rawStatus === 'ASSIGNED') {
        badgeBg = '#EFF6FF';
        badgeColor = '#1E40AF';
        badgeBorder = '#BFDBFE';
      } else if (rawStatus === 'IN_TRANSIT' || rawStatus === 'IN TRANSIT') {
        badgeBg = '#FFFBEB';
        badgeColor = '#B45309';
        badgeBorder = '#FCD34D';
      } else if (rawStatus === 'DELIVERED') {
        badgeBg = '#F0FDF4';
        badgeColor = '#166534';
        badgeBorder = '#BBF7D0';
      } else if (rawStatus === 'CANCELLED') {
        badgeBg = '#FEF2F2';
        badgeColor = '#991B1B';
        badgeBorder = '#FECACA';
      }

      const formattedDate = req.createdAt ? new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const displayTrackingId = req.trackingId || req.requestId || req.client_request_id || req.id || '--';
      const rawPriority = req.priorityLevel || req.priority || 'MEDIUM';
      const mappedPriority = mapPriority(rawPriority);

      return `
        <div style="background: #FFFFFF; border: 1px solid var(--color-border-subtle, #E2E8F0); border-radius: 8px; padding: 12px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 700; font-size: 13.5px; color: #0F172A;">${categoryTitle}</span>
            <span style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700;">
              ${mapped}
            </span>
          </div>
          <div style="font-size: 12px; color: #475569; margin-bottom: 4px;">
            <strong>${t('resources.trackingIdLabel', 'Tracking ID:')}</strong> <code>${displayTrackingId}</code>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748B;">
            <span>${t('resources.personsLabel', 'Persons:')} <strong>${req.personCount || req.quantity || 1}</strong></span>
            <span>${t('resources.priorityLabel', 'Priority:')} <strong style="color: ${rawPriority.toUpperCase() === 'CRITICAL' ? '#C62828' : '#D97706'};">${mappedPriority}</strong></span>
          </div>
          ${req.description ? `<div style="font-size: 11.5px; color: #64748B; margin-top: 4px; font-style: italic;">"${req.description}"</div>` : ''}
          ${formattedDate ? `<div style="font-size: 10.5px; color: #94A3B8; margin-top: 4px; text-align: right;">${formattedDate}</div>` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="app-card" style="margin-top: 14px; background: #F8FAFC; border: 1px solid #E2E8F0;">
        <div class="card-header" style="margin-bottom: 8px;">
          <div class="card-title-group">
            <span class="card-icon">📋</span>
            <div>
              <div class="card-title" style="font-size: 14px;">${t('resources.submittedHeading', 'Your Submitted Requests')}</div>
              <div class="card-subtitle" style="font-size: 11px;">${t('resources.submittedSubtitle', 'Real-time dispatch updates from Authority')}</div>
            </div>
          </div>
          <span class="source-badge government-badge" style="font-size: 10px;">${t('common.liveSync', 'Live Sync')}</span>
        </div>
        ${itemsHtml}
      </div>
    `;

    // Also update active confirmation dialog in real time if open
    const dialog = document.getElementById('globalDialogBackdrop');
    if (dialog && dialog.classList.contains('active')) {
      const dialogTitle = document.getElementById('dialogTitle');
      if (dialogTitle && (dialogTitle.textContent === 'Resource Request Registered' || dialogTitle.textContent === t('resources.requestRegisteredTitle'))) {
        const dialogBody = document.getElementById('dialogBody');
        if (dialogBody) {
          const codeElem = dialogBody.querySelector('code');
          if (codeElem) {
            const trackingId = codeElem.textContent.trim();
            const matched = requests.find(r => 
              (r.trackingId && r.trackingId === trackingId) ||
              (r.requestId && r.requestId === trackingId) ||
              (r.client_request_id && r.client_request_id === trackingId) ||
              (r.id && r.id === trackingId)
            );
            if (matched) {
              const banner = dialogBody.querySelector('.state-banner');
              if (banner) {
                const rawSt = (matched.status || 'PENDING').toUpperCase();
                banner.className = `state-banner ${rawSt === 'DELIVERED' ? 'success' : rawSt === 'CANCELLED' ? 'error' : 'pending-sync'}`;
                banner.innerHTML = `<span>${t('common.status', 'Status')}: <strong>${mapResourceStatus(rawSt)}</strong></span>`;
              }
            }
          }
        }
      }
    }
  }
}

// Global bootstrap
window.app = new RakshaSetuApp();
