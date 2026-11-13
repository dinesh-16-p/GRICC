import crypto from 'node:crypto';
import db from '../db/database.js';
import alertingService from './alertingService.js';

export const HISTORICAL_RECONSTRUCTION_BOUNDARY_ID = 222;
export const HISTORICAL_RECONSTRUCTION_BOUNDARY_HASH =
  '51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d';

export const SECURITY_EVENT_TYPES = [
  'FAILED_LOGIN',
  'ACCOUNT_LOCKED',
  'UNAUTHORIZED_ACCESS',
  'PRIVILEGE_ESCALATION_ATTEMPT',
  'RATE_LIMIT_EXCEEDED',
  'INVALID_TOKEN',
  'SUSPICIOUS_API_ACTIVITY',
  'SECURITY_CONFIGURATION_CHANGED',
  'SUSPICIOUS_SESSION_ACTIVITY',
  'DATA_ACCESS_VIOLATION',
];

export const SECURITY_EVENT_STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];
const VALID_SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Info'];
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'jwt',
  'secret',
  'authorization',
  'apikey',
  'api_key',
]);

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  err.name = name;
  return err;
}

export function sanitizeMetadata(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) continue;
    clean[k] = typeof v === 'object' && v !== null ? sanitizeMetadata(v) : v;
  }
  return clean;
}

/**
 * Deterministic SHA-256 hash chaining for audit_logs entries.
 */
