import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import db, { initializeDatabase, closeDatabase } from '../db/database.js';
import { computeAuditEntryHash } from '../services/securityService.js';

dotenv.config();

function validateStrongPassword(pw) {
  if (!pw || pw.length < 12) return 'Password must be at least 12 characters.';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include a number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must include a special character.';
  return null;
}

function runBootstrap() {
  const username = (process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const fullName = (process.env.BOOTSTRAP_ADMIN_NAME || 'GRICC System Administrator').trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';

  if (!email) {
    console.error('[BOOTSTRAP ERROR] BOOTSTRAP_ADMIN_EMAIL environment variable is required.');
    process.exit(1);
  }

  const pwError = validateStrongPassword(password);
  if (pwError) {
    console.error(`[BOOTSTRAP ERROR] Invalid BOOTSTRAP_ADMIN_PASSWORD: ${pwError}`);
    process.exit(1);
  }

  initializeDatabase();

  const existingAdmin = db.prepare("SELECT id, username FROM users WHERE role = 'ADMIN' AND is_active = 1 LIMIT 1").get();
  if (existingAdmin) {
    console.error(`[BOOTSTRAP ABORTED] An active ADMIN user already exists (username="${existingAdmin.username}").`);
    closeDatabase();
    process.exit(1);
  }

  const userId = `USR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const passwordHash = bcrypt.hashSync(password, 12);
  const nowIso = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, username, email, full_name, department, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Command & Security Governance', ?, 'ADMIN', 1, ?, ?)
    `).run(userId, username, email, fullName, passwordHash, nowIso, nowIso);

    db.prepare(`
      INSERT INTO role_assignments (user_id, role, assigned_by)
      VALUES (?, 'ADMIN', 'BOOTSTRAP_CLI')
    `).run(userId);

    const lastRow = db.prepare('SELECT entry_hash FROM audit_logs WHERE entry_hash IS NOT NULL ORDER BY id DESC LIMIT 1').get();
    const prevHash = lastRow?.entry_hash || 'GENESIS';
    const details = `Bootstrapped initial production ADMIN account "${username}".`;
    const entryHash = computeAuditEntryHash(prevHash, {
      userId: null,
      username: 'bootstrap-cli',
      userRole: 'SYSTEM',
      action: 'PRODUCTION_ADMIN_BOOTSTRAPPED',
      resourceType: 'user',
      recordId: userId,
      details,
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
      createdAt: nowIso,
    });

    db.prepare(`
      INSERT INTO audit_logs (user_id, username, user_role, action, resource_type, record_id, details, ip_address, status, prev_hash, entry_hash, created_at)
      VALUES (NULL, 'bootstrap-cli', 'SYSTEM', 'PRODUCTION_ADMIN_BOOTSTRAPPED', 'user', ?, ?, '127.0.0.1', 'SUCCESS', ?, ?, ?)
    `).run(userId, details, prevHash, entryHash, nowIso);
  });

  tx();
  closeDatabase();
  console.log(`[BOOTSTRAP SUCCESS] Initial ADMIN user "${username}" (${email}) created with ID ${userId}.`);
}

runBootstrap();

