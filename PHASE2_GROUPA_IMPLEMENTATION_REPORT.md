# RakshaSetu Phase 2 — Group A (Communication & Connectivity) Implementation Report

**Status:** COMPLETED & VERIFIED (25/25 Tests Passed, Zero Regressions)  
**Date:** September 23, 2026  
**Target Milestone:** Phase 2 — Group A: Communication & Connectivity  
**Scope:** Citizen PWA Core (`citizen/js/core/` and `citizen/js/`)  

---

## 1. Executive Summary & Objective

In accordance with the approved Phase 2 Implementation Plan, Phase 2 — Group A has been implemented, consolidating and formalizing the three primary emergency communication and connectivity workflows of RakshaSetu:

1. **"I'm Safe" Broadcast Engine**: Multi-recipient safety confirmation dispatches via Supabase backend when online, with durable IndexedDB queueing, cross-platform RFC5724 SMS fallbacks, and honest delivery status tracking (`SENT`, `QUEUED_OFFLINE`, `SMS_READY`).
2. **Pre-Blackout Location Heartbeat**: Battery-conscious periodic location telemetry while the Citizen PWA is active/eligible to execute, with cached last-known position fallback, stale-fix detection (>15m), bounded IndexedDB coalescing (max 3 pending fixes), and Supabase `heartbeats` ingestion.
3. **Low-Data Location Ping / SMS Fallback**: Ultra-compact single-SMS PDU payloads (< 140 chars) formatting GPS/cached telemetry, cross-platform RFC5724 SMS URI generation with safe percent-encoding, and strict disclosure requiring explicit user handset dispatch.

All implementations strictly adhere to the non-negotiable architectural mandates:
- **Citizen-Side Focus**: All new modules live under `citizen/js/core/` and `citizen/js/`.
- **Zero Authority Alterations**: Supabase schema, RLS policies, and Authority dashboard code remain completely untouched.
- **IndexedDB Authoritative**: Emergency and operational events persist exclusively in `RakshaSetu_DB` (`offline_queue` and `operational_state`). Zero operational data is stored in `localStorage`.
- **Honest Disclosures**: No false claims of "zero data loss", automated background SMS dispatch, or 24/7 background GPS tracking.

---

## 2. Implemented Features & Technical Architecture

