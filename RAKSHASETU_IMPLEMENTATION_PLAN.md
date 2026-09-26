# RakshaSetu Engineering Implementation Plan

**Project**: RakshaSetu Last-Mile Emergency Disaster-Response Platform  
**Architecture Baseline**: Shared RakshaSetu Safety Core  
**Scope**: 6-Phase Systematic Implementation & Hardening  
**Target Environment**: Citizen PWA (`/citizen/`) & Authority EOC (`/authority/`)  
**Date**: September 2026  

---

## Architectural Rules & Implementation Constraints

1. **Working Codebase Preservation**: RakshaSetu is an existing, functional application. No component or service may be rewritten from scratch. Existing UI, layouts, styles, and workflows must be preserved.
2. **Supabase Integrity**: Supabase PostgreSQL is the operational source of truth. Existing tables, schemas, constraints, and Row Level Security (RLS) policies must remain intact. No privileged credentials (`service_role`, database passwords) may be exposed in the browser.
3. **No Breaking Changes**: Citizen registration, email confirmation, password reset, authority role authentication, citizen SOS dispatch, authority demo SOS, shelter lifecycle, and 23-language i18n must remain operational at all times.
4. **Shared Safety Core Approach**: Consolidate capabilities into unified shared services rather than duplicating implementations across features.

---

## Phase 1: Shared Safety Core Consolidation

### 1.1 Objective
Construct the core abstraction layer providing unified location, connectivity, offline queuing, synchronization, regional data resolution, risk telemetry, communication fallbacks, and safety guidance.

### 1.2 Files to Create
- `citizen/js/core/location-service.js`: Unified geolocation abstraction providing high-accuracy GPS fixes, last-known cached positions, staleness detection, and standardized source tags (`GPS`, `NETWORK`, `CACHED`, `DEMO`).
- `citizen/js/core/connectivity-service.js`: Consolidated connectivity detection exposing `getState()` returning `ONLINE`, `OFFLINE`, `DEGRADED`, `UNKNOWN` with active Supabase health check pings.
- `citizen/js/core/offline-queue.js`: Unified local event queue for all asynchronous event types (`SOS_INCIDENT`, `RESOURCE_REQUEST`, `FAMILY_IM_SAFE`, `HEARTBEAT`) with standardized event schemas, attempt counters, and priority triage (`CRITICAL`, `HIGH`, `NORMAL`, `LOW`).
- `citizen/js/core/communication-fallback.js`: Multi-stage dispatch coordinator prioritizing Supabase online delivery -> OfflineQueue temporary persistence -> SMS URI / cellular fallback -> clear user delivery state.
- `citizen/js/core/safety-guidance-service.js`: Structured NDMA safety guidance resolver mapping user emergency queries to verified do's and don'ts, localized via the existing 23-language i18n engine.
- `citizen/js/core/route-service.js`: Consolidates safest-route elevation heuristics, waypoint generation, and simulated hazard boundary overlays, with explicit prototype disclaimers.
- `citizen/js/core/risk-data-service.js`: Normalizes government risk feeds (IMD, CWC, NDMA) with strict data integrity states (`LIVE`, `CACHED`, `STALE`, `UNAVAILABLE`).

### 1.3 Files to Modify
- `citizen/js/sync-manager.js`: Refactor `syncPendingOutbox()` to consume the unified `OfflineQueue` for all event types, preserving existing RFC4122 `clientEventId` idempotency and unique violation (23505) recovery.
- `citizen/js/offline-storage.js`: Integrate `OfflineQueue` and enforce strict `bihar-munger` resolution without silent fallback to Coastal Odisha.
- `citizen/js/network-manager.js`: Connect internal state machine with `ConnectivityService`.
- `citizen/sw.js`: Update precache list `ASSETS_TO_CACHE` to include new core service files.

### 1.4 Files that Must NOT be Modified
- `citizen/js/supabase-client.js`: Preserved as the singular public Supabase client.
- `citizen/js/auth-service.js`: Preserved intact; handles citizen signup, login, session persistence, and callbacks.
- `authority/src/services/supabase-client.js`: Preserved intact.
- `authority/src/services/authService.js`: Preserved intact; handles authority RBAC verification.

### 1.5 Supabase & RLS Changes
- **Database Schema**: No changes needed. Existing tables (`incidents`, `resource_requests`, `shelters`, `heartbeats`, `family_safety`, `alerts`, `profiles`) already satisfy all data requirements.
- **RLS Policies**: No changes needed. Existing policies enforce proper tenant isolation and role separation.

### 1.6 Testing & Verification Requirements
- Verify `LocationService.getCurrentPosition()` returns standard location schema on both desktop and mobile viewports.
- Simulate network disconnection in Chrome DevTools to verify `ConnectivityService.getState()` transitions from `ONLINE` to `OFFLINE`.
- Enqueue dummy events into `OfflineQueue` and verify persistence across browser refresh.
- Trigger `SyncManager` online flush and verify queue items transition from `PENDING` to `SYNCED`.

