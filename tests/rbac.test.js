import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../server/middleware/authMiddleware.js';

describe('RBAC Middleware Unit Tests', () => {
  it('allows access when user role matches permitted roles', () => {
    const middleware = requireRole('ADMIN', 'ANALYST');
    const req = {
      user: { id: 'USR-001', username: 'admin', role: 'ADMIN' },
      originalUrl: '/api/incidents',
      method: 'POST',
      ip: '127.0.0.1',
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks access with HTTP 403 when user role is insufficient', () => {
    const middleware = requireRole('ADMIN');
    const req = {
      user: { id: 'USR-002', username: 'viewer_user', role: 'VIEWER' },
      originalUrl: '/api/users',
      method: 'GET',
      ip: '127.0.0.1',
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'INSUFFICIENT_ROLE',
    }));
  });

  it('rejects unauthenticated requests with HTTP 401', () => {
    const middleware = requireRole('ADMIN', 'ANALYST', 'VIEWER');
    const req = {
      user: null,
      originalUrl: '/api/incidents',
      method: 'GET',
      ip: '127.0.0.1',
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

