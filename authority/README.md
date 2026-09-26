# RakshaSetu Authority - Emergency Operations Center (EOC)

**RakshaSetu Authority** is the dedicated rescue and coordination command interface of the RakshaSetu last-mile emergency communication architecture.

> [!IMPORTANT]
> **Not a Generic Admin Dashboard**: RakshaSetu Authority is an emergency operations console built for crisis conditions (cyclones, landslides, flash floods). It strictly prioritizes signal freshness, location reliability, triage speed, explainable heuristics, and resilient local-offline capabilities.

---

## Core Capabilities & Architecture

### 1. Distinct Geospatial Signal Classification
The dashboard enforces strict visual and operational distinctions across location data states:
- **LIVE LOCATION**: Verified recent GPS fix with active handshakes and continuous signal telemetry (green marker with radar beacon).
- **LAST-KNOWN LOCATION**: Not guaranteed to represent current citizen position; displays pre-blackout heartbeat timestamp, age (e.g. `2m 14s ago`), and horizontal accuracy confidence radius (e.g. `±18m`).
- **STALE LOCATION**: Handsets with aged or unverified beacons (`>15 mins`); demarcated with high-visibility warnings to prevent rescue units entering outdated hazard zones.
- **OFFLINE / CACHED LOCATION**: Local operational cache maintaining access to last telemetry pings even if central cloud infrastructure fails.

### 2. Complete Response Workflow
Every incident advances through an accountable, auditable lifecycle:
$$\text{Unassigned} \longrightarrow \text{Assigned} \longrightarrow \text{Responding} \longrightarrow \text{Reached} \longrightarrow \text{Resolved}$$

- **Unassigned**: Triage severity evaluated; incoming alerts flagged with medical urgency and network fallback indicators.
- **Assigned**: Operator dispatches specialized units (e.g. *SDRF Swift-Water Alpha*, *NDRF Heavy Battalion*, or *Fire & Rescue Squad*) with specific vehicles, equipment, and estimated response ETA.
- **Responding**: Rescue convoy en route; telemetry and field notes logged.
- **Reached**: First responders make on-scene victim contact.
- **Resolved**: Evacuation confirmed to relief shelter; incident closed and archived.

### 3. Explainable Resource Logistics
- Resource categories: **Water**, **Food**, **Medical**, **Shelter**.
- **Stretch Capability: Nearest-Need-First Prioritization**: Explainable dispatch calculation based on human rules (distance, flood barrier impassability, and urgency). **No unverified AI-based automated optimization claims.**

### 4. Government Data Grounding
- **IMD**: Real-time rainfall intensity and synoptic cyclone bulletins.
- **CWC / India-WRIS**: River gauge flood stage and reservoir discharge telemetry.
- **NDMA**: Standard Operating Procedures for debris flow and riparian evacuations.
- **ISRO Bhuvan**: Direct external launcher to satellite flood inundation maps (*RakshaSetu does not simulate a fake satellite operations system*).

### 5. Official Roadmap Integrations
Features requiring official state or telecom infrastructure are cataloged in a dedicated panel with clear disclaimers:
- Real-Time Dam & Weather Alerts
- Dynamic Safe Zone Broadcast
- Bluetooth Opportunistic Relay
- Community Location Snapshot
- Satellite Relay Integration (GSAT / NavIC direct-to-handset)
- 112 Emergency Number Integration (ERSS-112)
- Person-Finder Registry
- Misinformation Verification

### 6. Authority Authentication Disclosure
- Current mode: **Demo Authority Credential** (operational sandbox).
- Official national rollout requires authenticated **DigiLocker / Aadhaar XML & District Magistrate** authorization (tagged Roadmap).

---

## Running Locally

1. Start a local HTTP server in the project directory:
   ```bash
   python -m http.server 8080
   ```
2. Open your browser to:
   ```
   http://localhost:8080
   ```

---

## Interactive Demonstration Flow
Use the floating **Demo Flow Bar** in the top header or click the steps sequentially:
1. **Simulate Citizen SOS**: Generates incoming Critical distress signal.
2. **View Critical Alert**: Notice dual-encoded red indicators across KPI, map, and queue.
3. **Inspect Position**: Observe `LAST-KNOWN LOCATION` badge, GPS accuracy circle, and disclaimer.
4. **Examine Telemetry**: Check heartbeat status (`Recent`), elapsed time, and `SMS Fallback` network mode.
5. **Open Operations Drawer**: Slide-over drawer reveals citizen message and medical emergency notes.
6. **Assign Rescue Team**: Modal dialog assigns *SDRF Unit 1 (Alpha)* with inflatable boat and 15-minute ETA.
7. **Transition Response**: Click *Mark Responding* $\rightarrow$ *Mark Reached* $\rightarrow$ *Mark Resolved*.
8. **Coordinate Supplies**: Switch to *Resource Needs* and process *Water & ORS* request.
9. **Simulate Connection Loss**: Toggle backend status in Settings to verify resilient local caching.
