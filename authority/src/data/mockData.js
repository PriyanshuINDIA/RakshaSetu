/* ==========================================================================
   RakshaSetu Authority - Mock Emergency Operations Data
   Scenario: Munger / Ganga River Basin Monsoon Emergency Response
   Focus: Real-world operational realism, heartbeat precision, network states
   Strict Location Semantics:
   - LIVE LOCATION
   - LAST-KNOWN LOCATION (Never rename to LIVE)
   - STALE LOCATION
   - OFFLINE / CACHED
   ========================================================================== */

export const INITIAL_INCIDENTS = [
  {
    id: "RS-1042",
    priority: "CRITICAL",
    citizenName: "Priya Kumari",
    phone: "+91 98471 XXXXX",
    locationName: "Kashtaharani Ghat Sector",
    coordinates: [25.3770, 86.4720],
    locationType: "LAST-KNOWN LOCATION", // MUST NOT BE LABELED LIVE
    accuracyMeters: 18,
    receivedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    lastHeartbeatTime: new Date(Date.now() - 2 * 60 * 1000 - 14 * 1000).toISOString(),
    heartbeatAgeSec: 134,
    heartbeatStatus: "Recent", // Recent | Aging | Stale | Unavailable
    networkState: "SMS Fallback (2G)",
    networkDetails: "Data channel unavailable; telemetry received via compressed PDU SMS relay",
    medicalFlag: true,
    medicalDetails: "Elderly person (78y) requiring immediate oxygen support / mobility impaired",
    status: "Unassigned", // Unassigned | Assigned | Responding | Reached | Resolved
    assignedTeam: null,
    vehicleAssigned: null,
    etaMinutes: null,
    resourceNeeds: ["Medical Oxygen", "Inflatable Evacuation Raft"],
    message: "Flash flood surge rising fast, ground floor submerged to 5ft, 4 persons including grandmother cut off on rooftop slab.",
    timeline: [
      { step: "Signal Received", time: "08:42:01", note: "PDU SMS heartbeat packet ingested via Telecom gateway" },
      { step: "Triage Prioritization", time: "08:42:05", note: "Flagged CRITICAL: Medical emergency + water surge zone" }
    ],
    notes: ["Sector transformer reported blown. Heavy current in Ganga downstream."]
  },
  {
    id: "RS-1039",
    priority: "CRITICAL",
    citizenName: "Rajesh Kumar",
    phone: "+91 94462 XXXXX",
    locationName: "Kashim Bazar Road Reach",
    coordinates: [25.3710, 86.4810],
    locationType: "LIVE LOCATION",
    accuracyMeters: 12,
    receivedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    lastHeartbeatTime: new Date(Date.now() - 48 * 1000).toISOString(),
    heartbeatAgeSec: 48,
    heartbeatStatus: "Recent",
    networkState: "Cellular 4G (Degraded)",
    networkDetails: "Connected via BSNL B8 tower (RSRP -108 dBm)",
    medicalFlag: true,
    medicalDetails: "Citizen sustained leg fracture during debris flow",
    status: "Responding",
    assignedTeam: "SDRF Unit 2 (Bravo)",
    vehicleAssigned: "All-Terrain Rescue Vehicle #04",
    etaMinutes: 12,
    resourceNeeds: ["Trauma Splint Kit", "Stretcher"],
    message: "Mudslide breached rear compound wall. 3 family members trapped inside utility shed.",
    timeline: [
      { step: "Signal Received", time: "08:30:15", note: "App SOS trigger with GPS lock" },
      { step: "Team Assigned", time: "08:33:00", note: "Dispatched SDRF Unit 2 (Bravo)" },
      { step: "Responding", time: "08:35:40", note: "Unit en route via Munger bypass" }
    ],
    notes: ["Team Bravo reports road sludge at km 4; chainsaw clearance ongoing."]
  },
  {
    id: "RS-1035",
    priority: "HIGH",
    citizenName: "Ananya Sen",
    phone: "+91 97455 XXXXX",
    locationName: "Fort Compound School Ridge",
    coordinates: [25.3810, 86.4670],
    locationType: "LAST-KNOWN LOCATION",
    accuracyMeters: 35,
    receivedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    lastHeartbeatTime: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    heartbeatAgeSec: 480,
    heartbeatStatus: "Aging",
    networkState: "SMS Fallback (2G)",
    networkDetails: "Cellular packet dropped; last location via pre-blackout heartbeat cache",
    medicalFlag: false,
    medicalDetails: "None reported; cold exposure and panic",
    status: "Assigned",
    assignedTeam: "NDRF Battalion 9",
    vehicleAssigned: "Heavy Rescue Tender #09",
    etaMinutes: 25,
    resourceNeeds: ["Dry Food Rations", "Drinking Water"],
    message: "Water entering school compound ground. 18 locals gathered on first floor auditorium.",
    timeline: [
      { step: "Signal Received", time: "08:18:22", note: "SOS beacon registered" },
      { step: "Team Assigned", time: "08:24:10", note: "NDRF Team 9 allocated" }
    ],
    notes: ["Building is structurally sound reinforced concrete."]
  },
  {
    id: "RS-1028",
    priority: "HIGH",
    citizenName: "K. Murugan",
    phone: "+91 98950 XXXXX",
    locationName: "Purabsarai Ward West Hamlet",
    coordinates: [25.3680, 86.4890],
    locationType: "STALE LOCATION",
    accuracyMeters: 55,
    receivedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    lastHeartbeatTime: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    heartbeatAgeSec: 1680,
    heartbeatStatus: "Stale",
    networkState: "Offline / Cached",
    networkDetails: "No telemetry contact for >25 mins. Displaying cached beacon fix.",
    medicalFlag: false,
    medicalDetails: "None indicated",
    status: "Unassigned",
    assignedTeam: null,
    vehicleAssigned: null,
    etaMinutes: null,
    resourceNeeds: ["Drinking Water", "Tarpaulin"],
    message: "Power lines down across pathway. Drainage overflowing into 6 row houses.",
    timeline: [
      { step: "Signal Received", time: "07:58:00", note: "Last known cached sync from relay gateway" }
    ],
    notes: ["Awaiting local revenue ward member status update."]
  },
  {
    id: "RS-1022",
    priority: "MODERATE",
    citizenName: "Deepa Devi",
    phone: "+91 94970 XXXXX",
    locationName: "Jamalpur Road Junction Reach",
    coordinates: [25.3520, 86.4850],
    locationType: "LIVE LOCATION",
    accuracyMeters: 20,
    receivedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    lastHeartbeatTime: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    heartbeatAgeSec: 180,
    heartbeatStatus: "Recent",
    networkState: "Cellular 4G (Degraded)",
    networkDetails: "Connected with intermittent handshakes",
    medicalFlag: false,
    medicalDetails: "None",
    status: "Unassigned",
    assignedTeam: null,
    vehicleAssigned: null,
    etaMinutes: null,
    resourceNeeds: ["Baby Food Formula", "Batteries"],
    message: "Isolated by ditch washaway. Safe inside bungalow but running low on infant supplies.",
    timeline: [
      { step: "Signal Received", time: "07:44:12", note: "Moderate priority registered" }
    ],
    notes: ["Vehicle access cut off; foot track across railway ridge navigable."]
  },
  {
    id: "RS-1015",
    priority: "MODERATE",
    citizenName: "Suresh Prasad",
    phone: "+91 94002 XXXXX",
    locationName: "Mirzapur Bardah North Reach",
    coordinates: [25.3850, 86.4750],
    locationType: "LAST-KNOWN LOCATION",
    accuracyMeters: 40,
    receivedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    lastHeartbeatTime: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
    heartbeatAgeSec: 3000,
    heartbeatStatus: "Stale",
    networkState: "SMS Fallback (2G)",
    networkDetails: "Resolved on-site by Fire & Rescue team",
    medicalFlag: false,
    medicalDetails: "Evacuated to designated shelter",
    status: "Resolved",
    assignedTeam: "Bihar Fire & Rescue Squad 2",
    vehicleAssigned: "Emergency Rescue Tender #02",
    etaMinutes: 0,
    resourceNeeds: ["Shelter Transport"],
    message: "Tree fallen across exit gate. 2 cars blocked.",
    timeline: [
      { step: "Signal Received", time: "06:50:00", note: "Incident created" },
      { step: "Team Assigned", time: "07:05:00", note: "Bihar Fire & Rescue dispatched" },
      { step: "Responding", time: "07:15:00", note: "In transit" },
      { step: "Reached", time: "07:42:00", note: "Tree cleared with power saws" },
      { step: "Resolved", time: "08:15:00", note: "Family safely relocated to GEC Munger Camp" }
    ],
    notes: ["Incident closed successfully."]
  }
];

