/* ==========================================================================
   RakshaSetu Authority - Stretch & Roadmap Features (Sections 10 & 11)
   Clear architectural demarcation: Stretch vs Roadmap.
   Explicitly disclaiming unverified simulation.
   ========================================================================== */

export const STRETCH_FEATURES = [
  {
    id: "STRETCH-NNF",
    name: "Nearest-Need-First Prioritization",
    category: "Logistics Optimization",
    status: "Stretch",
    badgeLabel: "STRETCH: HEURISTIC",
    description: "Prioritization based on need, urgency, transit distance and road impassability factors.",
    operationalClarification: "Explainable dispatch heuristic based on human rules. Does NOT claim opaque AI-based optimization.",
    implementedIn: "Resource Coordination Screen (Tagged Stretch Algorithm)"
  },
  {
    id: "STRETCH-HIST-RISK",
    name: "Historical Risk Scoring",
    category: "Analytical Intelligence",
    status: "Stretch",
    badgeLabel: "STRETCH: ANALYTICAL",
    description: "Evaluates past landslide and flood frequencies across geological survey ward grids.",
    operationalClarification: "Visualized as a secondary historical risk report. Not used to override real-time citizen distress calls.",
    implementedIn: "Reports Panel (Historical Risk Section)"
  },
  {
    id: "STRETCH-CITIZEN-REBUILD",
    name: "Citizen Rebuild Feedback",
    category: "Post-Disaster Recovery",
    status: "Stretch",
    badgeLabel: "STRETCH: POST-CRISIS",
    description: "Crowdsourced infrastructure damage assessment (bridges, transformers, schools) submitted by citizens during the recovery phase.",
    operationalClarification: "Secondary operational feedback queue; disabled during live high-tide rescue operations.",
    implementedIn: "Reports & Recovery Tab"
  },
  {
    id: "STRETCH-LIVE-MAP-LAYER",
    name: "Experimental Live Tracking Layer",
    category: "Geospatial",
    status: "Stretch",
    badgeLabel: "STRETCH: EXPERIMENTAL",
    description: "Optional real-time trajectory extrapolation for active beacon handshakes.",
    operationalClarification: "Disabled by default to avoid confusion with verified GPS fixes. Operator toggle available with mandatory disclaimer.",
    implementedIn: "Map Layer Switcher"
  }
];

export const ROADMAP_FEATURES = [
  {
    id: "ROAD-01",
    name: "Real-Time Dam & Weather Alerts",
    status: "ROADMAP",
    badgeClass: "roadmap",
    shortExplanation: "Requires automated telemetry ingestion webhook directly from state irrigation and CWC SCADA river dams."
  },
  {
    id: "ROAD-02",
    name: "Dynamic Safe Zone Broadcast",
    status: "ROADMAP",
    badgeClass: "roadmap",
    shortExplanation: "Will allow district magistrates to publish geofenced safe evacuation polygon updates via cell-broadcast and PDU-SMS."
  },
  {
    id: "ROAD-03",
    name: "Bluetooth Opportunistic Relay",
    status: "ROADMAP",
    badgeClass: "roadmap",
    shortExplanation: "Future capability for opportunistic peer-to-peer communication through nearby compatible citizen devices during zero-cellular blackout."
  },
  {
    id: "ROAD-04",
    name: "Community Location Snapshot",
    status: "ROADMAP",
    badgeClass: "roadmap",
    shortExplanation: "Future batch cryptographic snapshot of all registered citizens in an isolated ward for rapid accounting without bandwidth drain."
  },
  {
    id: "ROAD-05",
    name: "Satellite Relay Integration",
    status: "ROADMAP",
    badgeClass: "roadmap",
    shortExplanation: "Requires government-installed satellite transceivers and GSAT/NavIC direct-to-handset emergency infrastructure."
  },
  {
    id: "ROAD-06",
    name: "112 Emergency Number Integration",
    status: "ROADMAP",
    badgeClass: "roadmap",
    shortExplanation: "Requires bilateral API binding with Emergency Response Support System (ERSS-112) state command dispatch."
  },
  {
    id: "ROAD-07",
    name: "Person-Finder Registry",
    status: "ROADMAP",
    badgeClass: "roadmap",
    shortExplanation: "Future privacy-controlled identity and missing person inquiry registry with strict verification to prevent fraud."
  },
  {
    id: "ROAD-08",
    name: "Misinformation Verification Filter",
    status: "ROADMAP",
    badgeClass: "roadmap",
    shortExplanation: "Automated linguistic hash check against verified district information officer bulletins to suppress panic hoaxes."
  }
];
