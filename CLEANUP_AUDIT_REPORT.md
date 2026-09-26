# RakshaSetu Project Cleanup Audit Report — Phase 1

**Execution Timestamp:** 2026-09-25  
**Scope:** Phase 1 Cleanup Only — Controlled cleanup, dead artifact removal, secret scanning, regression verification.  
**Strict Boundary:** Zero feature development, zero UI redesign, zero Supabase schema/RLS/auth modifications, zero alterations to functional business logic.

---

## 1. Executive Summary

A comprehensive, non-destructive audit and cleanup was executed across the RakshaSetu repository. Obsolete browser profile caches, completed debug scratch scripts, redundant duplicate source trees, legacy mock server endpoints, and hardcoded personal-looking demo contacts have been removed.

- **Total Regression Suite**: **112 / 112 Tests PASSED (100%)**
  - **Phase 1 (Core Services)**: 11 / 11 PASS
  - **Phase 2 (Group A: Alerts, Offline, Auth)**: 25 / 25 PASS
  - **Phase 3 (Group B: Provenance, Disclosures, Offline Data)**: 32 / 32 PASS
  - **Phase 4 (Group C: Safety Assistant & Safe Route)**: 44 / 44 PASS
- **Application Boots Verified**:
  - Citizen Disaster Response PWA (`citizen/index.html`): Verified clean boot via headless Chrome
  - Authority EOC Dashboard (`authority/index.html`): Verified clean boot via headless Chrome CDP
- **Security & Secret Scan**: 100% CLEAN. Zero private keys, zero `service_role` keys, zero database credentials, zero `.env` files. Only the public Supabase publishable key is present in client bundles.

---

## 2. Inventory of Removed Files & Folders

### 2.1 Chrome Test Browser Profiles (`authority/.chrome_*`)
All 12 temporary Chrome debugging directories containing local storage, cookies, session history, and cached browser extensions were purged:
1. `authority/.chrome_debug_console/`
2. `authority/.chrome_debug_err/`
3. `authority/.chrome_demo_sos_test/`
4. `authority/.chrome_fresh_auth_test/`
5. `authority/.chrome_fresh_trace_test/`
6. `authority/.chrome_test_notif/`
7. `authority/.chrome_test_profile/`
8. `authority/.chrome_test_profile9444/`
9. `authority/.chrome_test_reproduce/`
10. `authority/.chrome_test_ui_verify/`
11. `authority/.chrome_test_verify/`
12. `authority/.chrome_test_verify_intact/`

### 2.2 Authority Scratch Artifacts (`authority/scratch/`)
Completed investigative, reproduction, and ad-hoc debug scripts were removed:
- `authority/scratch/test_reproduce_bug.py`
- `authority/scratch/trace_incidents.py`
- `authority/scratch/verify_all_munger_cleanup.py`
- `authority/scratch/verify_all_shelter_criteria.py`
- `authority/scratch/verify_authority_demo_sos_integration.py`
- `authority/scratch/__pycache__/`

### 2.3 Unused Supabase Test Script
- `citizen/js/supabase-test.js`: Standalone scratch file with zero references in runtime codebase.

### 2.4 Duplicate Authority Client Bridge
- `authority/src/services/supabaseClient.js`: Legacy 8-line re-export stub. Zero runtime references (all modules import directly from authoritative `authority/src/services/supabase-client.js`).

### 2.5 Duplicate Legacy Authority JS Tree (`authority/js/`)
The current Authority console entry point (`authority/index.html`) loads `authority/src/app.js`, and all dependencies reside in `authority/src/`. The legacy duplicate directory `authority/js/` was verified to have zero runtime callers and was deleted:
- `authority/js/app.js` (forwarding shim)
- `authority/js/map.js` (forwarding shim)
- `authority/js/state.js` (forwarding shim)
- `authority/js/data/govSources.js`, `mockData.js`, `roadmapData.js`
- `authority/js/ui/demoFlow.js`, `drawer.js`, `modal.js`, `notifications.js`

