import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { computeAuditEntryHash } from '../services/securityService.js';
import { createDatabaseBackup } from './backup-database.js';

dotenv.config();

const dbPath = path.resolve(process.env.DB_PATH || './server/data/gricc.db');
const isApply = process.argv.includes('--apply') || process.argv.includes('--reconcile');

console.log('====================================================');
console.log('  GRICC Audit Chain Reconciliation Utility (Phase 22)');
console.log(`  Database: ${dbPath}`);
console.log(`  Mode:     ${isApply ? 'APPLY (WITH AUTO-BACKUP)' : 'DRY RUN (Preview Only)'}`);
console.log('====================================================');

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  process.exit(1);
}

// 1. If applying, create a safety backup first
if (isApply) {
  console.log('[BACKUP] Creating pre-rehash safety backup...');
  const backup = await createDatabaseBackup({
    sourceDbPath: dbPath,
    backupDir: path.resolve('./server/backups'),
    retentionCount: 30,
  });
  console.log(`[BACKUP] Completed safely: ${backup.backupFileName} (${backup.sizeBytes} bytes)`);
}

const db = new Database(dbPath);
const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id ASC').all();

console.log(`[AUDIT] Found ${rows.length} total historical audit records.`);

let prevHash = 'GENESIS';
let updatedCount = 0;
let alreadyMatchedCount = 0;
const plannedUpdates = [];

for (const row of rows) {
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

  if (row.entry_hash === calculatedHash && row.prev_hash === prevHash) {
    alreadyMatchedCount += 1;
  } else {
    updatedCount += 1;
    plannedUpdates.push({
      id: row.id,
      action: row.action,
      oldPrev: row.prev_hash,
      newPrev: prevHash,
      oldEntry: row.entry_hash,
      newEntry: calculatedHash,
    });
  }

  prevHash = calculatedHash;
}

console.log(`[AUDIT] Already matched: ${alreadyMatchedCount}`);
console.log(`[AUDIT] Requiring reconciliation: ${updatedCount}`);
console.log(`[AUDIT] Final canonical chain head hash: ${prevHash}`);

if (!isApply) {
  console.log('\n[DRY RUN] No changes were written to the database.');
  console.log('[DRY RUN] Run `node server/scripts/rehash-audit-chain.js --apply` to execute reconciliation.');
  db.close();
  process.exit(0);
}

// 2. Execute reconciliation within an atomic transaction
console.log('\n[APPLY] Executing atomic transaction to write reconciled hash chain...');
const updateStmt = db.prepare('UPDATE audit_logs SET prev_hash = @newPrev, entry_hash = @newEntry WHERE id = @id');

const reconcileTx = db.transaction((updates) => {
  for (const u of updates) {
    updateStmt.run(u);
  }
});

reconcileTx(plannedUpdates);
console.log(`[APPLY] Successfully updated ${plannedUpdates.length} audit records in atomic transaction.`);

// 3. Verify reconciliation
const verifyRows = db.prepare('SELECT id, prev_hash, entry_hash FROM audit_logs ORDER BY id ASC').all();
let testHash = 'GENESIS';
let verifyValid = true;

for (const r of rows) {
  const h = computeAuditEntryHash(testHash, {
    userId: r.user_id,
    username: r.username,
    userRole: r.user_role,
    action: r.action,
    resourceType: r.resource_type,
    recordId: r.record_id,
    details: r.details,
    ipAddress: r.ip_address,
    status: r.status,
    createdAt: r.created_at,
  });
  const stored = db.prepare('SELECT prev_hash, entry_hash FROM audit_logs WHERE id = ?').get(r.id);
  if (stored.prev_hash !== testHash || stored.entry_hash !== h) {
    verifyValid = false;
    break;
  }
  testHash = h;
}

db.close();

console.log(`[VERIFY] Post-reconciliation verification check: ${verifyValid ? 'PASS (100% Cryptographic Integrity)' : 'FAIL'}`);
process.exit(verifyValid ? 0 : 1);

