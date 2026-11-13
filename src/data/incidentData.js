/**
 * GRICC Incident Management Data (Phase 4)
 *
 * NOTE: All incident records, entities, timestamps, and teams are simulated
 * DEMO DATA for dashboard visual testing and evaluation purposes only.
 */

export const INCIDENT_STATUS = {
  OPEN: 'Open',
  INVESTIGATING: 'Investigating',
  CONTAINED: 'Contained',
  RESOLVED: 'Resolved',
};

export const INCIDENT_SEVERITY = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const INCIDENT_CATEGORIES = [
  'Cyber Threat & IT Infrastructure',
  'Supply Chain & Freight Transit',
  'Energy Grid & Critical Utilities',
  'Maritime & Port Security',
  'Natural Hazard & Meteorology',
  'Geopolitical & Trade Dispute',
  'Industrial Operations & Safety',
];

export const RESPONSE_TEAMS = [
  'Cyber Incident Response Team (CIRT)',
  'Logistics Continuity Taskforce',
  'Critical Infrastructure Unit',
  'Maritime Security Operations',
  'Regional Operations Command Alpha',
  'Global Threat Mitigation Group',
];

export const sampleIncidents = [
  {
    id: 'INC-2026-0891',
    title: 'Eastern Power Grid Relay Firmware Tampering Attempt',
    country: 'United States',
    location: 'Richmond Substation Facility, VA',
    category: 'Cyber Threat & IT Infrastructure',
    severity: INCIDENT_SEVERITY.CRITICAL,
    status: INCIDENT_STATUS.INVESTIGATING,
    assignedTeam: 'Cyber Incident Response Team (CIRT)',
    dateReported: '2026-11-02 18:30 UTC',
    lastUpdated: '2026-11-02 20:10 UTC',
    description:
      'Telemetry flagged unauthorized payload push targeting digital relay units. Secondary network airgap initiated; forensics unit analyzing intrusion vector. [DEMO DATA]',
  },
  {
    id: 'INC-2026-0844',
    title: 'Santos Intermodal Container Terminal Rail Blockade',
    country: 'Brazil',
    location: 'Port of Santos, Berth 12 Rail Yard',
    category: 'Supply Chain & Freight Transit',
    severity: INCIDENT_SEVERITY.HIGH,
    status: INCIDENT_STATUS.OPEN,
    assignedTeam: 'Logistics Continuity Taskforce',
    dateReported: '2026-11-02 17:15 UTC',
    lastUpdated: '2026-11-02 19:40 UTC',
    description:
      'Locomotive mechanical derailment obstructing main egress corridor for bulk grain trains. Emergency crane crews deployed. [DEMO DATA]',
  },
  {
    id: 'INC-2026-0792',
    title: 'Wagah Border Automated Customs Clearing Gateway Timeout',
    country: 'India',
    location: 'Amritsar Trade Logistics Hub, Punjab',
    category: 'Supply Chain & Freight Transit',
    severity: INCIDENT_SEVERITY.MEDIUM,
    status: INCIDENT_STATUS.CONTAINED,
    assignedTeam: 'Regional Operations Command Alpha',
    dateReported: '2026-11-02 14:20 UTC',
    lastUpdated: '2026-11-02 18:05 UTC',
    description:
      'High-latency database deadlocks throttled commercial bill of entry verification. Manual clearance protocol bypass active. [DEMO DATA]',
  },
  {
    id: 'INC-2026-0683',
    title: 'Offshore Seismic Sensor Telemetry Packet Degradation',
    country: 'Japan',
    location: 'Nankai Trough Deep-Sea Node 4',
    category: 'Maritime & Port Security',
    severity: INCIDENT_SEVERITY.LOW,
    status: INCIDENT_STATUS.RESOLVED,
    assignedTeam: 'Maritime Security Operations',
    dateReported: '2026-11-01 22:10 UTC',
    lastUpdated: '2026-11-02 12:30 UTC',
    description:
      'Fiber-optic transceiver fault caused intermittent dropped telemetry packets. Auxiliary satellite buoy failover verified and primary line spliced. [DEMO DATA]',
  },
  {
    id: 'INC-2026-0621',
    title: 'South Gulf Commercial Air Route Navigational Ghost Beacon',
    country: 'United Arab Emirates',
    location: 'Jebel Ali Flight Sector Bravo',
    category: 'Geopolitical & Trade Dispute',
    severity: INCIDENT_SEVERITY.MEDIUM,
    status: INCIDENT_STATUS.INVESTIGATING,
    assignedTeam: 'Global Threat Mitigation Group',
    dateReported: '2026-11-02 11:45 UTC',
    lastUpdated: '2026-11-02 17:50 UTC',
    description:
      'Spurious GPS spoofing vectors detected across regional commercial airline approach corridors. Primary inertial navigation mandated. [DEMO DATA]',
  },
  {
    id: 'INC-2026-0518',
    title: 'Thames Estuary Critical Cooling Pump Sensor Trip',
    country: 'United Kingdom',
    location: 'Isle of Grain Energy Complex, Kent',
    category: 'Energy Grid & Critical Utilities',
    severity: INCIDENT_SEVERITY.HIGH,
    status: INCIDENT_STATUS.CONTAINED,
    assignedTeam: 'Critical Infrastructure Unit',
    dateReported: '2026-11-02 09:15 UTC',
    lastUpdated: '2026-11-02 16:25 UTC',
    description:
      'Cavitation sensor triggered precautionary shutdown on turbine water coolant intake. Secondary loop active without capacity curtailment. [DEMO DATA]',
  },
  {
    id: 'INC-2026-0410',
    title: 'Jurong Island Chemical Pipeline Pressure Micro-Drop',
    country: 'Singapore',
    location: 'Jurong Industrial Cluster, Sector 7',
    category: 'Industrial Operations & Safety',
    severity: INCIDENT_SEVERITY.LOW,
    status: INCIDENT_STATUS.RESOLVED,
    assignedTeam: 'Critical Infrastructure Unit',
    dateReported: '2026-11-01 16:00 UTC',
    lastUpdated: '2026-11-02 08:30 UTC',
    description:
      'Acoustic leak detection system flagged 0.4 bar differential. Automated valve shutoff verified zero hazardous vapor discharge. Valve packing replaced. [DEMO DATA]',
  },
];