### 2.6 Generated Test Artifacts
- `citizen/test_results.json`: Ephemeral test run output purged from project source tree.

### 2.7 IDE Artifacts
- `citizen/.vscode/` (`settings.json`): Purged IDE workspace setting folder.

---

## 3. Files Retained Intentionally

### 3.1 Legacy WebSocket Compatibility Stubs
Both legacy WebSocket files are retained to preserve architectural contracts with legacy callers, and have been documented with explicit header notices:
- `citizen/js/websocket-client.js`  
  *Annotated with:* `LEGACY COMPATIBILITY STUB — SUPABASE REALTIME IS AUTHORITATIVE`
- `authority/src/services/websocketService.js`  
  *Annotated with:* `LEGACY COMPATIBILITY STUB — SUPABASE REALTIME IS AUTHORITATIVE`

### 3.2 Regression Test Suites & Verification Harness
Retained for ongoing reproducibility and CI/CD validation:
- `citizen/test_phase1_core.html`
- `citizen/test_phase2_group_a.html`
- `citizen/test_phase3_group_b.html`
- `citizen/test_phase4_group_c.html`
- `citizen/run_tests.py`
- `citizen/run_tests_phase2.py`
- `citizen/run_tests_phase3.py`
- `citizen/run_tests_phase4.py`
- `citizen/verify_app_boot.py`
- `citizen/test_dom.html` (ad-hoc DOM test candidate, preserved)
- `citizen/test_citizen_shelter.html` (ad-hoc shelter test candidate, preserved)

### 3.3 Regional Packages & i18n
- `odisha-coastal` regional package files and all multi-lingual translation keys remain intact.
- Regional package selector and location auto-detection logic guarantee that Munger/Bihar users are never silently defaulted to Coastal Odisha.

---

## 4. Server Cleanup & Conversion

The legacy local Python server was refactored:
1. **New Structure**: `citizen/test_server.py`
   - Operates strictly as a test-harness server.
   - Provides static asset serving with legacy URL alias mapping (for CSS and auth callbacks).
   - Provides `/api/test-results` for automated test harness reporting.
   - Provides `/health` for test runner readiness checks.
2. **Removed Obsolete Endpoints & Mock Disaster Data**:
   - `/api/ai/safety-assistant` (synthetic AI and `ONLINE_AI` mock responses removed)
   - `/routing/safest-route` (fake waypoints removed)
   - `/api/family/im-safe` (fake delivery acknowledgment removed)
   - `/api/incidents` (fake operational SOS acknowledgment removed)
   - `/api/resources` (fake resource acknowledgment removed)
   - `/citizens/:id/heartbeat` and `/heartbeat` (removed)
   - `/api/alerts` (fake Odisha cyclone bulletin removed)
   - `/api/shelters` (fake Puri shelter coordinates removed)
3. **Legacy Entry Point**: `citizen/server.py`
   - Converted into a thin 10-line forwarder that calls `test_server.py`.

---

## 5. Hardcoded Demo Contact Cleanup

### 5.1 Audit Findings
The baseline application previously contained hardcoded mock personal contacts:
- `Aarav Sharma (Brother)` (`+919876543210`)
- `Pooja Patel (Spouse)` (`+919812345678`)
- `District Emergency Contact` (`+919437012345`)

### 5.2 Remediation
1. **State Store (`citizen/js/store.js`)**:
   - `defaultProfile.contacts` set to empty array: `contacts: []`.
   - Added active self-healing filter on `savedProfile` initialization: any cached localStorage profiles containing the legacy demo names or numbers are filtered out automatically while preserving genuine user-configured emergency contacts.
2. **Citizen UI (`citizen/index.html`)**:
   - Replaced static demo contact rows in `#profileContactsList` with neutral state:
     `<div data-i18n="profile.noContacts">No emergency contacts configured.</div>`.
