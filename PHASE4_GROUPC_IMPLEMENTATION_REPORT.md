# PHASE 4 — GROUP C IMPLEMENTATION REPORT
## Citizen Safety Assistant & Safe Route to Shelter

**Platform**: RakshaSetu Citizen Emergency Network  
**Phase**: Phase 4 — Final Feature Group (Group C)  
**Verification Date**: September 23, 2026  
**Status**: COMPLETE (44/44 Group C Tests Passed | 112/112 All-Suite Tests Passed | 100% Green)

---

## 1. Executive Summary

Phase 4 (Group C) concludes the core functional development of the RakshaSetu citizen-side disaster response network by delivering two mission-critical, life-safety capabilities:
1. **Safe Route to Shelter**: Deterministic offline pedestrian routing from citizen location to designated relief shelters (grounded in the primary prototype destination: Government Engineering College, Munger `[25.3700, 86.5000]`), respecting current GPS fixes, cached last-known position fallback, stale detection (>15 minutes), walking ETA at ~3.2 km/h, and active flood hazard polygon avoidance without fabricating coordinates.
2. **Multilingual Voice + Text Safety Assistant**: 100% deterministic safety intent classification across 7 mandated categories (`FLOOD_SAFETY`, `HEAT_SAFETY`, `UNSAFE_WATER`, `TRAUMA_FIRST_AID`, `CYCLONE_SAFETY`, `GENERAL_EMERGENCY`, `SHELTER_GUIDANCE`) paired with official, verified disaster-safety guidance from the National Disaster Management Authority (NDMA), Indian Red Cross Society (IRCS), and Ministry of Health & Family Welfare (MoHFW).
   - Voice Input: Native browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).
   - Voice Output: Browser `SpeechSynthesis` with granular speak/stop playback controls.
   - Multilingual Coverage: 24 Indian languages, with RTL layout direction for Urdu (`ur`) and Sindhi (`sd`).
   - Strict Safety Guardrail: Rejection of non-disaster and general conversational chatbot queries.

### Zero AI API Guarantee
Phase 4 was engineered under strict constraints prohibiting generative AI APIs:
- **ZERO External AI APIs**: No OpenAI (`OPENAI_API_KEY`), Gemini (`GEMINI_API_KEY`), Claude (`ANTHROPIC_API_KEY`), Groq (`GROQ_API_KEY`), or external LLM endpoints.
- **ZERO Backend AI Proxies**: Removed legacy mock calls (`/api/ai/guidance`); all safety intelligence operates locally, deterministically, and offline in `SafetyGuidanceService`.
- **ZERO Supabase Schema/RLS Changes**: Preserved all existing Supabase tables, policies, and auth workflows intact.

---

## 2. Architecture & Service Design

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           CITIZEN APPLICATION                             │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│   [ Voice Input: Web Speech API ]       [ Text Input / Quick Directives ] │
│                           │                            │                  │
│                           ▼                            ▼                  │
│               ┌──────────────────────────────────────────────┐            │
│               │          SafetyAssistant Manager             │            │
│               │  (Microphone control, UI wave, TTS playback) │            │
│               └──────────────────────┬───────────────────────┘            │
│                                      │                                    │
│                                      ▼                                    │
│               ┌──────────────────────────────────────────────┐            │
│               │         SafetyGuidanceService                │            │
│               │  - Deterministic Intent Classification       │            │
│               │  - 7 Canonical Intent Keyword/Phrase Rules   │            │
│               │  - 24 Localized Dialects + RTL Awareness     │            │
│               │  - Verified NDMA / Red Cross Guidance DB     │            │
│               │  - Conversational Safety Guardrail           │            │
│               └──────────────────────┬───────────────────────┘            │
│                                      │                                    │
│                 ┌────────────────────┴────────────────────┐               │
│                 ▼                                         ▼               │
│   [ Structured Safety Guidance ]              [ Intent = SHELTER_GUIDANCE ]
│   - Immediate Actions (Do's)                              │               │
│   - Don't Actions (Don'ts)                                ▼               │
│   - When to Seek Help (Red Flags)             ┌──────────────────────┐    │
│   - Official Emergency Contact                │     RouteService     │    │
│   - Voice Summary SpeechSynthesis             │ - GPS Fix Resolution │    │
│                                               │ - GEC Munger Fallback│    │
│                                               │ - Hazard Avoidance   │    │
│                                               │ - Realistic ETA Walk │    │
│                                               └───────────┬──────────┘    │
│                                                           │               │
│                                                           ▼               │
│                                               ┌──────────────────────┐    │
│                                               │      SafetyMap       │    │
│                                               │ - Polyline Render    │    │
│                                               │ - Hazard Overlay     │    │
│                                               │ - Prototype Notice   │    │
│                                               └──────────────────────┘    │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Component Implementation

