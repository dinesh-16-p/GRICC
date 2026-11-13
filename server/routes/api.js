import express from 'express';
import { newsService } from '../services/newsService.js';
import { geopoliticalService } from '../services/geopoliticalService.js';
import { disasterService } from '../services/disasterService.js';
import { weatherService } from '../services/weatherService.js';
import { cyberService } from '../services/cyberService.js';
import persistenceService from '../services/persistenceService.js';
import authService from '../services/authService.js';
import alertingService from '../services/alertingService.js';
import countryRiskService from '../services/countryRiskService.js';
import reportingService from '../services/reportingService.js';
import predictiveService from '../services/predictiveService.js';
import { decisionService } from '../services/decisionService.js';
import { advancedAnalyticsService } from '../services/advancedAnalyticsService.js';
import { geospatialService } from '../services/geospatialService.js';
import { aiIntelligenceService } from '../services/aiIntelligenceService.js';
import { intelligenceRetrievalService } from '../services/intelligenceRetrievalService.js';
import { conversationService } from '../services/conversationService.js';
import { aiReportService } from '../services/aiReportService.js';
import { realTimeMonitoringService } from '../services/realTimeMonitoringService.js';
import { collaborationService } from '../services/collaborationService.js';
import { securityService } from '../services/securityService.js';
import cacheService from '../services/cacheService.js';
import performanceService from '../services/performanceService.js';
import rateLimit from 'express-rate-limit';
import { registerSseClient, broadcastEvent } from '../services/realtimeService.js';
import { authenticateToken, authenticateSse, requireRole } from '../middleware/authMiddleware.js';
import { validateBody } from '../middleware/validationMiddleware.js';
import {
  createIncidentSchema,
  updateIncidentSchema,
  aiChatSchema,
  aiGenerateReportSchema,
  collaborationDiscussionSchema,
  collaborationTaskSchema,
} from '../validators/schemas.js';

const router = express.Router();

const services = [
  newsService,
  geopoliticalService,
  disasterService,
  weatherService,
  cyberService,
];

// Mutex flag to prevent overlapping refresh operations
let isRefreshing = false;

// Helper to determine normalized provider status
const mapProviderHealth = (status) => {
  if (status.status === 'LIVE_ACTIVE') return 'HEALTHY';
  if (status.status === 'DEGRADED') return 'DEGRADED';
  if (status.error) return 'FAILED';
  if (!status.isConfigured) return 'NOT_CONFIGURED';
  return 'HEALTHY'; // default standby demo ready
};

// 1. GET /api/health
router.get('/health', (req, res) => {
  const sourcesStatus = services.map((s) => s.getStatus());
  const anyLive = sourcesStatus.some((s) => s.status === 'LIVE_ACTIVE');
  const healthyCount = sourcesStatus.filter((s) => mapProviderHealth(s) === 'HEALTHY').length;
  const degradedCount = sourcesStatus.filter((s) => mapProviderHealth(s) === 'DEGRADED').length;
  const failedCount = sourcesStatus.filter((s) => mapProviderHealth(s) === 'FAILED').length;

  res.status(200).json({
    status: 'HEALTHY',
    backendStatus: 'ONLINE',
    database: persistenceService.checkDbHealth(),
    system: 'GRICC Operational Gateway',
    version: '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    operationalMode: anyLive ? 'LIVE MODE' : 'DEMO MODE',
    providers: {
      total: services.length,
      healthy: healthyCount,
      degraded: degradedCount,
      failed: failedCount,
    },
  });
});

// 1b. GET /api/health/detailed
router.get('/health/detailed', (req, res) => {
  const mem = process.memoryUsage();
  const dbHealth = persistenceService.checkDbHealth();
  const sourcesStatus = services.map((s) => s.getStatus());
  const anyLive = sourcesStatus.some((s) => s.status === 'LIVE_ACTIVE');

  res.status(200).json({
    status: 'HEALTHY',
    backendStatus: 'ONLINE',
    database: dbHealth,
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssBytes: mem.rss,
        heapTotalBytes: mem.heapTotal,
        heapUsedBytes: mem.heapUsed,
        externalBytes: mem.external,
      },
    },
    operationalMode: anyLive ? 'LIVE MODE' : 'DEMO MODE',
    singleInstanceEnforced: true,
    timestamp: new Date().toISOString(),
  });
});

// Real-time Server-Sent Events (SSE) stream (authenticated via Bearer header or ?token=)
router.get('/events/stream', authenticateSse, (req, res) => {
  registerSseClient(req, res, req.user);
});

// Phase 16: Real-time Monitoring SSE stream (authenticated via Bearer header or ?token=)
router.get('/monitoring/stream', authenticateSse, (req, res) => {
  registerSseClient(req, res, req.user);
});

// Protect all intelligence, telemetry, incident, alert, and audit endpoints
router.use(authenticateToken);

// 2. GET /api/sources
router.get('/sources', (req, res) => {
  const sources = services.map((s) => {
    const raw = s.getStatus();
    const health = mapProviderHealth(raw);
    return {
      id: raw.id,
      name: raw.name,
      category: raw.category,
      provider: raw.provider,
      status: health, // 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'NOT_CONFIGURED'
      rawStatus: raw.status,
      isConfigured: raw.isConfigured,
      lastSuccessfulUpdate: raw.lastSync,
      lastAttemptedUpdate: raw.lastAttempt || raw.lastSync,
      latencyMs: raw.latencyMs,
      recordCount: raw.recordCount,
      error: raw.error,
    };
  });

  res.status(200).json({
    timestamp: new Date().toISOString(),
    totalSources: sources.length,
    sources,
  });
});