export const INITIAL_RESOURCE_REQUESTS = [
  {
    id: "RR-208",
    category: "Water",
    need: "Emergency Drinking Water (200L) & ORS Sachets",
    location: "Kashtaharani Relief Point",
    coordinates: [25.3765, 86.4730],
    priority: "High",
    requestedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    status: "Pending", // New | Prioritized | Assigned | In Progress | Fulfilled | Closed
    assignedTeam: null,
    urgencyContext: "Local borewell flooded with silt; 60 evacuees have zero potable water.",
    notes: "Stretch Nearest-Need-First calculation recommends routing from Munger Sadar depot.",
    stretchPrioritizationRationale: "Calculated distance: 2.1 km. Urgency: Severe dehydration risk."
  },
  {
    id: "RR-205",
    category: "Medical",
    need: "Insulin Cold-Pack & Chronic Cardiac Medication",
    location: "Kashim Bazar Outpost",
    coordinates: [25.3715, 86.4805],
    priority: "High",
    requestedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    status: "Assigned",
    assignedTeam: "Civil Defense Medical Wing",
    urgencyContext: "Elderly cardiac patient with lost medicine bag in flood rush.",
    notes: "Dispatched with thermal carrier box.",
    stretchPrioritizationRationale: "High urgency medical prescription need."
  },
  {
    id: "RR-201",
    category: "Food",
    need: "Dry Rations (Rice, Dal, Biscuits) for 80 persons",
    location: "Purabsarai Community Hall",
    coordinates: [25.3675, 86.4880],
    priority: "Moderate",
    requestedAt: new Date(Date.now() - 80 * 60 * 1000).toISOString(),
    status: "Fulfilled",
    assignedTeam: "District Food Supply Dept",
    urgencyContext: "Transit halt for evacuated families awaiting bus transfer.",
    notes: "Delivered via District Civil Supplies van #BR-08-4122.",
    stretchPrioritizationRationale: "Bulk volume requirement fulfilled from primary district granary."
  },
  {
    id: "RR-198",
    category: "Shelter",
    need: "Heavy Waterproof Tarpaulins (40 units) & Sleeping Mats",
    location: "Jamalpur Relief Shelter",
    coordinates: [25.3530, 86.4840],
    priority: "Moderate",
    requestedAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
    status: "In Progress",
    assignedTeam: "Volunteer Logistics Unit 3",
    urgencyContext: "Roof seepage in auxiliary dormitory hall.",
    notes: "Vehicle dispatched from Munger Sadar store.",
    stretchPrioritizationRationale: "Protects dry sleeping zone for 140 occupants."
  }
];

