import db from '../db/database.js';
import authService from '../services/authService.js';
import securityService from '../services/securityService.js';

function getDefaultOperatorUser() {
  // Safe read-only fallback: NEVER grant ADMIN privileges to unauthenticated visitors
  return {
    id: 'USR-003',
    username: 'viewer',
    email: 'viewer@gricc.intel',
    fullName: 'Demo Viewer',
    department: 'External Operations',
    role: 'VIEWER',
  };
}

/**
 * Validate CSRF token when request relies on cookie-based authentication.
 * State-changing methods (POST, PUT, PATCH, DELETE) require a matching X-CSRF-Token header.
 */
function validateCsrfIfCookieAuth(req) {
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (!isStateChanging) return true;

  // If client used Authorization header, CSRF check is bypassed (custom headers cannot be forged cross-origin)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return true;

  // If cookie auth was used, enforce CSRF token header
  if (req.cookies?.gricc_session) {
    const csrfHeader = req.headers['x-csrf-token'];
    const csrfCookie = req.cookies?.gricc_csrf;
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      return false;
    }
  }
  return true;
}

/**
 * Check if the active runtime environment explicitly permits unauthenticated operator fallback.
 * Operator fallback is strictly restricted to development mode (NODE_ENV === 'development').
 * In production, testing, or any environment where NODE_ENV is unset, fallback is completely blocked.
 */
function isDevOperatorFallbackAllowed() {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.ALLOW_DEV_OPERATOR_FALLBACK === 'true'
  );
}

/**
 * Middleware: Resolve Bearer JWT token or HttpOnly session cookie; otherwise allow access as default operator in dev.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies?.gricc_session) {
    token = req.cookies.gricc_session;
    if (!validateCsrfIfCookieAuth(req)) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'CSRF_INVALID',
        message: 'Invalid or missing CSRF token for cookie session.',
      });
    }
  }

  if (!token) {
    if (!isDevOperatorFallbackAllowed()) {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'TOKEN_MISSING',
        message: 'Authentication required. No session token provided.',
      });
    }
    req.user = getDefaultOperatorUser();
    return next();
  }

  try {
    const session = authService.verifySession(token);
    req.user = session.user;
    req.tokenJti = session.jti;
    next();
  } catch (err) {
    if (!isDevOperatorFallbackAllowed()) {
      return res.status(401).json({
        error: err.name || 'Unauthorized',
        code: err.code || 'TOKEN_INVALID',
        message: err.message || 'Authentication required.',
      });
    }
    req.user = getDefaultOperatorUser();
    next();
  }
}

/**
 * Middleware: Resolve SSE authentication from Bearer header, query string (?token=), or HttpOnly cookie.
 */
export function authenticateSse(req, res, next) {
  const authHeader = req.headers.authorization;
  const headerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token.trim() : null;
  const cookieToken = req.cookies?.gricc_session || null;
  const token = headerToken || queryToken || cookieToken;

  if (!token) {
    if (!isDevOperatorFallbackAllowed()) {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'TOKEN_MISSING',
        message: 'Authentication required for SSE stream.',
      });
    }
    req.user = getDefaultOperatorUser();
    return next();
  }

  try {
    const session = authService.verifySession(token);
    req.user = session.user;
    req.tokenJti = session.jti;
    next();
  } catch (err) {
    if (!isDevOperatorFallbackAllowed()) {
      return res.status(401).json({
        error: err?.name || 'Unauthorized',
        code: err?.code || 'TOKEN_INVALID',
        message: err?.message || 'Invalid SSE authentication token.',
      });
    }
    req.user = getDefaultOperatorUser();
    next();
  }
}

/**
 * Middleware: Enforce Role-Based Access Control (RBAC).
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'TOKEN_MISSING',
        message: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      authService.logAudit({
        userId: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        resourceType: 'api',
        recordId: req.originalUrl,
        details: `Denied ${req.method} ${req.originalUrl} for role ${req.user.role}. Required: ${allowedRoles.join(', ')}.`,
        ipAddress: req.ip,
        status: 'DENIED',
      });

      const isAdminEndpoint = /^\/api\/(users|audit-logs|security)/.test(req.originalUrl || '');
      securityService.recordSecurityEvent({
        eventType: isAdminEndpoint ? 'PRIVILEGE_ESCALATION_ATTEMPT' : 'UNAUTHORIZED_ACCESS',
        severity: isAdminEndpoint ? 'High' : 'Medium',
        userId: req.user.id,
        ipAddress: req.ip,
        endpoint: req.originalUrl,
        description: `Role ${req.user.role} denied on ${req.method} ${req.originalUrl}. Required: ${allowedRoles.join(', ')}.`,
        createAlert: isAdminEndpoint,
      });

      return res.status(403).json({
        error: 'Forbidden',
        code: 'INSUFFICIENT_ROLE',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }

    next();
  };
}

