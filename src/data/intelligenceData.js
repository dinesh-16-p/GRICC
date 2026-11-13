/**
 * GRICC Sample Intelligence Feed Data (Phase 3)
 *
 * NOTE: All events, threat classifications, entities, and summaries are simulated
 * DEMO DATA for dashboard visual testing and evaluation purposes only.
 */

export const ALERT_SEVERITY = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const sampleAlerts = [
  {
    id: 'ALT-8091',
    title: 'Industrial Grid Supervisory System Intrusion Detection',
    country: 'United States',
    region: 'North America',
    category: 'Cyber Infrastructure',
    severity: ALERT_SEVERITY.CRITICAL,
    timestamp: '2026-11-02 20:15 UTC',
    summary:
      'Uncorrelated lateral traversal telemetry flagged across eastern grid relay controllers. Defense isolation protocols active. [DEMO DATA]',
    source: 'DEMO SOURCE: Cyber Command Threat Sensor Matrix',
    status: 'active', // 'active' | 'acknowledged' | 'resolved'
  },
  {
    id: 'ALT-7742',
    title: 'Severe Coastal Surge Impacting Freight Rail Transit',
    country: 'United States',
    region: 'North America',
    category: 'Natural Hazards & Logistics',
    severity: ALERT_SEVERITY.HIGH,
    timestamp: '2026-11-02 19:50 UTC',
    summary:
      'Tidal surge inundation along Mid-Atlantic intermodal rail corridors. Primary bulk container departures deferred 24 hours. [DEMO DATA]',
    source: 'DEMO SOURCE: Hydro-Meteorological Sat-Array',
    status: 'active',
  },
  {
    id: 'ALT-6920',
    title: 'Freight Rail Transit Bottleneck Along Agricultural Corridor',
    country: 'Brazil',
    region: 'South America',
    category: 'Supply Chain & Logistics',
    severity: ALERT_SEVERITY.HIGH,
    timestamp: '2026-11-02 19:15 UTC',
    summary:
      'Rolling stock locomotive maintenance delays across Cerrado-Santos rail link causing export grain terminal backlog. [DEMO DATA]',
    source: 'DEMO SOURCE: Agro-Logistics Intermodal Tracker',
    status: 'active',
  },
  {
    id: 'ALT-5412',
    title: 'Cross-Border Supply Corridor Customs Processing Delay',
    country: 'India',
    region: 'South Asia',
    category: 'Trade & Supply Chain',
    severity: ALERT_SEVERITY.MEDIUM,
    timestamp: '2026-11-02 18:45 UTC',
    summary:
      'Intermittent clearing gateway latency across northwestern border trade terminal. Rerouting commercial cargo via alternate hubs. [DEMO DATA]',
    source: 'DEMO SOURCE: Regional Customs Automated Registry',
    status: 'acknowledged',
  },
  {
    id: 'ALT-4831',
    title: 'Strait Transit Routing Advisory for Commercial Air Transport',
    country: 'United Arab Emirates',
    region: 'Middle East',
    category: 'Aviation & Geopolitical',
    severity: ALERT_SEVERITY.MEDIUM,
    timestamp: '2026-11-02 17:55 UTC',
    summary:
      'Civil aviation authorities issued temporary flight level revisions along southern gulf corridors following naval exercises. [DEMO DATA]',
    source: 'DEMO SOURCE: Middle East Air Navigation Bulletin',
    status: 'active',
  },
  {
    id: 'ALT-3210',
    title: 'Financial Clearing Network Anomaly Detected and Quarantined',
    country: 'United Kingdom',
    region: 'Western Europe',
    category: 'Financial Infrastructure',
    severity: ALERT_SEVERITY.LOW,
    timestamp: '2026-11-02 17:20 UTC',
    summary:
      'Synthetic probe packet bursts targeting interbank transaction gateways successfully neutralized by automated perimeter firewalls. [DEMO DATA]',
    source: 'DEMO SOURCE: Fin-CERT Early Warning Net',
    status: 'resolved',
  },
  {
    id: 'ALT-2104',
    title: 'Seismic Buoy Pressure Micro-Oscillations Monitored',
    country: 'Japan',
    region: 'East Asia',
    category: 'Maritime & Seismic',
    severity: ALERT_SEVERITY.LOW,
    timestamp: '2026-11-02 16:40 UTC',
    summary:
      'Offshore deep-sea sensor grid registered standard subduction tremors. All port breakwaters and maritime corridors remain fully operational. [DEMO DATA]',
    source: 'DEMO SOURCE: Pacific Ocean Tsunami Early Net',
    status: 'active',
  },
  {
    id: 'ALT-1088',
    title: 'Maritime Traffic Density Surge in Malacca Strait Lane Alpha',
    country: 'Singapore',
    region: 'Southeast Asia',
    category: 'Maritime Operations',
    severity: ALERT_SEVERITY.LOW,
    timestamp: '2026-11-02 15:30 UTC',
    summary:
      'Pre-scheduled dredging operations created temporary 12% slow-down in outbound container lanes. Traffic control safely managing spacing. [DEMO DATA]',
    source: 'DEMO SOURCE: Singapore MPA Vessel Telemetry',
    status: 'acknowledged',
  },
];
