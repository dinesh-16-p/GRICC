import db from '../db/database.js';

// Reference coordinates for monitored countries when incidents lack explicit coordinates
const COUNTRY_COORDINATES = {
  India: { lat: 20.5937, lng: 78.9629, region: 'South Asia' },
  'United Kingdom': { lat: 51.5074, lng: -0.1278, region: 'Western Europe' },
  Japan: { lat: 36.2048, lng: 138.2529, region: 'East Asia' },
  'United Arab Emirates': { lat: 23.4241, lng: 53.8478, region: 'Middle East' },
  Brazil: { lat: -14.235, lng: -51.9253, region: 'South America' },
  Singapore: { lat: 1.3521, lng: 103.8198, region: 'Southeast Asia' },
  'United States': { lat: 37.0902, lng: -95.7129, region: 'North America' },
};

const INCIDENT_SEVERITY_WEIGHT = {
  Critical: 18,
  High: 12,
  Medium: 6,
  Low: 3,
};

const ALERT_SEVERITY_WEIGHT = {
  Critical: 12,
  High: 8,
  Medium: 4,
  Low: 2,
};

export function classifyRiskScore(score) {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Medium';
  return 'Low';
}

function mapIncident(row) {
  return {
    id: row.id,
    title: row.title,
    country: row.country,
    location: row.location,
    category: row.category,
    severity: row.severity,
    status: row.status,
    assignedTeam: row.assigned_team,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    dateReported: row.date_reported,
    lastUpdated: row.last_updated,
  };
}

function mapAlert(row) {
  return {
    id: row.id,
    title: row.title,
    country: row.country,
    region: row.region,
    category: row.category,
    severity: row.severity,
    timestamp: row.timestamp,
    summary: row.summary,
    source: row.source,
    url: row.url,
    status: row.status,
    isLive: Boolean(row.is_live),
    updatedAt: row.updated_at,
  };
}

function computeCountryScore(country, incidents, alerts, snapshots = []) {
  const activeIncidents = incidents.filter((i) => i.status !== 'Resolved');
  const activeAlerts = alerts.filter((a) => a.status !== 'resolved');
  const criticalAlerts = activeAlerts.filter((a) => a.severity === 'Critical');

  // 1. Active Incident Load (0 - 40 pts)
  const rawIncidentPts = activeIncidents.reduce(
    (sum, inc) => sum + (INCIDENT_SEVERITY_WEIGHT[inc.severity] || 3),
    0
  );
  const activeIncidentPts = Math.min(40, rawIncidentPts);

  // 2. Threat Category Diversity (0 - 15 pts)
  const distinctActiveCategories = new Set(activeIncidents.map((i) => i.category).filter(Boolean));
  const categoryPts = Math.min(15, distinctActiveCategories.size * 5);

  // 3. Active Intelligence Alerts (0 - 30 pts)
  const rawAlertPts = activeAlerts.reduce(
    (sum, alt) => sum + (ALERT_SEVERITY_WEIGHT[alt.severity] || 2),
    0
  );
  const alertPts = Math.min(30, rawAlertPts);

  // 4. Historical Incident Volume Factor (0 - 15 pts)
  const historyPts = Math.min(15, incidents.length * 3);

  const score = Math.min(100, activeIncidentPts + categoryPts + alertPts + historyPts);
  const classification = classifyRiskScore(score);

  // Historical comparison against most recent stored snapshot
  const latestSnapshot = snapshots[0] || null;
  const previousSnapshot =
    snapshots.length > 1 ? snapshots[1] : latestSnapshot && latestSnapshot.score !== score ? latestSnapshot : null;
  const scoreDelta = previousSnapshot ? score - previousSnapshot.score : 0;
  const trendDirection =
    scoreDelta > 0 ? 'RISING' : scoreDelta < 0 ? 'IMPROVING' : 'STABLE';

  // Severity distribution across all incidents in country
  const severityDistribution = ['Critical', 'High', 'Medium', 'Low'].map((sev) => ({
    severity: sev,
    count: incidents.filter((i) => i.severity === sev).length,
    activeCount: activeIncidents.filter((i) => i.severity === sev).length,
  }));

  // Threat category breakdown
  const categoryMap = new Map();
  for (const inc of incidents) {
    categoryMap.set(inc.category, (categoryMap.get(inc.category) || 0) + 1);
  }
  const threatCategories = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Historical monthly trend from actual incident timestamps
  const monthMap = new Map();
  for (const inc of incidents) {
    const rawDate = inc.dateReported || inc.lastUpdated || '';
    const monthKey = /^\d{4}-\d{2}/.test(rawDate) ? rawDate.slice(0, 7) : '2026-11';
    const entry = monthMap.get(monthKey) || { month: monthKey, total: 0, critical: 0, resolved: 0 };
    entry.total += 1;
    if (inc.severity === 'Critical') entry.critical += 1;
    if (inc.status === 'Resolved') entry.resolved += 1;
    monthMap.set(monthKey, entry);
  }
  const historicalTrends = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // Distinguish verified external intelligence vs internal demo/calculated telemetry
  const verifiedExternalAlerts = activeAlerts.filter((a) => a.isLive);
  const internalAlerts = activeAlerts.filter((a) => !a.isLive);

  const lastIncidentUpdate = incidents[0]?.lastUpdated || null;
  const lastAlertUpdate = alerts[0]?.updatedAt || alerts[0]?.timestamp || null;
  const geo = COUNTRY_COORDINATES[country] || null;
  const coordIncident = incidents.find(
    (i) => typeof i.latitude === 'number' && typeof i.longitude === 'number'
  );

  return {
    country,
    region: alerts[0]?.region || geo?.region || 'Global Theatre',
    coordinates: coordIncident
      ? [coordIncident.latitude, coordIncident.longitude]
      : geo
        ? [geo.lat, geo.lng]
        : null,
    riskScore: score,
    classification,
    previousScore: previousSnapshot ? previousSnapshot.score : score,
    scoreDelta,
    trendDirection,
    lastCalculated: new Date().toISOString(),
    lastIntelligenceUpdate: lastIncidentUpdate || lastAlertUpdate || new Date().toISOString(),
    counts: {
      totalIncidents: incidents.length,
      activeIncidents: activeIncidents.length,
      resolvedIncidents: incidents.length - activeIncidents.length,
      totalAlerts: alerts.length,
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      verifiedExternalAlerts: verifiedExternalAlerts.length,
      internalAlerts: internalAlerts.length,
    },
    scoreExplanation: {
      methodology:
        'Deterministic 0-100 score = Active Incident Load (max 40) + Threat Category Diversity (max 15) + Active Alert Load (max 30) + Historical Incident Volume (max 15).',
      components: [
        {
          label: 'Active Incident Load',
          points: activeIncidentPts,
          maxPoints: 40,
          detail: `${activeIncidents.length} active incident(s) weighted by severity`,
        },
        {
          label: 'Category Diversity',
          points: categoryPts,
          maxPoints: 15,
          detail: `${distinctActiveCategories.size} distinct active threat categor(y/ies)`,
        },
        {
          label: 'Active Intelligence Alerts',
          points: alertPts,
          maxPoints: 30,
          detail: `${activeAlerts.length} unmitigated alert(s) (${verifiedExternalAlerts.length} live external, ${internalAlerts.length} internal)`,
        },
        {
          label: 'Historical Incident Volume',
          points: historyPts,
          maxPoints: 15,
          detail: `${incidents.length} total recorded incident(s) in SQLite`,
        },
      ],
    },
    dataSources: {
      calculatedIndicatorSource: 'GRICC SQLite Incident & Alert Register (Internal Calculation)',
      verifiedExternalFeedsCount: verifiedExternalAlerts.length,
      verifiedExternalSources: Array.from(new Set(verifiedExternalAlerts.map((a) => a.source))),
    },
    severityDistribution,
    threatCategories,
    historicalTrends,
    snapshotHistory: snapshots.slice(0, 12),
    activeIncidentsList: activeIncidents,
    allIncidents: incidents,
    criticalAlertsList: criticalAlerts,
    allAlerts: alerts,
  };
}