// 3. GET /api/telemetry
router.get('/telemetry', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';

    // Fetch all 5 providers concurrently with Promise.allSettled for fault-tolerance
    const results = await Promise.allSettled(services.map((s) => s.fetchData(forceRefresh)));

    const sourcesStatus = services.map((s) => {
      const raw = s.getStatus();
      return {
        ...raw,
        health: mapProviderHealth(raw),
      };
    });

    const isLive = sourcesStatus.some((s) => s.status === 'LIVE_ACTIVE');
    const healthyCount = sourcesStatus.filter((s) => s.health === 'HEALTHY').length;
    const degradedCount = sourcesStatus.filter((s) => s.health === 'DEGRADED').length;
    const failedCount = sourcesStatus.filter((s) => s.health === 'FAILED').length;

    // Collect data payloads
    const news = results[0].status === 'fulfilled' ? results[0].value : null;
    const geopolitical = results[1].status === 'fulfilled' ? results[1].value : null;
    const disaster = results[2].status === 'fulfilled' ? results[2].value : null;
    const weather = results[3].status === 'fulfilled' ? results[3].value : null;
    const cyber = results[4].status === 'fulfilled' ? results[4].value : null;

    const totalLiveRecords =
      (news?.items?.length || 0) +
      (geopolitical?.items?.length || 0) +
      (disaster?.items?.length || 0) +
      (weather?.items?.length || 0) +
      (cyber?.items?.length || 0);

    res.status(200).json({
      timestamp: new Date().toISOString(),
      mode: isLive ? 'LIVE MODE' : 'DEMO MODE',
      summary: {
        totalConfiguredProviders: services.length,
        healthyProviders: healthyCount,
        degradedProviders: degradedCount,
        failedProviders: failedCount,
        totalLiveRecords,
        lastRefreshTime: new Date().toISOString(),
      },
      sources: sourcesStatus,
      data: {
        news,
        geopolitical,
        disaster,
        weather,
        cyber,
      },
      disclaimer: isLive
        ? 'VERIFIED LIVE TELEMETRY — Sourced from authoritative public intelligence feeds.'
        : 'DEMO DATA — Operating on curated simulated telemetry. Configure API keys in .env for custom feeds.',
    });
  } catch (err) {
    console.error('[API TELEMETRY ERROR]:', err);
    res.status(500).json({
      error: 'TelemetryRetrievalError',
      message: 'Failed to retrieve telemetry streams from providers',
      details: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// 4. POST /api/refresh (ADMIN & ANALYST only)
router.post('/refresh', requireRole('ADMIN', 'ANALYST'), async (req, res) => {
  if (isRefreshing) {
    return res.status(429).json({
      error: 'ConcurrentRefreshPrevented',
      message: 'A telemetry refresh operation is already in progress. Please wait.',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    isRefreshing = true;
    const startTime = Date.now();

    // Trigger force refresh on all 5 services
    const settled = await Promise.allSettled(services.map((s) => s.fetchData(true)));

    const succeeded = settled.filter((s) => s.status === 'fulfilled').length;
    const failed = settled.filter((s) => s.status === 'rejected').length;

    const partialFailures = settled
      .map((s, idx) => (s.status === 'rejected' ? { service: services[idx].name, error: s.reason?.message } : null))
      .filter(Boolean);

    res.status(200).json({
      status: 'REFRESH_COMPLETE',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      refreshedProviders: succeeded,
      failedProviders: failed,
      partialFailures,
    });
  } catch (err) {
    console.error('[API REFRESH ERROR]:', err);
    res.status(500).json({
      error: 'RefreshFailure',
      message: err.message || 'Failed to complete provider refresh',
      timestamp: new Date().toISOString(),
    });
  } finally {
    isRefreshing = false;
  }
});

// =========================================================
// PHASE 7: PERSISTENT SQLITE REST ENDPOINTS
// =========================================================

// 5. GET /api/incidents
router.get('/incidents', (req, res, next) => {
  try {
    const { severity, status, country, search } = req.query;
    const incidents = persistenceService.getAllIncidents({ severity, status, country, search });
    res.status(200).json({
      timestamp: new Date().toISOString(),
      count: incidents.length,
      incidents,
    });
  } catch (err) {
    next(err);
  }
});

// 6. GET /api/incidents/:id
router.get('/incidents/:id', (req, res, next) => {
  try {
    const incident = persistenceService.getIncidentById(req.params.id);
    if (!incident) {
      return res.status(404).json({
        error: 'NotFound',
        message: `Incident ${req.params.id} not found.`,
      });
    }
    res.status(200).json({ incident });
  } catch (err) {
    next(err);
  }
});

// 7. POST /api/incidents (ADMIN & ANALYST)
router.post('/incidents', requireRole('ADMIN', 'ANALYST'), validateBody(createIncidentSchema), (req, res, next) => {
  try {
    const created = persistenceService.createIncident({
      ...req.body,
      actor: req.user?.username || 'GRICC Operator',
    });
    cacheService.invalidatePrefix('countries:');
    cacheService.invalidatePrefix('predictive:');
    cacheService.invalidatePrefix('analytics:');
    cacheService.invalidatePrefix('geospatial:');
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'INCIDENT_CREATED',
      resourceType: 'incident',
      recordId: created.id,
      details: `Created incident "${created.title}" (${created.severity}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    const stats = persistenceService.getDashboardStats();
    alertingService.evaluateIncident(created, true);
    broadcastEvent('incident_created', { incident: created, stats });
    res.status(201).json({
      message: 'Incident persisted successfully.',
      incident: created,
    });
  } catch (err) {
    next(err);
  }
});

// 8. PUT /api/incidents/:id (ADMIN & ANALYST)
router.put('/incidents/:id', requireRole('ADMIN', 'ANALYST'), validateBody(updateIncidentSchema), (req, res, next) => {
  try {
    const updated = persistenceService.updateIncident(req.params.id, {
      ...req.body,
      actor: req.user?.username || 'GRICC Operator',
    });
    cacheService.invalidatePrefix('countries:');
    cacheService.invalidatePrefix('predictive:');
    cacheService.invalidatePrefix('analytics:');
    cacheService.invalidatePrefix('geospatial:');
    const isResolved = updated.status === 'Resolved';
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: isResolved ? 'INCIDENT_RESOLVED' : 'INCIDENT_UPDATED',
      resourceType: 'incident',
      recordId: updated.id,
      details: `Updated incident ${updated.id} (status: ${updated.status}, severity: ${updated.severity}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    const stats = persistenceService.getDashboardStats();
    alertingService.evaluateIncident(updated, false);
    broadcastEvent('incident_updated', { incident: updated, stats });
    res.status(200).json({
      message: 'Incident updated successfully.',
      incident: updated,
    });
  } catch (err) {
    next(err);
  }
});

// 9. DELETE /api/incidents/:id (ADMIN only)
router.delete('/incidents/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const result = persistenceService.deleteIncident(
      req.params.id,
      req.user?.username || 'GRICC Operator'
    );
    cacheService.invalidatePrefix('countries:');
    cacheService.invalidatePrefix('predictive:');
    cacheService.invalidatePrefix('analytics:');
    cacheService.invalidatePrefix('geospatial:');
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'INCIDENT_DELETED',
      resourceType: 'incident',
      recordId: req.params.id,
      details: `Deleted incident ${req.params.id}.`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    const stats = persistenceService.getDashboardStats();
    broadcastEvent('incident_deleted', { id: req.params.id, stats });
    res.status(200).json({
      message: `Incident ${req.params.id} deleted.`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// 10. GET /api/alerts
router.get('/alerts', (req, res, next) => {
  try {
    const alerts = persistenceService.getAllAlerts();
    res.status(200).json({
      timestamp: new Date().toISOString(),
      count: alerts.length,
      alerts,
    });
  } catch (err) {
    next(err);
  }
});

// 11. POST /api/alerts/sync (ADMIN & ANALYST)
router.post('/alerts/sync', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const { alerts } = req.body;
    const synced = persistenceService.syncLiveAlerts(alerts);
    const stats = persistenceService.getDashboardStats();
    alertingService.evaluateSyncedAlerts(synced);
    broadcastEvent('alerts_synced', { count: synced.length, stats });
    res.status(200).json({
      timestamp: new Date().toISOString(),
      count: synced.length,
      alerts: synced,
    });
  } catch (err) {
    next(err);
  }
});

// 12. PATCH /api/alerts/:id/status (ADMIN & ANALYST)
router.patch('/alerts/:id/status', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const { status } = req.body;
    const updated = persistenceService.updateAlertStatus(
      req.params.id,
      status,
      req.user?.username || 'GRICC Operator'
    );
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action:
        status === 'acknowledged'
          ? 'ALERT_ACKNOWLEDGED'
          : status === 'resolved'
            ? 'ALERT_RESOLVED'
            : 'ALERT_REACTIVATED',
      resourceType: 'alert',
      recordId: req.params.id,
      details: `Updated alert ${req.params.id} status to ${status}.`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    const stats = persistenceService.getDashboardStats();
    alertingService.evaluateAlertUpdate(updated);
    broadcastEvent('alert_updated', { alert: updated, stats });
    res.status(200).json({
      message: `Alert ${req.params.id} status updated to ${status}.`,
      alert: updated,
    });
  } catch (err) {
    next(err);
  }
});

// 13. GET /api/activities
router.get('/activities', (req, res, next) => {
  try {
    const { limit, entityType, entityId } = req.query;
    const activities = persistenceService.getActivities({ limit, entityType, entityId });
    res.status(200).json({
      timestamp: new Date().toISOString(),
      count: activities.length,
      activities,
    });
  } catch (err) {
    next(err);
  }
});

// 14. GET /api/stats (Cached with 10s TTL, invalidated on write)
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await cacheService.getOrSet('dashboard:stats', 10000, () =>
      persistenceService.getDashboardStats()
    );
    res.status(200).json({
      timestamp: new Date().toISOString(),
      stats,
    });
  } catch (err) {
    next(err);
  }
});

// 15. GET /api/audit-logs (ADMIN only)
router.get('/audit-logs', requireRole('ADMIN'), (req, res, next) => {
  try {
    const { limit, action, userId } = req.query;
    const logs = authService.getAuditLogs({ limit, action, userId });
    res.status(200).json({
      timestamp: new Date().toISOString(),
      count: logs.length,
      logs,
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================
// PHASE 9: REAL-TIME NOTIFICATIONS, WATCHLISTS & ESCALATION
// =========================================================

// 16. GET /api/notifications
router.get('/notifications', (req, res, next) => {
  try {
    const { limit, country, severity, unreadOnly } = req.query;
    const data = alertingService.getNotificationsForUser(req.user.id, {
      limit,
      country,
      severity,
      unreadOnly,
    });
    res.status(200).json({
      timestamp: new Date().toISOString(),
      ...data,
    });
  } catch (err) {
    next(err);
  }
});

// 17. PATCH /api/notifications/:id/read
router.patch('/notifications/:id/read', (req, res, next) => {
  try {
    const result = alertingService.markAsRead(req.params.id, req.user.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 18. POST /api/notifications/read-all
router.post('/notifications/read-all', (req, res, next) => {
  try {
    const result = alertingService.markAllAsRead(req.user.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 19. GET /api/notifications/preferences
router.get('/notifications/preferences', (req, res, next) => {
  try {
    const preferences = alertingService.getUserPreferences(req.user.id);
    res.status(200).json({ preferences });
  } catch (err) {
    next(err);
  }
});

// 20. PUT /api/notifications/preferences
router.put('/notifications/preferences', (req, res, next) => {
  try {
    const preferences = alertingService.updateUserPreferences(req.user.id, req.body || {});
    res.status(200).json({ preferences });
  } catch (err) {
    next(err);
  }
});

// 21. GET /api/watchlists
router.get('/watchlists', (req, res, next) => {
  try {
    const watchlists = alertingService.getWatchlists();
    res.status(200).json({
      timestamp: new Date().toISOString(),
      watchlists,
    });
  } catch (err) {
    next(err);
  }
});

// 22. POST /api/watchlists (ADMIN & ANALYST)
router.post('/watchlists', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const item = alertingService.addWatchlistCountry(req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'WATCHLIST_ADDED',
      resourceType: 'watchlist',
      recordId: String(item.id),
      details: `Added "${item.country}" (min severity: ${item.minSeverity}) to watchlist.`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(201).json({ watchlist: item });
  } catch (err) {
    next(err);
  }
});

// 23. DELETE /api/watchlists/:id (ADMIN & ANALYST)
router.delete('/watchlists/:id', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const result = alertingService.removeWatchlistCountry(req.params.id);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'WATCHLIST_REMOVED',
      resourceType: 'watchlist',
      recordId: req.params.id,
      details: `Removed "${result.country}" from watchlist.`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 24. GET /api/escalation-rules
router.get('/escalation-rules', (req, res, next) => {
  try {
    const rules = alertingService.getEscalationRules();
    res.status(200).json({ rules });
  } catch (err) {
    next(err);
  }
});

// 25. PUT /api/escalation-rules/:id (ADMIN only)
router.put('/escalation-rules/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const rule = alertingService.updateEscalationRule(req.params.id, req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'ESCALATION_RULE_UPDATED',
      resourceType: 'escalation_rule',
      recordId: rule.id,
      details: `Updated rule "${rule.name}" (enabled: ${rule.enabled}, threshold: ${rule.threshold}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ rule });
  } catch (err) {
    next(err);
  }
});

// 26. POST /api/escalation-rules/evaluate (ADMIN & ANALYST)
router.post('/escalation-rules/evaluate', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const escalated = alertingService.evaluateUnacknowledgedAlerts();
    res.status(200).json({
      evaluatedAt: new Date().toISOString(),
      escalatedCount: escalated.length,
      notifications: escalated,
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================
// PHASE 10: COUNTRY RISK PROFILES & EXECUTIVE REPORTING
// =========================================================

// 27. GET /api/countries
router.get('/countries', async (req, res, next) => {
  try {
    const { search = '', classification = '' } = req.query;
    const key = `countries:list:${String(search).toLowerCase()}:${String(classification).toLowerCase()}`;
    const countries = await cacheService.getOrSet(key, 15000, () =>
      countryRiskService.getAllCountryProfiles({ search, classification })
    );
    res.status(200).json({
      timestamp: new Date().toISOString(),
      count: countries.length,
      countries,
    });
  } catch (err) {
    next(err);
  }
});

// 28. GET /api/countries/:country
router.get('/countries/:country', (req, res, next) => {
  try {
    const profile = countryRiskService.getCountryProfile(req.params.country);
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
});

// 29. GET /api/countries/:country/trends
router.get('/countries/:country/trends', (req, res, next) => {
  try {
    const profile = countryRiskService.getCountryProfile(req.params.country);
    res.status(200).json({
      country: profile.country,
      historicalTrends: profile.historicalTrends,
      snapshotHistory: profile.snapshotHistory,
      previousScore: profile.previousScore,
      currentScore: profile.riskScore,
      scoreDelta: profile.scoreDelta,
      trendDirection: profile.trendDirection,
    });
  } catch (err) {
    next(err);
  }
});

// 30. POST /api/countries/:country/recalculate (ADMIN & ANALYST)
router.post('/countries/:country/recalculate', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const profile = countryRiskService.recordCountrySnapshot(req.params.country);
    res.status(200).json({ profile });
  } catch (err) {
    next(err);
  }
});

// 31. GET /api/reports
router.get('/reports', (req, res, next) => {
  try {
    const isViewer = req.user.role === 'VIEWER';
    let reports = reportingService.listReports({ publishedOnly: isViewer });
    if (req.user.role !== 'ADMIN') {
      reports = reports.filter((r) => r.reportType !== 'AUDIT_ACTIVITY_REPORT');
    }
    res.status(200).json({
      timestamp: new Date().toISOString(),
      count: reports.length,
      reports,
    });
  } catch (err) {
    next(err);
  }
});

// 32. GET /api/reports/:id
router.get('/reports/:id', (req, res, next) => {
  try {
    const report = reportingService.getReportById(req.params.id);
    if (req.user.role === 'VIEWER' && !report.isPublished) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Viewers can only access published reports.',
      });
    }
    if (report.reportType === 'AUDIT_ACTIVITY_REPORT' && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only ADMIN users can access Audit Activity Reports.',
      });
    }
    res.status(200).json({ report });
  } catch (err) {
    next(err);
  }
});

// 33. POST /api/reports/generate (ADMIN & ANALYST)
router.post('/reports/generate', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const report = reportingService.generateReport(req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'REPORT_GENERATED',
      resourceType: 'report',
      recordId: report.id,
      details: `Generated ${report.reportType} ("${report.title}").`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(201).json({
      message: 'Report generated and persisted.',
      report,
    });
  } catch (err) {
    next(err);
  }
});

// 34. PATCH /api/reports/:id/publish (ADMIN & ANALYST)
router.patch('/reports/:id/publish', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const { isPublished } = req.body || {};
    if (typeof isPublished !== 'boolean') {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'isPublished boolean is required.',
      });
    }
    const report = reportingService.updatePublishState(req.params.id, isPublished);
    res.status(200).json({ report });
  } catch (err) {
    next(err);
  }
});

// 35. GET /api/reports/:id/download (ADMIN & ANALYST)
router.get('/reports/:id/download', requireRole('ADMIN', 'ANALYST'), async (req, res, next) => {
  try {
    const format = String(req.query.format || 'json').toLowerCase();
    const report = reportingService.getReportById(req.params.id);

    if (report.reportType === 'AUDIT_ACTIVITY_REPORT' && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only ADMIN users can export Audit Activity Reports.',
      });
    }

    if (format === 'pdf') {
      const pdfBuffer = await reportingService.exportPdfBuffer(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report.id}.pdf"`);
      return res.status(200).send(pdfBuffer);
    }

    if (format === 'csv') {
      const csv = reportingService.exportCsv(report);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${report.id}.csv"`);
      return res.status(200).send(csv);
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${report.id}.json"`);
      return res.status(200).send(JSON.stringify(report, null, 2));
    }

    return res.status(400).json({
      error: 'ValidationError',
      message: 'Unsupported export format. Use pdf, csv, or json.',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================
// PHASE 11: PREDICTIVE INTELLIGENCE & EARLY WARNING SYSTEM
// =========================================================

// 36. GET /api/predictive/overview
router.get('/predictive/overview', async (req, res, next) => {
  try {
    const overview = await cacheService.getOrSet('predictive:overview', 15000, () =>
      predictiveService.getPredictiveOverview()
    );
    res.status(200).json(overview);
  } catch (err) {
    next(err);
  }
});

// 37. GET /api/predictive/countries/:country
router.get('/predictive/countries/:country', (req, res, next) => {
  try {
    const data = predictiveService.getCountryPrediction(req.params.country);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 38. GET /api/predictive/warnings
router.get('/predictive/warnings', (req, res, next) => {
  try {
    const { status, country, severity, limit } = req.query;
    const warnings = predictiveService.getEarlyWarnings({ status, country, severity, limit });
    res.status(200).json({
      timestamp: new Date().toISOString(),
      count: warnings.length,
      warnings,
    });
  } catch (err) {
    next(err);
  }
});

// 39. POST /api/predictive/evaluate (ADMIN & ANALYST)
router.post('/predictive/evaluate', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const result = predictiveService.evaluateEarlyWarnings();
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'EARLY_WARNING_EVALUATION',
      resourceType: 'early_warning',
      details: `Evaluated predictive thresholds (${result.newWarningsCount} new warning(s) generated).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 40. PATCH /api/predictive/warnings/:id/status (ADMIN & ANALYST)
router.patch('/predictive/warnings/:id/status', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const { status } = req.body || {};
    const warning = predictiveService.updateWarningStatus(req.params.id, status, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: status === 'resolved' ? 'EARLY_WARNING_RESOLVED' : 'EARLY_WARNING_ACKNOWLEDGED',
      resourceType: 'early_warning',
      recordId: String(warning.id),
      details: `Updated early warning ${warning.id} (${warning.country}) status to ${status}.`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ warning });
  } catch (err) {
    next(err);
  }
});

// 41. GET /api/predictive/thresholds
router.get('/predictive/thresholds', (req, res, next) => {
  try {
    const thresholds = predictiveService.getThresholds();
    res.status(200).json({ thresholds });
  } catch (err) {
    next(err);
  }
});

// 42. PUT /api/predictive/thresholds/:id (ADMIN only)
router.put('/predictive/thresholds/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const threshold = predictiveService.updateThreshold(req.params.id, req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'EARLY_WARNING_THRESHOLD_UPDATED',
      resourceType: 'early_warning_threshold',
      recordId: threshold.id,
      details: `Updated threshold "${threshold.name}" to ${threshold.thresholdValue} (enabled: ${threshold.enabled}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ threshold });
  } catch (err) {
    next(err);
  }
});

// =========================================================
// PHASE 12: STRATEGIC DECISION SUPPORT & AUTOMATED RESPONSE
// =========================================================

// 43. GET /api/decisions/overview
router.get('/decisions/overview', (req, res, next) => {
  try {
    const dashboard = decisionService.getDecisionDashboard();
    res.status(200).json(dashboard);
  } catch (err) {
    next(err);
  }
});

// 44. POST /api/decisions/recommendations/generate (ADMIN & ANALYST)
router.post('/decisions/recommendations/generate', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const result = decisionService.generateRecommendations();
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'STRATEGIC_RECOMMENDATIONS_GENERATED',
      resourceType: 'strategic_recommendation',
      details: `Generated ${result.newRecommendationsCount} strategic recommendation(s).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 45. PATCH /api/decisions/recommendations/:id/decision (ADMIN & ANALYST)
router.patch('/decisions/recommendations/:id/decision', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const { status, outcomeNotes } = req.body || {};
    const recommendation = decisionService.updateRecommendationDecision(
      req.params.id,
      { status, outcomeNotes },
      req.user
    );
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'STRATEGIC_RECOMMENDATION_DECISION',
      resourceType: 'strategic_recommendation',
      recordId: String(recommendation.id),
      details: `Updated recommendation ${recommendation.id} (${recommendation.country}) to ${recommendation.status}.`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ recommendation });
  } catch (err) {
    next(err);
  }
});

// 46. POST /api/decisions/simulate (All authenticated roles for read-only simulation; recording requires ADMIN/ANALYST)
router.post('/decisions/simulate', (req, res, next) => {
  try {
    const { country, horizonSteps, mitigationFactor, recordSimulation } = req.body || {};
    const canRecord = Boolean(recordSimulation) && ['ADMIN', 'ANALYST'].includes(req.user.role);
    const simulation = decisionService.simulateScenarios(
      country,
      { horizonSteps, mitigationFactor, recordSimulation: canRecord },
      req.user
    );
    if (canRecord) {
      authService.logAudit({
        userId: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        action: 'SCENARIO_SIMULATED',
        resourceType: 'scenario_simulation',
        details: `Ran and logged scenario simulation for ${simulation.country}.`,
        ipAddress: req.ip,
        status: 'SUCCESS',
      });
    }
    res.status(200).json(simulation);
  } catch (err) {
    next(err);
  }
});

// 47. GET /api/decisions/playbooks
router.get('/decisions/playbooks', (req, res, next) => {
  try {
    const { status, category } = req.query;
    const playbooks = decisionService.getPlaybooks({ status, category });
    res.status(200).json({ count: playbooks.length, playbooks });
  } catch (err) {
    next(err);
  }
});

// 48. POST /api/decisions/playbooks (ADMIN & ANALYST)
router.post('/decisions/playbooks', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const playbook = decisionService.createPlaybook(req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'RESPONSE_PLAYBOOK_CREATED',
      resourceType: 'response_playbook',
      recordId: playbook.id,
      details: `Created response playbook "${playbook.name}" (${playbook.category}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(201).json({ playbook });
  } catch (err) {
    next(err);
  }
});

// 49. PATCH /api/decisions/playbooks/:id (ADMIN & ANALYST)
router.patch('/decisions/playbooks/:id', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const playbook = decisionService.updatePlaybook(req.params.id, req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'RESPONSE_PLAYBOOK_UPDATED',
      resourceType: 'response_playbook',
      recordId: playbook.id,
      details: `Updated playbook "${playbook.name}" (status: ${playbook.status}, ${playbook.completedSteps}/${playbook.totalSteps} steps).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ playbook });
  } catch (err) {
    next(err);
  }
});

// 50. GET /api/decisions/actions
router.get('/decisions/actions', (req, res, next) => {
  try {
    const { status, priority, assignedTo, limit } = req.query;
    const actions = decisionService.getActions({ status, priority, assignedTo, limit });
    res.status(200).json({ count: actions.length, actions });
  } catch (err) {
    next(err);
  }
});

// 51. POST /api/decisions/actions (ADMIN & ANALYST)
router.post('/decisions/actions', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const action = decisionService.createAction(req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'RESPONSE_ACTION_CREATED',
      resourceType: 'response_action',
      recordId: String(action.id),
      details: `Created response action "${action.title}" for ${action.country} (priority: ${action.priority}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(201).json({ action });
  } catch (err) {
    next(err);
  }
});

// 52. PATCH /api/decisions/actions/:id (ADMIN & ANALYST)
router.patch('/decisions/actions/:id', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const action = decisionService.updateAction(req.params.id, req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'RESPONSE_ACTION_UPDATED',
      resourceType: 'response_action',
      recordId: String(action.id),
      details: `Updated action "${action.title}" (status: ${action.status}, assignee: ${action.assignedToUsername || 'Unassigned'}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ action });
  } catch (err) {
    next(err);
  }
});

// =========================================================
// PHASE 13: ADVANCED INTELLIGENCE ANALYTICS
// =========================================================

// 53. GET /api/analytics/advanced/overview
router.get('/analytics/advanced/overview', async (req, res, next) => {
  try {
    const overview = await cacheService.getOrSet('analytics:overview', 15000, () =>
      advancedAnalyticsService.getOverview()
    );
    res.status(200).json(overview);
  } catch (err) {
    next(err);
  }
});

// 54. GET /api/analytics/advanced/correlations
router.get('/analytics/advanced/correlations', (req, res, next) => {
  try {
    const data = advancedAnalyticsService.getCorrelations();
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 55. GET /api/analytics/advanced/correlations/:country
router.get('/analytics/advanced/correlations/:country', (req, res, next) => {
  try {
    const data = advancedAnalyticsService.getCorrelations({ country: req.params.country });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 56. GET /api/analytics/advanced/anomalies
router.get('/analytics/advanced/anomalies', (req, res, next) => {
  try {
    const { country, severity, status, limit, offset } = req.query;
    const data = advancedAnalyticsService.getAnomalies({ country, severity, status, limit, offset });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 57. GET /api/analytics/advanced/relationships
router.get('/analytics/advanced/relationships', (req, res, next) => {
  try {
    const { type } = req.query;
    const data = advancedAnalyticsService.getRelationships({ type });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 58. GET /api/analytics/advanced/relationships/:country
router.get('/analytics/advanced/relationships/:country', (req, res, next) => {
  try {
    const { type } = req.query;
    const data = advancedAnalyticsService.getRelationships({ country: req.params.country, type });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 59. GET /api/analytics/advanced/comparison
router.get('/analytics/advanced/comparison', (req, res, next) => {
  try {
    const { countries } = req.query;
    const data = advancedAnalyticsService.getComparison({ countries });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 60. GET /api/analytics/advanced/trends
router.get('/analytics/advanced/trends', (req, res, next) => {
  try {
    const { granularity, country, region, category, severity, startDate, endDate } = req.query;
    const data = advancedAnalyticsService.getTrends({
      granularity,
      country,
      region,
      category,
      severity,
      startDate,
      endDate,
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 61. GET /api/analytics/advanced/insights
router.get('/analytics/advanced/insights', (req, res, next) => {
  try {
    const { type, limit, offset } = req.query;
    const data = advancedAnalyticsService.getInsights({ type, limit, offset });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 62. POST /api/analytics/advanced/analyze (ADMIN & ANALYST)
router.post('/analytics/advanced/analyze', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const result = advancedAnalyticsService.runFullAnalysis(req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'ADVANCED_ANALYTICS_EXECUTED',
      resourceType: 'advanced_analytics',
      details: `Executed anomaly detection & analytical insight engine (${result.newAnomaliesCount} anomalies, ${result.newInsightsCount} insights).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// =========================================================
// PHASE 14: ADVANCED GEOSPATIAL INTELLIGENCE
// =========================================================

// 63. GET /api/geospatial/overview
router.get('/geospatial/overview', async (req, res, next) => {
  try {
    const overview = await cacheService.getOrSet('geospatial:overview', 15000, () =>
      geospatialService.getOverview()
    );
    res.status(200).json(overview);
  } catch (err) {
    next(err);
  }
});

// 64. GET /api/geospatial/map
router.get('/geospatial/map', (req, res, next) => {
  try {
    const data = geospatialService.getMapData(req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 65. GET /api/geospatial/heatmap
router.get('/geospatial/heatmap', (req, res, next) => {
  try {
    const data = geospatialService.getHeatmapData(req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 66. GET /api/geospatial/regions
router.get('/geospatial/regions', (req, res, next) => {
  try {
    const data = geospatialService.getRegions();
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 67. GET /api/geospatial/regions/:region
router.get('/geospatial/regions/:region', (req, res, next) => {
  try {
    const data = geospatialService.getRegionDetail(req.params.region);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 68. GET /api/geospatial/clusters
router.get('/geospatial/clusters', (req, res, next) => {
  try {
    const { region, limit } = req.query;
    const data = geospatialService.getClusters({ region, limit });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 69. GET /api/geospatial/risk-zones
router.get('/geospatial/risk-zones', (req, res, next) => {
  try {
    const { region, classification } = req.query;
    const data = geospatialService.getRiskZones({ region, classification });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 70. GET /api/geospatial/history
router.get('/geospatial/history', (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const data = geospatialService.getHistory({ startDate, endDate });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 71. GET /api/geospatial/country/:country
router.get('/geospatial/country/:country', (req, res, next) => {
  try {
    const data = geospatialService.getCountryDrillDown(req.params.country);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 72. GET /api/geospatial/incidents
router.get('/geospatial/incidents', (req, res, next) => {
  try {
    const data = geospatialService.getFilteredIncidents(req.query);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 73. POST /api/geospatial/analyze (ADMIN & ANALYST)
router.post('/geospatial/analyze', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const { epsilonKm, minPoints } = req.body || {};
    // Only ADMIN may override clustering parameters beyond defaults if restricted; ANALYST can execute with valid bounds
    if ((epsilonKm !== undefined || minPoints !== undefined) && req.user.role !== 'ADMIN' && req.user.role !== 'ANALYST') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = geospatialService.runGeospatialAnalysis({ epsilonKm, minPoints }, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'GEOSPATIAL_ANALYSIS_EXECUTED',
      resourceType: 'geospatial_analysis',
      details: `Executed DBSCAN clustering (epsilon=${result.parameters.epsilonKm}km, minPoints=${result.parameters.minPoints}) -> ${result.clustersFound} cluster(s), ${result.zonesUpdated} risk zone(s).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// =========================================================
// PHASE 15: AI-POWERED INTELLIGENCE ASSISTANT
// =========================================================

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_MAX || 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TooManyRequests',
    message: 'AI assistant rate limit exceeded. Please try again shortly.',
  },
});

// 74. GET /api/ai/status
router.get('/ai/status', (req, res, next) => {
  try {
    res.status(200).json(aiIntelligenceService.getStatus());
  } catch (err) {
    next(err);
  }
});

// 75. PUT /api/ai/config (ADMIN only)
router.put('/ai/config', requireRole('ADMIN'), (req, res, next) => {
  try {
    const config = aiIntelligenceService.updateConfig(req.body || {});
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'AI_PROVIDER_CONFIG_UPDATED',
      resourceType: 'ai_config',
      details: `Updated AI provider configuration to ${config.provider} (${config.model}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ config });
  } catch (err) {
    next(err);
  }
});

// 76. POST /api/ai/chat
router.post('/ai/chat', aiLimiter, validateBody(aiChatSchema), async (req, res, next) => {
  try {
    const { conversationId, message } = req.body || {};
    const result = await aiIntelligenceService.chat({ conversationId, message }, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'AI_INTELLIGENCE_QUERY',
      resourceType: 'ai_conversation',
      recordId: result.conversationId,
      details: `Executed grounded AI intelligence query (${result.message.evidence?.length || 0} evidence citations).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 77. GET /api/ai/conversations
router.get('/ai/conversations', (req, res, next) => {
  try {
    const conversations = conversationService.listConversations(req.user.id);
    res.status(200).json({ count: conversations.length, conversations });
  } catch (err) {
    next(err);
  }
});

// 78. POST /api/ai/conversations
router.post('/ai/conversations', (req, res, next) => {
  try {
    const { title, activeCountry } = req.body || {};
    const conversation = conversationService.createConversation(req.user.id, title, activeCountry);
    res.status(201).json({ conversation });
  } catch (err) {
    next(err);
  }
});

// 79. GET /api/ai/conversations/:id
router.get('/ai/conversations/:id', (req, res, next) => {
  try {
    const data = conversationService.getOwnedConversation(req.params.id, req.user.id);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// 80. DELETE /api/ai/conversations/:id
router.delete('/ai/conversations/:id', (req, res, next) => {
  try {
    const result = conversationService.deleteConversation(req.params.id, req.user.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 81. POST /api/ai/search
router.post('/ai/search', aiLimiter, (req, res, next) => {
  try {
    const { query } = req.body || {};
    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: 'ValidationError', message: 'Search query is required.' });
    }
    const result = intelligenceRetrievalService.searchIntelligence(query, req.user.role);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 82. POST /api/ai/explain-risk
router.post('/ai/explain-risk', aiLimiter, async (req, res, next) => {
  try {
    const { country } = req.body || {};
    const result = await aiIntelligenceService.explainRisk({ country }, req.user);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 83. POST /api/ai/summarize
router.post('/ai/summarize', aiLimiter, async (req, res, next) => {
  try {
    const result = await aiIntelligenceService.summarize(req.body || {}, req.user);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 84. POST /api/ai/compare
router.post('/ai/compare', aiLimiter, async (req, res, next) => {
  try {
    const result = await aiIntelligenceService.compare(req.body || {}, req.user);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 85. POST /api/ai/generate-report (ADMIN & ANALYST)
router.post('/ai/generate-report', aiLimiter, requireRole('ADMIN', 'ANALYST'), validateBody(aiGenerateReportSchema), async (req, res, next) => {
  try {
    const report = await aiReportService.generateDraftReport(req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'AI_DRAFT_REPORT_GENERATED',
      resourceType: 'ai_report',
      recordId: report.id,
      details: `Generated draft AI report "${report.title}" (${report.reportType}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(201).json({ report });
  } catch (err) {
    next(err);
  }
});

// 86. GET /api/ai/reports
router.get('/ai/reports', (req, res, next) => {
  try {
    const reports = aiReportService.listReports(req.user);
    res.status(200).json({ count: reports.length, reports });
  } catch (err) {
    next(err);
  }
});

// 87. GET /api/ai/reports/:id
router.get('/ai/reports/:id', (req, res, next) => {
  try {
    const report = aiReportService.getReportById(req.params.id, req.user);
    res.status(200).json({ report });
  } catch (err) {
    next(err);
  }
});

// 88. PATCH /api/ai/reports/:id/approve (ADMIN & ANALYST)
router.patch('/ai/reports/:id/approve', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const report = aiReportService.approveAndEditReport(req.params.id, req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'AI_REPORT_APPROVED',
      resourceType: 'ai_report',
      recordId: report.id,
      details: `Approved AI report "${report.title}" (linked report: ${report.linkedReportId || 'N/A'}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ report });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PHASE 16: REAL-TIME INTELLIGENCE MONITORING & ALERT SYSTEM
// ============================================================

const monitoringEvaluateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Monitoring evaluation rate limit exceeded. Please wait briefly.' },
});

router.get('/monitoring/overview', requireRole('ADMIN', 'ANALYST', 'VIEWER'), async (req, res, next) => {
  try {
    const overview = await cacheService.getOrSet('monitoring:overview', 10000, () =>
      realTimeMonitoringService.getOverview()
    );
    res.status(200).json(overview);
  } catch (err) {
    next(err);
  }
});

router.get('/monitoring/alerts', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    const { severity, alertType, status, countryId, limit, offset } = req.query;
    const result = realTimeMonitoringService.getAlerts({
      severity,
      alertType,
      status,
      countryId,
      limit,
      offset,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/monitoring/alerts/:id', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    const alert = realTimeMonitoringService.getAlertById(req.params.id);
    res.status(200).json({ alert });
  } catch (err) {
    next(err);
  }
});

router.patch('/monitoring/alerts/:id/status', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const { status } = req.body || {};
    const alert = realTimeMonitoringService.updateAlertStatus(req.params.id, status, req.user);
    cacheService.invalidatePrefix('monitoring:');

    const actionMap = {
      ACKNOWLEDGED: 'ALERT_ACKNOWLEDGED',
      INVESTIGATING: 'ALERT_INVESTIGATION_STARTED',
      RESOLVED: 'ALERT_RESOLVED',
      DISMISSED: 'ALERT_DISMISSED',
    };

    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: actionMap[status] || 'ALERT_STATUS_UPDATED',
      resourceType: 'intelligence_alert',
      resourceId: String(alert.id),
      details: `Updated alert "${alert.title}" (${alert.alertType}) to ${status}.`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });

    res.status(200).json({ alert });
  } catch (err) {
    next(err);
  }
});

router.get('/monitoring/categories', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    res.status(200).json({ categories: realTimeMonitoringService.getCategories() });
  } catch (err) {
    next(err);
  }
});

router.patch('/monitoring/categories/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const category = realTimeMonitoringService.updateCategory(req.params.id, req.body || {});
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'MONITORING_SETTINGS_UPDATED',
      resourceType: 'monitoring_category',
      resourceId: String(category.id),
      details: `Updated monitoring category ${category.id} (enabled=${category.enabled}, minSeverity=${category.minSeverity}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ category });
  } catch (err) {
    next(err);
  }
});

router.get('/monitoring/settings', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    res.status(200).json({ settings: realTimeMonitoringService.getSettings() });
  } catch (err) {
    next(err);
  }
});

router.patch('/monitoring/settings', requireRole('ADMIN'), (req, res, next) => {
  try {
    const settings = realTimeMonitoringService.updateSettings(req.body || {});
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'MONITORING_SETTINGS_UPDATED',
      resourceType: 'monitoring_settings',
      resourceId: '1',
      details: `Updated monitoring settings (interval=${settings.intervalSeconds}s, enabled=${settings.enabled}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
});

router.post('/monitoring/evaluate', monitoringEvaluateLimiter, requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const result = realTimeMonitoringService.evaluateNow(req.user);
    if (!result.skipped) {
      authService.logAudit({
        userId: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        action: 'MONITORING_EVALUATION_COMPLETED',
        resourceType: 'monitoring_engine',
        details: `Manual monitoring evaluation completed (${result.createdCount} new alert(s) generated).`,
        ipAddress: req.ip,
        status: 'SUCCESS',
      });
    }
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/monitoring/health', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    res.status(200).json({ health: realTimeMonitoringService.getHealth() });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PHASE 17: INTELLIGENCE COLLABORATION & TEAM WORKSPACE
// ============================================================

const collabWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TooManyRequests', message: 'Collaboration write rate limit exceeded. Please wait briefly.' },
});

router.get('/collaboration/overview', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    res.status(200).json(collaborationService.getOverview(req.user));
  } catch (err) {
    next(err);
  }
});

router.get('/collaboration/discussions', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    const { status, priority, discussionType, search, limit, offset } = req.query;
    res.status(200).json(
      collaborationService.listDiscussions({ status, priority, discussionType, search, limit, offset }, req.user)
    );
  } catch (err) {
    next(err);
  }
});

router.post('/collaboration/discussions', collabWriteLimiter, requireRole('ADMIN', 'ANALYST'), validateBody(collaborationDiscussionSchema), (req, res, next) => {
  try {
    const discussion = collaborationService.createDiscussion(req.body || {}, req.user, req.ip);
    res.status(201).json({ discussion });
  } catch (err) {
    next(err);
  }
});

router.get('/collaboration/discussions/:id', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    const discussion = collaborationService.getDiscussionById(req.params.id, req.user);
    res.status(200).json({ discussion });
  } catch (err) {
    next(err);
  }
});

router.patch('/collaboration/discussions/:id', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const discussion = collaborationService.updateDiscussion(req.params.id, req.body || {}, req.user, req.ip);
    res.status(200).json({ discussion });
  } catch (err) {
    next(err);
  }
});

router.patch('/collaboration/discussions/:id/assign', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const discussion = collaborationService.assignDiscussion(
      req.params.id,
      req.body?.assignedTo || null,
      req.user,
      req.ip
    );
    res.status(200).json({ discussion });
  } catch (err) {
    next(err);
  }
});

router.patch('/collaboration/discussions/:id/status', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const discussion = collaborationService.updateDiscussionStatus(
      req.params.id,
      req.body?.status,
      req.user,
      req.ip
    );
    res.status(200).json({ discussion });
  } catch (err) {
    next(err);
  }
});

router.get('/collaboration/discussions/:id/comments', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    const comments = collaborationService.listComments(req.params.id, req.user);
    res.status(200).json({ comments });
  } catch (err) {
    next(err);
  }
});

router.post('/collaboration/discussions/:id/comments', collabWriteLimiter, requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const comment = collaborationService.addComment(req.params.id, req.body || {}, req.user, req.ip);
    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
});

router.patch('/collaboration/comments/:id', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const comment = collaborationService.editComment(req.params.id, req.body?.content, req.user, req.ip);
    res.status(200).json({ comment });
  } catch (err) {
    next(err);
  }
});

router.delete('/collaboration/comments/:id', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const comment = collaborationService.deleteComment(req.params.id, req.user, req.ip);
    res.status(200).json({ comment });
  } catch (err) {
    next(err);
  }
});

router.get('/collaboration/discussions/:id/shared-records', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    const records = collaborationService.listSharedRecords(req.params.id, req.user);
    res.status(200).json({ records });
  } catch (err) {
    next(err);
  }
});

router.post('/collaboration/discussions/:id/shared-records', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const record = collaborationService.shareRecord(req.params.id, req.body || {}, req.user, req.ip);
    res.status(201).json({ record });
  } catch (err) {
    next(err);
  }
});

router.delete('/collaboration/shared-records/:id', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const result = collaborationService.unshareRecord(req.params.id, req.user, req.ip);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/collaboration/tasks', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    const { status, priority, assignedTo, createdBy, overdueOnly, limit, offset } = req.query;
    res.status(200).json(
      collaborationService.listTasks({ status, priority, assignedTo, createdBy, overdueOnly, limit, offset }, req.user)
    );
  } catch (err) {
    next(err);
  }
});

router.post('/collaboration/tasks', requireRole('ADMIN', 'ANALYST'), validateBody(collaborationTaskSchema), (req, res, next) => {
  try {
    const task = collaborationService.createTask(req.body || {}, req.user, req.ip);
    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

router.get('/collaboration/tasks/:id', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    const task = collaborationService.getTaskById(req.params.id, req.user);
    res.status(200).json({ task });
  } catch (err) {
    next(err);
  }
});

router.patch('/collaboration/tasks/:id', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const task = collaborationService.updateTask(req.params.id, req.body || {}, req.user, req.ip);
    res.status(200).json({ task });
  } catch (err) {
    next(err);
  }
});

router.patch('/collaboration/tasks/:id/assign', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const task = collaborationService.assignTask(req.params.id, req.body?.assignedTo, req.user, req.ip);
    res.status(200).json({ task });
  } catch (err) {
    next(err);
  }
});

router.patch('/collaboration/tasks/:id/status', requireRole('ADMIN', 'ANALYST'), (req, res, next) => {
  try {
    const task = collaborationService.updateTaskStatus(req.params.id, req.body?.status, req.user, req.ip);
    res.status(200).json({ task });
  } catch (err) {
    next(err);
  }
});

router.get('/collaboration/team', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    const members = collaborationService.getTeamDirectory(req.user);
    res.status(200).json({ members });
  } catch (err) {
    next(err);
  }
});

router.get('/collaboration/activity', requireRole('ADMIN', 'ANALYST', 'VIEWER'), (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const activity = collaborationService.getActivityTimeline({ limit, offset }, req.user);
    res.status(200).json({ activity });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PHASE 18: ADVANCED SECURITY & COMPLIANCE FRAMEWORK (ADMIN ONLY)
// ============================================================

router.get('/security/overview', requireRole('ADMIN'), (req, res, next) => {
  try {
    res.status(200).json(securityService.getSecurityOverview());
  } catch (err) {
    next(err);
  }
});

router.get('/security/events', requireRole('ADMIN'), (req, res, next) => {
  try {
    const { eventType, severity, userId, status, startDate, endDate, limit, offset } = req.query;
    res.status(200).json(
      securityService.listSecurityEvents({
        eventType,
        severity,
        userId,
        status,
        startDate,
        endDate,
        limit,
        offset,
      })
    );
  } catch (err) {
    next(err);
  }
});

router.patch('/security/events/:id/status', requireRole('ADMIN'), (req, res, next) => {
  try {
    const event = securityService.updateSecurityEventStatus(req.params.id, req.body?.status, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'SECURITY_EVENT_UPDATED',
      resourceType: 'security_event',
      recordId: event.id,
      details: `Updated security event ${event.id} (${event.eventType}) to ${event.status}.`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ event });
  } catch (err) {
    next(err);
  }
});

router.get('/security/settings', requireRole('ADMIN'), (req, res, next) => {
  try {
    res.status(200).json({ settings: securityService.getSecuritySettings() });
  } catch (err) {
    next(err);
  }
});

router.patch('/security/settings', requireRole('ADMIN'), (req, res, next) => {
  try {
    const settings = securityService.updateSecuritySettings(req.body || {}, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'SECURITY_SETTINGS_UPDATED',
      resourceType: 'security_settings',
      recordId: '1',
      details: `Updated security settings (maxFailedLogins=${settings.maxFailedLogins}, lockout=${settings.lockoutDurationMinutes}m, minPwLen=${settings.minPasswordLength}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ settings });
  } catch (err) {
    next(err);
  }
});

router.get('/security/audit-integrity', requireRole('ADMIN'), (req, res, next) => {
  try {
    const integrity = securityService.verifyAuditLogIntegrity();
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'AUDIT_INTEGRITY_VERIFIED',
      resourceType: 'audit_logs',
      details: `Verified audit log hash chain: valid=${integrity.valid}, hashed=${integrity.hashedCount}, tampered=${integrity.tamperedCount}.`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json({ integrity });
  } catch (err) {
    next(err);
  }
});

router.post('/security/users/:id/unlock', requireRole('ADMIN'), (req, res, next) => {
  try {
    const result = securityService.unlockUserAccount(req.params.id, req.user);
    authService.logAudit({
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: 'USER_ACCOUNT_UNLOCKED',
      resourceType: 'user',
      recordId: req.params.id,
      details: `Unlocked user account "${result.username}" (${req.params.id}).`,
      ipAddress: req.ip,
      status: 'SUCCESS',
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PHASE 19: PERFORMANCE & SCALABILITY MONITORING (ADMIN ONLY)
// ============================================================

router.get('/performance/overview', requireRole('ADMIN'), (req, res, next) => {
  try {
    res.status(200).json(performanceService.getOverview());
  } catch (err) {
    next(err);
  }
});

router.get('/performance/metrics', requireRole('ADMIN'), (req, res, next) => {
  try {
    res.status(200).json({ metrics: performanceService.getMetrics() });
  } catch (err) {
    next(err);
  }
});

router.get('/performance/health', requireRole('ADMIN'), (req, res, next) => {
  try {
    res.status(200).json({ health: performanceService.getHealth() });
  } catch (err) {
    next(err);
  }
});

export default router;