3. **Safety Verification**:
   - When contacts list is empty, emergency SOS fallback utilizes national emergency services (`112`).
   - Adding, editing, and deleting user emergency contacts in the profile UI remains fully functional.
   - "I'm Safe" status transmission continues to work seamlessly.

---

## 6. Security & Credential Scan Results

A complete pattern-based scan of the entire repository was conducted for:
- Privileged keys (`service_role`, `sb_secret`)
- Database connection strings and passwords
- Private certificates and asymmetric keys (`BEGIN RSA`, `BEGIN EC`, etc.)
- User access / refresh tokens
- Third-party AI provider credentials (`sk-`, OpenAI, Gemini, Claude, Groq)
- Dotenv configuration files (`.env`, `.env.local`, `.env.production`)
- Embedded SQLite or browser credential files

### Scan Findings
- **High-Risk Secrets**: **0 FOUND**
- **Medium-Risk Secrets**: **0 FOUND**
- **Exposed Credentials**: **0 FOUND**
- **Public Client Key**: `sb_publishable_IGa6TRg6C3CRIK0BoElOqg_TOjZaF3B` in frontend clients (`citizen/js/supabase-client.js` and `authority/src/services/supabase-client.js`). This is the designed, safe public publishable key for client-side Supabase authentication and RLS.

---

## 7. Regression Verification Results

All 4 test phases and application boot verifiers were executed post-cleanup:

| Test Suite | Scope | Target | Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Verify App Boot** | Citizen PWA DOM & Page Title | `http://localhost:8080/index.html` | Title matched, tabs verified | **PASS** |
| **Authority Boot** | EOC Dashboard DOM & Module Load | `http://127.0.0.1:8085/index.html` | Title matched, CDP ok | **PASS** |
| **Phase 1 Core** | Core modules, Offline storage, Route, Bhuvan | `test_phase1_core.html` | 11 / 11 | **PASS** |
| **Phase 2 Group A** | Incident, Alerts, Offline, Auth, Realtime | `test_phase2_group_a.html` | 25 / 25 | **PASS** |
| **Phase 3 Group B** | Data provenance, Disclosures, Offline digests | `test_phase3_group_b.html` | 32 / 32 | **PASS** |
| **Phase 4 Group C** | Safety Assistant (24 langs, RTL), Safe Route | `test_phase4_group_c.html` | 44 / 44 | **PASS** |
| **Total** | **Full Regression Coverage** | **All 4 Phase Suites** | **112 / 112** | **100% PASS** |

### Verified Subsystems
- **Citizen App**: Boot, Auth/Session, SOS Dispatch, Resource Requests, Shelter Filtering, Safe Route elevation analysis, Safety Assistant NDMA protocols, "I'm Safe" broadcasts, 24-language i18n, Urdu & Sindhi RTL.
- **Authority Dashboard**: Boot, Auth/RBAC, Map geospatial layers, Incident Queue, Resource allocation, Shelter status management, Realtime subscriptions, Authority Demo SOS trigger.

---

## 8. Known Remaining Technical Debt

1. **WebSocket Compatibility Layer**:
   - `citizen/js/websocket-client.js` and `authority/src/services/websocketService.js` remain as no-op/fallback stubs. Full removal would require refactoring legacy event listener registrations across older UI modules.
2. **Ad-Hoc Test Files**:
   - `test_dom.html` and `test_citizen_shelter.html` remain in `citizen/` for backwards compatibility. They are not part of the active 112-test automated regression runner, but remain harmless.
3. **Regional Package Extensibility**:
   - Current offline packages include `bihar-munger` and `odisha-coastal`. Expansion to other national disaster zones (e.g., Assam Brahmaputra, Uttarakhand Hill Hazards) will require packaging additional localized geodata GeoJSON bundles.

---

**Phase 1 Cleanup Complete. All cleanup boundaries strictly respected. Ready for review.**