### Feature 1: "I'm Safe" Broadcast Engine
- **Module**: [`citizen/js/family-safety.js`](file:///d:/RakshaSetu/citizen/js/family-safety.js)
- **Class**: `FamilySafetyManager` (exported as `familySafety`)
- **Key Capabilities**:
  - Replaces legacy direct writes with Phase 1 `locationService` (GPS + cached last-known fallback).
  - Inspects reachable network state via `connectivityService`.
  - **Online Dispatch**: Directly attempts backend transmission to Supabase `family_safety` via `apiClient.post('/family/im-safe', payload)` with fallback to EOC gateway simulator.
  - **Offline Queuing**: When offline or if network dispatch fails, durably enqueues a `FAMILY_IM_SAFE` event with client-generated RFC4122 `clientEventId` in IndexedDB `offline_queue`.
  - **Cross-Platform SMS Fallback**: Concurrently formats an RFC5724 URI (`sms:<phone>?body=<encodedMessage>`) pointing to the primary emergency contact.
  - **Honest Delivery States**: Exposes `SENT`, `QUEUED_OFFLINE`, `SMS_READY`, `FAILED`, and `RETRYING`. Never marks unconfirmed SMS as delivered.

### Feature 2: Pre-Blackout Location Heartbeat
- **Module**: [`citizen/js/core/heartbeat-service.js`](file:///d:/RakshaSetu/citizen/js/core/heartbeat-service.js)
- **Class**: `HeartbeatService` (exported as `heartbeatService`)
- **Key Capabilities**:
  - **Lifecycle & Battery Optimization**: Binds to `document.visibilitychange`. Standby cadence (5 minutes) pauses when the tab is backgrounded. During active SOS emergency (`store.getState().activeEmergencySession`), escalates to 1-minute cadence and continues telemetry collection.
  - **Telemetry Ingestion**: Directly dispatches to Supabase `heartbeats` table (`citizen_id`, `latitude`, `longitude`, `accuracy_meters`, `network_state`), matching the Authority EOC monitoring contract.
  - **Cached & Stale Position Recovery**: Recovers last-known coordinates from `LocationService` if GPS acquisition times out; flags fixes older than 15 minutes as `is_stale: true`.
  - **IndexedDB Coalescing**: Limits pending heartbeat records in `offline_queue` to a bounded sliding window of 3 fixes, pruning older obsolete coordinates to preserve device storage and prevent network storms on reconnect.
  - **Mandatory Disclosure**: Discloses that heartbeats operate *"while the Citizen PWA is active/eligible to execute, with cached last-known recovery."*

### Feature 3: Low-Data Location Ping & SMS Fallback
- **Module**: [`citizen/js/core/low-data-ping.js`](file:///d:/RakshaSetu/citizen/js/core/low-data-ping.js)
- **Class**: `LowDataPingService` (exported as `lowDataPing`)
- **Key Capabilities**:
  - **Ultra-Compact Serialization**: Produces standardized string payloads strictly under 140 characters to fit within a single GSM 7-bit SMS PDU:
    `[RS-PING] T:<type> L:<lat>,<lng> A:<acc>m S:<src> TS:<hh:mm>`
  - **Cross-Platform SMS Construction**: Implements RFC5724 compliant URI generation via `communicationFallback.generateSmsUri()`. Properly percent-encodes all coordinate, time, and status tokens.
  - **Explicit User Action Enforcement**: Reports delivery state `SMS_READY` alongside `actionStatus: USER_ACTION_REQUIRED` and `requiresUserAction: true`.
  - **Gateway Disclosure**: Enforces `SMS_DISCLOSURE`: *"SMS URI generation is not equivalent to automated SMS delivery. Handset user confirmation is required to send."*

---

## 3. File Modification & Creation Manifest

| File | Status | Description of Changes |
| :--- | :--- | :--- |
| [`citizen/js/core/heartbeat-service.js`](file:///d:/RakshaSetu/citizen/js/core/heartbeat-service.js) | **NEW** | Pre-Blackout Location Heartbeat engine with visibility listener, bounded IndexedDB coalescing, cached fallback, and disclosure. |
| [`citizen/js/core/low-data-ping.js`](file:///d:/RakshaSetu/citizen/js/core/low-data-ping.js) | **NEW** | Low-Data Ping generator, <140 char compact PDU formatter, RFC5724 SMS URI generator, and honest delivery state reporting. |
| [`citizen/js/family-safety.js`](file:///d:/RakshaSetu/citizen/js/family-safety.js) | **MODIFIED** | Refactored `FamilySafetyManager` to integrate with `locationService`, `offlineQueue` (IndexedDB), `connectivityService`, and `communicationFallback`. |
| [`citizen/js/emergency-sos.js`](file:///d:/RakshaSetu/citizen/js/emergency-sos.js) | **MODIFIED** | Delegated background and active emergency location telemetry loops to `heartbeatService`. |
| [`citizen/js/core/communication-fallback.js`](file:///d:/RakshaSetu/citizen/js/core/communication-fallback.js) | **MODIFIED** | Added `formatCompactPingPayload` helper for lightweight telemetry encoding. |
| [`citizen/js/core/sync-manager.js`](file:///d:/RakshaSetu/citizen/js/core/sync-manager.js) | **MODIFIED** | Added `syncPending` method alias, PostgreSQL 23505 conflict idempotency, and automated flush for `FAMILY_IM_SAFE` and `HEARTBEAT`. |
| [`citizen/js/core/index.js`](file:///d:/RakshaSetu/citizen/js/core/index.js) | **MODIFIED** | Unified barrel export updated with `heartbeatService`, `HeartbeatDeliveryState`, `HEARTBEAT_DISCLOSURE`, `lowDataPing`, `LowDataPingState`, `SMS_DISCLOSURE`. |
| [`citizen/js/api-client.js`](file:///d:/RakshaSetu/citizen/js/api-client.js) | **MODIFIED** | Added `signIn`/`signUp` compatibility wrappers, and unauthenticated/guest local server fallbacks for `/citizens/:id/heartbeat` and `/family/im-safe`. |
| [`citizen/sw.js`](file:///d:/RakshaSetu/citizen/sw.js) | **MODIFIED** | Incremented cache version to `rakshasetu-core-v3.2` and precached new core service files. |
| [`citizen/test_phase2_group_a.html`](file:///d:/RakshaSetu/citizen/test_phase2_group_a.html) | **NEW** | Automated test harness containing 25 comprehensive test cases covering Group A and zero regressions. |
| [`citizen/run_tests_phase2.py`](file:///d:/RakshaSetu/citizen/run_tests_phase2.py) | **NEW** | Headless Chrome automated test runner for Phase 2 Group A. |

---

## 4. Test Matrix & Verification Results

### Test Execution Summary
- **Total Test Cases**: 25
- **Passed**: 25 (100%)
- **Failed**: 0 (0%)
- **Test Runner**: Headless Google Chrome (`--headless=new`) via Python CDP runner (`citizen/run_tests_phase2.py`)
- **Server**: Local Python Server on Port 8080 (`citizen/server.py`)

### Section A: I'm Safe Broadcast (7 Tests)
| # | Test Case Description | Verified Behavior | Status |
| :---: | :--- | :--- | :---: |
| 1 | Online I'm Safe Broadcast | Direct backend/EOC dispatch with `deliveryState: SENT` and `smsFallback: false`. | **PASSED** |
| 2 | Offline I'm Safe Broadcast | Dispatches to `deliveryState: QUEUED_OFFLINE`, prepares RFC5724 `smsUri`, sets `smsFallback: true`. | **PASSED** |
| 3 | IndexedDB Persistence | Event is durably enqueued in `offline_queue` store with `status: PENDING` and `type: FAMILY_IM_SAFE`. | **PASSED** |
| 4 | Reload Persistence | Durably preserved across sessions with intact recipient contacts, coordinates, and message body. | **PASSED** |
| 5 | Reconnect Synchronization | Reconnecting to network triggers auto-flush transition from `PENDING` to `SYNCED`. | **PASSED** |
| 6 | Duplicate Prevention & Idempotency | Re-enqueuing with identical `clientEventId` yields single idempotent entry (zero duplicates). | **PASSED** |
| 7 | Honest Delivery Status Distinction | Explicit enum boundary: `SENT !== QUEUED_OFFLINE !== SMS_READY`. | **PASSED** |

### Section B: Pre-Blackout Location Heartbeat (6 Tests)
| # | Test Case Description | Verified Behavior | Status |
| :---: | :--- | :--- | :---: |
| 8 | Online Heartbeat Telemetry | Transmits live coordinates and network status to backend EOC with `deliveryState: ONLINE_SENT`. | **PASSED** |
| 9 | Offline Heartbeat Queue | Durably enqueues in IndexedDB `offline_queue` with `priority: LOW` and `type: HEARTBEAT`. | **PASSED** |
| 10 | Reconnect Synchronization | Offline queued heartbeats flush to `status: SYNCED` upon network restoration. | **PASSED** |
| 11 | Cached Location Fallback | Recovers last-known position from `LocationService` when live GPS is unavailable. | **PASSED** |
| 12 | Stale Location Handling | Correctly evaluates and tags telemetry older than 15 minutes as `is_stale: true`. | **PASSED** |
| 13 | Honest Heartbeat Claim | Enforces `HEARTBEAT_DISCLOSURE`: *"periodic location telemetry while the Citizen PWA is active/eligible to execute, with cached last-known recovery."* | **PASSED** |

### Section C: Low-Data Location Ping & SMS Fallback (5 Tests)
| # | Test Case Description | Verified Behavior | Status |
| :---: | :--- | :--- | :---: |
| 14 | Compact Payload Generation | Generated payload `[RS-PING] T:SOS L:25.37570,86.47350 A:12m S:GPS TS:09:41` is 56 chars (< 140 chars). | **PASSED** |
| 15 | Cross-Platform SMS URI | Conforms to RFC5724 (`sms:112?body=...`) with recipient phone and payload body. | **PASSED** |
| 16 | Proper URL Percent-Encoding | Replaces whitespace with `%20` and percent-encodes URI characters safely. | **PASSED** |
| 17 | Explicit User Action Required | Sets `actionStatus: USER_ACTION_REQUIRED` and `requiresUserAction: true`. | **PASSED** |
| 18 | No False SMS Delivered Claim | Enforces `SMS_DISCLOSURE`: *"SMS URI generation is not equivalent to automated SMS delivery. Handset user confirmation is required to send."* | **PASSED** |

### Section D: Zero-Regression Verification (7 Tests)
| # | Test Case Description | Verified Behavior | Status |
| :---: | :--- | :--- | :---: |
| 19 | Citizen Auth Integrity | Sign-in and sign-up method contracts intact on `apiClient` and `authService`. | **PASSED** |
| 20 | Citizen SOS Dispatch | `emergencySOS` dispatch pipeline and SMS generator functioning as expected. | **PASSED** |
| 21 | Authority Demo SOS | `locationService.getDemoLocation()` delivers stable mock coordinates (Munger, Bihar). | **PASSED** |
| 22 | Resource Requests Service | `apiClient.createResourceRequest` and `getResourceRequests` contracts operational. | **PASSED** |
| 23 | Shelter Routing & Map | `routeService.computeSafeRoute` yields elevated ridge path with distance heuristics. | **PASSED** |
| 24 | 23-Language i18n & RTL Layout | `t()` translation engine and RTL layout direction mapping fully preserved. | **PASSED** |
| 25 | Phase 1 Core Services Health | All 11 Phase 1 Core Services confirmed active, healthy, and operational. | **PASSED** |

---

## 5. Regression & Boot Verification

1. **Phase 1 Test Suite Regression Test**:
   - Command: `python run_tests.py`
   - Target: `http://localhost:8080/test_phase1_core.html`
   - Result: `{'total': 11, 'passedCount': 11, 'allPassed': True}` (100% pass)
2. **Citizen PWA Application Boot Verification**:
   - Command: `python verify_app_boot.py`
   - Target: `http://localhost:8080/index.html`
   - Result: HTTP 200 on all application assets, title confirmed as *"RakshaSetu: Citizen Disaster Response PWA"*, zero uncaught script exceptions.

---

## 6. Conclusion & Next Steps

Phase 2 — Group A (Communication & Connectivity) is complete, robust, and verified.
In accordance with instructions:
- Group B and Group C were **NOT** started.
- All modifications are strictly confined to the Citizen PWA core layer.
- Ready for user review and approval before proceeding to any subsequent phases.
