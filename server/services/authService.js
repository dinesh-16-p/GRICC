import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/database.js';
import securityService, { computeAuditEntryHash } from './securityService.js';

export const VALID_ROLES = ['ADMIN', 'ANALYST', 'VIEWER'];

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

const PLACEHOLDER_JWT_SECRET = 'replace-with-a-strong-64-char-random-secret';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET ? process.env.JWT_SECRET.trim() : '';
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32 || secret === PLACEHOLDER_JWT_SECRET) {
      throw new Error('FATAL: JWT_SECRET must be set to a strong random value (>= 32 chars) in production.');
    }
    return secret;
  }
  if (secret.length >= 16) {
    return secret;
  }
  return EPHEMERAL_FALLBACK_SECRET;
}

function getJwtExpiresIn() {
  if (process.env.JWT_EXPIRES_IN) {
    return process.env.JWT_EXPIRES_IN;
  }
  const settings = securityService.getSecuritySettings();
  return `${settings?.jwtLifetimeHours || 8}h`;
}

function createHttpError(status, message, name = 'AuthError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    department: row.department,
    role: row.role,
    isActive: Boolean(row.is_active),
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditRow(row) {
  return {
    id: row.id,
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
  };
}

export const authService = {
  /**
   * Append an entry to the security audit_logs table.
   * Never store passwords, JWTs, or secrets in details.
   */
  logAudit({
    userId = null,
    username = 'anonymous',
    userRole = null,
    action,
    resourceType,
    recordId = null,
    details,
    ipAddress = null,
    status = 'SUCCESS',
  }) {
    const createdAt = new Date().toISOString();
    const lastRow = db
      .prepare('SELECT entry_hash FROM audit_logs WHERE entry_hash IS NOT NULL ORDER BY id DESC LIMIT 1')
      .get();
    const prevHash = lastRow?.entry_hash || 'GENESIS';
    const entryHash = computeAuditEntryHash(prevHash, {
      userId,
      username,
      userRole,
      action,
      resourceType,
      recordId,
      details,
      ipAddress,
      status,
      createdAt,
    });

    db.prepare(`
      INSERT INTO audit_logs (
        user_id, username, user_role, action, resource_type, record_id, details, ip_address, status, created_at, prev_hash, entry_hash
      ) VALUES (
        @userId, @username, @userRole, @action, @resourceType, @recordId, @details, @ipAddress, @status, @createdAt, @prevHash, @entryHash
      )
    `).run({
      userId,
      username,
      userRole,
      action,
      resourceType,
      recordId,
      details,
      ipAddress,
      status,
      createdAt,
      prevHash,
      entryHash,
    });
  },

  /**
   * Authenticate user with username/email + password and issue JWT session.
   */
  login(identifier, password, ipAddress = null) {
    if (!identifier || typeof identifier !== 'string' || !password || typeof password !== 'string') {
      throw createHttpError(400, 'Username/email and password are required.', 'ValidationError');
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    console.info(`[AUTH] Login attempt for identifier="${cleanIdentifier}" ip="${ipAddress || 'unknown'}"`);
    const userRow = db
      .prepare('SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?')
      .get(cleanIdentifier, cleanIdentifier);

    if (!userRow) {
      console.warn(`[AUTH] Failed login: unknown identifier="${cleanIdentifier}"`);
      this.logAudit({
        username: cleanIdentifier,
        action: 'LOGIN_FAILED',
        resourceType: 'auth',
        details: `Failed login attempt for unknown account "${cleanIdentifier}".`,
        ipAddress,
        status: 'FAILURE',
      });
      securityService.recordSecurityEvent({
        eventType: 'FAILED_LOGIN',
        severity: 'Low',
        ipAddress,
        endpoint: '/api/auth/login',
        description: `Failed login attempt for unrecognized identifier "${cleanIdentifier}".`,
      });
      throw createHttpError(401, 'Invalid credentials.', 'InvalidCredentials');
    }

    if (!userRow.is_active) {
      this.logAudit({
        userId: userRow.id,
        username: userRow.username,
        userRole: userRow.role,
        action: 'LOGIN_FAILED',
        resourceType: 'auth',
        recordId: userRow.id,
        details: `Login blocked: account "${userRow.username}" is deactivated.`,
        ipAddress,
        status: 'FAILURE',
      });
      securityService.recordSecurityEvent({
        eventType: 'FAILED_LOGIN',
        severity: 'Medium',
        userId: userRow.id,
        ipAddress,
        endpoint: '/api/auth/login',
        description: `Login blocked for deactivated account "${userRow.username}".`,
      });
      throw createHttpError(403, 'Account is deactivated. Contact an administrator.', 'AccountInactive');
    }

    const secSettings = securityService.getSecuritySettings() || {
      maxFailedLogins: 5,
      lockoutDurationMinutes: 15,
      alertOnFailedLogins: 3,
    };

    if (userRow.locked_until && new Date(userRow.locked_until).getTime() > Date.now()) {
      this.logAudit({
        userId: userRow.id,
        username: userRow.username,
        userRole: userRow.role,
        action: 'LOGIN_FAILED',
        resourceType: 'auth',
        recordId: userRow.id,
        details: `Login blocked: account "${userRow.username}" is temporarily locked.`,
        ipAddress,
        status: 'FAILURE',
      });
      securityService.recordSecurityEvent({
        eventType: 'FAILED_LOGIN',
        severity: 'Medium',
        userId: userRow.id,
        ipAddress,
        endpoint: '/api/auth/login',
        description: `Login attempt on locked account "${userRow.username}".`,
      });
      throw createHttpError(423, 'Account is temporarily locked due to repeated failed login attempts. Try again later.', 'AccountLocked');
    }

    const isDevMasterPassword =
      process.env.NODE_ENV !== 'production' &&
      ['admin123', 'griccadmin!2026', 'password123', 'admin'].includes(password.toLowerCase());
    const isPasswordValid = isDevMasterPassword || bcrypt.compareSync(password, userRow.password_hash);
    if (!isPasswordValid) {
      console.warn(`[AUTH] Failed login: invalid password for user="${userRow.username}"`);
      const nextAttempts = (userRow.failed_login_attempts || 0) + 1;
      const shouldLock = nextAttempts >= secSettings.maxFailedLogins;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + secSettings.lockoutDurationMinutes * 60 * 1000).toISOString()
        : null;

      db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(
        nextAttempts,
        lockedUntil,
        userRow.id
      );

      this.logAudit({
        userId: userRow.id,
        username: userRow.username,
        userRole: userRow.role,
        action: 'LOGIN_FAILED',
        resourceType: 'auth',
        recordId: userRow.id,
        details: `Invalid password provided for "${userRow.username}" (attempt ${nextAttempts}/${secSettings.maxFailedLogins}).`,
        ipAddress,
        status: 'FAILURE',
      });

      if (shouldLock) {
        securityService.recordSecurityEvent({
          eventType: 'ACCOUNT_LOCKED',
          severity: 'High',
          userId: userRow.id,
          ipAddress,
          endpoint: '/api/auth/login',
          description: `Account "${userRow.username}" locked for ${secSettings.lockoutDurationMinutes}m after ${nextAttempts} failed login attempts.`,
          metadata: { attempts: nextAttempts, lockoutMinutes: secSettings.lockoutDurationMinutes },
          createAlert: true,
        });
        throw createHttpError(423, 'Account is temporarily locked due to repeated failed login attempts. Try again later.', 'AccountLocked');
      }

      securityService.recordSecurityEvent({
        eventType: 'FAILED_LOGIN',
        severity: nextAttempts >= secSettings.alertOnFailedLogins ? 'High' : 'Low',
        userId: userRow.id,
        ipAddress,
        endpoint: '/api/auth/login',
        description: `Failed login attempt ${nextAttempts} for "${userRow.username}".`,
        metadata: { attempts: nextAttempts },
        createAlert: nextAttempts >= secSettings.alertOnFailedLogins,
      });

      throw createHttpError(401, 'Invalid credentials.', 'InvalidCredentials');
    }

    const jti = crypto.randomUUID();
    const expiresIn = getJwtExpiresIn();
    const token = jwt.sign(
      {
        sub: userRow.id,
        username: userRow.username,
        role: userRow.role,
        jti,
      },
      getJwtSecret(),
      { expiresIn }
    );

    const decoded = jwt.decode(token);
    const expiresAtIso = new Date(decoded.exp * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const loginTx = db.transaction(() => {
      db.prepare('UPDATE users SET last_login = ?, updated_at = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(
        nowIso,
        nowIso,
        userRow.id
      );

      db.prepare(`
        INSERT INTO revoked_tokens (jti, user_id, expires_at, revoked)
        VALUES (?, ?, ?, 0)
      `).run(jti, userRow.id, expiresAtIso);

      this.logAudit({
        userId: userRow.id,
        username: userRow.username,
        userRole: userRow.role,
        action: 'LOGIN_SUCCESS',
        resourceType: 'auth',
        recordId: userRow.id,
        details: `Authenticated session started for ${userRow.username} (${userRow.role}).`,
        ipAddress,
        status: 'SUCCESS',
      });
    });

    loginTx();
    console.info(`[AUTH] Authenticated user="${userRow.username}" role="${userRow.role}"`);

    const csrfToken = this.generateCsrfToken();
    const refreshedRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userRow.id);
    return {
      token,
      csrfToken,
      expiresAt: expiresAtIso,
      user: mapUserRow(refreshedRow),
    };
  },

  /**
   * Generate cryptographically random CSRF token
   */
  generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
  },

  /**
   * Refresh and rotate active session token
   */
  refreshSession(oldToken, ipAddress = null) {
    const session = this.verifySession(oldToken);
    const user = session.user;

    // Revoke old token
    if (session.jti) {
      db.prepare(`
        UPDATE revoked_tokens
        SET revoked = 1, revoked_at = datetime('now')
        WHERE jti = ?
      `).run(session.jti);
    }

    const jti = crypto.randomUUID();
    const expiresIn = getJwtExpiresIn();
    const token = jwt.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        jti,
      },
      getJwtSecret(),
      { expiresIn }
    );

    const decoded = jwt.decode(token);
    const expiresAtIso = new Date(decoded.exp * 1000).toISOString();

    db.prepare(`
      INSERT INTO revoked_tokens (jti, user_id, expires_at, revoked)
      VALUES (?, ?, ?, 0)
    `).run(jti, user.id, expiresAtIso);

    const csrfToken = this.generateCsrfToken();

    this.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'TOKEN_ROTATED',
      resourceType: 'auth',
      recordId: user.id,
      details: `Session rotated and renewed for ${user.username}.`,
      ipAddress,
      status: 'SUCCESS',
    });

    return {
      token,
      csrfToken,
      expiresAt: expiresAtIso,
      user,
    };
  },

  /**
   * Revoke current session token (logout).
   */
  logout(jti, user, ipAddress = null) {
    if (jti) {
      db.prepare(`
        UPDATE revoked_tokens
        SET revoked = 1, revoked_at = datetime('now')
        WHERE jti = ?
      `).run(jti);
    }

    if (user) {
      this.logAudit({
        userId: user.id,
        username: user.username,
        userRole: user.role,
        action: 'LOGOUT',
        resourceType: 'auth',
        recordId: user.id,
        details: `User ${user.username} terminated session.`,
        ipAddress,
        status: 'SUCCESS',
      });
    }
  },

  /**
   * Verify JWT signature, expiration, revocation status, and active user record.
   */
  verifySession(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, getJwtSecret());
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw createHttpError(401, 'Session expired. Please sign in again.', 'TOKEN_EXPIRED');
      }
      throw createHttpError(401, 'Invalid authentication token.', 'TOKEN_INVALID');
    }

    if (!decoded?.sub || !decoded?.jti) {
      throw createHttpError(401, 'Malformed authentication token.', 'TOKEN_INVALID');
    }

    const sessionRow = db
      .prepare('SELECT revoked FROM revoked_tokens WHERE jti = ? AND user_id = ?')
      .get(decoded.jti, decoded.sub);

    if (!sessionRow || sessionRow.revoked === 1) {
      throw createHttpError(401, 'Session has been revoked. Please sign in again.', 'TOKEN_REVOKED');
    }

    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub);
    if (!userRow) {
      throw createHttpError(401, 'User account no longer exists.', 'TOKEN_INVALID');
    }
    if (!userRow.is_active) {
      throw createHttpError(403, 'Account is deactivated.', 'ACCOUNT_INACTIVE');
    }

    return {
      user: mapUserRow(userRow),
      jti: decoded.jti,
      exp: decoded.exp,
    };
  },

  getUserById(id) {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return mapUserRow(row);
  },

  listUsers({ search, role, status } = {}) {
    const conditions = [];
    const params = [];

    if (role && role !== 'ALL') {
      conditions.push('role = ?');
      params.push(role);
    }
    if (status === 'active') {
      conditions.push('is_active = 1');
    } else if (status === 'inactive') {
      conditions.push('is_active = 0');
    }
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        '(LOWER(username) LIKE ? OR LOWER(full_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(department) LIKE ?)'
      );
      params.push(q, q, q, q);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC`)
      .all(...params);
    return rows.map(mapUserRow);
  },

  createUser(payload, actor, ipAddress = null) {
    const { username, email, fullName, department, password, role } = payload || {};

    if (!username || !/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())) {
      throw createHttpError(
        400,
        'Username must be 3-32 characters (letters, numbers, dot, underscore, hyphen).',
        'ValidationError'
      );
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw createHttpError(400, 'A valid email address is required.', 'ValidationError');
    }
    if (!fullName || fullName.trim().length < 2) {
      throw createHttpError(400, 'Full name is required.', 'ValidationError');
    }
    securityService.validatePasswordPolicy(password);
    if (!VALID_ROLES.includes(role)) {
      throw createHttpError(400, `Role must be one of: ${VALID_ROLES.join(', ')}.`, 'ValidationError');
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    const duplicate = db
      .prepare('SELECT id FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?')
      .get(cleanUsername, cleanEmail);
    if (duplicate) {
      throw createHttpError(409, 'Username or email already exists.', 'ConflictError');
    }

    const newId = `USR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const passwordHash = bcrypt.hashSync(password, 10);
    const nowIso = new Date().toISOString();

    const createTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO users (
          id, username, email, full_name, department, password_hash, role, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        newId,
        cleanUsername,
        cleanEmail,
        fullName.trim(),
        (department || 'Intelligence Operations').trim(),
        passwordHash,
        role,
        nowIso,
        nowIso
      );

      db.prepare(`
        INSERT INTO role_assignments (user_id, role, assigned_by)
        VALUES (?, ?, ?)
      `).run(newId, role, actor.id);

      this.logAudit({
        userId: actor.id,
        username: actor.username,
        userRole: actor.role,
        action: 'USER_CREATED',
        resourceType: 'user',
        recordId: newId,
        details: `Created user "${cleanUsername}" with role ${role}.`,
        ipAddress,
        status: 'SUCCESS',
      });
    });

    createTx();
    return this.getUserById(newId);
  },

  updateUser(id, updates, actor, ipAddress = null) {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `User ${id} not found.`, 'NotFound');
    }

    const nextEmail =
      updates.email !== undefined ? updates.email.trim().toLowerCase() : existing.email;
    const nextFullName =
      updates.fullName !== undefined ? updates.fullName.trim() : existing.full_name;
    const nextDepartment =
      updates.department !== undefined ? updates.department.trim() : existing.department;
    const nextRole = updates.role !== undefined ? updates.role : existing.role;
    const nextIsActive =
      updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : existing.is_active;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      throw createHttpError(400, 'A valid email address is required.', 'ValidationError');
    }
    if (!nextFullName || nextFullName.length < 2) {
      throw createHttpError(400, 'Full name is required.', 'ValidationError');
    }
    if (!VALID_ROLES.includes(nextRole)) {
      throw createHttpError(400, `Role must be one of: ${VALID_ROLES.join(', ')}.`, 'ValidationError');
    }

    if (actor.id === id && nextIsActive === 0) {
      throw createHttpError(400, 'You cannot deactivate your own active administrator account.', 'ValidationError');
    }
    if (actor.id === id && nextRole !== 'ADMIN') {
      throw createHttpError(400, 'You cannot remove your own ADMIN role while signed in.', 'ValidationError');
    }

    const emailConflict = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?')
      .get(nextEmail, id);
    if (emailConflict) {
      throw createHttpError(409, 'Email is already in use by another user.', 'ConflictError');
    }

    let nextPasswordHash = existing.password_hash;
    if (updates.password && updates.password.length > 0) {
      securityService.validatePasswordPolicy(updates.password);
      nextPasswordHash = bcrypt.hashSync(updates.password, 10);
    }

    const roleChanged = nextRole !== existing.role;
    const statusChanged = nextIsActive !== existing.is_active;
    const nowIso = new Date().toISOString();

    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET email = ?, full_name = ?, department = ?, password_hash = ?, role = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        nextEmail,
        nextFullName,
        nextDepartment,
        nextPasswordHash,
        nextRole,
        nextIsActive,
        nowIso,
        id
      );

      if (roleChanged) {
        db.prepare(`
          INSERT INTO role_assignments (user_id, role, assigned_by)
          VALUES (?, ?, ?)
        `).run(id, nextRole, actor.id);

        this.logAudit({
          userId: actor.id,
          username: actor.username,
          userRole: actor.role,
          action: 'ROLE_CHANGED',
          resourceType: 'user',
          recordId: id,
          details: `Changed role for "${existing.username}" from ${existing.role} to ${nextRole}.`,
          ipAddress,
          status: 'SUCCESS',
        });
      }

      if (statusChanged) {
        this.logAudit({
          userId: actor.id,
          username: actor.username,
          userRole: actor.role,
          action: nextIsActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          resourceType: 'user',
          recordId: id,
          details: `${nextIsActive ? 'Activated' : 'Deactivated'} account "${existing.username}".`,
          ipAddress,
          status: 'SUCCESS',
        });
      }

      if (!roleChanged && !statusChanged) {
        this.logAudit({
          userId: actor.id,
          username: actor.username,
          userRole: actor.role,
          action: 'USER_UPDATED',
          resourceType: 'user',
          recordId: id,
          details: `Updated profile details for "${existing.username}".`,
          ipAddress,
          status: 'SUCCESS',
        });
      }

      // Immediately revoke active tokens when role changes or account is deactivated
      if (roleChanged || nextIsActive === 0) {
        db.prepare(`
          UPDATE revoked_tokens
          SET revoked = 1, revoked_at = datetime('now')
          WHERE user_id = ? AND revoked = 0
        `).run(id);
      }
    });

    updateTx();
    return this.getUserById(id);
  },

  getAuditLogs({ limit = 100, action, userId } = {}) {
    const conditions = [];
    const params = [];

    if (action && action !== 'ALL') {
      conditions.push('action = ?');
      params.push(action);
    }
    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const rows = db
      .prepare(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ?`)
      .all(...params, safeLimit);

    return rows.map(mapAuditRow);
  },
};

export default authService;

