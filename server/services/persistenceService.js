import db from '../db/database.js';

const VALID_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const VALID_INCIDENT_STATUSES = ['Open', 'Investigating', 'Contained', 'Resolved'];
const VALID_ALERT_STATUSES = ['active', 'acknowledged', 'resolved'];

function formatUtcNow() {
  const now = new Date();
  return `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)} UTC`;
}

function mapIncidentRow(row) {
  if (!row) return null;
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
    createdAt: row.created_at,
  };
}

function mapAlertRow(row) {
  if (!row) return null;
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

function mapActivityRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    description: row.description,
    severity: row.severity,
    actor: row.actor,
    createdAt: row.created_at,
  };
}

export const persistenceService = {
  // ==========================================
  // HEALTH
  // ==========================================
  checkDbHealth() {
    try {
      const row = db.prepare('SELECT 1 AS ok').get();
      return row?.ok === 1 ? 'CONNECTED' : 'DEGRADED';
    } catch (err) {
      return 'DISCONNECTED';
    }
  },

  // ==========================================
  // INCIDENTS
  // ==========================================
  getAllIncidents({ severity, status, country, search } = {}) {
    const conditions = [];
    const params = [];

    if (severity && severity !== 'ALL') {
      conditions.push('severity = ?');
      params.push(severity);
    }
    if (status && status !== 'ALL') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (country && country !== 'ALL') {
      conditions.push('country = ?');
      params.push(country);
    }
    if (search && search.trim()) {
      const pattern = `%${search.trim()}%`;
      conditions.push('(id LIKE ? OR title LIKE ? OR country LIKE ? OR location LIKE ? OR category LIKE ?)');
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM incidents ${whereClause} ORDER BY created_at DESC, date_reported DESC`)
      .all(...params);

    return rows.map(mapIncidentRow);
  },

  getIncidentById(id) {
    const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
    if (!row) return null;

    const logs = db
      .prepare(
        `SELECT * FROM activity_logs
         WHERE entity_type = 'incident' AND entity_id = ?
         ORDER BY id DESC`
      )
      .all(id)
      .map(mapActivityRow);

    return {
      ...mapIncidentRow(row),
      activityLogs: logs,
    };
  },

  createIncident(payload) {
    const {
      id,
      title,
      country,
      location,
      category,
      severity,
      status = 'Open',
      assignedTeam,
      description,
      latitude = null,
      longitude = null,
    } = payload;

    if (!title?.trim() || !country?.trim() || !location?.trim() || !category?.trim() || !assignedTeam?.trim() || !description?.trim()) {
      const err = new Error('Missing required incident fields (title, country, location, category, assignedTeam, description).');
      err.status = 400;
      throw err;
    }

    if (!VALID_SEVERITIES.includes(severity)) {
      const err = new Error(`Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
      err.status = 400;
      throw err;
    }

    if (!VALID_INCIDENT_STATUSES.includes(status)) {
      const err = new Error(`Invalid status. Must be one of: ${VALID_INCIDENT_STATUSES.join(', ')}`);
      err.status = 400;
      throw err;
    }

    let lat = latitude !== null && latitude !== '' && latitude !== undefined ? Number(latitude) : null;
    let lng = longitude !== null && longitude !== '' && longitude !== undefined ? Number(longitude) : null;

    if (lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) {
      const err = new Error('Latitude must be a valid number between -90 and 90.');
      err.status = 400;
      throw err;
    }
    if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180)) {
      const err = new Error('Longitude must be a valid number between -180 and 180.');
      err.status = 400;
      throw err;
    }

    const nowUtc = formatUtcNow();
    const incidentId =
      id?.trim() ||
      `INC-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const insertTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO incidents (
          id, title, country, location, category, severity, status,
          assigned_team, description, latitude, longitude, date_reported, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        incidentId,
        title.trim(),
        country.trim(),
        location.trim(),
        category.trim(),
        severity,
        status,
        assignedTeam.trim(),
        description.trim(),
        lat,
        lng,
        nowUtc,
        nowUtc
      );

      db.prepare(`
        INSERT INTO activity_logs (entity_type, entity_id, action, description, severity, actor)
        VALUES ('incident', ?, 'CREATED', ?, ?, 'Command Analyst')
      `).run(incidentId, `Incident ${incidentId} registered: "${title.trim()}" (${country.trim()})`, severity);

      return db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
    });

    return mapIncidentRow(insertTx());
  },

  updateIncident(id, updates) {
    const existing = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error(`Incident ${id} not found.`);
      err.status = 404;
      throw err;
    }

    const nextTitle = updates.title !== undefined ? updates.title.trim() : existing.title;
    const nextCountry = updates.country !== undefined ? updates.country.trim() : existing.country;
    const nextLocation = updates.location !== undefined ? updates.location.trim() : existing.location;
    const nextCategory = updates.category !== undefined ? updates.category.trim() : existing.category;
    const nextSeverity = updates.severity !== undefined ? updates.severity : existing.severity;
    const nextStatus = updates.status !== undefined ? updates.status : existing.status;
    const nextTeam = updates.assignedTeam !== undefined ? updates.assignedTeam.trim() : existing.assigned_team;
    const nextDesc = updates.description !== undefined ? updates.description.trim() : existing.description;

    let nextLat = existing.latitude;
    let nextLng = existing.longitude;
    if (updates.latitude !== undefined) {
      nextLat = updates.latitude === null || updates.latitude === '' ? null : Number(updates.latitude);
      if (nextLat !== null && (isNaN(nextLat) || nextLat < -90 || nextLat > 90)) {
        const err = new Error('Latitude must be between -90 and 90.');
        err.status = 400;
        throw err;
      }
    }
    if (updates.longitude !== undefined) {
      nextLng = updates.longitude === null || updates.longitude === '' ? null : Number(updates.longitude);
      if (nextLng !== null && (isNaN(nextLng) || nextLng < -180 || nextLng > 180)) {
        const err = new Error('Longitude must be between -180 and 180.');
        err.status = 400;
        throw err;
      }
    }

    if (!VALID_SEVERITIES.includes(nextSeverity)) {
      const err = new Error(`Invalid severity: ${nextSeverity}`);
      err.status = 400;
      throw err;
    }
    if (!VALID_INCIDENT_STATUSES.includes(nextStatus)) {
      const err = new Error(`Invalid status: ${nextStatus}`);
      err.status = 400;
      throw err;
    }

    const nowUtc = formatUtcNow();

    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE incidents
        SET title = ?, country = ?, location = ?, category = ?, severity = ?,
            status = ?, assigned_team = ?, description = ?, latitude = ?, longitude = ?,
            last_updated = ?
        WHERE id = ?
      `).run(
        nextTitle,
        nextCountry,
        nextLocation,
        nextCategory,
        nextSeverity,
        nextStatus,
        nextTeam,
        nextDesc,
        nextLat,
        nextLng,
        nowUtc,
        id
      );

      // Build descriptive activity log
      const changes = [];
      let actionType = 'UPDATED';
      if (nextStatus !== existing.status) {
        changes.push(`Status: ${existing.status} -> ${nextStatus}`);
        actionType = `STATUS_${nextStatus.toUpperCase()}`;
      }
      if (nextTeam !== existing.assigned_team) {
        changes.push(`Team: ${nextTeam}`);
      }
      if (nextTitle !== existing.title || nextSeverity !== existing.severity || nextDesc !== existing.description) {
        changes.push('Details modified');
      }

      const logMessage =
        changes.length > 0
          ? `Incident ${id} updated (${changes.join('; ')})`
          : `Incident ${id} metadata saved`;

      db.prepare(`
        INSERT INTO activity_logs (entity_type, entity_id, action, description, severity, actor)
        VALUES ('incident', ?, ?, ?, ?, 'Command Analyst')
      `).run(id, actionType, logMessage, nextSeverity);

      return db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
    });

    return mapIncidentRow(updateTx());
  },

  deleteIncident(id) {
    const existing = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error(`Incident ${id} not found.`);
      err.status = 404;
      throw err;
    }

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM incidents WHERE id = ?').run(id);
      db.prepare(`
        INSERT INTO activity_logs (entity_type, entity_id, action, description, severity, actor)
        VALUES ('incident', ?, 'DELETED', ?, ?, 'Command Analyst')
      `).run(id, `Incident ${id} ("${existing.title}") removed from register.`, existing.severity);
    });

    deleteTx();
    return { deleted: true, id };
  },

  // ==========================================
  // ALERTS
  // ==========================================
  getAllAlerts() {
    const rows = db
      .prepare('SELECT * FROM alerts ORDER BY is_live DESC, updated_at DESC, timestamp DESC')
      .all();
    return rows.map(mapAlertRow);
  },

  syncLiveAlerts(incomingAlerts = []) {
    if (!Array.isArray(incomingAlerts) || incomingAlerts.length === 0) {
      return this.getAllAlerts();
    }

    const syncTx = db.transaction((items) => {
      const insertOrIgnore = db.prepare(`
        INSERT OR IGNORE INTO alerts (
          id, title, country, region, category, severity, timestamp, summary, source, url, status, is_live
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `);

      for (const a of items) {
        const sev = VALID_SEVERITIES.includes(a.severity) ? a.severity : 'Medium';
        insertOrIgnore.run(
          a.id,
          a.title || 'Intelligence Advisory',
          a.country || 'International',
          a.region || 'Global',
          a.category || 'Global Affairs',
          sev,
          a.timestamp || formatUtcNow(),
          a.summary || a.title || 'Verified intelligence bulletin.',
          a.source || 'External Intelligence Feed',
          a.url || null,
          a.isLive ? 1 : 0
        );
      }
    });

    syncTx(incomingAlerts);
    return this.getAllAlerts();
  },

  updateAlertStatus(id, status) {
    if (!VALID_ALERT_STATUSES.includes(status)) {
      const err = new Error(`Invalid alert status. Must be one of: ${VALID_ALERT_STATUSES.join(', ')}`);
      err.status = 400;
      throw err;
    }

    const existing = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error(`Alert ${id} not found.`);
      err.status = 404;
      throw err;
    }

    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE alerts SET status = ?, updated_at = datetime('now') WHERE id = ?
      `).run(status, id);

      const actionLabel =
        status === 'acknowledged'
          ? 'ACKNOWLEDGED'
          : status === 'resolved'
          ? 'RESOLVED'
          : 'REOPENED';

      db.prepare(`
        INSERT INTO activity_logs (entity_type, entity_id, action, description, severity, actor)
        VALUES ('alert', ?, ?, ?, ?, 'Command Analyst')
      `).run(id, actionLabel, `Alert ${id} ("${existing.title}") marked as ${status}.`, existing.severity);

      return db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    });

    return mapAlertRow(updateTx());
  },

  // ==========================================
  // ACTIVITY LOGS
  // ==========================================
  getActivities({ limit = 50, entityType, entityId } = {}) {
    const conditions = [];
    const params = [];

    if (entityType && entityType !== 'ALL') {
      conditions.push('entity_type = ?');
      params.push(entityType);
    }
    if (entityId) {
      conditions.push('entity_id = ?');
      params.push(entityId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    params.push(safeLimit);

    const rows = db
      .prepare(`SELECT * FROM activity_logs ${whereClause} ORDER BY id DESC LIMIT ?`)
      .all(...params);

    return rows.map(mapActivityRow);
  },

  // ==========================================
  // DASHBOARD STATISTICS (SQL AGGREGATIONS)
  // ==========================================
  getDashboardStats() {
    const incidentStats = db
      .prepare(`
        SELECT
          COUNT(*) AS totalIncidents,
          SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) AS openIncidents,
          SUM(CASE WHEN status = 'Investigating' THEN 1 ELSE 0 END) AS investigatingIncidents,
          SUM(CASE WHEN status = 'Contained' THEN 1 ELSE 0 END) AS containedIncidents,
          SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) AS resolvedIncidents,
          SUM(CASE WHEN severity = 'Critical' THEN 1 ELSE 0 END) AS criticalIncidents,
          SUM(CASE WHEN severity IN ('Critical', 'High') AND status != 'Resolved' THEN 1 ELSE 0 END) AS activeHighRiskIncidents,
          COUNT(DISTINCT CASE WHEN severity IN ('Critical', 'High') AND status != 'Resolved' THEN country END) AS highRiskCountries,
          COUNT(DISTINCT country) AS incidentCountries
        FROM incidents
      `)
      .get();

    const alertStats = db
      .prepare(`
        SELECT
          COUNT(*) AS totalAlerts,
          SUM(CASE WHEN status != 'resolved' THEN 1 ELSE 0 END) AS activeAlerts,
          SUM(CASE WHEN severity = 'Critical' AND status != 'resolved' THEN 1 ELSE 0 END) AS criticalAlerts,
          COUNT(DISTINCT country) AS alertCountries
        FROM alerts
      `)
      .get();

    const distinctCountriesRow = db
      .prepare(`
        SELECT COUNT(*) AS count FROM (
          SELECT country FROM incidents
          UNION
          SELECT country FROM alerts WHERE country NOT IN ('Global', 'International')
        )
      `)
      .get();

    return {
      totalIncidents: incidentStats.totalIncidents || 0,
      openIncidents: incidentStats.openIncidents || 0,
      investigatingIncidents: incidentStats.investigatingIncidents || 0,
      containedIncidents: incidentStats.containedIncidents || 0,
      resolvedIncidents: incidentStats.resolvedIncidents || 0,
      criticalIncidents: incidentStats.criticalIncidents || 0,
      highRiskAreas: incidentStats.activeHighRiskIncidents || 0,
      highRiskCountries: incidentStats.highRiskCountries || 0,
      monitoredCountries: distinctCountriesRow?.count || 0,
      totalAlerts: alertStats.totalAlerts || 0,
      activeAlerts: alertStats.activeAlerts || 0,
      criticalAlerts: alertStats.criticalAlerts || 0,
    };
  },
};

export default persistenceService;

