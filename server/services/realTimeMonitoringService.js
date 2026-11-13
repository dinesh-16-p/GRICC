import db from '../db/database.js';
import authService from './authService.js';
import countryRiskService from './countryRiskService.js';
import { broadcastEvent, getConnectedClientCount } from './realtimeService.js';
import cacheService from './cacheService.js';
import performanceService from './performanceService.js';

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  err.name = name;
  return err;
}

const SEVERITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const VALID_STATUSES = ['NEW', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];
const VALID_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

function meetsMinSeverity(severity, minSeverity) {
  return (SEVERITY_RANK[severity] || 0) >= (SEVERITY_RANK[minSeverity] || 1);
}

function mapAlertRow(row) {
  let evidence = {};
  let statusHistory = [];
  try {
    evidence = JSON.parse(row.evidence_json || '{}');
  } catch {
    evidence = {};
  }
  try {
    statusHistory = JSON.parse(row.status_history_json || '[]');
  } catch {
    statusHistory = [];
  }
  return {
    id: row.id,
    deduplicationKey: row.deduplication_key,
    alertType: row.alert_type,
    title: row.title,
    description: row.description,
    severity: row.severity,
    countryId: row.country_id,
    sourceModule: row.source_module,
    sourceRecordId: row.source_record_id,
    evidence,
    status: row.status,
    statusHistory,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
  };
}