export function computeAuditEntryHash(prevHash, entry) {
  const canonical = JSON.stringify({
    prevHash: prevHash || 'GENESIS',
    userId: entry.userId != null ? Number(entry.userId) : null,
    username: entry.username ?? null,
    userRole: entry.userRole ?? null,
    action: entry.action,
    resourceType: entry.resourceType,
    recordId: entry.recordId != null ? String(entry.recordId) : null,
    details: entry.details,
    ipAddress: entry.ipAddress ?? null,
    status: entry.status || 'SUCCESS',
    createdAt: entry.createdAt,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function mapSettings(row) {
  if (!row) return null;
  return {
    maxFailedLogins: row.max_failed_logins,
    lockoutDurationMinutes: row.lockout_duration_minutes,
    minPasswordLength: row.min_password_length,
    requireUppercase: Boolean(row.require_uppercase),
    requireLowercase: Boolean(row.require_lowercase),
    requireNumber: Boolean(row.require_number),
    requireSpecialChar: Boolean(row.require_special_char),
    jwtLifetimeHours: row.jwt_lifetime_hours,
    apiRateLimitMax: row.api_rate_limit_max,
    securityEventRetentionDays: row.security_event_retention_days,
    alertOnFailedLogins: row.alert_on_failed_logins,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function mapSecurityEvent(row) {
  let metadata = {};
  try {
    metadata = JSON.parse(row.metadata_json || '{}');
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    eventType: row.event_type,
    severity: row.severity,
    userId: row.user_id,
    ipAddress: row.ip_address,
    endpoint: row.endpoint,
    description: row.description,
    metadata,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  };
}

export const securityService = {
  getSecuritySettings() {
    const row = db.prepare('SELECT * FROM security_settings WHERE id = 1').get();
    return mapSettings(row);
  },

  updateSecuritySettings(patch, actor) {
    const current = this.getSecuritySettings();
    const next = {
      maxFailedLogins:
        patch.maxFailedLogins !== undefined ? Number(patch.maxFailedLogins) : current.maxFailedLogins,
      lockoutDurationMinutes:
        patch.lockoutDurationMinutes !== undefined
          ? Number(patch.lockoutDurationMinutes)
          : current.lockoutDurationMinutes,
      minPasswordLength:
        patch.minPasswordLength !== undefined ? Number(patch.minPasswordLength) : current.minPasswordLength,
      requireUppercase:
        patch.requireUppercase !== undefined ? Boolean(patch.requireUppercase) : current.requireUppercase,
      requireLowercase:
        patch.requireLowercase !== undefined ? Boolean(patch.requireLowercase) : current.requireLowercase,
      requireNumber: patch.requireNumber !== undefined ? Boolean(patch.requireNumber) : current.requireNumber,
      requireSpecialChar:
        patch.requireSpecialChar !== undefined ? Boolean(patch.requireSpecialChar) : current.requireSpecialChar,
      jwtLifetimeHours:
        patch.jwtLifetimeHours !== undefined ? Number(patch.jwtLifetimeHours) : current.jwtLifetimeHours,
      apiRateLimitMax:
        patch.apiRateLimitMax !== undefined ? Number(patch.apiRateLimitMax) : current.apiRateLimitMax,
      securityEventRetentionDays:
        patch.securityEventRetentionDays !== undefined
          ? Number(patch.securityEventRetentionDays)
          : current.securityEventRetentionDays,
      alertOnFailedLogins:
        patch.alertOnFailedLogins !== undefined
          ? Number(patch.alertOnFailedLogins)
          : current.alertOnFailedLogins,
    };

    if (!Number.isInteger(next.maxFailedLogins) || next.maxFailedLogins < 3 || next.maxFailedLogins > 20) {
      throw createHttpError(400, 'maxFailedLogins must be an integer between 3 and 20.');
    }
    if (
      !Number.isInteger(next.lockoutDurationMinutes) ||
      next.lockoutDurationMinutes < 1 ||
      next.lockoutDurationMinutes > 1440
    ) {
      throw createHttpError(400, 'lockoutDurationMinutes must be an integer between 1 and 1440.');
    }
    if (!Number.isInteger(next.minPasswordLength) || next.minPasswordLength < 8 || next.minPasswordLength > 64) {
      throw createHttpError(400, 'minPasswordLength must be an integer between 8 and 64.');
    }
    if (!Number.isInteger(next.jwtLifetimeHours) || next.jwtLifetimeHours < 1 || next.jwtLifetimeHours > 24) {
      throw createHttpError(400, 'jwtLifetimeHours must be an integer between 1 and 24.');
    }
    if (!Number.isInteger(next.apiRateLimitMax) || next.apiRateLimitMax < 60 || next.apiRateLimitMax > 5000) {
      throw createHttpError(400, 'apiRateLimitMax must be an integer between 60 and 5000.');
    }
    if (
      !Number.isInteger(next.securityEventRetentionDays) ||
      next.securityEventRetentionDays < 7 ||
      next.securityEventRetentionDays > 3650
    ) {
      throw createHttpError(400, 'securityEventRetentionDays must be between 7 and 3650.');
    }
    if (!Number.isInteger(next.alertOnFailedLogins) || next.alertOnFailedLogins < 2 || next.alertOnFailedLogins > 20) {
      throw createHttpError(400, 'alertOnFailedLogins must be an integer between 2 and 20.');
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE security_settings
      SET max_failed_logins = ?, lockout_duration_minutes = ?, min_password_length = ?,
          require_uppercase = ?, require_lowercase = ?, require_number = ?, require_special_char = ?,
          jwt_lifetime_hours = ?, api_rate_limit_max = ?, security_event_retention_days = ?,
          alert_on_failed_logins = ?, updated_by = ?, updated_at = ?
      WHERE id = 1
    `).run(
      next.maxFailedLogins,
      next.lockoutDurationMinutes,
      next.minPasswordLength,
      next.requireUppercase ? 1 : 0,
      next.requireLowercase ? 1 : 0,
      next.requireNumber ? 1 : 0,
      next.requireSpecialChar ? 1 : 0,
      next.jwtLifetimeHours,
      next.apiRateLimitMax,
      next.securityEventRetentionDays,
      next.alertOnFailedLogins,
      actor?.username || 'ADMIN',
      nowIso
    );

    this.recordSecurityEvent({
      eventType: 'SECURITY_CONFIGURATION_CHANGED',
      severity: 'Medium',
      userId: actor?.id || null,
      endpoint: '/api/security/settings',
      description: `Security policy updated by ${actor?.username || 'ADMIN'}.`,
      metadata: { maxFailedLogins: next.maxFailedLogins, jwtLifetimeHours: next.jwtLifetimeHours },
      createAlert: true,
    });

    return this.getSecuritySettings();
  },

  validatePasswordPolicy(password) {
    const settings = this.getSecuritySettings() || {
      minPasswordLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecialChar: true,
    };

    if (typeof password !== 'string' || password.length < settings.minPasswordLength) {
      throw createHttpError(
        400,
        `Password must be at least ${settings.minPasswordLength} characters long.`
      );
    }
    if (settings.requireUppercase && !/[A-Z]/.test(password)) {
      throw createHttpError(400, 'Password must include at least one uppercase letter.');
    }
    if (settings.requireLowercase && !/[a-z]/.test(password)) {
      throw createHttpError(400, 'Password must include at least one lowercase letter.');
    }
    if (settings.requireNumber && !/[0-9]/.test(password)) {
      throw createHttpError(400, 'Password must include at least one numeric digit.');
    }
    if (settings.requireSpecialChar && !/[^A-Za-z0-9]/.test(password)) {
      throw createHttpError(400, 'Password must include at least one special character.');
    }
    return true;
  },

  recordSecurityEvent({
    eventType,
    severity = 'Medium',
    userId = null,
    ipAddress = null,
    endpoint = null,
    description,
    metadata = {},
    createAlert = false,
  }) {
    if (!SECURITY_EVENT_TYPES.includes(eventType)) return null;
    const safeSeverity = VALID_SEVERITIES.includes(severity) ? severity : 'Medium';
    const id = `SEC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const nowIso = new Date().toISOString();
    const cleanMeta = sanitizeMetadata(metadata);

    try {
      db.prepare(`
        INSERT INTO security_events (
          id, event_type, severity, user_id, ip_address, endpoint, description, metadata_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
      `).run(
        id,
        eventType,
        safeSeverity,
        userId,
        ipAddress,
        endpoint,
        String(description || eventType).slice(0, 500),
        JSON.stringify(cleanMeta),
        nowIso
      );

      const adminIds = db
        .prepare("SELECT id FROM users WHERE role = 'ADMIN' AND is_active = 1")
        .all()
        .map((r) => r.id);

      if (createAlert && adminIds.length > 0) {
        alertingService.createNotification({
          dedupKey: `sec-${eventType}-${userId || ipAddress || 'sys'}-${nowIso.slice(0, 16)}`,
          type: 'ALERT_UPDATE',
          title: `[SECURITY] ${eventType}`,
          message: String(description || eventType),
          severity: safeSeverity,
          entityType: 'security_event',
          entityId: id,
          userIds: adminIds,
        });
      }

      return mapSecurityEvent(db.prepare('SELECT * FROM security_events WHERE id = ?').get(id));
    } catch {
      return null;
    }
  },

  listSecurityEvents({
    eventType = 'ALL',
    severity = 'ALL',
    userId = 'ALL',
    status = 'ALL',
    startDate = null,
    endDate = null,
    limit = 50,
    offset = 0,
  } = {}) {
    const conditions = [];
    const params = [];

    if (eventType && eventType !== 'ALL') {
      conditions.push('event_type = ?');
      params.push(eventType);
    }
    if (severity && severity !== 'ALL') {
      conditions.push('severity = ?');
      params.push(severity);
    }
    if (userId && userId !== 'ALL') {
      conditions.push('user_id = ?');
      params.push(userId);
    }
    if (status && status !== 'ALL') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (startDate) {
      conditions.push('created_at >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('created_at <= ?');
      params.push(endDate);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const total = db.prepare(`SELECT COUNT(*) AS count FROM security_events ${where}`).get(...params).count;
    const events = db
      .prepare(`SELECT * FROM security_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, safeLimit, safeOffset)
      .map(mapSecurityEvent);

    return { total, limit: safeLimit, offset: safeOffset, events };
  },

  updateSecurityEventStatus(id, status, actor) {
    if (!SECURITY_EVENT_STATUSES.includes(status)) {
      throw createHttpError(400, `Invalid status. Must be one of: ${SECURITY_EVENT_STATUSES.join(', ')}`);
    }
    const existing = db.prepare('SELECT * FROM security_events WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `Security event ${id} not found.`, 'NotFound');
    }

    const isResolved = status === 'RESOLVED' || status === 'DISMISSED';
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE security_events
      SET status = ?, resolved_at = ?, resolved_by = ?
      WHERE id = ?
    `).run(status, isResolved ? nowIso : null, isResolved ? actor?.username || 'ADMIN' : null, id);

    return mapSecurityEvent(db.prepare('SELECT * FROM security_events WHERE id = ?').get(id));
  },

  verifyAuditLogIntegrity() {
    const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id ASC').all();
    let lastHash = null;
    let hashedCount = 0;
    let legacyUnchainedCount = 0;
    const tamperedEntries = [];

    for (const row of rows) {
      if (!row.entry_hash) {
        legacyUnchainedCount += 1;
        continue;
      }
      hashedCount += 1;
      const expectedPrev = lastHash || 'GENESIS';
      const actualPrev = row.prev_hash || 'GENESIS';
      const recomputed = computeAuditEntryHash(expectedPrev, {
        userId: row.user_id,
        username: row.username,
        userRole: row.user_role,
        action: row.action,
        resourceType: row.resource_type,
        recordId: row.record_id,
        details: row.details,
        ipAddress: row.ip_address,
        status: row.status,
        createdAt: row.created_at,
      });

      if (actualPrev !== expectedPrev || recomputed !== row.entry_hash) {
        tamperedEntries.push({
          id: row.id,
          action: row.action,
          createdAt: row.created_at,
          reason: actualPrev !== expectedPrev ? 'PREV_HASH_MISMATCH' : 'ENTRY_HASH_MISMATCH',
        });
      }
      lastHash = row.entry_hash;
    }

    const isReconciled = legacyUnchainedCount === 0 && tamperedEntries.length === 0;
    const legacyStatus = legacyUnchainedCount > 0
      ? 'MIGRATED_LEGACY_PRESERVED'
      : (tamperedEntries.length === 0 ? 'VERIFIED_HASHED' : 'LEGACY_UNVERIFIED');

    const historicalReconstructedCount = rows.filter((r) => r.id <= HISTORICAL_RECONSTRUCTION_BOUNDARY_ID).length;
    const liveChainCount = rows.filter((r) => r.id > HISTORICAL_RECONSTRUCTION_BOUNDARY_ID).length;
    const boundaryRow = rows.find((r) => r.id === HISTORICAL_RECONSTRUCTION_BOUNDARY_ID);
    const boundaryIntact = boundaryRow
      ? boundaryRow.entry_hash === HISTORICAL_RECONSTRUCTION_BOUNDARY_HASH
      : null;

    return {
      valid: tamperedEntries.length === 0,
      status: tamperedEntries.length === 0 ? 'VERIFIED_HASHED' : 'LEGACY_UNVERIFIED',
      legacyStatus,
      totalChecked: rows.length,
      hashedCount,
      legacyUnchainedCount,
      boundary: {
        boundaryId: HISTORICAL_RECONSTRUCTION_BOUNDARY_ID,
        boundaryHash: HISTORICAL_RECONSTRUCTION_BOUNDARY_HASH,
        historicalReconstructedCount,
        liveChainCount,
        boundaryIntact,
        transparencyNotice:
          'Hashes for historical records 1-222 were canonically reconstructed in Phase 22 to establish mathematical continuity. Records > 222 are created at runtime with original creation-time cryptographic chaining.',
      },
      tamperedCount: tamperedEntries.length,
      tamperedEntries: tamperedEntries.slice(0, 20),
      verifiedAt: new Date().toISOString(),
    };
  },

  unlockUserAccount(userId, actor) {
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw createHttpError(404, `User ${userId} not found.`, 'NotFound');
    }
    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      userId
    );
    this.recordSecurityEvent({
      eventType: 'SECURITY_CONFIGURATION_CHANGED',
      severity: 'Info',
      userId,
      endpoint: `/api/security/users/${userId}/unlock`,
      description: `Account "${user.username}" unlocked by ${actor?.username || 'ADMIN'}.`,
    });
    return { unlocked: true, userId, username: user.username };
  },

  cleanupExpiredTokens() {
    const res = db.prepare("DELETE FROM revoked_tokens WHERE expires_at < datetime('now')").run();
    return res.changes;
  },

  getSecurityOverview() {
    const allEvents = db.prepare('SELECT * FROM security_events ORDER BY created_at DESC LIMIT 500').all();
    const nowIso = new Date().toISOString();
    const lockedAccounts = db
      .prepare('SELECT id, username, full_name, role, failed_login_attempts, locked_until FROM users WHERE locked_until IS NOT NULL AND locked_until > ?')
      .all(nowIso)
      .map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        role: u.role,
        failedLoginAttempts: u.failed_login_attempts,
        lockedUntil: u.locked_until,
      }));

    const severityDist = VALID_SEVERITIES.map((sev) => ({
      severity: sev,
      count: allEvents.filter((e) => e.severity === sev).length,
    }));

    const integrity = this.verifyAuditLogIntegrity();
    const settings = this.getSecuritySettings();

    return {
      generatedAt: nowIso,
      summary: {
        openEvents: allEvents.filter((e) => e.status === 'OPEN' || e.status === 'INVESTIGATING').length,
        totalEvents: allEvents.length,
        failedLogins: allEvents.filter((e) => e.event_type === 'FAILED_LOGIN').length,
        unauthorizedAttempts: allEvents.filter(
          (e) => e.event_type === 'UNAUTHORIZED_ACCESS' || e.event_type === 'PRIVILEGE_ESCALATION_ATTEMPT'
        ).length,
        lockedAccountsCount: lockedAccounts.length,
        auditIntegrityValid: integrity.valid,
      },
      severityDistribution: severityDist,
      lockedAccounts,
      auditIntegrity: integrity,
      settings,
      configurationStatus: {
        jwtSecretConfigured: Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16),
        bcryptEnabled: true,
        helmetHeadersEnabled: true,
        rateLimitingEnabled: true,
      },
      recentEvents: allEvents.slice(0, 15).map(mapSecurityEvent),
    };
  },
};

export default securityService;

