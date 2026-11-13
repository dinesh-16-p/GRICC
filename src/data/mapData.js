/**
 * GRICC Sample Map Monitoring Data (Phase 2)
 *
 * NOTE: All scores, incident classifications, and descriptions are simulated
 * DEMO DATA for dashboard visual testing and evaluation purposes only.
 */

export const RISK_LEVELS = {
  HIGH: 'High Risk',
  MEDIUM: 'Medium Risk',
  LOW: 'Low Risk',
};

export const sampleLocations = [
  {
    id: 'loc-in',
    country: 'India',
    city: 'New Delhi',
    region: 'South Asia',
    coordinates: [28.6139, 77.2090],
    riskScore: 48,
    riskClassification: RISK_LEVELS.MEDIUM,
    riskCategory: 'Geopolitical & Supply Chain',
    lastUpdated: '2026-11-02 18:45 UTC',
    description:
      'Regional border supply corridor monitoring and monsoon-driven infrastructure transit delays. [DEMO DATA]',
    status: 'ACTIVE_MONITORING',
  },
  {
    id: 'loc-uk',
    country: 'United Kingdom',
    city: 'London',
    region: 'Western Europe',
    coordinates: [51.5074, -0.1278],
    riskScore: 28,
    riskClassification: RISK_LEVELS.LOW,
    riskCategory: 'Cyber Threat & Critical Infrastructure',
    lastUpdated: '2026-11-02 19:10 UTC',
    description:
      'Elevated cyber threat posture reported across energy financial clearing systems. Operational continuity stable. [DEMO DATA]',
    status: 'ROUTINE_OBSERVATION',
  },
  {
    id: 'loc-jp',
    country: 'Japan',
    city: 'Tokyo',
    region: 'East Asia',
    coordinates: [35.6762, 139.6503],
    riskScore: 22,
    riskClassification: RISK_LEVELS.LOW,
    riskCategory: 'Maritime & Seismic Resilience',
    lastUpdated: '2026-11-02 19:30 UTC',
    description:
      'Pacific maritime lane surveillance and seismic activity baseline tracking. Ports operational without disruptions. [DEMO DATA]',
    status: 'ROUTINE_OBSERVATION',
  },
  {
    id: 'loc-ae',
    country: 'United Arab Emirates',
    city: 'Dubai',
    region: 'Middle East',
    coordinates: [25.2048, 55.2708],
    riskScore: 44,
    riskClassification: RISK_LEVELS.MEDIUM,
    riskCategory: 'Aviation & Energy Transit',
    lastUpdated: '2026-11-02 17:55 UTC',
    description:
      'Strait transit logistics monitoring. Regional flight routing adjustments in effect for select corridors. [DEMO DATA]',
    status: 'ACTIVE_MONITORING',
  },
  {
    id: 'loc-br',
    country: 'Brazil',
    city: 'Brasília',
    region: 'South America',
    coordinates: [-15.7975, -47.8919],
    riskScore: 58,
    riskClassification: RISK_LEVELS.MEDIUM,
    riskCategory: 'Resource Extraction & Logistics',
    lastUpdated: '2026-11-02 16:20 UTC',
    description:
      'Hydroelectric reservoir levels and freight rail transit disruptions impacting bulk commodity movements. [DEMO DATA]',
    status: 'ACTIVE_MONITORING',
  },
  {
    id: 'loc-sg',
    country: 'Singapore',
    city: 'Singapore',
    region: 'Southeast Asia',
    coordinates: [1.3521, 103.8198],
    riskScore: 19,
    riskClassification: RISK_LEVELS.LOW,
    riskCategory: 'Port Congestion & Cyber Defense',
    lastUpdated: '2026-11-02 20:05 UTC',
    description:
      'Malacca Strait vessel throughput operating at peak capacity. Critical maritime networks green. [DEMO DATA]',
    status: 'ROUTINE_OBSERVATION',
  },
  {
    id: 'loc-us',
    country: 'United States',
    city: 'Washington, D.C.',
    region: 'North America',
    coordinates: [38.9072, -77.0369],
    riskScore: 78,
    riskClassification: RISK_LEVELS.HIGH,
    riskCategory: 'Critical Infrastructure & Geo-Economics',
    lastUpdated: '2026-11-02 20:15 UTC',
    description:
      'High-priority advisory: Severe coastal storm surges and targeted industrial grid intrusion attempts detected. [DEMO DATA]',
    status: 'ALERT_ACTIVE',
  },
];

