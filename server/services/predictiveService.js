import db from '../db/database.js';
import countryRiskService from './countryRiskService.js';
import { broadcastEvent } from './realtimeService.js';

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

function mapWarningRow(row) {
  return {
    id: row.id,
    country: row.country,
    warningType: row.warning_type,
    title: row.title,
    description: row.description,
    severity: row.severity,
    currentScore: row.current_score,
    projectedScore: row.projected_score,
    status: row.status,
    acknowledgedBy: row.acknowledged_by,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

function mapThresholdRow(row) {
  return {
    id: row.id,
    name: row.name,
    metricKey: row.metric_key,
    thresholdValue: row.threshold_value,
    enabled: Boolean(row.enabled),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

/**
 * Deterministic linear least-squares slope over ordered numeric values.
 */
function computeLinearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function clampScore(val) {
  return Math.max(0, Math.min(100, Math.round(val)));
}

function buildCountryPrediction(profile) {
  // Snapshots in profile.snapshotHistory are newest-first; reverse to chronological order
  const chronological = [...(profile.snapshotHistory || [])].reverse();
  const scores = chronological.map((s) => s.score);
  const sampleCount = scores.length;

  const hasSufficientHistory = sampleCount >= 2;
  const slope = hasSufficientHistory ? computeLinearSlope(scores) : 0;
  const rateOfChange = Number(slope.toFixed(2));

  let direction = 'STABLE';
  if (hasSufficientHistory) {
    if (rateOfChange >= 1.0) direction = 'RISING';
    else if (rateOfChange <= -1.0) direction = 'DECLINING';
  }

  let confidence = 'INSUFFICIENT_DATA';
  if (sampleCount >= 7) confidence = 'HIGH';
  else if (sampleCount >= 4) confidence = 'MEDIUM';
  else if (sampleCount >= 2) confidence = 'LOW';

  const nextStepScore = hasSufficientHistory
    ? clampScore(profile.riskScore + slope)
    : null;

  const projectionSeries = hasSufficientHistory
    ? [
        {
          label: 'Current',
          historicalScore: profile.riskScore,
          projectedScore: profile.riskScore,
          isProjection: false,
        },
        {
          label: 'T+1',
          historicalScore: null,
          projectedScore: clampScore(profile.riskScore + slope * 1),
          isProjection: true,
        },
        {
          label: 'T+2',
          historicalScore: null,
          projectedScore: clampScore(profile.riskScore + slope * 2),
          isProjection: true,
        },
        {
          label: 'T+3',
          historicalScore: null,
          projectedScore: clampScore(profile.riskScore + slope * 3),
          isProjection: true,
        },
      ]
    : [];

  const historicalSeries = chronological.map((s, idx) => ({
    label: `Snap ${idx + 1}`,
    calculatedAt: s.calculated_at,
    historicalScore: s.score,
    projectedScore: idx === chronological.length - 1 ? s.score : null,
    isProjection: false,
  }));

  return {
    country: profile.country,
    region: profile.region,
    currentScore: profile.riskScore,
    classification: profile.classification,
    activeIncidents: profile.counts.activeIncidents,
    criticalAlerts: profile.counts.criticalAlerts,
    snapshotCount: sampleCount,
    hasSufficientHistory,
    confidence,
    direction,
    rateOfChange,
    projectedNextScore: nextStepScore,
    insufficientDataReason: hasSufficientHistory
      ? null
      : 'At least 2 historical risk snapshots are required for trend-based projection.',
    comparisonSeries: [...historicalSeries, ...projectionSeries.slice(1)],
    methodology:
      'Deterministic ordinary least-squares (OLS) linear trend over recorded country_risk_snapshots, bounded to 0-100. Projections are mathematical indicators, not verified external intelligence.',
  };
}

export const predictiveService = {
  getThresholds() {
    return db
      .prepare('SELECT * FROM early_warning_thresholds ORDER BY id ASC')
      .all()
      .map(mapThresholdRow);
  },

  updateThreshold(id, { thresholdValue, enabled }, actor) {
    const existing = db.prepare('SELECT * FROM early_warning_thresholds WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `Threshold ${id} not found.`, 'NotFound');
    }
    const nextValue =
      thresholdValue !== undefined
        ? Math.max(1, Math.min(100, parseInt(thresholdValue, 10) || existing.threshold_value))
        : existing.threshold_value;
    const nextEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;

    db.prepare(`
      UPDATE early_warning_thresholds
      SET threshold_value = ?, enabled = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(nextValue, nextEnabled, actor?.username || 'ADMIN', new Date().toISOString(), id);

    return mapThresholdRow(
      db.prepare('SELECT * FROM early_warning_thresholds WHERE id = ?').get(id)
    );
  },

  getEarlyWarnings({ status = 'ALL', country = 'ALL', severity = 'ALL', limit = 100 } = {}) {
    const conditions = [];
    const params = [];

    if (status && status !== 'ALL') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (country && country !== 'ALL') {
      conditions.push('LOWER(country) = LOWER(?)');
      params.push(country);
    }
    if (severity && severity !== 'ALL') {
      conditions.push('severity = ?');
      params.push(severity);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);

    return db
      .prepare(`SELECT * FROM early_warnings ${where} ORDER BY id DESC LIMIT ?`)
      .all(...params, safeLimit)
      .map(mapWarningRow);
  },

  updateWarningStatus(id, status, actor) {
    if (!['active', 'acknowledged', 'resolved'].includes(status)) {
      throw createHttpError(400, 'Status must be active, acknowledged, or resolved.');
    }
    const existing = db.prepare('SELECT * FROM early_warnings WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `Early warning ${id} not found.`, 'NotFound');
    }

    const nowIso = new Date().toISOString();
    const ackBy = status === 'acknowledged' ? actor?.username || 'Operator' : existing.acknowledged_by;
    const ackAt = status === 'acknowledged' ? nowIso : existing.acknowledged_at;
    const resAt = status === 'resolved' ? nowIso : null;

    db.prepare(`
      UPDATE early_warnings
      SET status = ?, acknowledged_by = ?, acknowledged_at = ?, resolved_at = ?
      WHERE id = ?
    `).run(status, ackBy, ackAt, resAt, id);

    const updated = mapWarningRow(
      db.prepare('SELECT * FROM early_warnings WHERE id = ?').get(id)
    );
    broadcastEvent('early_warning_updated', { warning: updated });
    return updated;
  },

  detectEmergingThreats() {
    const thresholds = this.getThresholds();
    const thrMap = new Map(thresholds.map((t) => [t.metricKey, t]));
    const activeIncidents = db
      .prepare(`SELECT * FROM incidents WHERE status != 'Resolved'`)
      .all();

    // 1. Incident Volume Surges by Country
    const surgeThr = thrMap.get('INCIDENT_SURGE_COUNT');
    const countryCounts = new Map();
    for (const inc of activeIncidents) {
      countryCounts.set(inc.country, (countryCounts.get(inc.country) || 0) + 1);
    }
    const volumeSurges = [];
    if (!surgeThr || surgeThr.enabled) {
      const minCount = surgeThr?.thresholdValue || 2;
      for (const [country, count] of countryCounts.entries()) {
        if (count >= minCount) {
          volumeSurges.push({
            country,
            activeCount: count,
            threshold: minCount,
            signal: 'INCIDENT_SURGE',
          });
        }
      }
    }

    // 2. Recurring Threat Categories per Country
    const catThr = thrMap.get('CATEGORY_RECURRENCE_COUNT');
    const catPairs = new Map();
    for (const inc of activeIncidents) {
      const key = `${inc.country}::${inc.category}`;
      catPairs.set(key, (catPairs.get(key) || 0) + 1);
    }
    const recurringCategories = [];
    if (!catThr || catThr.enabled) {
      const minCat = catThr?.thresholdValue || 2;
      for (const [pair, count] of catPairs.entries()) {
        if (count >= minCat) {
          const [country, category] = pair.split('::');
          recurringCategories.push({
            country,
            category,
            occurrences: count,
            threshold: minCat,
            signal: 'CATEGORY_RECURRENCE',
          });
        }
      }
    }

    // 3. Geographic Incident Clusters (active incidents with coordinates or shared country)
    const clusterThr = thrMap.get('CLUSTER_ACTIVE_COUNT');
    const geoClusters = [];
    if (!clusterThr || clusterThr.enabled) {
      const minCluster = clusterThr?.thresholdValue || 2;
      for (const [country, count] of countryCounts.entries()) {
        const geoCount = activeIncidents.filter(
          (i) => i.country === country && typeof i.latitude === 'number' && typeof i.longitude === 'number'
        ).length;
        if (count >= minCluster && geoCount >= 1) {
          geoClusters.push({
            country,
            activeIncidents: count,
            geolocatedIncidents: geoCount,
            signal: 'GEOGRAPHIC_CLUSTER',
          });
        }
      }
    }

    // Global category trends across all SQLite incidents
    const allIncidents = db.prepare('SELECT category, severity, status FROM incidents').all();
    const catTotals = new Map();
    for (const inc of allIncidents) {
      const entry = catTotals.get(inc.category) || { category: inc.category, total: 0, active: 0, critical: 0 };
      entry.total += 1;
      if (inc.status !== 'Resolved') entry.active += 1;
      if (inc.severity === 'Critical') entry.critical += 1;
      catTotals.set(inc.category, entry);
    }

    return {
      volumeSurges,
      recurringCategories,
      geoClusters,
      categoryTrends: Array.from(catTotals.values()).sort((a, b) => b.active - a.active),
    };
  },

  /**
   * Evaluate deterministic rules and persist deduplicated Early Warnings.
   */
  evaluateEarlyWarnings() {
    const profiles = countryRiskService.getAllCountryProfiles();
    const predictions = profiles.map(buildCountryPrediction);
    const thresholds = this.getThresholds();
    const thrMap = new Map(thresholds.map((t) => [t.metricKey, t]));
    const emerging = this.detectEmergingThreats();

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO early_warnings (
        dedup_key, country, warning_type, title, description, severity, current_score, projected_score, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `);

    const newlyCreated = [];
    const nowIso = new Date().toISOString();

    const pushWarning = ({ dedupKey, country, warningType, title, description, severity, currentScore, projectedScore }) => {
      const info = insertStmt.run(
        dedupKey,
        country,
        warningType,
        title,
        description,
        severity,
        currentScore ?? null,
        projectedScore ?? null,
        nowIso
      );
      if (info.changes > 0) {
        const row = db.prepare('SELECT * FROM early_warnings WHERE id = ?').get(info.lastInsertRowid);
        const warning = mapWarningRow(row);
        newlyCreated.push(warning);
        broadcastEvent('early_warning', { warning });
      }
    };

    const approachThr = thrMap.get('APPROACHING_CRITICAL_SCORE');
    const approachVal = approachThr?.thresholdValue || 65;

    for (const pred of predictions) {
      if (!approachThr || approachThr.enabled) {
        if (pred.currentScore >= approachVal) {
          pushWarning({
            dedupKey: `ew-approach-${pred.country}-${pred.currentScore}`,
            country: pred.country,
            warningType: 'RISK_APPROACHING_CRITICAL',
            title: `Risk Threshold Warning: ${pred.country} (${pred.currentScore}/100)`,
            description: `Calculated country risk score (${pred.currentScore}) meets or exceeds configured threshold (${approachVal}).`,
            severity: pred.currentScore >= 75 ? 'Critical' : 'High',
            currentScore: pred.currentScore,
            projectedScore: pred.projectedNextScore,
          });
        } else if (pred.hasSufficientHistory && pred.projectedNextScore >= 75) {
          pushWarning({
            dedupKey: `ew-proj-crit-${pred.country}-${pred.projectedNextScore}`,
            country: pred.country,
            warningType: 'RAPID_SCORE_RISE',
            title: `Projected Critical Trajectory: ${pred.country}`,
            description: `Trend extrapolation projects ${pred.country} reaching ${pred.projectedNextScore}/100 (rate: +${pred.rateOfChange}/snapshot, confidence: ${pred.confidence}).`,
            severity: 'High',
            currentScore: pred.currentScore,
            projectedScore: pred.projectedNextScore,
          });
        }
      }
    }

    for (const surge of emerging.volumeSurges) {
      const pred = predictions.find((p) => p.country === surge.country);
      pushWarning({
        dedupKey: `ew-surge-${surge.country}-${surge.activeCount}`,
        country: surge.country,
        warningType: 'INCIDENT_SURGE',
        title: `Incident Volume Surge: ${surge.country}`,
        description: `${surge.activeCount} active incidents detected in ${surge.country} (threshold: ${surge.threshold}).`,
        severity: surge.activeCount >= surge.threshold + 1 ? 'Critical' : 'High',
        currentScore: pred?.currentScore ?? null,
        projectedScore: pred?.projectedNextScore ?? null,
      });
    }

    for (const rec of emerging.recurringCategories) {
      const pred = predictions.find((p) => p.country === rec.country);
      pushWarning({
        dedupKey: `ew-cat-${rec.country}-${rec.category}-${rec.occurrences}`,
        country: rec.country,
        warningType: 'CATEGORY_RECURRENCE',
        title: `Recurring Threat Category in ${rec.country}`,
        description: `${rec.occurrences} active incidents in "${rec.category}" (threshold: ${rec.threshold}).`,
        severity: 'Medium',
        currentScore: pred?.currentScore ?? null,
        projectedScore: pred?.projectedNextScore ?? null,
      });
    }

    for (const cl of emerging.geoClusters) {
      const pred = predictions.find((p) => p.country === cl.country);
      pushWarning({
        dedupKey: `ew-cluster-${cl.country}-${cl.activeIncidents}`,
        country: cl.country,
        warningType: 'GEOGRAPHIC_CLUSTER',
        title: `Geographic Incident Cluster: ${cl.country}`,
        description: `${cl.activeIncidents} active incidents (${cl.geolocatedIncidents} geolocated) clustered in ${cl.country}.`,
        severity: 'High',
        currentScore: pred?.currentScore ?? null,
        projectedScore: pred?.projectedNextScore ?? null,
      });
    }

    return {
      evaluatedAt: nowIso,
      newWarningsCount: newlyCreated.length,
      newWarnings: newlyCreated,
    };
  },

  getPredictiveOverview() {
    const profiles = countryRiskService.getAllCountryProfiles();
    const predictions = profiles.map(buildCountryPrediction);
    const emerging = this.detectEmergingThreats();
    const warnings = this.getEarlyWarnings({ limit: 100 });
    const thresholds = this.getThresholds();

    const topEmergingCountries = [...predictions]
      .sort((a, b) => {
        if (b.rateOfChange !== a.rateOfChange) return b.rateOfChange - a.rateOfChange;
        return b.currentScore - a.currentScore;
      })
      .slice(0, 10);

    const avgCurrent =
      predictions.length > 0
        ? Math.round(predictions.reduce((s, p) => s + p.currentScore, 0) / predictions.length)
        : 0;
    const withProj = predictions.filter((p) => p.hasSufficientHistory && p.projectedNextScore !== null);
    const avgSlope =
      withProj.length > 0
        ? withProj.reduce((s, p) => s + p.rateOfChange, 0) / withProj.length
        : 0;

    const globalForecastSeries = [
      { label: 'Current Baseline', historicalAvg: avgCurrent, projectedAvg: avgCurrent },
      { label: 'Forecast T+1', historicalAvg: null, projectedAvg: clampScore(avgCurrent + avgSlope * 1) },
      { label: 'Forecast T+2', historicalAvg: null, projectedAvg: clampScore(avgCurrent + avgSlope * 2) },
      { label: 'Forecast T+3', historicalAvg: null, projectedAvg: clampScore(avgCurrent + avgSlope * 3) },
    ];

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        monitoredCountries: predictions.length,
        risingRiskCountries: predictions.filter((p) => p.direction === 'RISING').length,
        activeWarnings: warnings.filter((w) => w.status === 'active').length,
        emergingThreatSignals:
          emerging.volumeSurges.length +
          emerging.recurringCategories.length +
          emerging.geoClusters.length,
        countriesWithProjection: withProj.length,
      },
      globalForecastSeries,
      topEmergingCountries,
      predictions,
      emergingThreats: emerging,
      earlyWarnings: warnings,
      thresholds,
      disclaimer:
        'CALCULATED MATHEMATICAL PROJECTIONS — Derived deterministically from SQLite incident records and historical snapshots. Not verified external intelligence.',
    };
  },

  getCountryPrediction(country) {
    const profile = countryRiskService.getCountryProfile(country);
    const prediction = buildCountryPrediction(profile);
    const warnings = this.getEarlyWarnings({ country: profile.country, limit: 50 });
    return {
      profile,
      prediction,
      warnings,
    };
  },
};

export default predictiveService;