### 3.1 RouteService (`citizen/js/core/route-service.js`)
- **API Entrypoint**: `routeService.calculateSafeRouteToShelter(targetShelter, options)`
- **Destination Target**: Primary prototype destination configured as Government Engineering College (GEC), Munger (`[25.3700, 86.5000]`).
- **Location Resolution Hierarchy**:
  1. Explicit origin provided in options (e.g. testing/manual override).
  2. Active GPS coordinate fix via `locationService.getCurrentPosition()`.
  3. Last-known durable position fix via `locationService.getLastKnownLocation()`.
  4. Stale flag checked: if age exceeds 15 minutes, route includes warning tag `is_stale_location: true`.
  5. Honest failure handling: If neither live GPS nor cached location is available, returns `{ success: false, error: 'GPS_UNAVAILABLE' }` without fabricating coordinates.
- **Shelter Availability Validation**:
  - Inactive shelter check: `{ success: false, error: 'SHELTER_INACTIVE' }`
  - Missing/unverified shelter coordinates: `{ success: false, error: 'SHELTER_COORDINATES_UNAVAILABLE' }`
- **Hazard Avoidance Heuristic**:
  - Automatically loads flood hazard polygons from `regionalDataService` / `offlineStorage` (e.g. Munger Kashtaharani Ghat low-lying inundation zone).
  - Uses Ray-Casting algorithm (`isPointInPolygon` & line-segment intersection) to detect route paths traversing active hazard polygons.
  - Inserts elevated detour waypoints along high-ground ridges to circumnavigate inundated lowlands.
- **Kinematics & Walking ETA**:
  - Haversine distance computation with winding road curvature factor ($1.22 \times \text{great-circle distance}$).
  - Walking speed calibrated to realistic flood/disaster terrain: $3.2 \text{ km/h}$.
  - Computes `walking_time_minutes = Math.round((distance_km / 3.2) * 60)`.
- **Prototype Status & Disclaimers**:
  - Explicitly tags `is_prototype: true`.
  - Attaches standard disclaimer: *"Prototype offline heuristic walking route; not certified emergency evacuation guidance. Verify on scene."*

### 3.2 SafetyGuidanceService (`citizen/js/core/safety-guidance-service.js`)
- **Intent Classifier**: Pure deterministic keyword and phrase matching across 7 canonical intents:
  1. `FLOOD_SAFETY`: Immediate refuge on high ground, water boiling (3 min) or chlorination (1 tab / 20L), 3 whistle blasts / torch signalling, no barefoot walking. Contact: `1070`.
  2. `HEAT_SAFETY`: Move to shade/cool room, oral rehydration salts (ORS) / lemon water, cool wet cloth on forehead/neck/armpits, no direct sun, no cold ice baths. Contact: `108`.
  3. `UNSAFE_WATER`: Boil vigorously for 3 minutes, 1 chlorine tablet (halazone/NaDCC) per 20 litres, allow 30 min settling, cloth filtration, no drinking flood runoff or raw canal water. Contact: `1077`.
  4. `TRAUMA_FIRST_AID`: Direct firm pressure with clean cloth, elevate injured limb above heart, do not remove deeply embedded objects, zero oral medications/drugs to unconscious victims, immobilize fractures. Contact: `108`.
  5. `CYCLONE_SAFETY`: Move away from windows into reinforced interior room, turn off gas/power, secure loose outdoor objects, do not step outside during the calm eye of the storm. Contact: `1070`.
  6. `GENERAL_EMERGENCY`: Locate nearest active shelter, conserve phone battery (low brightness), avoid unverified social media rumors, trigger Emergency SOS for life threats. Contact: `112`.
  7. `SHELTER_GUIDANCE`: Directs citizen to Safety Map shelter markers, initiates Safe Route calculation, reminds citizen to carry ID and land papers in waterproof bag. Contact: `1077`.