export const INITIAL_SHELTERS = [
  {
    id: "SH-01",
    name: "Government Engineering College, Munger (Demo Shelter)",
    location: "Munger, Bihar (Prototype Facility)",
    coordinates: [25.3757, 86.4735],
    totalCapacity: 500,
    currentOccupancy: 0,
    status: "ACTIVE",
    services: ["Community Kitchen", "Medical First Aid Post", "Diesel Generator Backup", "Separate Sanitation"],
    medicalStaff: "2 Medical Officers, 4 Staff Nurses",
    generatorStatus: "Operational (48h Fuel remaining)",
    lastUpdated: "5 min ago",
    contactPerson: "Camp Coordinator / Control Desk (+91 94312 XXXXX)"
  },
  {
    id: "SH-02",
    name: "Munger Town Hall Relief Centre",
    location: "Munger Fort Area",
    coordinates: [25.3800, 86.4680],
    totalCapacity: 600,
    currentOccupancy: 412,
    status: "Active - Normal",
    services: ["Hot Meals", "Full Medical Dispensary", "Clean Water RO Plant", "Child Friendly Safe Space"],
    medicalStaff: "District Health Mission Team",
    generatorStatus: "Grid power stable + 60kVA backup",
    lastUpdated: "12 min ago",
    contactPerson: "Joint BDO Munger (+91 94314 22334)"
  },
  {
    id: "SH-03",
    name: "Jamalpur Railway Community Hall",
    location: "Jamalpur Station Road",
    coordinates: [25.3520, 86.4860],
    totalCapacity: 120,
    currentOccupancy: 120,
    status: "FULL - Evacuation Transfer in Progress",
    services: ["Temporary Shelter", "Emergency Biscuits & Water"],
    medicalStaff: "1 Paramedic",
    generatorStatus: "Battery Inverter Only",
    lastUpdated: "2 min ago",
    contactPerson: "Ward Member (+91 94315 33445)"
  },
  {
    id: "SH-04",
    name: "Purabsarai High School Camp",
    location: "Purabsarai Main Road",
    coordinates: [25.3685, 86.4895],
    totalCapacity: 220,
    currentOccupancy: 148,
    status: "Active - Accepting Evacuees",
    services: ["Dry Shelter", "Food Distribution", "Community Sanitation"],
    medicalStaff: "Mobile Medical Unit visiting at 10:00",
    generatorStatus: "Portable 5kVA Genset",
    lastUpdated: "8 min ago",
    contactPerson: "School Principal (+91 94316 44556)"
  }
];

export const HAZARD_AREAS = [
  {
    id: "HAZ-01",
    name: "Ganga Ghat Road Approach",
    type: "Unsafe Road / Structural Washout",
    coordinates: [25.3790, 86.4710],
    status: "IMPASSABLE FOR VEHICLES",
    description: "Water flowing 1.8 meters above riverbank approach. Silt and debris accumulated.",
    reportedBy: "Bihar PWD & Police Highway Patrol",
    reportedAt: "07:30 IST"
  },
  {
    id: "HAZ-02",
    name: "Jamalpur Hills Slope Section km 4.2",
    type: "Mudslide & Rockfall Hazard",
    coordinates: [25.3480, 86.4910],
    status: "RESTRICTED - RESCUE CONVOYS ONLY",
    description: "Active soil wash observed on uphill slope. Continuous rain causing sludge runoff.",
    reportedBy: "Forest Dept Rapid Response",
    reportedAt: "08:15 IST"
  }
];

// Rescue teams are strictly loaded from Supabase public.rescue_teams (never mock data).
export const RESCUE_TEAMS = [];

