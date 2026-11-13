import db from '../db/database.js';
import { broadcastEvent } from './realtimeService.js';

const SEVERITY_RANK = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
  Info: 0,
};

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

function mapNotificationRow(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    severity: row.severity,
    country: row.country,
    entityType: row.entity_type,
    entityId: row.entity_id,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

function mapWatchlistRow(row) {
  return {
    id: row.id,
    country: row.country,
    minSeverity: row.min_severity,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapRuleRow(row) {
  return {
    id: row.id,
    name: row.name,
    ruleType: row.rule_type,
    threshold: row.threshold,
    enabled: Boolean(row.enabled),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export const alertingService = {
  /**
   * Persist a deduplicated notification and broadcast it via SSE.
   */
  createNotification({
    dedupKey = null,
    type,
    title,
    message,
    severity = 'Info',
    country = null,
    entityType = null,
    entityId = null,
    userIds = null,
  }) {
    const info = db
      .prepare(`
        INSERT OR IGNORE INTO notifications (
          dedup_key, type, title, message, severity, country, entity_type, entity_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        dedupKey,
        type,
        title,
        message,
        severity,
        country,
        entityType,
        entityId,
        new Date().toISOString()
      );

    // If duplicate dedupKey was ignored, do not re-broadcast
    if (info.changes === 0) {
      return null;
    }

    const row = db
      .prepare('SELECT *, 0 AS is_read FROM notifications WHERE id = ?')
      .get(info.lastInsertRowid);
    const notification = mapNotificationRow(row);

    broadcastEvent('notification', { notification }, userIds ? { userIds } : {});
    return notification;
  },

  getNotificationsForUser(userId, { limit = 50, country, severity, unreadOnly } = {}) {
    const conditions = [];
    const params = [userId];

    if (country && country !== 'ALL') {
      conditions.push('n.country = ?');
      params.push(country);
    }
    if (severity && severity !== 'ALL') {
      conditions.push('n.severity = ?');
      params.push(severity);
    }
    if (unreadOnly === 'true' || unreadOnly === true) {
      conditions.push('nr.notification_id IS NULL');
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

    const rows = db
      .prepare(`
        SELECT n.*,
               CASE WHEN nr.notification_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
        FROM notifications n
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.id AND nr.user_id = ?
        ${where}
        ORDER BY n.id DESC
        LIMIT ?
      `)
      .all(...params, safeLimit);

    const unreadCount = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM notifications n
        LEFT JOIN notification_reads nr
          ON nr.notification_id = n.id AND nr.user_id = ?
        WHERE nr.notification_id IS NULL
      `)
      .get(userId).count;

    return {
      notifications: rows.map(mapNotificationRow),
      unreadCount,
    };
  },

  markAsRead(notificationId, userId) {
    const exists = db.prepare('SELECT id FROM notifications WHERE id = ?').get(notificationId);
    if (!exists) {
      throw createHttpError(404, `Notification ${notificationId} not found.`, 'NotFound');
    }
    db.prepare(`
      INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
      VALUES (?, ?)
    `).run(notificationId, userId);
    return { notificationId: Number(notificationId), isRead: true };
  },

  markAllAsRead(userId) {
    const info = db
      .prepare(`
        INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
        SELECT id, ? FROM notifications
      `)
      .run(userId);
    return { markedCount: info.changes };
  },

  // =========================================================
  // ESCALATION & WATCHLIST EVALUATION
  // =========================================================

  getEscalationRules() {
    return db.prepare('SELECT * FROM escalation_rules ORDER BY id ASC').all().map(mapRuleRow);
  },

  updateEscalationRule(id, { enabled, threshold }, actor) {
    const existing = db.prepare('SELECT * FROM escalation_rules WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `Escalation rule ${id} not found.`, 'NotFound');
    }

    const nextEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;
    const nextThreshold =
      threshold !== undefined ? Math.max(1, parseInt(threshold, 10) || existing.threshold) : existing.threshold;

    db.prepare(`
      UPDATE escalation_rules
      SET enabled = ?, threshold = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `).run(nextEnabled, nextThreshold, actor?.username || 'ADMIN', new Date().toISOString(), id);

    return mapRuleRow(db.prepare('SELECT * FROM escalation_rules WHERE id = ?').get(id));
  },

  evaluateIncident(incident, isNew = false) {
    const createdNotifications = [];

    // 1. Standard incident creation/update notification
    const updateNotif = this.createNotification({
      dedupKey: `inc-${isNew ? 'new' : 'upd'}-${incident.id}-${incident.status}-${incident.lastUpdated}`,
      type: 'INCIDENT_UPDATE',
      title: isNew ? `New Incident: ${incident.id}` : `Incident Updated: ${incident.id}`,
      message: `${incident.title} (${incident.country}) — Status: ${incident.status}, Severity: ${incident.severity}`,
      severity: incident.severity,
      country: incident.country,
      entityType: 'incident',
      entityId: incident.id,
    });
    if (updateNotif) createdNotifications.push(updateNotif);

    // Resolved incidents stop generating active escalation or watchlist warnings
    if (incident.status === 'Resolved') {
      return createdNotifications;
    }

    const rules = this.getEscalationRules();
    const critRule = rules.find((r) => r.ruleType === 'CRITICAL_INCIDENT' && r.enabled);
    const clusterRule = rules.find((r) => r.ruleType === 'COUNTRY_CLUSTER' && r.enabled);

    // 2. Critical incident immediate escalation
    if (critRule && incident.severity === 'Critical') {
      const n = this.createNotification({
        dedupKey: `esc-crit-inc-${incident.id}-${incident.lastUpdated}`,
        type: 'ESCALATION',
        title: `CRITICAL ESCALATION: ${incident.id}`,
        message: `Immediate command attention required for "${incident.title}" in ${incident.location}, ${incident.country}.`,
        severity: 'Critical',
        country: incident.country,
        entityType: 'incident',
        entityId: incident.id,
      });
      if (n) createdNotifications.push(n);
    }

    // 3. Multi-incident country cluster escalation (based strictly on validated active DB count)
    if (clusterRule && incident.country) {
      const activeInCountry = db
        .prepare(
          `SELECT COUNT(*) AS count FROM incidents WHERE country = ? AND status != 'Resolved'`
        )
        .get(incident.country).count;

      if (activeInCountry >= clusterRule.threshold) {
        const n = this.createNotification({
          dedupKey: `esc-cluster-${incident.country}-${activeInCountry}`,
          type: 'COUNTRY_WARNING',
          title: `Elevated Incident Volume: ${incident.country}`,
          message: `${activeInCountry} active (unresolved) incidents recorded in ${incident.country} (threshold: ${clusterRule.threshold}).`,
          severity: activeInCountry >= clusterRule.threshold + 1 ? 'Critical' : 'High',
          country: incident.country,
          entityType: 'country',
          entityId: incident.country,
        });
        if (n) createdNotifications.push(n);
      }
    }

    // 4. Country watchlist check
    const watch = db
      .prepare('SELECT * FROM watchlists WHERE LOWER(country) = LOWER(?)')
      .get(incident.country || '');
    if (watch && (SEVERITY_RANK[incident.severity] || 0) >= (SEVERITY_RANK[watch.min_severity] || 0)) {
      const n = this.createNotification({
        dedupKey: `watch-inc-${watch.country}-${incident.id}-${incident.status}`,
        type: 'COUNTRY_WARNING',
        title: `Watchlist Alert: ${watch.country}`,
        message: `Monitored country incident ${incident.id} (${incident.severity}): "${incident.title}".`,
        severity: incident.severity,
        country: watch.country,
        entityType: 'incident',
        entityId: incident.id,
      });
      if (n) createdNotifications.push(n);
    }

    return createdNotifications;
  },

  evaluateAlertUpdate(alert) {
    const n = this.createNotification({
      dedupKey: `alt-upd-${alert.id}-${alert.status}-${alert.updatedAt || Date.now()}`,
      type: 'ALERT_UPDATE',
      title: `Alert ${alert.status.toUpperCase()}: ${alert.id}`,
      message: `"${alert.title}" (${alert.country}) marked as ${alert.status}.`,
      severity: alert.status === 'resolved' ? 'Info' : alert.severity,
      country: alert.country,
      entityType: 'alert',
      entityId: alert.id,
    });
    return n ? [n] : [];
  },

  evaluateSyncedAlerts(alerts = []) {
    const created = [];
    const watchRows = db.prepare('SELECT * FROM watchlists').all();
    const watchMap = new Map(watchRows.map((w) => [w.country.toLowerCase(), w]));

    for (const alert of alerts) {
      if (alert.status === 'resolved') continue;

      if (alert.severity === 'Critical' && alert.status === 'active') {
        const n = this.createNotification({
          dedupKey: `alt-crit-${alert.id}`,
          type: 'CRITICAL_THREAT',
          title: `Critical Threat Alert: ${alert.country}`,
          message: alert.title,
          severity: 'Critical',
          country: alert.country,
          entityType: 'alert',
          entityId: alert.id,
        });
        if (n) created.push(n);
      }

      const watch = watchMap.get((alert.country || '').toLowerCase());
      if (watch && (SEVERITY_RANK[alert.severity] || 0) >= (SEVERITY_RANK[watch.min_severity] || 0)) {
        const n = this.createNotification({
          dedupKey: `watch-alt-${watch.country}-${alert.id}`,
          type: 'COUNTRY_WARNING',
          title: `Watchlist Intelligence: ${watch.country}`,
          message: `[${alert.severity}] ${alert.title}`,
          severity: alert.severity,
          country: watch.country,
          entityType: 'alert',
          entityId: alert.id,
        });
        if (n) created.push(n);
      }
    }
    return created;
  },

  evaluateUnacknowledgedAlerts() {
    const rule = db
      .prepare(`SELECT * FROM escalation_rules WHERE rule_type = 'UNACK_CRITICAL_ALERT' AND enabled = 1`)
      .get();
    if (!rule) return [];

    const cutoffMs = rule.threshold * 60 * 1000;
    const now = Date.now();
    const activeCriticalAlerts = db
      .prepare(`SELECT * FROM alerts WHERE severity = 'Critical' AND status = 'active'`)
      .all();

    const escalated = [];
    for (const alert of activeCriticalAlerts) {
      const updatedMs = Date.parse(alert.updated_at || alert.timestamp);
      if (!Number.isNaN(updatedMs) && now - updatedMs >= cutoffMs) {
        const n = this.createNotification({
          dedupKey: `esc-unack-alert-${alert.id}`,
          type: 'ESCALATION',
          title: `Unacknowledged Critical Alert: ${alert.id}`,
          message: `Critical alert "${alert.title}" (${alert.country}) remains unacknowledged beyond ${rule.threshold}m threshold.`,
          severity: 'Critical',
          country: alert.country,
          entityType: 'alert',
          entityId: alert.id,
        });
        if (n) escalated.push(n);
      }
    }
    return escalated;
  },

  // =========================================================
  // COUNTRY WATCHLISTS
  // =========================================================

  getWatchlists() {
    return db
      .prepare('SELECT * FROM watchlists ORDER BY country ASC')
      .all()
      .map(mapWatchlistRow);
  },

  addWatchlistCountry({ country, minSeverity = 'Medium', notes = '' }, actor) {
    if (!country || !country.trim()) {
      throw createHttpError(400, 'Country name is required.');
    }
    if (!['Critical', 'High', 'Medium', 'Low'].includes(minSeverity)) {
      throw createHttpError(400, 'Invalid minSeverity.');
    }

    const cleanCountry = country.trim();
    const existing = db
      .prepare('SELECT id FROM watchlists WHERE LOWER(country) = LOWER(?)')
      .get(cleanCountry);
    if (existing) {
      throw createHttpError(409, `${cleanCountry} is already on the watchlist.`, 'ConflictError');
    }

    const info = db
      .prepare(`
        INSERT INTO watchlists (country, min_severity, notes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(cleanCountry, minSeverity, notes.trim(), actor?.id || null, new Date().toISOString());

    return mapWatchlistRow(
      db.prepare('SELECT * FROM watchlists WHERE id = ?').get(info.lastInsertRowid)
    );
  },

  removeWatchlistCountry(id) {
    const existing = db.prepare('SELECT * FROM watchlists WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `Watchlist entry ${id} not found.`, 'NotFound');
    }
    db.prepare('DELETE FROM watchlists WHERE id = ?').run(id);
    return { deleted: true, id: Number(id), country: existing.country };
  },

  // =========================================================
  // USER NOTIFICATION PREFERENCES
  // =========================================================

  getUserPreferences(userId) {
    const row = db
      .prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
      .get(userId);
    if (!row) {
      return {
        userId,
        browserNotifications: false,
        minSeverity: 'Medium',
        soundEnabled: false,
      };
    }
    return {
      userId: row.user_id,
      browserNotifications: Boolean(row.browser_notifications),
      minSeverity: row.min_severity,
      soundEnabled: Boolean(row.sound_enabled),
      updatedAt: row.updated_at,
    };
  },

  updateUserPreferences(userId, { browserNotifications, minSeverity, soundEnabled }) {
    const current = this.getUserPreferences(userId);
    const nextBrowser =
      browserNotifications !== undefined ? (browserNotifications ? 1 : 0) : current.browserNotifications ? 1 : 0;
    const nextSeverity = minSeverity || current.minSeverity;
    const nextSound =
      soundEnabled !== undefined ? (soundEnabled ? 1 : 0) : current.soundEnabled ? 1 : 0;

    if (!['Critical', 'High', 'Medium', 'Low'].includes(nextSeverity)) {
      throw createHttpError(400, 'Invalid minSeverity preference.');
    }

    db.prepare(`
      INSERT INTO notification_preferences (user_id, browser_notifications, min_severity, sound_enabled, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        browser_notifications = excluded.browser_notifications,
        min_severity = excluded.min_severity,
        sound_enabled = excluded.sound_enabled,
        updated_at = excluded.updated_at
    `).run(userId, nextBrowser, nextSeverity, nextSound, new Date().toISOString());

    return this.getUserPreferences(userId);
  },
};

export default alertingService;

