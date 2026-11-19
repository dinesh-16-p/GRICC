import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SOURCE_DB_PATH = path.resolve('./server/data/gricc.db');
const DEMO_DB_PATH = path.resolve('./server/data/gricc-demo.db');

export async function createDemoDatabase({
  sourcePath = SOURCE_DB_PATH,
  targetPath = DEMO_DB_PATH,
} = {}) {
  const resolvedSource = path.resolve(sourcePath);
  const resolvedTarget = path.resolve(targetPath);

  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Authoritative database not found at ${resolvedSource}`);
  }

  // Ensure target directory exists
  const targetDir = path.dirname(resolvedTarget);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Remove stale demo db if present
  if (fs.existsSync(resolvedTarget)) {
    fs.unlinkSync(resolvedTarget);
  }
  const walPath = `${resolvedTarget}-wal`;
  const shmPath = `${resolvedTarget}-shm`;
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  console.log(`[DEMO DB] Initiating SQLite Online Backup from ${resolvedSource} to ${resolvedTarget}...`);

  // Open source strictly in read-only mode to prevent any modification to authoritative DB
  const sourceDb = new Database(resolvedSource, { readonly: true });
  try {
    await sourceDb.backup(resolvedTarget);
  } finally {
    sourceDb.close();
  }

  console.log('[DEMO DB] Backup snapshot complete. Verifying demo database integrity...');

  // Independently verify demo database
  const demoDb = new Database(resolvedTarget, { readonly: true });
  let integrity;
  let quickCheck;
  let tableCount;
  let userCount;
  let auditCount;
  let boundaryRecord;

  try {
    integrity = demoDb.pragma('integrity_check', { simple: true });
    quickCheck = demoDb.pragma('quick_check', { simple: true });
    tableCount = demoDb.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().c;
    userCount = demoDb.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    auditCount = demoDb.prepare('SELECT COUNT(*) AS c FROM audit_logs').get().c;
    boundaryRecord = demoDb.prepare('SELECT id, entry_hash, action FROM audit_logs WHERE id = 222').get();
  } finally {
    demoDb.close();
  }

  if (integrity !== 'ok') {
    throw new Error(`Demo database integrity_check failed: ${integrity}`);
  }
  if (quickCheck !== 'ok') {
    throw new Error(`Demo database quick_check failed: ${quickCheck}`);
  }

  const expectedBoundaryHash = '51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d';
  if (boundaryRecord?.entry_hash !== expectedBoundaryHash) {
    throw new Error(`Demo database boundary hash mismatch on row 222: got ${boundaryRecord?.entry_hash}, expected ${expectedBoundaryHash}`);
  }

  console.log('[DEMO DB] Independent verification passed:');
  console.log(`  - integrity_check: ${integrity}`);
  console.log(`  - quick_check: ${quickCheck}`);
  console.log(`  - tables: ${tableCount}`);
  console.log(`  - users: ${userCount}`);
  console.log(`  - audit records: ${auditCount}`);
  console.log(`  - boundary row 222 hash: ${boundaryRecord.entry_hash}`);

  // Prove isolation: write to demo db and ensure authoritative db has 0 changes
  const rwDemoDb = new Database(resolvedTarget);
  try {
    rwDemoDb.pragma('journal_mode = WAL');
    rwDemoDb.prepare(`
      INSERT INTO activity_logs (entity_type, entity_id, action, description, severity, actor)
      VALUES ('system', 'ISOLATION-TEST', 'DEMO_ISOLATION_CHECK', 'Demo DB isolation probe', 'Low', 'test')
    `).run();
  } finally {
    rwDemoDb.close();
  }

  // Check source DB (read-only)
  const verifySourceDb = new Database(resolvedSource, { readonly: true });
  try {
    const probe = verifySourceDb.prepare("SELECT COUNT(*) AS c FROM activity_logs WHERE entity_id = 'ISOLATION-TEST'").get().c;
    if (probe !== 0) {
      throw new Error('CRITICAL ISOLATION FAILURE: Test record leaked into authoritative database!');
    }
  } finally {
    verifySourceDb.close();
  }

  // Clean up probe record from demo DB
  const cleanDemoDb = new Database(resolvedTarget);
  try {
    cleanDemoDb.prepare("DELETE FROM activity_logs WHERE entity_id = 'ISOLATION-TEST'").run();
  } finally {
    cleanDemoDb.close();
  }

  console.log('[DEMO DB] Database isolation verified: demo database is completely isolated.');

  return {
    sourcePath: resolvedSource,
    targetPath: resolvedTarget,
    tables: tableCount,
    users: userCount,
    auditRecords: auditCount,
    boundaryHash: boundaryRecord.entry_hash,
    verified: true,
  };
}

// Direct CLI invocation
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename || '')) {
  createDemoDatabase()
    .then((res) => {
      console.log('[DEMO DB] Successfully created and verified demo database:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[DEMO DB ERROR]', err);
      process.exit(1);
    });
}