export const countryRiskService = {
  getAllCountryProfiles({ search = '', classification = 'ALL' } = {}) {
    const incidentRows = db.prepare('SELECT * FROM incidents ORDER BY last_updated DESC').all();
    const alertRows = db.prepare('SELECT * FROM alerts ORDER BY updated_at DESC').all();
    const watchRows = db.prepare('SELECT country FROM watchlists').all();

    const countrySet = new Set(Object.keys(COUNTRY_COORDINATES));
    incidentRows.forEach((r) => r.country && countrySet.add(r.country));
    alertRows.forEach((r) => r.country && r.country !== 'Global' && r.country !== 'Global Theatre' && countrySet.add(r.country));
    watchRows.forEach((r) => r.country && countrySet.add(r.country));

    const profiles = [];
    for (const country of Array.from(countrySet).sort()) {
      const inc = incidentRows.filter((r) => r.country?.toLowerCase() === country.toLowerCase()).map(mapIncident);
      const alt = alertRows.filter((r) => r.country?.toLowerCase() === country.toLowerCase()).map(mapAlert);
      const snaps = db
        .prepare(
          'SELECT id, score, classification, active_incidents, critical_alerts, calculated_at FROM country_risk_snapshots WHERE LOWER(country) = LOWER(?) ORDER BY id DESC LIMIT 12'
        )
        .all(country);

      profiles.push(computeCountryScore(country, inc, alt, snaps));
    }

    const q = search.trim().toLowerCase();
    return profiles
      .filter((p) => {
        const matchSearch =
          !q ||
          p.country.toLowerCase().includes(q) ||
          p.region.toLowerCase().includes(q);
        const matchClass = classification === 'ALL' || p.classification === classification;
        return matchSearch && matchClass;
      })
      .sort((a, b) => b.riskScore - a.riskScore);
  },

  getCountryProfile(country) {
    const cleanCountry = country.trim();
    const incRows = db
      .prepare('SELECT * FROM incidents WHERE LOWER(country) = LOWER(?) ORDER BY last_updated DESC')
      .all(cleanCountry);
    const altRows = db
      .prepare('SELECT * FROM alerts WHERE LOWER(country) = LOWER(?) ORDER BY updated_at DESC')
      .all(cleanCountry);
    const snaps = db
      .prepare(
        'SELECT id, score, classification, active_incidents, critical_alerts, calculated_at FROM country_risk_snapshots WHERE LOWER(country) = LOWER(?) ORDER BY id DESC LIMIT 20'
      )
      .all(cleanCountry);

    const canonicalName = incRows[0]?.country || altRows[0]?.country || cleanCountry;
    return computeCountryScore(
      canonicalName,
      incRows.map(mapIncident),
      altRows.map(mapAlert),
      snaps
    );
  },

  recordCountrySnapshot(country) {
    const profile = this.getCountryProfile(country);
    const breakdownJson = JSON.stringify(profile.scoreExplanation.components);
    const calculatedAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO country_risk_snapshots (
        country, score, classification, active_incidents, critical_alerts, breakdown_json, calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.country,
      profile.riskScore,
      profile.classification,
      profile.counts.activeIncidents,
      profile.counts.criticalAlerts,
      breakdownJson,
      calculatedAt
    );

    return this.getCountryProfile(profile.country);
  },
};

export default countryRiskService;

