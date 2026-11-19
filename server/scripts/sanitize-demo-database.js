import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { computeAuditEntryHash } from '../services/securityService.js';

const DEMO_DB_PATH = path.resolve('./server/data/gricc-demo.db');
const AUTH_DB_PATH = path.resolve('./server/data/gricc.db');

export function sanitizeDemoDatabase(demoDbPath = DEMO_DB_PATH) {
  const resolvedDemoDb = path.resolve(demoDbPath);
  const resolvedAuthDb = path.resolve(AUTH_DB_PATH);

  if (resolvedDemoDb === resolvedAuthDb) {
    throw new Error('FATAL: Attempted to run demo sanitization on authoritative database! Operation blocked.');
  }

  if (!fs.existsSync(resolvedDemoDb)) {
    throw new Error(`Demo database not found at ${resolvedDemoDb}. Run createDemoDatabase() first.`);
  }

  console.log(`[SANITIZE] Sanitizing demo database at ${resolvedDemoDb}...`);

  const db = new Database(resolvedDemoDb);

  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = OFF'); // temporarily off for atomic re-seeding

    const tx = db.transaction(() => {
      // 1. Remove automated test artifacts from incidents
      const deletedIncidents = db.prepare("DELETE FROM incidents WHERE id LIKE 'TEST-%'").run();
      console.log(`  - Cleaned ${deletedIncidents.changes} test incident artifacts.`);

      // 2. Sanitize users table: replace real personal identities with fictional demo accounts
      // Fresh demo password hashes
      const viewerHash = bcrypt.hashSync('DemoViewer2026!', 10);
      const analystHash = bcrypt.hashSync('DemoAnalyst2026!', 10);
      const adminHash = bcrypt.hashSync('DemoAdmin2026!', 10);

      db.prepare('DELETE FROM users').run();
      db.prepare('DELETE FROM role_assignments').run();

      const insertUser = db.prepare(`
        INSERT INTO users (id, username, email, full_name, department, password_hash, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `);

      const insertRole = db.prepare(`
        INSERT INTO role_assignments (id, user_id, role, assigned_by, assigned_at)
        VALUES (?, ?, ?, 'DEMO_PROVISIONER', datetime('now'))
      `);

      insertUser.run('USR-DEMO-001', 'demo_admin', 'admin@gricc.demo', 'Director Marcus Vance (Demo)', 'Command & Security Governance', adminHash, 'ADMIN');
      insertRole.run(1, 'USR-DEMO-001', 'ADMIN');

      insertUser.run('USR-DEMO-002', 'demo_analyst', 'analyst@gricc.demo', 'Elena Rostova (Demo)', 'Global Threat Analysis Unit', analystHash, 'ANALYST');
      insertRole.run(2, 'USR-DEMO-002', 'ANALYST');

      insertUser.run('USR-DEMO-003', 'viewer', 'viewer@gricc.demo', 'Julian Thorne (Demo)', 'Executive Oversight Briefings', viewerHash, 'VIEWER');
      insertRole.run(3, 'USR-DEMO-003', 'VIEWER');

      console.log('  - Users sanitized: 3 fictional accounts provisioned (demo_admin, demo_analyst, viewer).');
      console.log('  - All authoritative password hashes purged and replaced with isolated demo hashes.');

      // 3. Sanitize audit logs: mask any personal email, username, or name in details
      db.prepare(`
        UPDATE audit_logs
        SET details = replace(replace(replace(replace(details, 'dpillay851@gmail.com', 'analyst@gricc.demo'), 'dpillay851', 'demo_analyst'), 'Dinesh Pillay', 'Elena Rostova'), '@gmail.com', '@gricc.demo'),
            username = CASE
              WHEN username LIKE '%dpillay%' THEN 'demo_analyst'
              WHEN username = 'operator' THEN 'demo_operator'
              ELSE replace(username, '@gmail.com', '@gricc.demo')
            END
      `).run();

      // Mask external IP addresses to private subnet in audit logs
      db.prepare(`
        UPDATE audit_logs
        SET ip_address = '10.0.0.1'
        WHERE ip_address IS NOT NULL AND ip_address NOT IN ('127.0.0.1', '::1')
      `).run();

      console.log('  - Audit logs sanitized: masked personal identifiers and external IPs.');

      // 3b. Reconcile demo cryptographic audit chain with sanitized records
      const auditRows = db.prepare('SELECT * FROM audit_logs ORDER BY id ASC').all();
      let prevHash = 'GENESIS';
      const updateHashStmt = db.prepare('UPDATE audit_logs SET prev_hash = ?, entry_hash = ? WHERE id = ?');
      for (const row of auditRows) {
        const calculatedHash = computeAuditEntryHash(prevHash, {
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
        updateHashStmt.run(prevHash, calculatedHash, row.id);
        prevHash = calculatedHash;
      }
      console.log(`  - Rehashed cryptographic chain for ${auditRows.length} audit records in demo database.`);

      // 4. Sanitize security events: mask IPs and references
      db.prepare(`
        UPDATE security_events
        SET ip_address = '10.0.0.1'
        WHERE ip_address IS NOT NULL AND ip_address NOT IN ('127.0.0.1', '::1')
      `).run();

      db.prepare(`
        UPDATE security_events
        SET description = replace(replace(replace(description, 'dpillay851@gmail.com', 'analyst@gricc.demo'), 'dpillay851', 'demo_operator'), '@gmail.com', '@gricc.demo')
      `).run();

      console.log('  - Security events sanitized.');

      // 5. Clean up stale revoked tokens & notification read tracking in demo DB
      db.prepare('DELETE FROM revoked_tokens').run();
      db.prepare('DELETE FROM notification_reads').run();
      db.prepare('DELETE FROM notification_preferences').run();

      console.log('  - Session tokens and read caches purged.');
    });

    tx();

    db.pragma('foreign_keys = ON');

    // Run integrity check on sanitized demo database
    const check = db.pragma('integrity_check', { simple: true });
    if (check !== 'ok') {
      throw new Error(`Demo database integrity_check failed after sanitization: ${check}`);
    }

    console.log('[SANITIZE] Demo database sanitized successfully. Integrity: ok.');

    return {
      sanitized: true,
      demoDbPath: resolvedDemoDb,
      usersProvisioned: 3,
      integrity: check,
    };
  } finally {
    db.close();
  }
}

// Direct CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename || '')) {
  try {
    const res = sanitizeDemoDatabase();
    console.log('[SANITIZE COMPLETE]', res);
    process.exit(0);
  } catch (err) {
    console.error('[SANITIZE ERROR]', err);
    process.exit(1);
  }
}