### 1.7 Rollback Considerations
- Each shared service module operates as an independent ES module. If an issue occurs, the original monolithic handlers in `emergency-sos.js` or `sync-manager.js` can be restored without affecting the underlying database.

---

## Phase 2: Group A — Communication & Connectivity

### 2.1 Objective
Strengthen and unify the three communication features:
1. **"I'm Safe" Broadcast**: Seamless backend delivery when online, queued in `OfflineQueue` when offline, with SMS fallback.
2. **Pre-Blackout Location Heartbeat**: Periodic background GPS telemetry transmitted to Supabase `heartbeats` table when online, logged locally when offline.
3. **Low-Data Location Ping / SMS Path**: Pre-formatted, ultra-compressed SMS payload generation with GPS coordinates and battery telemetry.

### 2.2 Files to Modify
- `citizen/js/family-safety.js`:
  - Route broadcast requests through `CommunicationFallback` and `OfflineQueue`.
  - Ensure offline broadcasts persist in `OfflineQueue` for automatic synchronization when connectivity is restored, in addition to preparing the SMS fallback URI.
  - Record broadcast events in Supabase `family_safety` table upon sync.
- `citizen/js/emergency-sos.js`:
  - Delegate coordinates capture to `LocationService`.
  - Route heartbeat pings to Supabase `heartbeats` table via `SyncManager` rather than unhandled fetch calls.
  - Delegate SMS URI formatting to `CommunicationFallback`.
- `citizen/js/app.js`:
  - Wire UI status indicators for heartbeat recency and broadcast status.
  - Update "I'm Safe" bottom-sheet modal to display honest multi-stage delivery feedback (`QUEUED`, `SENT_TO_BACKEND`, `SMS_READY`).

### 2.3 Files that Must NOT be Modified
- `citizen/auth/callback.html` & `citizen/auth/reset-password.html`
- `authority/src/services/incidentService.js` (Must continue consuming `public.incidents`)
- `authority/src/services/heartbeatService.js` (Must continue reading `public.heartbeats`)

### 2.4 Supabase & RLS Changes
- None. `public.family_safety` and `public.heartbeats` tables already exist and have active RLS policies.

### 2.5 Testing & Verification Requirements
- **"I'm Safe" Online Test**: Trigger broadcast with active network; verify record insertion in Supabase `family_safety` and UI status "Confirmed & Queued".
- **"I'm Safe" Offline Test**: Toggle network to offline; trigger broadcast; verify event appears in `OfflineQueue` and SMS fallback composer opens with pre-populated coordinates.
- **Heartbeat Telemetry Test**: Verify periodic location fixes populate in Supabase `heartbeats` and reflect in Authority EOC Live Map with appropriate age indicator.

### 2.6 Rollback Considerations
- If outbox queuing for "I'm Safe" fails, revert to direct REST dispatch with immediate SMS fallback.

---

## Phase 3: Group B — Disaster Intelligence

### 3.1 Objective
Strengthen disaster intelligence features grounded in verified data:
1. **Dam & Weather Risk Digest**: Ingest official IMD bulletins and CWC hydrological telemetry for Munger / Ganga basin; enforce data freshness classifications.
2. **Satellite Imagery / Bhuvan Integration**: Direct context-aware launcher to ISRO NRSC Bhuvan Flood Inundation Geo-Portal with regional coordinates.

### 3.2 Files to Modify
- `citizen/js/alerts-manager.js`:
  - Remove hardcoded Hirakud Dam / Odisha references.
  - Connect to `RiskDataService` for Munger / Ganga basin hydrological data (Kashtaharani Ghat monitoring station, Indrapuri/Sone barrage discharge).
  - Enforce status tags (`LIVE`, `CACHED`, `STALE`, `UNAVAILABLE`).
- `citizen/assets/data/regional-packages.json`:
  - Update `bihar-munger` package to include verified Ganga river basin hydrological context and BSDMA emergency helplines.
  - Remove stale default references that silently select Coastal Odisha.
- `citizen/js/safety-map.js`:
  - Remove hardcoded Fani 2019 surge polygon from `toggleHistoricalRiskLayer()`; bind hazard boundaries to the active region package.
  - Enhance `openISROBhuvanPortal()` to provide explicit operational notices.

### 3.3 Files that Must NOT be Modified
- `authority/src/data/govSources.js` (Already correctly configured with Munger IMD and CWC stations).
- `authority/src/services/governmentDataService.js`.

### 3.4 Supabase & RLS Changes
- None. `public.alerts` table is used for real-time bulletins; regional package provides cached baseline.

### 3.5 Testing & Verification Requirements
- Verify Alerts tab in Citizen PWA displays Munger Ganga water level and IMD precipitation rate.
- Disconnect internet; verify alerts display `CACHED` badge with explicit last-sync timestamp.
- Click "ISRO Bhuvan Portal" button; verify clean external navigation to official NRSC portal.

