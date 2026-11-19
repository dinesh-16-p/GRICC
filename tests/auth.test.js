import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import securityService from '../server/services/securityService.js';
import authService from '../server/services/authService.js';
import { authenticateToken, authenticateSse } from '../server/middleware/authMiddleware.js';

describe('Auth & Security Service Unit Tests', () => {
  it('enforces password policy complexity rules', () => {
    // Valid strong password
    expect(() => securityService.validatePasswordPolicy('StrongPass!2026')).not.toThrow();

    // Too short
    expect(() => securityService.validatePasswordPolicy('Sh!1')).toThrow(/at least 8 characters/);

    // Missing uppercase
    expect(() => securityService.validatePasswordPolicy('weakpass!2026')).toThrow(/uppercase/);

    // Missing lowercase
    expect(() => securityService.validatePasswordPolicy('WEAKPASS!2026')).toThrow(/lowercase/);

    // Missing number
    expect(() => securityService.validatePasswordPolicy('WeakPass!NoNum')).toThrow(/numeric digit/);

    // Missing special character
    expect(() => securityService.validatePasswordPolicy('WeakPass123456')).toThrow(/special/);
  });

  it('generates random CSRF tokens with sufficient entropy', () => {
    const token1 = authService.generateCsrfToken();
    const token2 = authService.generateCsrfToken();

    expect(token1).toHaveLength(64); // 32 bytes hex
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
  });

  it('verifies active user login credentials in development mode', () => {
    const result = authService.login('admin', 'admin123');
    expect(result).toBeDefined();
    expect(result.token).toBeDefined();
    expect(result.csrfToken).toHaveLength(64);
    expect(result.user.username).toBe('admin');
    expect(result.user.role).toBe('ADMIN');
  });

  it('verifies session tokens and detects invalid signatures', () => {
    const login = authService.login('analyst', 'admin123');
    const session = authService.verifySession(login.token);

    expect(session.user.username).toBe('analyst');
    expect(session.user.role).toBe('ANALYST');
    expect(session.jti).toBeDefined();

    expect(() => authService.verifySession('invalid.jwt.token')).toThrow();
  });

  it('successfully rotates tokens and invalidates the previous JTI', () => {
    const initialLogin = authService.login('viewer', 'admin123');
    const rotated = authService.refreshSession(initialLogin.token);

    expect(rotated.token).toBeDefined();
    expect(rotated.token).not.toBe(initialLogin.token);
    expect(rotated.csrfToken).toBeDefined();

    // Old token should now be revoked
    expect(() => authService.verifySession(initialLogin.token)).toThrow(/revoked/);

    // New token should be valid
    const newSession = authService.verifySession(rotated.token);
    expect(newSession.user.username).toBe('viewer');
  });

  describe('Authentication Middleware & Safeguards Regression Tests', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalJwtSecret = process.env.JWT_SECRET;
    const TEST_PROD_JWT_SECRET = 'test-regression-jwt-secret-with-minimum-32-chars!';

    beforeAll(() => {
      process.env.JWT_SECRET = TEST_PROD_JWT_SECRET;
    });

    function mockReqRes({ authHeader, cookie, queryToken, method = 'GET', csrfHeader, csrfCookie } = {}) {
      const req = {
        headers: {
          ...(authHeader ? { authorization: authHeader } : {}),
          ...(csrfHeader ? { 'x-csrf-token': csrfHeader } : {}),
        },
        cookies: {
          ...(cookie ? { gricc_session: cookie } : {}),
          ...(csrfCookie ? { gricc_csrf: csrfCookie } : {}),
        },
        query: queryToken ? { token: queryToken } : {},
        method,
        originalUrl: '/api/users',
        ip: '127.0.0.1',
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      const next = vi.fn();
      return { req, res, next };
    }

    it('rejects unauthenticated requests in production mode with HTTP 401 and TOKEN_MISSING', () => {
      process.env.NODE_ENV = 'production';
      const { req, res, next } = mockReqRes();

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TOKEN_MISSING',
        })
      );
    });

    it('rejects invalid tokens in production mode with HTTP 401', () => {
      process.env.NODE_ENV = 'production';
      const { req, res, next } = mockReqRes({ authHeader: 'Bearer invalid.token.payload' });

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TOKEN_INVALID',
        })
      );
    });

    it('rejects expired tokens in production mode with HTTP 401', () => {
      process.env.NODE_ENV = 'production';
      const expiredToken = jwt.sign(
        { sub: 'USR-001', username: 'admin', role: 'ADMIN', jti: 'test-exp-jti' },
        process.env.JWT_SECRET || 'test-secret-min-32-chars-long-audit!!',
        { expiresIn: '0s' }
      );
      const { req, res, next } = mockReqRes({ authHeader: `Bearer ${expiredToken}` });

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects revoked tokens in production mode with HTTP 401', () => {
      process.env.NODE_ENV = 'production';
      const login = authService.login('admin', 'admin123');
      const session = authService.verifySession(login.token);
      authService.logout(session.jti, session.user);

      const { req, res, next } = mockReqRes({ authHeader: `Bearer ${login.token}` });

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('authenticates valid Bearer tokens in production mode', () => {
      process.env.NODE_ENV = 'production';
      const login = authService.login('admin', 'admin123');
      const { req, res, next } = mockReqRes({ authHeader: `Bearer ${login.token}` });

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.username).toBe('admin');
      expect(req.user.role).toBe('ADMIN');
    });

    it('rejects unauthenticated SSE connection attempts in production with HTTP 401', () => {
      process.env.NODE_ENV = 'production';
      const { req, res, next } = mockReqRes();

      authenticateSse(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TOKEN_MISSING',
        })
      );
    });

    it('rejects invalid SSE tokens in production mode with HTTP 401', () => {
      process.env.NODE_ENV = 'production';
      const { req, res, next } = mockReqRes({ queryToken: 'invalid.sse.token' });

      authenticateSse(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TOKEN_INVALID',
        })
      );
    });

    it('allows valid tokens to connect to SSE stream in production', () => {
      process.env.NODE_ENV = 'production';
      const login = authService.login('analyst', 'admin123');
      const { req, res, next } = mockReqRes({ queryToken: login.token });

      authenticateSse(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.username).toBe('analyst');
    });

    it('allows valid session cookies to connect to SSE stream in production without query parameters', () => {
      process.env.NODE_ENV = 'production';
      const login = authService.login('analyst', 'admin123');
      const { req, res, next } = mockReqRes({ cookie: login.token });

      authenticateSse(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.username).toBe('analyst');
    });

    it('allows Bearer authorization header to connect to SSE stream in production', () => {
      process.env.NODE_ENV = 'production';
      const login = authService.login('analyst', 'admin123');
      const { req, res, next } = mockReqRes({ authHeader: `Bearer ${login.token}` });

      authenticateSse(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.username).toBe('analyst');
    });

    it('rejects revoked session cookies on SSE stream in production with HTTP 401', () => {
      process.env.NODE_ENV = 'production';
      const login = authService.login('admin', 'admin123');
      const session = authService.verifySession(login.token);
      authService.logout(session.jti, session.user);

      const { req, res, next } = mockReqRes({ cookie: login.token });

      authenticateSse(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'TOKEN_REVOKED',
          message: 'Session has been revoked. Please sign in again.',
        })
      );
    });

    it('blocks unauthenticated operator fallback when NODE_ENV is unset', () => {
      delete process.env.NODE_ENV;
      const { req, res, next } = mockReqRes();

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TOKEN_MISSING',
        })
      );
    });

    it('strictly rejects unauthenticated requests even in development mode (no auto-admin elevation)', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ALLOW_DEV_OPERATOR_FALLBACK;
      const { req, res, next } = mockReqRes();

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TOKEN_MISSING',
        })
      );
      expect(req.user).toBeUndefined();
    });

    it('ensures dev operator fallback can NEVER assign ADMIN role to visitors', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_OPERATOR_FALLBACK = 'true';
      const { req, res, next } = mockReqRes();

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.role).toBe('VIEWER');
      expect(req.user.role).not.toBe('ADMIN');
      delete process.env.ALLOW_DEV_OPERATOR_FALLBACK;
    });

    it('verifies static master passwords no longer bypass bcrypt verification', () => {
      process.env.NODE_ENV = 'development';
      // Arbitrary non-stored password must fail
      expect(() => authService.login('admin', 'WrongRandomPass!2026')).toThrow();
      // Legitimate bcrypt password continues to authenticate
      const valid = authService.login('admin', 'admin123');
      expect(valid.user.username).toBe('admin');
    });

    // Restore original env
    afterAll(() => {
      if (originalEnv !== undefined) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (originalJwtSecret !== undefined) {
        process.env.JWT_SECRET = originalJwtSecret;
      } else {
        delete process.env.JWT_SECRET;
      }
    });
  });
});

