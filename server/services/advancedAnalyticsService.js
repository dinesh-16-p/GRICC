import db from '../db/database.js';
import countryRiskService from './countryRiskService.js';
import predictiveService from './predictiveService.js';
import { broadcastEvent } from './realtimeService.js';

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

/**
 * Compute Pearson correlation coefficient r in [-1, 1] for two equal-length numeric arrays.
 * Returns null if sample size < 3 or either series has zero variance.
 */
function computePearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) {
    return { r: null, n, significant: false, insufficientData: true };
  }

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) {
    return { r: 0, n, significant: false, insufficientData: false };
  }

  const r = Number((num / Math.sqrt(denX * denY)).toFixed(3));
  // For small samples n >= 4, approximate significance threshold |r| >= 0.70; for n >= 6, |r| >= 0.65
  const significant = (n >= 6 && Math.abs(r) >= 0.65) || (n >= 4 && Math.abs(r) >= 0.8);
  return { r, n, significant, insufficientData: false };
}

/**
 * Derive 4 normalized risk dimensions (0-100) from real SQLite incidents & alerts for a country.
 */
function computeCountryDimensions(profile) {
  const incidents = db
    .prepare('SELECT category, severity, status FROM incidents WHERE LOWER(country) = LOWER(?)')
    .all(profile.country);
  const alerts = db
    .prepare('SELECT category, severity, status FROM alerts WHERE LOWER(country) = LOWER(?)')
    .all(profile.country);

  const weightOf = (sev) => ({ Critical: 30, High: 20, Medium: 12, Low: 5 }[sev] || 5);

  let political = 0;
  let economic = 0;
  let security = 0;

  for (const inc of incidents) {
    const w = weightOf(inc.severity) * (inc.status === 'Resolved' ? 0.4 : 1);
    const cat = String(inc.category || '').toLowerCase();
    if (cat.includes('geopolitical') || cat.includes('trade')) {
      political += w;
      economic += w * 0.5;
    } else if (cat.includes('supply') || cat.includes('freight') || cat.includes('energy') || cat.includes('industrial')) {
      economic += w;
    } else {
      security += w;
    }
  }

  for (const alt of alerts) {
    const w = weightOf(alt.severity) * (alt.status === 'resolved' ? 0.3 : 0.8);
    const cat = String(alt.category || '').toLowerCase();
    if (cat.includes('geopolitical') || cat.includes('trade')) political += w;
    else if (cat.includes('economic') || cat.includes('supply') || cat.includes('weather')) economic += w;
    else security += w;
  }

  return {
    overall: profile.riskScore,
    political: Math.min(100, Math.round(political)),
    economic: Math.min(100, Math.round(economic)),
    security: Math.min(100, Math.round(security)),
    geopolitical: Math.min(100, Math.round((profile.riskScore * 0.6) + (political * 0.4))),
  };
}

function mapRelationshipRow(row) {
  return {
    id: row.id,
    sourceCountry: row.source_country,
    targetCountry: row.target_country,
    relationshipType: row.relationship_type,
    strengthScore: row.strength_score,
    trendDirection: row.trend_direction,
    verificationStatus: row.verification_status,
    sourceAttribution: row.source_attribution,
    summary: row.summary,
    updatedAt: row.updated_at,
  };
}

function mapAnomalyRow(row) {
  let linkedIncidentIds = [];
  let linkedWarningIds = [];
  try {
    linkedIncidentIds = JSON.parse(row.linked_incident_ids || '[]');
  } catch {
    linkedIncidentIds = [];
  }
  try {
    linkedWarningIds = JSON.parse(row.linked_warning_ids || '[]');
  } catch {
    linkedWarningIds = [];
  }
  return {
    id: row.id,
    dedupKey: row.dedup_key,
    country: row.country,
    anomalyType: row.anomaly_type,
    severity: row.severity,
    confidence: row.confidence,
    baselineValue: row.baseline_value,
    observedValue: row.observed_value,
    zScore: row.z_score,
    explanation: row.explanation,
    linkedIncidentIds,
    linkedWarningIds,
    status: row.status,
    detectedAt: row.detected_at,
  };
}