- **Conversational Safety Guardrail**:
  - Queries not matching disaster-safety intents (e.g. general conversation, cooking recipes, programming) return `SafetyIntent.UNSUPPORTED` with `isSupported: false`.
  - Courteous refusal explains domain limitations: *"I can help with flood safety, heat safety, unsafe water, basic emergency guidance, shelter guidance, and other supported disaster-safety topics."*
- **Multilingual Support**:
  - Multi-language phrase aliasing supporting Hindi, English, Urdu, Sindhi, Bengali, Odia, Tamil, and Telugu.
  - Supports RTL layouts for Urdu (`ur`) and Sindhi (`sd`).

### 3.3 SafetyAssistant Manager (`citizen/js/safety-assistant.js`)
- **Speech Input**: Browser Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`).
  - Configured with `continuous = false`, `interimResults = false`.
  - Language resolution mapped via `SPEECH_LANG_MAP` (e.g., `hi` -> `hi-IN`, `ur` -> `ur-IN`, `en` -> `en-IN`).
  - Handles permission denials and unsupported browser environments gracefully.
- **Speech Output**: Browser `SpeechSynthesis`.
  - Speaks concise NDMA `voiceSummary`.
  - Provides full `speak(text, options)` and `stopSpeaking()` control hooks wired to UI buttons.
- **Bi-directional Language Synchronization**:
  - Subscribes to `languageManager.onLanguageChange` to immediately update recognition and synthesis locales.
  - Subscribes to `store` profile language state changes to keep centralized state in sync.

### 3.4 UI Integration (`citizen/js/app.js`, `citizen/js/safety-map.js`, `citizen/index.html`)
- Added **Safe Route quick action** on the Home screen and an on-map **"Safe Route to Shelter" overlay button**.
- Renders elevated walking polyline in blue (`#38bdf8`) on Leaflet map, accompanied by red hazard avoidance polygon (`#ef4444`) and informative destination popups.
- Safety Assistant modal displays structured directives:
  - Immediate Actions (Do's) with green tick badges
  - Don't Actions (Don'ts) with red warning badges
  - Red Flags ("When to Seek Urgent Help")
  - One-tap direct dial emergency contact (`tel:...`)
  - Listen / Stop Voice buttons.

---

## 4. Test Execution & Verification Matrix

### 4.1 Phase 4 (Group C) Test Suite (`test_phase4_group_c.html`)
The comprehensive test suite executes 44 rigorous automated checks across 5 functional areas:

| Category | Tests | Description | Result |
| :--- | :---: | :--- | :---: |
| **Part 1: Safe Route to Shelter** | 1–13 | GEC Munger destination `[25.37, 86.50]`, GPS vs cached vs stale location resolution, realistic ~3.2 km/h walking ETA, flood hazard polygon avoidance detour, prototype disclaimers, honest GPS/shelter failure handling | **13/13 PASS** |
| **Part 2: Safety Assistant Guidance** | 14–22 | Deterministic classification pipeline, all 7 NDMA protocols (`FLOOD_SAFETY`, `HEAT_SAFETY`, `UNSAFE_WATER`, `TRAUMA_FIRST_AID`, `CYCLONE_SAFETY`, `GENERAL_EMERGENCY`, `SHELTER_GUIDANCE`), conversational guardrail | **9/9 PASS** |
| **Part 3: Multilingual & RTL** | 23–29 | Exact phrase classification in Hindi, English, Bengali, Odia, Tamil, Telugu; RTL validation for Urdu and Sindhi; speech language synchronization | **7/7 PASS** |
| **Part 4: Web Speech API** | 30–34 | SpeechRecognition runtime availability and permission fallback, BCP-47 tag resolution, SpeechSynthesis utterance generation and stop playback controls | **5/5 PASS** |
| **Part 5: Security & Regressions** | 35–44 | Zero AI API keys verification, zero external LLM endpoints, zero Supabase schema/RLS alterations, Citizen Auth, Citizen SOS, Shelter GIS, Group A, Group B, and Phase 1 Core regression | **10/10 PASS** |
| **TOTAL** | **44** | **All Phase 4 (Group C) Core Checks** | **44/44 PASS (100%)** |

### 4.2 Full Regression Suite Results
Automated Chromium headless execution confirmed zero regressions across all historical phases:

```
======================================================================
RAKSHASETU ALL-SUITE CHROMIUM REGRESSION RUNNER
======================================================================

[SUITE] Phase 4 Group C (Safe Route & Safety Assistant)
  URL: http://localhost:8080/test_phase4_group_c.html
  Result: TEST_RESULTS: 44/44 PASS

[SUITE] Phase 3 Group B (Disaster Intelligence)
  URL: http://localhost:8080/test_phase3_group_b.html
  Result: PASSED: Group B (32/32)

[SUITE] Phase 2 Group A (Communication & Connectivity)
  URL: http://localhost:8080/test_phase2_group_a.html
  Result: PASSED: Group A (25/25)

[SUITE] Phase 1 Core (Safety Core & Storage)
  URL: http://localhost:8080/test_phase1_core.html
  Result: PASSED: Phase 1 (11/11)

[SUITE] Citizen PWA Clean Boot Verification
  Result: PASSED: Citizen PWA booted with title 'RakshaSetu: Citizen Disaster Response PWA'

======================================================================
FINAL REGRESSION REPORT
======================================================================
  Phase 4 Group C (Safe Route & Safety Assistant) : PASS (44/44)
  Phase 3 Group B (Disaster Intelligence)          : PASS (32/32)
  Phase 2 Group A (Communication & Connectivity)  : PASS (25/25)
  Phase 1 Core (Safety Core & Storage)             : PASS (11/11)
  Citizen PWA Boot                                 : PASS

ALL VERIFICATIONS PASSED (100% | 112/112 TESTS GREEN)
```

---

## 5. Prototype Disclaimers & Operational Limitations

1. **Safe Route Heuristic**:
   - The walking route computed by `RouteService` uses a geometric shortest-path and hazard avoidance algorithm based on regional flood map vectors.
   - It is explicitly marked as a **prototype offline heuristic** and is **not certified emergency evacuation guidance**. Road conditions, flash flood surges, and structural damage on scene take absolute priority over calculated paths.
2. **Primary Shelter Destination**:
   - Government Engineering College (GEC), Munger (`[25.3700, 86.5000]`) is the primary prototype shelter destination used for heuristic validation.
   - It is identified as a prototype shelter destination and is not currently designated as an official permanent relief camp by the Munger District Administration.
3. **Safety Assistant Medical / Legal Boundaries**:
   - Guidance provided by `SafetyGuidanceService` is grounded exclusively in public NDMA, Red Cross, and MoHFW first-aid protocols.
   - It **does NOT prescribe prescription medications or oral drugs** (strictly antiseptic washing, direct pressure, elevation, and hydration).
   - Emergency contacts (`112`, `1070`, `1077`, `108`) are provided as standard government helplines.

---

## 6. Conclusion

Phase 4 (Group C) has been implemented strictly adhering to all architectural constraints, data privacy mandates, and zero-AI requirements. The system is verified green across all 112 automated test cases spanning Phases 1 through 4.

Execution is paused in compliance with workflow instructions to await user review and approval.
