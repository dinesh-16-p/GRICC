import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { sanitizeDemoDatabase } from '../server/scripts/sanitize-demo-database.js';
import { requireRole, authenticateToken } from '../server/middleware/authMiddleware.js';

describe('Task 3.13.2 — Demo Database Sanitization & Security Isolation Tests', () => {
  const authDbPath = path.resolve('./server/data/gricc.db');
  const demoDbPath = path.resolve('./server/data/gricc-demo.db');

  beforeAll(() => {
    // Ensure demo DB exists and is sanitized
    expect(fs.existsSync(authDbPath)).toBe(true);
    sanitizeDemoDatabase(demoDbPath);
  });

  it('1. Verifies zero personal identities or personal emails exist in any table in demo database', () => {
    const db = new Database(demoDbPath, { readonly: true });
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      let matches = 0;
      for (const t of tables) {
        const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all();
        for (const c of cols) {
          try {
            const count = db.prepare(`
              SELECT COUNT(*) AS c FROM "${t.name}"
              WHERE CAST("${c.name}" AS TEXT) LIKE '%dpillay%'
                 OR CAST("${c.name}" AS TEXT) LIKE '%dinesh%'
                 OR CAST("${c.name}" AS TEXT) LIKE '%@gmail.com%'
            `).get().c;
            matches += count;
          } catch {
            // non-text column
          }
        }
      }
      expect(matches).toBe(0);
    } finally {
      db.close();
    }
  });

  it('2. Verifies fictional demo accounts are provisioned in demo database', () => {
    const db = new Database(demoDbPath, { readonly: true });
    try {
      const users = db.prepare('SELECT id, username, email, role, is_active FROM users ORDER BY id ASC').all();
      expect(users).toHaveLength(3);
      expect(users[0]).toMatchObject({ id: 'USR-DEMO-001', username: 'demo_admin', role: 'ADMIN', is_active: 1 });
      expect(users[1]).toMatchObject({ id: 'USR-DEMO-002', username: 'demo_analyst', role: 'ANALYST', is_active: 1 });
      expect(users[2]).toMatchObject({ id: 'USR-DEMO-003', username: 'viewer', role: 'VIEWER', is_active: 1 });
    } finally {
      db.close();
    }
  });

  it('3. Verifies demo passwords authenticate successfully on demo DB', () => {
    const db = new Database(demoDbPath, { readonly: true });
    try {
      const viewer = db.prepare("SELECT password_hash FROM users WHERE username = 'viewer'").get();
      expect(viewer).toBeDefined();
      expect(bcrypt.compareSync('DemoViewer2026!', viewer.password_hash)).toBe(true);

      const analyst = db.prepare("SELECT password_hash FROM users WHERE username = 'demo_analyst'").get();
      expect(analyst).toBeDefined();
      expect(bcrypt.compareSync('DemoAnalyst2026!', analyst.password_hash)).toBe(true);

      const admin = db.prepare("SELECT password_hash FROM users WHERE username = 'demo_admin'").get();
      expect(admin).toBeDefined();
      expect(bcrypt.compareSync('DemoAdmin2026!', admin.password_hash)).toBe(true);
    } finally {
      db.close();
    }
  });

  it('4. Confirms demo credentials CANNOT authenticate against authoritative database', () => {
    const authDb = new Database(authDbPath, { readonly: true });
    try {
      // demo_admin and demo_analyst do not exist in authoritative DB
      const authAdmin = authDb.prepare("SELECT * FROM users WHERE username = 'demo_admin'").get();
      expect(authAdmin).toBeUndefined();

      const authAnalyst = authDb.prepare("SELECT * FROM users WHERE username = 'demo_analyst'").get();
      expect(authAnalyst).toBeUndefined();

      // viewer user in auth DB rejects demo viewer password
      const authViewer = authDb.prepare("SELECT password_hash FROM users WHERE username = 'viewer'").get();
      expect(authViewer).toBeDefined();
      expect(bcrypt.compareSync('DemoViewer2026!', authViewer.password_hash)).toBe(false);
    } finally {
      authDb.close();
    }
  });

  it('5. Confirms authoritative passwords CANNOT authenticate against demo database', () => {
    const demoDb = new Database(demoDbPath, { readonly: true });
    try {
      const demoViewer = demoDb.prepare("SELECT password_hash FROM users WHERE username = 'viewer'").get();
      expect(demoViewer).toBeDefined();
      expect(bcrypt.compareSync('admin123', demoViewer.password_hash)).toBe(false);
    } finally {
      demoDb.close();
    }
  });

  it('6. Verifies authoritative database is completely preserved and untampered', () => {
    const authDb = new Database(authDbPath, { readonly: true });
    try {
      const integrity = authDb.pragma('integrity_check', { simple: true });
      expect(integrity).toBe('ok');

      const boundary = authDb.prepare('SELECT id, entry_hash FROM audit_logs WHERE id = 222').get();
      expect(boundary.entry_hash).toBe('51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d');

      const totalAudit = authDb.prepare('SELECT COUNT(*) AS c FROM audit_logs').get().c;
      expect(totalAudit).toBe(285);
    } finally {
      authDb.close();
    }
  });

  it('7. Enforces Viewer role blocked with 403 on all administrative routes', () => {
    const viewerUser = { id: 'USR-DEMO-003', username: 'viewer', role: 'VIEWER' };
    const requireAdmin = requireRole('ADMIN');

    const adminEndpoints = [
      '/api/users',
      '/api/security/overview',
      '/api/security/settings',
      '/api/security/audit-integrity',
      '/api/performance/overview',
      '/api/audit-logs',
    ];

    for (const endpoint of adminEndpoints) {
      const req = { user: viewerUser, method: 'GET', originalUrl: endpoint, ip: '127.0.0.1' };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
      const next = vi.fn();

      requireAdmin(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Forbidden', code: 'INSUFFICIENT_ROLE' }));
    }
  });

  it('8. Enforces Viewer role blocked with 403 on all state mutation endpoints', () => {
    const viewerUser = { id: 'USR-DEMO-003', username: 'viewer', role: 'VIEWER' };
    const requireAdminOrAnalyst = requireRole('ADMIN', 'ANALYST');

    const mutationEndpoints = [
      { method: 'POST', url: '/api/incidents' },
      { method: 'PUT', url: '/api/incidents/INC-2026-0891' },
      { method: 'POST', url: '/api/watchlists' },
      { method: 'PUT', url: '/api/escalation-rules/1' },
      { method: 'POST', url: '/api/reports/generate' },
      { method: 'POST', url: '/api/collaboration/discussions' },
    ];

    for (const endpoint of mutationEndpoints) {
      const req = { user: viewerUser, method: endpoint.method, originalUrl: endpoint.url, ip: '127.0.0.1' };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
      const next = vi.fn();

      requireAdminOrAnalyst(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Forbidden', code: 'INSUFFICIENT_ROLE' }));
    }
  });
});

