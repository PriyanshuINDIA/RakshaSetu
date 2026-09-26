# RakshaSetu — Automated Testing & Verification Infrastructure

**IMPORTANT NOTICE**:  
The files documented in this file are **DEVELOPMENT AND AUTOMATED TESTING ARTIFACTS ONLY**.  
They are **NOT** part of the production application runtime and **NEVER** act as an operational production backend.

In production:
- The Citizen PWA (`citizen/index.html`) communicates directly with **Supabase Cloud PostgreSQL & Auth**.
- The Authority EOC Dashboard (`authority/index.html`) communicates directly with **Supabase Cloud PostgreSQL & Auth**.
- Realtime telemetry is managed exclusively by **Supabase PostgreSQL Realtime** (`postgres_changes`).
- Offline resilience is handled entirely on-device via **IndexedDB** (`offline_queue`, `offlineStorage`) and SMS URIs (`rfc5724`).

---

## Inventory of Test Infrastructure Files

| File | Purpose | Environment |
| :--- | :--- | :--- |
| `citizen/test_server.py` | Lightweight local static asset server and test harness reporter (`/api/test-results`). Contains zero mock operational endpoints or disaster data fixtures. | Local Development & Headless CI/CD |
| `citizen/server.py` | Minimal 10-line backwards-compatibility shim forwarding directly to `test_server.py`. | Local Development |
| `citizen/run_tests.py` | Headless Chrome runner for Phase 1 Core Services regression suite. | Local CI/CD |
| `citizen/run_tests_phase2.py` | Headless Chrome runner for Phase 2 Group A (Communication & Connectivity) regression suite. | Local CI/CD |
| `citizen/run_tests_phase3.py` | Headless Chrome runner for Phase 3 Group B (Data Provenance & Disclosures) regression suite. | Local CI/CD |
| `citizen/run_tests_phase4.py` | Headless Chrome runner for Phase 4 Group C (Safety Assistant & Safe Route) regression suite. | Local CI/CD |
| `citizen/verify_app_boot.py` | Headless Chrome validator verifying Citizen PWA DOM mounting and title resolution. | Local CI/CD |
| `citizen/test_phase1_core.html` | Automated unit/integration test harness executing 11 core service specifications. | Test Browser |
| `citizen/test_phase2_group_a.html` | Automated integration test harness executing 25 communication & connectivity specifications. | Test Browser |
| `citizen/test_phase3_group_b.html` | Automated integration test harness executing 32 provenance & data disclosure specifications. | Test Browser |
| `citizen/test_phase4_group_c.html` | Automated integration test harness executing 44 assistant & safe route specifications. | Test Browser |
| `citizen/test_dom.html` | Ad-hoc DOM inspection test harness. | Development Debugging |
| `citizen/test_citizen_shelter.html` | Ad-hoc shelter filter and lifecycle inspection harness. | Development Debugging |

---

## Instructions for Running Tests

1. Start the test server:
   ```bash
   python citizen/test_server.py
   ```
2. In a separate terminal, execute any or all regression test suites:
   ```bash
   python citizen/verify_app_boot.py
   python citizen/run_tests.py
   python citizen/run_tests_phase2.py
   python citizen/run_tests_phase3.py
   python citizen/run_tests_phase4.py
   ```
3. Full suite target: **112 / 112 PASS (100%)**.