function mapCategoryRow(row) {
  return {
    id: row.id,
    name: row.name,
    alertType: row.alert_type,
    enabled: Boolean(row.enabled),
    minSeverity: row.min_severity,
    description: row.description,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function mapSettingsRow(row) {
  let monitoredCountries = [];
  try {
    monitoredCountries = JSON.parse(row.monitored_countries_json || '[]');
  } catch {
    monitoredCountries = [];
  }
  return {
    intervalSeconds: row.interval_seconds,
    minSeverity: row.min_severity,
    dedupWindowMinutes: row.dedup_window_minutes,
    riskScoreChangeThreshold: row.risk_score_change_threshold,
    incidentSurgeThreshold: row.incident_surge_threshold,
    predictiveWarningThreshold: row.predictive_warning_threshold,
    geospatialClusterThreshold: row.geospatial_cluster_threshold,
    monitoredCountries,
    lastEvaluatedAt: row.last_evaluated_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

// Single-instance lifecycle state (prevents duplicate background jobs)
let monitoringTimer = null;
let isRunning = false;
let isEvaluating = false;
let lastError = null;
let lastRunAt = null;

export const realTimeMonitoringService = {
  getSettings() {
    const row = db.prepare('SELECT * FROM monitoring_settings WHERE id = 1').get();
    return row ? mapSettingsRow(row) : null;
  },

  updateSettings(patch = {}, actor) {
    const current = this.getSettings();
    const intervalSeconds =
      patch.intervalSeconds !== undefined ? Number(patch.intervalSeconds) : current.intervalSeconds;
    const minSeverity = patch.minSeverity !== undefined ? patch.minSeverity : current.minSeverity;
    const dedupWindowMinutes =
      patch.dedupWindowMinutes !== undefined ? Number(patch.dedupWindowMinutes) : current.dedupWindowMinutes;
    const riskScoreChangeThreshold =
      patch.riskScoreChangeThreshold !== undefined
        ? Number(patch.riskScoreChangeThreshold)
        : current.riskScoreChangeThreshold;
    const incidentSurgeThreshold =
      patch.incidentSurgeThreshold !== undefined
        ? Number(patch.incidentSurgeThreshold)
        : current.incidentSurgeThreshold;
    const predictiveWarningThreshold =
      patch.predictiveWarningThreshold !== undefined
        ? Number(patch.predictiveWarningThreshold)
        : current.predictiveWarningThreshold;
    const geospatialClusterThreshold =
      patch.geospatialClusterThreshold !== undefined
        ? Number(patch.geospatialClusterThreshold)
        : current.geospatialClusterThreshold;
    const monitoredCountries =
      patch.monitoredCountries !== undefined
        ? Array.isArray(patch.monitoredCountries)
          ? patch.monitoredCountries.map((c) => String(c).trim()).filter(Boolean)
          : []
        : current.monitoredCountries;

    if (!Number.isFinite(intervalSeconds) || intervalSeconds < 10 || intervalSeconds > 3600) {
      throw createHttpError(400, 'intervalSeconds must be between 10 and 3600.');
    }
    if (!VALID_SEVERITIES.includes(minSeverity)) {
      throw createHttpError(400, `minSeverity must be one of: ${VALID_SEVERITIES.join(', ')}`);
    }
    if (!Number.isFinite(dedupWindowMinutes) || dedupWindowMinutes < 1 || dedupWindowMinutes > 1440) {
      throw createHttpError(400, 'dedupWindowMinutes must be between 1 and 1440.');
    }
    if (!Number.isFinite(riskScoreChangeThreshold) || riskScoreChangeThreshold < 1 || riskScoreChangeThreshold > 50) {
      throw createHttpError(400, 'riskScoreChangeThreshold must be between 1 and 50.');
    }
    if (!Number.isFinite(incidentSurgeThreshold) || incidentSurgeThreshold < 2 || incidentSurgeThreshold > 20) {
      throw createHttpError(400, 'incidentSurgeThreshold must be between 2 and 20.');
    }
    if (!Number.isFinite(predictiveWarningThreshold) || predictiveWarningThreshold < 25 || predictiveWarningThreshold > 95) {
      throw createHttpError(400, 'predictiveWarningThreshold must be between 25 and 95.');
    }
    if (!Number.isFinite(geospatialClusterThreshold) || geospatialClusterThreshold < 2 || geospatialClusterThreshold > 20) {
      throw createHttpError(400, 'geospatialClusterThreshold must be between 2 and 20.');
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE monitoring_settings
      SET interval_seconds = ?, min_severity = ?, dedup_window_minutes = ?,
          risk_score_change_threshold = ?, incident_surge_threshold = ?,
          predictive_warning_threshold = ?, geospatial_cluster_threshold = ?,
          monitored_countries_json = ?, updated_by = ?, updated_at = ?
      WHERE id = 1
    `).run(
      Math.round(intervalSeconds),
      minSeverity,
      Math.round(dedupWindowMinutes),
      Math.round(riskScoreChangeThreshold),
      Math.round(incidentSurgeThreshold),
      Math.round(predictiveWarningThreshold),
      Math.round(geospatialClusterThreshold),
      JSON.stringify(monitoredCountries),
      actor?.username || 'ADMIN',
      nowIso
    );

    if (isRunning && patch.intervalSeconds !== undefined) {
      this.restartTimer();
    }

    return this.getSettings();
  },

  getCategories() {
    return db.prepare('SELECT * FROM monitoring_categories ORDER BY id ASC').all().map(mapCategoryRow);
  },

  updateCategory(id, { enabled, minSeverity }, actor) {
    const existing = db.prepare('SELECT * FROM monitoring_categories WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `Monitoring category ${id} not found.`, 'NotFound');
    }
    const nextEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;
    const nextMinSev = minSeverity !== undefined ? minSeverity : existing.min_severity;
    if (!VALID_SEVERITIES.includes(nextMinSev)) {
      throw createHttpError(400, `minSeverity must be one of: ${VALID_SEVERITIES.join(', ')}`);
    }

    db.prepare(`
      UPDATE monitoring_categories
      SET enabled = ?, min_severity = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(nextEnabled, nextMinSev, actor?.username || 'ADMIN', new Date().toISOString(), id);

    return mapCategoryRow(db.prepare('SELECT * FROM monitoring_categories WHERE id = ?').get(id));
  },

  /**
   * Incremental database-backed evaluation across Phases 7-15.
   * Deduplicates via deduplication_key and broadcasts newly generated alerts over SSE.
   */
  evaluateNow(actor = null) {
    if (isEvaluating) {
      return { skipped: true, reason: 'Evaluation already in progress', newAlertsCount: 0, newAlerts: [] };
    }

    isEvaluating = true;
    const evalStart = performance.now();
    const nowIso = new Date().toISOString();

    try {
      const settings = this.getSettings();
      const categories = this.getCategories();
      const catMap = new Map(categories.map((c) => [c.alertType, c]));
      const countryFilter = new Set((settings.monitoredCountries || []).map((c) => c.toLowerCase()));

      const shouldInclude = (alertType, severity, country) => {
        const cat = catMap.get(alertType);
        if (cat && !cat.enabled) return false;
        if (!meetsMinSeverity(severity, settings.minSeverity)) return false;
        if (cat && !meetsMinSeverity(severity, cat.minSeverity)) return false;
        if (countryFilter.size > 0 && country && !countryFilter.has(String(country).toLowerCase())) {
          return false;
        }
        return true;
      };

      const insertAlert = db.prepare(`
        INSERT OR IGNORE INTO intelligence_alerts (
          deduplication_key, alert_type, title, description, severity,
          country_id, source_module, source_record_id, evidence_json, status,
          status_history_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?)
      `);

      const candidates = [];

      // 1. Incidents (Phase 7)
      const activeIncidents = db
        .prepare(`SELECT * FROM incidents WHERE status != 'Resolved' ORDER BY id DESC LIMIT 100`)
        .all();
      for (const inc of activeIncidents) {
        if (shouldInclude('CRITICAL_INCIDENT', inc.severity, inc.country)) {
          candidates.push({
            dedupKey: `MON-INC-${inc.id}-${inc.severity}`,
            alertType: 'CRITICAL_INCIDENT',
            title: `${inc.severity} Incident: ${inc.title}`,
            description: inc.description,
            severity: inc.severity,
            countryId: inc.country,
            sourceModule: 'INCIDENTS',
            sourceRecordId: String(inc.id),
            evidence: {
              recordId: inc.id,
              location: inc.location,
              category: inc.category,
              status: inc.status,
              dateReported: inc.date_reported,
            },
          });
        }
      }

      // 2. Country Risk Changes & Critical Postures (Phase 10)
      const profiles = countryRiskService.getAllCountryProfiles();
      for (const p of profiles) {
        const bigJump = Math.abs(p.scoreDelta || 0) >= settings.riskScoreChangeThreshold;
        const isCritical = p.riskScore >= settings.predictiveWarningThreshold;
        if (bigJump || isCritical) {
          const sev = p.riskScore >= 75 ? 'Critical' : 'High';
          if (shouldInclude('HIGH_RISK_CHANGE', sev, p.country)) {
            candidates.push({
              dedupKey: `MON-RISK-${p.country}-${p.riskScore}`,
              alertType: 'HIGH_RISK_CHANGE',
              title: `Elevated Country Risk: ${p.country} (${p.riskScore}/100)`,
              description: `${p.country} (${p.region}) is classified as ${p.classification} with ${p.counts.activeIncidents} active incident(s) (delta: ${p.scoreDelta}).`,
              severity: sev,
              countryId: p.country,
              sourceModule: 'COUNTRY_RISK',
              sourceRecordId: p.country,
              evidence: {
                riskScore: p.riskScore,
                classification: p.classification,
                scoreDelta: p.scoreDelta,
                activeIncidents: p.counts.activeIncidents,
              },
            });
          }
        }
      }

      // 3. Predictive Early Warnings (Phase 11)
      const warnings = db
        .prepare(`SELECT * FROM early_warnings WHERE status = 'active' ORDER BY id DESC LIMIT 50`)
        .all();
      for (const w of warnings) {
        if (shouldInclude('NEW_EARLY_WARNING', w.severity, w.country)) {
          candidates.push({
            dedupKey: `MON-EW-${w.id}`,
            alertType: 'NEW_EARLY_WARNING',
            title: `Early Warning: ${w.title}`,
            description: w.description,
            severity: w.severity,
            countryId: w.country,
            sourceModule: 'PREDICTIVE',
            sourceRecordId: String(w.id),
            evidence: {
              warningType: w.warning_type,
              currentScore: w.current_score,
              projectedScore: w.projected_score,
              createdAt: w.created_at,
            },
          });
        }
      }

      // 4. Strategic Recommendations (Phase 12)
      const recs = db
        .prepare(`SELECT * FROM strategic_recommendations WHERE status = 'pending' ORDER BY id DESC LIMIT 50`)
        .all();
      for (const r of recs) {
        if (shouldInclude('STRATEGIC_RECOMMENDATION', r.severity, r.country)) {
          candidates.push({
            dedupKey: `MON-REC-${r.id}`,
            alertType: 'STRATEGIC_RECOMMENDATION',
            title: `Strategic Action Recommended: ${r.title}`,
            description: r.rationale,
            severity: r.severity,
            countryId: r.country,
            sourceModule: 'DECISIONS',
            sourceRecordId: String(r.id),
            evidence: {
              priority: r.priority,
              confidence: r.confidence,
              sourceSignal: r.source_signal,
              playbookId: r.recommended_playbook_id,
            },
          });
        }
      }

      // 5. Detected Anomalies (Phase 13)
      const anomalies = db
        .prepare(`SELECT * FROM detected_anomalies WHERE status = 'active' ORDER BY id DESC LIMIT 50`)
        .all();
      for (const a of anomalies) {
        if (shouldInclude('DETECTED_ANOMALY', a.severity, a.country)) {
          candidates.push({
            dedupKey: `MON-ANOM-${a.id}`,
            alertType: 'DETECTED_ANOMALY',
            title: `Anomaly in ${a.country}: ${a.anomaly_type}`,
            description: a.explanation,
            severity: a.severity,
            countryId: a.country,
            sourceModule: 'ADVANCED_ANALYTICS',
            sourceRecordId: String(a.id),
            evidence: {
              anomalyType: a.anomaly_type,
              baseline: a.baseline_value,
              observed: a.observed_value,
              zScore: a.z_score,
            },
          });
        }
      }

      // 6. Geospatial Clusters (Phase 14)
      const clusters = db
        .prepare('SELECT * FROM geospatial_clusters WHERE incident_count >= ? ORDER BY id DESC LIMIT 30')
        .all(settings.geospatialClusterThreshold);
      for (const cl of clusters) {
        let countries = [];
        try {
          countries = JSON.parse(cl.countries_json || '[]');
        } catch {
          countries = [];
        }
        const primaryCountry = countries[0] || null;
        if (shouldInclude('GEOSPATIAL_CLUSTER', 'Medium', primaryCountry)) {
          candidates.push({
            dedupKey: `MON-CLUS-${cl.id}`,
            alertType: 'GEOSPATIAL_CLUSTER',
            title: `Geospatial Cluster in ${cl.region} (${cl.incident_count} incidents)`,
            description: `DBSCAN identified ${cl.incident_count} nearby incidents (${cl.dominant_category}) within ${cl.radius_km} km.`,
            severity: cl.incident_count >= 3 ? 'High' : 'Medium',
            countryId: primaryCountry,
            sourceModule: 'GEOSPATIAL',
            sourceRecordId: String(cl.id),
            evidence: {
              region: cl.region,
              radiusKm: cl.radius_km,
              incidentCount: cl.incident_count,
              countries,
            },
          });
        }
      }

      // 7. Approved AI Intelligence Reports (Phase 15)
      const aiReports = db
        .prepare(`SELECT * FROM ai_generated_reports WHERE status = 'approved' ORDER BY updated_at DESC LIMIT 20`)
        .all();
      for (const rpt of aiReports) {
        let countries = [];
        try {
          countries = JSON.parse(rpt.relevant_countries_json || '[]');
        } catch {
          countries = [];
        }
        const primaryCountry = countries[0] || null;
        if (shouldInclude('INTELLIGENCE_UPDATE', 'Low', primaryCountry)) {
          candidates.push({
            dedupKey: `MON-AIRPT-${rpt.id}`,
            alertType: 'INTELLIGENCE_UPDATE',
            title: `Approved Intelligence Report: ${rpt.title}`,
            description: `Approved by ${rpt.approved_by || 'Operator'} (${rpt.report_type}).`,
            severity: 'Low',
            countryId: primaryCountry,
            sourceModule: 'AI_ASSISTANT',
            sourceRecordId: rpt.id,
            evidence: {
              reportType: rpt.report_type,
              approvedBy: rpt.approved_by,
              approvedAt: rpt.approved_at,
            },
          });
        }
      }

      const newlyCreated = [];
      const tx = db.transaction(() => {
        for (const c of candidates) {
          const initialHistory = JSON.stringify([
            { status: 'NEW', actor: actor?.username || 'MONITOR_ENGINE', timestamp: nowIso },
          ]);
          const info = insertAlert.run(
            c.dedupKey,
            c.alertType,
            c.title,
            c.description,
            c.severity,
            c.countryId || null,
            c.sourceModule,
            c.sourceRecordId,
            JSON.stringify(c.evidence),
            initialHistory,
            nowIso
          );
          if (info.changes > 0) {
            const row = db.prepare('SELECT * FROM intelligence_alerts WHERE id = ?').get(info.lastInsertRowid);
            if (row) newlyCreated.push(mapAlertRow(row));
          }
        }
        db.prepare('UPDATE monitoring_settings SET last_evaluated_at = ? WHERE id = 1').run(nowIso);
      });
      tx();

      for (const alert of newlyCreated) {
        broadcastEvent('intelligence_alert', { alert });
        authService.logAudit({
          userId: actor?.id || 'SYSTEM',
          username: actor?.username || 'MONITOR_ENGINE',
          userRole: actor?.role || 'SYSTEM',
          action: 'ALERT_CREATED',
          resourceType: 'intelligence_alert',
          recordId: String(alert.id),
          details: `Created ${alert.severity} ${alert.alertType} alert: ${alert.title}`,
          status: 'SUCCESS',
        });
      }

      lastRunAt = nowIso;
      lastError = null;
      if (newlyCreated.length > 0) {
        cacheService.invalidatePrefix('monitoring:');
      }
      performanceService.recordJobRun('monitoring_evaluation', performance.now() - evalStart, true);

      return {
        evaluatedAt: nowIso,
        createdCount: newlyCreated.length,
        newAlertsCount: newlyCreated.length,
        newAlerts: newlyCreated,
      };
    } catch (err) {
      lastError = err.message;
      performanceService.recordJobRun('monitoring_evaluation', performance.now() - evalStart, false, err.message);
      console.error('[MONITORING ENGINE ERROR]:', err.message);
      throw err;
    } finally {
      isEvaluating = false;
    }
  },

  getAlerts({ status = 'ALL', severity = 'ALL', alertType = 'ALL', country = 'ALL', countryId = 'ALL', limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    const targetCountry = country !== 'ALL' ? country : countryId;

    if (status && status !== 'ALL') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (severity && severity !== 'ALL') {
      conditions.push('severity = ?');
      params.push(severity);
    }
    if (alertType && alertType !== 'ALL') {
      conditions.push('alert_type = ?');
      params.push(alertType);
    }
    if (targetCountry && targetCountry !== 'ALL') {
      conditions.push("LOWER(COALESCE(country_id, '')) LIKE LOWER(?)");
      params.push(`%${targetCountry}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const total = db.prepare(`SELECT COUNT(*) AS count FROM intelligence_alerts ${where}`).get(...params).count;
    const alerts = db
      .prepare(
        `SELECT * FROM intelligence_alerts ${where} ORDER BY CASE severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END, id DESC LIMIT ? OFFSET ?`
      )
      .all(...params, safeLimit, safeOffset)
      .map(mapAlertRow);

    return { total, limit: safeLimit, offset: safeOffset, alerts };
  },

  getAlertById(id) {
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      throw createHttpError(400, 'Alert ID must be a positive integer.');
    }
    const row = db.prepare('SELECT * FROM intelligence_alerts WHERE id = ?').get(numId);
    if (!row) {
      throw createHttpError(404, `Intelligence alert ${id} not found.`, 'NotFound');
    }
    return mapAlertRow(row);
  },

  updateAlertStatus(id, status, actor) {
    if (!VALID_STATUSES.includes(status)) {
      throw createHttpError(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    const existing = this.getAlertById(id);
    const nowIso = new Date().toISOString();
    const actorName = actor?.username || 'Operator';

    const nextHistory = [
      ...(existing.statusHistory || []),
      { status, actor: actorName, timestamp: nowIso },
    ];

    const ackAt = status === 'ACKNOWLEDGED' ? existing.acknowledgedAt || nowIso : existing.acknowledgedAt;
    const ackBy = status === 'ACKNOWLEDGED' ? existing.acknowledgedBy || actorName : existing.acknowledgedBy;
    const resAt = status === 'RESOLVED' || status === 'DISMISSED' ? nowIso : existing.resolvedAt;
    const resBy = status === 'RESOLVED' || status === 'DISMISSED' ? actorName : existing.resolvedBy;

    db.prepare(`
      UPDATE intelligence_alerts
      SET status = ?, status_history_json = ?, acknowledged_at = ?, acknowledged_by = ?, resolved_at = ?, resolved_by = ?
      WHERE id = ?
    `).run(status, JSON.stringify(nextHistory), ackAt, ackBy, resAt, resBy, existing.id);

    const updated = this.getAlertById(existing.id);
    broadcastEvent('intelligence_alert_updated', { alert: updated });
    return updated;
  },

  getOverview() {
    const allAlerts = db.prepare('SELECT * FROM intelligence_alerts ORDER BY id DESC LIMIT 300').all().map(mapAlertRow);

    const byStatus = {
      NEW: allAlerts.filter((a) => a.status === 'NEW').length,
      ACKNOWLEDGED: allAlerts.filter((a) => a.status === 'ACKNOWLEDGED').length,
      INVESTIGATING: allAlerts.filter((a) => a.status === 'INVESTIGATING').length,
      RESOLVED: allAlerts.filter((a) => a.status === 'RESOLVED').length,
      DISMISSED: allAlerts.filter((a) => a.status === 'DISMISSED').length,
    };

    const bySeverity = VALID_SEVERITIES.map((sev) => ({
      severity: sev,
      count: allAlerts.filter((a) => a.severity === sev).length,
    }));

    const catMap = new Map();
    const countryMap = new Map();
    const trendMap = new Map();

    for (const a of allAlerts) {
      catMap.set(a.alertType, (catMap.get(a.alertType) || 0) + 1);
      const cName = a.countryId || 'Global';
      countryMap.set(cName, (countryMap.get(cName) || 0) + 1);
      const day = String(a.createdAt || '').slice(0, 10) || '2026-11-12';
      trendMap.set(day, (trendMap.get(day) || 0) + 1);
    }

    return {
      generatedAt: new Date().toISOString(),
      health: this.getHealth(),
      summary: {
        totalAlerts: allAlerts.length,
        newAlerts: byStatus.NEW,
        criticalAlerts: allAlerts.filter((a) => a.severity === 'Critical').length,
        acknowledgedAlerts: byStatus.ACKNOWLEDGED,
        investigatingAlerts: byStatus.INVESTIGATING,
        resolvedAlerts: byStatus.RESOLVED,
      },
      charts: {
        bySeverity,
        byCategory: Array.from(catMap.entries()).map(([category, count]) => ({ category, count })),
        byCountry: Array.from(countryMap.entries())
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        trends: Array.from(trendMap.entries())
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      },
      recentAlerts: allAlerts.slice(0, 20),
    };
  },

  getHealth() {
    const settings = this.getSettings();
    return {
      isRunning,
      isEvaluating,
      intervalSeconds: settings?.intervalSeconds ?? 60,
      lastEvaluatedAt: settings?.lastEvaluatedAt || lastRunAt,
      activeSseConnections: getConnectedClientCount(),
      lastError,
    };
  },

  startMonitoring() {
    if (isRunning && monitoringTimer) {
      return { started: false, alreadyRunning: true };
    }
    const settings = this.getSettings();
    const intervalMs = Math.max(10, settings?.intervalSeconds || 60) * 1000;
    isRunning = true;

    // Run initial check safely, then schedule periodic interval
    try {
      this.evaluateNow({ id: 'SYSTEM', username: 'MONITOR_ENGINE', role: 'SYSTEM' });
    } catch {
      // Logged inside evaluateNow
    }

    monitoringTimer = setInterval(() => {
      try {
        this.evaluateNow({ id: 'SYSTEM', username: 'MONITOR_ENGINE', role: 'SYSTEM' });
      } catch {
        // Logged inside evaluateNow; never crash server
      }
    }, intervalMs);

    authService.logAudit({
      userId: 'SYSTEM',
      username: 'MONITOR_ENGINE',
      userRole: 'SYSTEM',
      action: 'MONITORING_STARTED',
      resourceType: 'monitoring_engine',
      details: `Real-time monitoring engine started (interval: ${intervalMs / 1000}s).`,
      status: 'SUCCESS',
    });

    return { started: true, alreadyRunning: false };
  },

  restartTimer() {
    if (!isRunning) return;
    if (monitoringTimer) {
      clearInterval(monitoringTimer);
      monitoringTimer = null;
    }
    const settings = this.getSettings();
    const intervalMs = Math.max(10, settings?.intervalSeconds || 60) * 1000;
    monitoringTimer = setInterval(() => {
      try {
        this.evaluateNow({ id: 'SYSTEM', username: 'MONITOR_ENGINE', role: 'SYSTEM' });
      } catch {
        // Safe guard
      }
    }, intervalMs);
  },

  stopMonitoring() {
    if (monitoringTimer) {
      clearInterval(monitoringTimer);
      monitoringTimer = null;
    }
    if (isRunning) {
      isRunning = false;
      try {
        authService.logAudit({
          userId: 'SYSTEM',
          username: 'MONITOR_ENGINE',
          userRole: 'SYSTEM',
          action: 'MONITORING_STOPPED',
          resourceType: 'monitoring_engine',
          details: 'Real-time monitoring engine stopped gracefully.',
          status: 'SUCCESS',
        });
      } catch {
        // Ignore if DB already closed during shutdown
      }
    }
    return { stopped: true };
  },
};