### 3.6 Rollback Considerations
- Cached JSON packages in `regional-packages.json` serve as an immutable fallback if live Supabase alerts are unreachable.

---

## Phase 4: Group C — Citizen Safety Assistant

### 4.1 Objective
Enhance citizen assistance capabilities without introducing unverified or generative AI risks:
1. **Safe Route to Shelter**: Consolidate heuristic safe-routing engine with transparent disclaimers; route to the verified Munger demo shelter (`Government Engineering College, Munger`).
2. **Multilingual Voice + Text Safety Chat**: Connect text and speech inputs to the verified `SafetyGuidanceService` pipeline, delivering responses translated across 23 languages using the existing `i18n` engine.

### 4.2 Files to Modify
- `citizen/js/safety-assistant.js`:
  - Replace hardcoded English strings with dynamic retrieval from `SafetyGuidanceService`.
  - Pass user prompts through intent classifier (`FLOOD_SAFETY`, `HEAT_EMERGENCY`, `TRAUMA_FIRST_AID`, `CYCLONE_SAFETY`, `WATER_PURIFICATION`, `GENERAL_SAFETY`).
  - Translate output responses using `i18n.t()` or language manager to respect the citizen's selected language.
  - Bind speech recognition language to the selected Indian language code (e.g. `hi-IN`, `bn-IN`, `ta-IN`, `mr-IN`).
  - Provide speech synthesis playback of the localized advice card.
- `citizen/js/safety-map.js`:
  - Integrate `RouteService` to calculate path from citizen's coordinates to the active shelter.
  - Ensure destination defaults to `Government Engineering College, Munger (Demo Shelter)` (coords ~25.37, 86.50) when in Munger region.
  - Display explicit disclaimer: "Safest Route — Prototype • Local Elevation Heuristic".

### 4.3 Files that Must NOT be Modified
- `citizen/i18n/index.js` core translation registry.
- `citizen/i18n/*.js` (24 language dictionaries; new translation keys should be added additively if required).

### 4.4 Supabase & RLS Changes
- None. Routing and safety guidance are computed locally from verified datasets and active shelter records.

### 4.5 Testing & Verification Requirements
- **Multilingual Assistant Test**: Switch app language to Hindi (`hi`), ask "बाढ़ में क्या करें" (What to do in flood); verify response card renders in Hindi with NDMA attribution.
- **Voice Input Test**: Tap microphone; speak emergency question; verify transcription populates input field and triggers intent match.
- **Speech Synthesis Test**: Tap voice playback; verify synthesized audio plays in target language.
- **Safe Route Test**: Open Safety Map; tap "Plot Safest Route"; verify green dashed polyline leads to GEC Munger demo shelter with elevation ridge heuristic notice.

### 4.6 Rollback Considerations
- If Web Speech recognition is blocked by browser permission or unsupported, UI gracefully falls back to text search input with zero crash risk.

---

## Phase 5: End-to-End Verification & Hardening

### 5.1 Objective
Execute rigorous integration testing across all 12 platform features on both Citizen PWA and Authority EOC.

### 5.2 Verification Checklist
1. **Authentication & RBAC**:
   - Citizen signup, login, email callback, and session recovery.
   - Authority login rejection for citizen role; grant access only for `authority`/`admin`.
2. **Citizen SOS Dispatch**:
   - One-tap SOS creates incident row in Supabase with valid `client_event_id`.
   - Realtime update appears on Authority EOC dashboard and tactical map within 2 seconds.
3. **Incident Lifecycle Progression**:
   - Authority operator transitions incident: `Unassigned -> Assigned -> Responding -> Reached -> Resolved`.
   - Citizen handset receives Realtime postgres_changes event and updates status banner in real-time.
4. **Resource Request & Logistics**:
   - Citizen submits request for clean water; synced to Supabase `resource_requests`.
   - Authority assigns team and vehicle; advances status `PENDING -> ASSIGNED -> IN_TRANSIT -> DELIVERED`.
5. **Offline & Network Recovery**:
   - Handset offline: SOS, "I'm Safe", and resource requests queue locally.
   - Handset online: Queue flushes automatically without user intervention; duplicates resolved idempotently.
6. **23 Languages & RTL Layout**:
   - Validate UI rendering across Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, etc.
   - Validate RTL layout alignment for Urdu (`ur`) and Sindhi (`sd`).

---

## Phase 6: Codebase Hygiene & Cleanup

### 6.1 Objective
Remove obsolete development artifacts, dead shims, and redundant comments while strictly preserving all operational files.

### 6.2 Cleanup Actions
- Update `citizen/sw.js` cache version and ensure all active assets are precached.
- Remove obsolete debugging console logs while preserving structured diagnostic traces.
- Verify zero lingering references to coastal Odisha or Wayanad in active Munger operational paths.
- Ensure all demo data is labeled with `DEMO` or `PROTOTYPE` indicators.
