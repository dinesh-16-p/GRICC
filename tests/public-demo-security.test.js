import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import authService from '../server/services/authService.js';
import { authenticateToken, requireRole } from '../server/middleware/authMiddleware.js';
import { createDemoDatabase } from '../server/scripts/create-demo-database.js';

describe('Public Demo Security Remediation Verification (Task 3.13.1)', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalFallback = process.env.ALLOW_DEV_OPERATOR_FALLBACK;
  const TEST_JWT_SECRET = 'public-demo-security-test-secret-at-least-32-chars-long!';

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.NODE_ENV = originalEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (originalFallback !== undefined) {
      process.env.ALLOW_DEV_OPERATOR_FALLBACK = originalFallback;
    } else {
      delete process.env.ALLOW_DEV_OPERATOR_FALLBACK;
    }
  });

  function mockReqRes({ authHeader, cookie, method = 'GET', url = '/api/incidents' } = {}) {
    const req = {
      headers: {
        ...(authHeader ? { authorization: authHeader } : {}),
      },
      cookies: {
        ...(cookie ? { gricc_session: cookie } : {}),
      },
      method,
      originalUrl: url,
      ip: '127.0.0.1',
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();
    return { req, res, next };
  }

  it('1. Unauthenticated API requests return 401 with TOKEN_MISSING', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DEV_OPERATOR_FALLBACK;

    const { req, res, next } = mockReqRes({ method: 'GET', url: '/api/incidents' });
    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Unauthorized',
        code: 'TOKEN_MISSING',
      })
    );
    expect(req.user).toBeUndefined();
  });

  it('2. Invalid or malformed tokens return 401 with TOKEN_INVALID', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DEV_OPERATOR_FALLBACK;

    const { req, res, next } = mockReqRes({
      authHeader: 'Bearer malformed.invalid.token',
      method: 'GET',
      url: '/api/incidents',
    });
    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'TOKEN_INVALID',
      })
    );
    expect(req.user).toBeUndefined();
  });

  it('3. No default administrator identity is automatically assigned to visitors', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DEV_OPERATOR_FALLBACK;

    const { req, res, next } = mockReqRes({ method: 'GET', url: '/api/sources' });
    authenticateToken(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('4. Legitimate administrator login continues to authenticate properly', () => {
    const login = authService.login('admin', 'admin123');
    expect(login).toBeDefined();
    expect(login.token).toBeDefined();
    expect(login.user.role).toBe('ADMIN');
    expect(login.user.username).toBe('admin');

    // Admin token successfully authenticates via middleware
    const { req, res, next } = mockReqRes({
      authHeader: `Bearer ${login.token}`,
      method: 'GET',
      url: '/api/users',
    });
    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.role).toBe('ADMIN');
  });

  it('5. Legitimate viewer login authenticates with VIEWER role', () => {
    const login = authService.login('viewer', 'admin123');
    expect(login).toBeDefined();
    expect(login.token).toBeDefined();
    expect(login.user.role).toBe('VIEWER');
    expect(login.user.username).toBe('viewer');

    const { req, res, next } = mockReqRes({
      authHeader: `Bearer ${login.token}`,
      method: 'GET',
      url: '/api/incidents',
    });
    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.role).toBe('VIEWER');
  });

  it('6. Viewer requests to protected write operations return 403 Forbidden', () => {
    const viewerUser = { id: 'USR-003', username: 'viewer', role: 'VIEWER' };
    const requireAdminOrAnalyst = requireRole('ADMIN', 'ANALYST');

    const req = {
      user: viewerUser,
      method: 'POST',
      originalUrl: '/api/incidents',
      ip: '127.0.0.1',
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    requireAdminOrAnalyst(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Forbidden',
        code: 'INSUFFICIENT_ROLE',
      })
    );
  });

  it('7. Viewer cannot access administrative user management or security functions', () => {
    const viewerUser = { id: 'USR-003', username: 'viewer', role: 'VIEWER' };
    const requireAdmin = requireRole('ADMIN');

    const req = {
      user: viewerUser,
      method: 'GET',
      originalUrl: '/api/users',
      ip: '127.0.0.1',
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Forbidden',
        code: 'INSUFFICIENT_ROLE',
      })
    );
  });

  it('8. Demo database isolation: demo DB is isolated and writes cannot modify authoritative DB', async () => {
    const authoritativeDbPath = path.resolve('./server/data/gricc.db');
    const probeDbPath = path.resolve('./server/data/gricc-isolation-probe.db');

    expect(fs.existsSync(authoritativeDbPath)).toBe(true);

    const result = await createDemoDatabase({
      sourcePath: authoritativeDbPath,
      targetPath: probeDbPath,
    });

    try {
      expect(result.verified).toBe(true);
      expect(fs.existsSync(probeDbPath)).toBe(true);
      expect(result.tables).toBeGreaterThanOrEqual(40);
      expect(result.users).toBeGreaterThanOrEqual(5);
      expect(result.boundaryHash).toBe('51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d');

      // Perform an explicit write to the probe database
      const testTag = `TEST-MUTATION-${Date.now()}`;
      const demoRw = new Database(probeDbPath);
      try {
        demoRw.prepare(`
          INSERT INTO activity_logs (entity_type, entity_id, action, description, severity, actor)
          VALUES ('system', ?, 'DEMO_MUTATION_TEST', 'Testing demo DB write isolation', 'Low', 'test')
        `).run(testTag);
      } finally {
        demoRw.close();
      }

      // Verify record exists in probe DB
      const demoVerify = new Database(probeDbPath, { readonly: true });
      let demoCount = 0;
      try {
        demoCount = demoVerify.prepare('SELECT COUNT(*) AS c FROM activity_logs WHERE entity_id = ?').get(testTag).c;
      } finally {
        demoVerify.close();
      }
      expect(demoCount).toBe(1);

      // Verify record DOES NOT exist in authoritative DB
      const authVerify = new Database(authoritativeDbPath, { readonly: true });
      let authCount = 0;
      try {
        authCount = authVerify.prepare('SELECT COUNT(*) AS c FROM activity_logs WHERE entity_id = ?').get(testTag).c;
      } finally {
        authVerify.close();
      }
      expect(authCount).toBe(0);
    } finally {
      if (fs.existsSync(probeDbPath)) fs.unlinkSync(probeDbPath);
      const wal = `${probeDbPath}-wal`;
      const shm = `${probeDbPath}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    }
  });
});