function mapInsightRow(row) {
  let supportingData = {};
  let relevantCountries = [];
  try {
    supportingData = JSON.parse(row.supporting_data_json || '{}');
  } catch {
    supportingData = {};
  }
  try {
    relevantCountries = JSON.parse(row.relevant_countries_json || '[]');
  } catch {
    relevantCountries = [];
  }
  return {
    id: row.id,
    dedupKey: row.dedup_key,
    title: row.title,
    insightType: row.insight_type,
    description: row.description,
    supportingData,
    relevantCountries,
    timePeriod: row.time_period,
    confidence: row.confidence,
    dataSources: row.data_sources,
    createdAt: row.created_at,
  };
}

export const advancedAnalyticsService = {
  /**
   * MODULE 1: Cross-Country Risk Correlation Analysis
   */
  getCorrelations({ country = null } = {}) {
    const profiles = countryRiskService.getAllCountryProfiles();
    const targetCountry = country ? String(country).trim() : null;

    if (targetCountry && !profiles.some((p) => p.country.toLowerCase() === targetCountry.toLowerCase())) {
      throw createHttpError(404, `No risk data found for country "${targetCountry}".`, 'NotFound');
    }

    const snapshotsByCountry = new Map();
    const dimensionsByCountry = new Map();

    for (const p of profiles) {
      const snaps = db
        .prepare('SELECT score FROM country_risk_snapshots WHERE LOWER(country) = LOWER(?) ORDER BY calculated_at ASC, id ASC')
        .all(p.country)
        .map((r) => r.score);
      snapshotsByCountry.set(p.country, snaps);
      dimensionsByCountry.set(p.country, computeCountryDimensions(p));
    }

    const pairs = [];
    const matrix = [];

    for (let i = 0; i < profiles.length; i += 1) {
      const a = profiles[i];
      const rowScores = {};
      for (let j = 0; j < profiles.length; j += 1) {
        const b = profiles[j];
        if (a.country === b.country) {
          rowScores[b.country] = { r: 1, n: snapshotsByCountry.get(a.country).length || 4, significant: true, basis: 'identity' };
          continue;
        }

        const snapsA = snapshotsByCountry.get(a.country) || [];
        const snapsB = snapshotsByCountry.get(b.country) || [];
        const minSnap = Math.min(snapsA.length, snapsB.length);

        let stats;
        let basis;
        if (minSnap >= 3) {
          stats = computePearson(snapsA.slice(-minSnap), snapsB.slice(-minSnap));
          basis = 'historical_snapshots';
        } else {
          // Cross-dimensional indicator correlation across [overall, political, economic, security]
          const dimA = dimensionsByCountry.get(a.country);
          const dimB = dimensionsByCountry.get(b.country);
          stats = computePearson(
            [dimA.overall, dimA.political, dimA.economic, dimA.security],
            [dimB.overall, dimB.political, dimB.economic, dimB.security]
          );
          basis = 'indicator_profile_vectors';
        }

        const cell = {
          r: stats.r,
          n: stats.n,
          significant: stats.significant,
          insufficientData: stats.insufficientData,
          basis,
        };
        rowScores[b.country] = cell;

        if (j > i) {
          const matchesFilter =
            !targetCountry ||
            a.country.toLowerCase() === targetCountry.toLowerCase() ||
            b.country.toLowerCase() === targetCountry.toLowerCase();
          if (matchesFilter) {
            pairs.push({
              countryA: a.country,
              countryB: b.country,
              pearsonR: stats.r,
              sampleSize: stats.n,
              significant: stats.significant,
              insufficientData: stats.insufficientData,
              basis,
              pattern:
                stats.r === null
                  ? 'INSUFFICIENT_DATA'
                  : stats.r >= 0.65
                  ? 'CO_RISING_PATTERN'
                  : stats.r <= -0.65
                  ? 'INVERSE_PATTERN'
                  : 'WEAK_OR_INDEPENDENT',
            });
          }
        }
      }
      matrix.push({ country: a.country, correlations: rowScores });
    }

    pairs.sort((x, y) => Math.abs(y.pearsonR || 0) - Math.abs(x.pearsonR || 0));

    // Historical correlation trend across months (incident-count co-movement)
    const monthlyTrend = db
      .prepare(`
        SELECT substr(date_reported, 1, 7) AS period, COUNT(*) AS incidentCount, COUNT(DISTINCT country) AS activeCountries
        FROM incidents
        GROUP BY period
        ORDER BY period ASC
      `)
      .all();

    return {
      countries: profiles.map((p) => p.country),
      pairs,
      matrix,
      historicalTrend: monthlyTrend,
      significantCount: pairs.filter((p) => p.significant).length,
      correlationNote:
        'Pearson correlation (r) measures statistical co-movement across snapshots or indicator dimensions. Correlation does NOT imply causation.',
    };
  },

  /**
   * MODULE 2: Threat Pattern & Anomaly Detection
   */
  runAnomalyDetection() {
    const profiles = countryRiskService.getAllCountryProfiles();
    const activeIncidents = db
      .prepare(`SELECT id, country, category, severity, latitude, longitude FROM incidents WHERE status != 'Resolved'`)
      .all();
    const activeWarnings = predictiveService.getEarlyWarnings({ status: 'active' });

    const counts = profiles.map((p) => p.counts.activeIncidents);
    const meanActive = counts.length > 0 ? counts.reduce((s, c) => s + c, 0) / counts.length : 0;
    const variance =
      counts.length > 1
        ? counts.reduce((s, c) => s + (c - meanActive) ** 2, 0) / counts.length
        : 0;
    const stdActive = Math.sqrt(variance);

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO detected_anomalies (
        dedup_key, country, anomaly_type, severity, confidence,
        baseline_value, observed_value, z_score, explanation,
        linked_incident_ids, linked_warning_ids, status, detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `);

    const newlyDetected = [];
    const nowIso = new Date().toISOString();

    const recordAnomaly = (payload) => {
      const info = insertStmt.run(
        payload.dedupKey,
        payload.country,
        payload.anomalyType,
        payload.severity,
        payload.confidence,
        payload.baselineValue,
        payload.observedValue,
        payload.zScore,
        payload.explanation,
        JSON.stringify(payload.linkedIncidentIds || []),
        JSON.stringify(payload.linkedWarningIds || []),
        nowIso
      );
      if (info.changes > 0) {
        const row = db.prepare('SELECT * FROM detected_anomalies WHERE id = ?').get(info.lastInsertRowid);
        if (row) newlyDetected.push(mapAnomalyRow(row));
      }
    };

    for (const p of profiles) {
      const countryIncidents = activeIncidents.filter((i) => i.country === p.country);
      const countryWarnings = activeWarnings.filter((w) => w.country === p.country);
      const incIds = countryIncidents.map((i) => i.id);
      const warnIds = countryWarnings.map((w) => w.id);

      // 1. Frequency Spike (requires >= 2 active incidents & positive z-score)
      if (p.counts.activeIncidents >= 2 && stdActive > 0) {
        const z = Number(((p.counts.activeIncidents - meanActive) / stdActive).toFixed(2));
        if (z >= 1.0) {
          recordAnomaly({
            dedupKey: `anom-freq-${p.country}-${p.counts.activeIncidents}`,
            country: p.country,
            anomalyType: 'FREQUENCY_SPIKE',
            severity: z >= 1.8 ? 'Critical' : 'High',
            confidence: profiles.length >= 5 ? 'HIGH' : 'MEDIUM',
            baselineValue: Number(meanActive.toFixed(2)),
            observedValue: p.counts.activeIncidents,
            zScore: z,
            explanation: `${p.country} shows ${p.counts.activeIncidents} active incidents vs. global baseline mean of ${meanActive.toFixed(2)} (z=${z}).`,
            linkedIncidentIds: incIds,
            linkedWarningIds: warnIds,
          });
        }
      }

      // 2. Risk Score Jump (requires >= 2 snapshots)
      const snaps = db
        .prepare('SELECT score FROM country_risk_snapshots WHERE LOWER(country) = LOWER(?) ORDER BY calculated_at DESC, id DESC LIMIT 5')
        .all(p.country);
      if (snaps.length >= 2) {
        const latest = snaps[0].score;
        const prevScores = snaps.slice(1).map((s) => s.score);
        const baseline = prevScores.reduce((s, v) => s + v, 0) / prevScores.length;
        const delta = latest - baseline;
        if (delta >= 15) {
          recordAnomaly({
            dedupKey: `anom-jump-${p.country}-${latest}`,
            country: p.country,
            anomalyType: 'RISK_SCORE_JUMP',
            severity: latest >= 75 ? 'Critical' : 'High',
            confidence: snaps.length >= 3 ? 'HIGH' : 'MEDIUM',
            baselineValue: Number(baseline.toFixed(1)),
            observedValue: latest,
            zScore: null,
            explanation: `Risk score jumped +${delta.toFixed(1)} pts above prior snapshot baseline (${baseline.toFixed(1)} -> ${latest}).`,
            linkedIncidentIds: incIds,
            linkedWarningIds: warnIds,
          });
        }
      }

      // 3. Repeated Threat-Category Pattern (requires >= 2 incidents in same category)
      const catCounts = new Map();
      for (const inc of countryIncidents) {
        catCounts.set(inc.category, (catCounts.get(inc.category) || 0) + 1);
      }
      for (const [cat, count] of catCounts.entries()) {
        if (count >= 2) {
          recordAnomaly({
            dedupKey: `anom-cat-${p.country}-${cat}-${count}`,
            country: p.country,
            anomalyType: 'CATEGORY_PATTERN',
            severity: 'Medium',
            confidence: 'HIGH',
            baselineValue: 1,
            observedValue: count,
            zScore: null,
            explanation: `Repeated "${cat}" incident pattern detected in ${p.country} (${count} active occurrences).`,
            linkedIncidentIds: countryIncidents.filter((i) => i.category === cat).map((i) => i.id),
            linkedWarningIds: warnIds,
          });
        }
      }

      // 4. Geographic Concentration (requires >= 2 geolocated active incidents)
      const geoIncs = countryIncidents.filter(
        (i) => typeof i.latitude === 'number' && typeof i.longitude === 'number'
      );
      if (geoIncs.length >= 2) {
        recordAnomaly({
          dedupKey: `anom-geo-${p.country}-${geoIncs.length}`,
          country: p.country,
          anomalyType: 'GEOGRAPHIC_CONCENTRATION',
          severity: 'High',
          confidence: 'MEDIUM',
          baselineValue: 1,
          observedValue: geoIncs.length,
          zScore: null,
          explanation: `${geoIncs.length} geolocated active incidents concentrated within ${p.country}.`,
          linkedIncidentIds: geoIncs.map((i) => i.id),
          linkedWarningIds: warnIds,
        });
      }
    }

    return {
      detectedAt: nowIso,
      newAnomaliesCount: newlyDetected.length,
      newAnomalies: newlyDetected,
    };
  },

  getAnomalies({ country = 'ALL', severity = 'ALL', status = 'ALL', limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];

    if (country && country !== 'ALL') {
      conditions.push('LOWER(country) = LOWER(?)');
      params.push(country);
    }
    if (severity && severity !== 'ALL') {
      conditions.push('severity = ?');
      params.push(severity);
    }
    if (status && status !== 'ALL') {
      conditions.push('status = ?');
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const total = db
      .prepare(`SELECT COUNT(*) AS count FROM detected_anomalies ${where}`)
      .get(...params).count;

    const rows = db
      .prepare(`SELECT * FROM detected_anomalies ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, safeLimit, safeOffset)
      .map(mapAnomalyRow);

    return { total, limit: safeLimit, offset: safeOffset, anomalies: rows };
  },

  /**
   * MODULE 3: Geopolitical Relationship Analysis
   */
  getRelationships({ country = null, type = 'ALL' } = {}) {
    const conditions = [];
    const params = [];

    if (country) {
      conditions.push('(LOWER(source_country) = LOWER(?) OR LOWER(target_country) = LOWER(?))');
      params.push(country, country);
    }
    if (type && type !== 'ALL') {
      conditions.push('relationship_type = ?');
      params.push(type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const relationships = db
      .prepare(`SELECT * FROM geopolitical_relationships ${where} ORDER BY ABS(strength_score) DESC`)
      .all(...params)
      .map(mapRelationshipRow);

    if (country && relationships.length === 0) {
      const profiles = countryRiskService.getAllCountryProfiles();
      if (!profiles.some((p) => p.country.toLowerCase() === String(country).toLowerCase())) {
        throw createHttpError(404, `No relationship records found for country "${country}".`, 'NotFound');
      }
    }

    const nodeSet = new Set();
    for (const rel of relationships) {
      nodeSet.add(rel.sourceCountry);
      nodeSet.add(rel.targetCountry);
    }
    const profiles = countryRiskService.getAllCountryProfiles();
    const profileMap = new Map(profiles.map((p) => [p.country, p]));

    const nodes = Array.from(nodeSet).map((name) => ({
      id: name,
      riskScore: profileMap.get(name)?.riskScore ?? 0,
      classification: profileMap.get(name)?.classification ?? 'Low',
    }));

    return {
      count: relationships.length,
      nodes,
      edges: relationships,
      verificationLegend: {
        VERIFIED_FACT: 'Confirmed bilateral/multilateral agreement or documented state posture',
        SOURCED_INDICATOR: 'Quantitative trade, freight, or diplomatic indicator from named source',
        ANALYTICAL_ASSESSMENT: 'GRICC analytical estimate derived from observed operational telemetry',
      },
    };
  },

  /**
   * MODULE 4: Multi-Country Comparative Intelligence
   */
  getComparison({ countries = [] } = {}) {
    const allProfiles = countryRiskService.getAllCountryProfiles();
    const requested = Array.isArray(countries)
      ? countries.map((c) => String(c).trim()).filter(Boolean)
      : String(countries || '')
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);

    const selectedProfiles =
      requested.length > 0
        ? allProfiles.filter((p) => requested.some((r) => r.toLowerCase() === p.country.toLowerCase()))
        : allProfiles.slice(0, 4);

    if (requested.length > 0 && selectedProfiles.length === 0) {
      throw createHttpError(404, 'None of the requested countries were found in monitored risk profiles.', 'NotFound');
    }

    const items = selectedProfiles.map((p) => {
      const dims = computeCountryDimensions(p);
      const pred = predictiveService.getCountryPrediction(p.country).prediction;
      const snaps = db
        .prepare('SELECT score, calculated_at FROM country_risk_snapshots WHERE LOWER(country) = LOWER(?) ORDER BY calculated_at ASC, id ASC LIMIT 10')
        .all(p.country);

      return {
        country: p.country,
        region: p.region,
        riskScore: p.riskScore,
        classification: p.classification,
        activeIncidents: p.counts.activeIncidents,
        criticalAlerts: p.counts.criticalAlerts,
        indicators: dims,
        topCategories: p.threatCategories || [],
        prediction: {
          direction: pred.direction,
          rateOfChange: pred.rateOfChange,
          projectedNextScore: pred.projectedNextScore,
          confidence: pred.confidence,
          hasSufficientHistory: pred.hasSufficientHistory,
        },
        snapshotHistory: snaps,
      };
    });

    const radarSeries = ['Overall', 'Political', 'Economic', 'Security', 'Geopolitical'].map((metric) => {
      const row = { metric };
      const key = metric.toLowerCase();
      for (const item of items) {
        row[item.country] = item.indicators[key];
      }
      return row;
    });

    return {
      comparedCountries: items.map((i) => i.country),
      availableCountries: allProfiles.map((p) => p.country),
      items,
      radarSeries,
    };
  },

  /**
   * MODULE 5: Intelligence Trend Analysis
   */
  getTrends({ granularity = 'monthly', country = 'ALL', region = 'ALL', category = 'ALL', severity = 'ALL', startDate = '', endDate = '' } = {}) {
    if (!['monthly', 'quarterly', 'annual'].includes(granularity)) {
      throw createHttpError(400, 'Granularity must be monthly, quarterly, or annual.');
    }

    const profiles = countryRiskService.getAllCountryProfiles();
    const regionMap = new Map(profiles.map((p) => [p.country.toLowerCase(), p.region]));

    const conditions = [];
    const params = [];
    if (country && country !== 'ALL') {
      conditions.push('LOWER(country) = LOWER(?)');
      params.push(country);
    }
    if (category && category !== 'ALL') {
      conditions.push('category = ?');
      params.push(category);
    }
    if (severity && severity !== 'ALL') {
      conditions.push('severity = ?');
      params.push(severity);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rawIncidents = db.prepare(`SELECT * FROM incidents ${where}`).all(...params);

    const filtered = rawIncidents.filter((inc) => {
      const incRegion = regionMap.get(String(inc.country || '').toLowerCase()) || 'Global';
      if (region && region !== 'ALL' && incRegion !== region) return false;
      const dateStr = String(inc.date_reported || '').slice(0, 10);
      if (startDate && dateStr && dateStr < startDate) return false;
      if (endDate && dateStr && dateStr > endDate) return false;
      return true;
    });

    const periodBuckets = new Map();
    const categoryBuckets = new Map();
    const regionalBuckets = new Map();

    for (const inc of filtered) {
      const rawDate = String(inc.date_reported || '2026-11');
      const year = /^\d{4}/.test(rawDate) ? rawDate.slice(0, 4) : '2026';
      const monthNum = /^\d{4}-\d{2}/.test(rawDate) ? parseInt(rawDate.slice(5, 7), 10) : 11;
      let period = `${year}-${String(monthNum).padStart(2, '0')}`;
      if (granularity === 'quarterly') {
        const q = Math.ceil(monthNum / 3);
        period = `${year}-Q${q}`;
      } else if (granularity === 'annual') {
        period = year;
      }

      const pEntry = periodBuckets.get(period) || { period, totalIncidents: 0, criticalIncidents: 0, activeIncidents: 0 };
      pEntry.totalIncidents += 1;
      if (inc.severity === 'Critical') pEntry.criticalIncidents += 1;
      if (inc.status !== 'Resolved') pEntry.activeIncidents += 1;
      periodBuckets.set(period, pEntry);

      categoryBuckets.set(inc.category, (categoryBuckets.get(inc.category) || 0) + 1);

      const reg = regionMap.get(String(inc.country || '').toLowerCase()) || 'Global';
      const rEntry = regionalBuckets.get(reg) || { region: reg, incidents: 0, critical: 0 };
      rEntry.incidents += 1;
      if (inc.severity === 'Critical') rEntry.critical += 1;
      regionalBuckets.set(reg, rEntry);
    }

    const timeSeries = Array.from(periodBuckets.values()).sort((a, b) => a.period.localeCompare(b.period));
    const categoryTrends = Array.from(categoryBuckets.entries())
      .map(([cat, count]) => ({ category: cat, count }))
      .sort((a, b) => b.count - a.count);
    const regionalMovement = Array.from(regionalBuckets.values()).sort((a, b) => b.incidents - a.incidents);

    return {
      granularity,
      filters: { country, region, category, severity, startDate, endDate },
      totalMatchedIncidents: filtered.length,
      timeSeries,
      categoryTrends,
      regionalMovement,
    };
  },

  /**
   * MODULE 6: Advanced Analytical Insights
   */
  generateInsights() {
    const correlations = this.getCorrelations();
    const { anomalies } = this.getAnomalies({ status: 'active', limit: 50 });
    const profiles = countryRiskService.getAllCountryProfiles();
    const trends = this.getTrends();

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO analytical_insights (
        dedup_key, title, insight_type, description, supporting_data_json,
        relevant_countries_json, time_period, confidence, data_sources, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const created = [];
    const nowIso = new Date().toISOString();
    const periodLabel = new Date().toISOString().slice(0, 7);

    const pushInsight = (item) => {
      const info = insertStmt.run(
        item.dedupKey,
        item.title,
        item.insightType,
        item.description,
        JSON.stringify(item.supportingData),
        JSON.stringify(item.relevantCountries),
        periodLabel,
        item.confidence,
        item.dataSources,
        nowIso
      );
      if (info.changes > 0) {
        const row = db.prepare('SELECT * FROM analytical_insights WHERE id = ?').get(info.lastInsertRowid);
        if (row) created.push(mapInsightRow(row));
      }
    };

    // 1. Significant Cross-Country Correlations
    for (const pair of correlations.pairs.filter((p) => p.significant).slice(0, 3)) {
      pushInsight({
        dedupKey: `ins-corr-${pair.countryA}-${pair.countryB}-${pair.pearsonR}`,
        title: `Statistically Significant Risk Co-Movement: ${pair.countryA} & ${pair.countryB}`,
        insightType: 'CORRELATION_LINK',
        description: `${pair.countryA} and ${pair.countryB} exhibit Pearson r=${pair.pearsonR} across ${pair.sampleSize} observations (${pair.basis}). Note: statistical correlation does not establish causation.`,
        supportingData: { pearsonR: pair.pearsonR, sampleSize: pair.sampleSize, basis: pair.basis },
        relevantCountries: [pair.countryA, pair.countryB],
        confidence: pair.sampleSize >= 5 ? 'HIGH' : 'MEDIUM',
        dataSources: 'SQLite country_risk_snapshots & incidents',
      });
    }

    // 2. Active Anomalies
    for (const anom of anomalies.slice(0, 4)) {
      pushInsight({
        dedupKey: `ins-anom-${anom.id}`,
        title: `Anomaly Detected in ${anom.country}: ${anom.anomalyType.replace(/_/g, ' ')}`,
        insightType: 'ANOMALY_ALERT',
        description: anom.explanation,
        supportingData: { baseline: anom.baselineValue, observed: anom.observedValue, zScore: anom.zScore },
        relevantCountries: [anom.country],
        confidence: anom.confidence,
        dataSources: 'SQLite incidents, early_warnings & country_risk_snapshots',
      });
    }

    // 3. Elevated Country Risk Movements
    for (const p of profiles.filter((x) => x.riskScore >= 50).slice(0, 3)) {
      pushInsight({
        dedupKey: `ins-risk-${p.country}-${p.riskScore}`,
        title: `Elevated Composite Risk Profile: ${p.country} (${p.riskScore}/100)`,
        insightType: 'RISK_MOVEMENT',
        description: `${p.country} (${p.region}) carries a ${p.classification} risk classification with ${p.counts.activeIncidents} active incident(s) and ${p.counts.criticalAlerts} critical alert(s).`,
        supportingData: { riskScore: p.riskScore, activeIncidents: p.counts.activeIncidents, criticalAlerts: p.counts.criticalAlerts },
        relevantCountries: [p.country],
        confidence: 'HIGH',
        dataSources: 'GRICC Country Risk Scoring Engine (SQLite)',
      });
    }

    // 4. Regional Pattern Leader
    if (trends.regionalMovement.length > 0) {
      const topReg = trends.regionalMovement[0];
      pushInsight({
        dedupKey: `ins-reg-${topReg.region}-${topReg.incidents}`,
        title: `Highest Regional Incident Concentration: ${topReg.region}`,
        insightType: 'REGIONAL_PATTERN',
        description: `${topReg.region} accounts for ${topReg.incidents} recorded incident(s) (${topReg.critical} Critical) in the current dataset.`,
        supportingData: topReg,
        relevantCountries: profiles.filter((p) => p.region === topReg.region).map((p) => p.country),
        confidence: 'HIGH',
        dataSources: 'SQLite incidents register',
      });
    }

    return {
      generatedAt: nowIso,
      newInsightsCount: created.length,
      newInsights: created,
    };
  },

  getInsights({ type = 'ALL', limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    if (type && type !== 'ALL') {
      conditions.push('insight_type = ?');
      params.push(type);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const total = db
      .prepare(`SELECT COUNT(*) AS count FROM analytical_insights ${where}`)
      .get(...params).count;
    const rows = db
      .prepare(`SELECT * FROM analytical_insights ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, safeLimit, safeOffset)
      .map(mapInsightRow);

    return { total, limit: safeLimit, offset: safeOffset, insights: rows };
  },

  runFullAnalysis(actor = null) {
    const anomalyResult = this.runAnomalyDetection();
    const insightResult = this.generateInsights();

    broadcastEvent('advanced_analytics_updated', {
      newAnomaliesCount: anomalyResult.newAnomaliesCount,
      newInsightsCount: insightResult.newInsightsCount,
      triggeredBy: actor?.username || 'Operator',
    });

    return {
      analyzedAt: new Date().toISOString(),
      newAnomaliesCount: anomalyResult.newAnomaliesCount,
      newInsightsCount: insightResult.newInsightsCount,
      newAnomalies: anomalyResult.newAnomalies,
      newInsights: insightResult.newInsights,
    };
  },

  getOverview() {
    const correlations = this.getCorrelations();
    const anomaliesData = this.getAnomalies({ limit: 50 });
    const relationshipsData = this.getRelationships();
    const comparisonData = this.getComparison();
    const trendsData = this.getTrends();
    const insightsData = this.getInsights({ limit: 30 });
    const emerging = predictiveService.detectEmergingThreats();

    const activeAnomaliesCount = anomaliesData.anomalies.filter((a) => a.status === 'active').length;
    const emergingPatternsCount =
      (emerging.volumeSurges?.length || 0) +
      (emerging.recurringCategories?.length || 0) +
      (emerging.geoClusters?.length || 0);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalCountriesAnalyzed: correlations.countries.length,
        activeAnomalies: activeAnomaliesCount,
        significantCorrelations: correlations.significantCount,
        emergingThreatPatterns: emergingPatternsCount,
        totalRelationships: relationshipsData.count,
        totalInsights: insightsData.total,
      },
      correlations,
      anomalies: anomaliesData.anomalies,
      relationships: relationshipsData,
      comparison: comparisonData,
      trends: trendsData,
      insights: insightsData.insights,
    };
  },
};

