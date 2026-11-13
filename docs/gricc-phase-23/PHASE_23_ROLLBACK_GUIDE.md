# GRICC 2.0 — Phase 23: Rollback & Disaster Recovery Guide

**Document:** `PHASE_23_ROLLBACK_GUIDE.md`  
**Phase:** 23 of 50 — Performance Optimization, Scalability Engineering & Production Preparation  
**Date:** November 13, 2026  
**Status:** VERIFIED RESTORATION PROCEDURES  

---

## 1. Overview & Rollback Scope

If any Phase 23 performance optimization or configuration adjustment causes operational instability in a deployment environment, follow the verified rollback steps documented below.

---

## 2. Database Restoration Procedures

Pre-flight baseline backups created prior to Phase 23:
- Plaintext SQLite backup: `server/backups/gricc-backup-2026-11-13T06-08-56-180Z.db`
- Authenticated encrypted backup: `server/backups/gricc-backup-2026-11-13T06-09-03-703Z.db.enc`

### 2.1 Restoring from Unencrypted Pre-Flight Backup
```bash
node -e "
import('./server/scripts/backup-database.js').then(m =>
  m.restoreDatabaseBackup({
    backupFilePath: './server/backups/gricc-backup-2026-11-13T06-08-56-180Z.db',
    targetDbPath: './server/data/gricc.db',
    overwrite: true
  })
).then(console.log);
"
```

### 2.2 Restoring from Encrypted Backup
```bash
node -e "
import('./server/scripts/backup-database.js').then(m =>
  m.restoreDatabaseBackup({
    backupFilePath: './server/backups/gricc-backup-2026-11-13T06-09-03-703Z.db.enc',
    targetDbPath: './server/data/gricc.db',
    encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
    overwrite: true
  })
).then(console.log);
"
```

---

## 3. Database Migration Rollback (Index Reversion)

If the expression index `idx_country_snapshots_lower_id` needs to be removed:
```sql
DROP INDEX IF EXISTS idx_country_snapshots_lower_id;
```
This safely removes the B-tree index without affecting table data, columns, or integrity checks.

---

## 4. Code & Git Rollback

Phase 23 milestone commits in local Git:
- Commit `a1b52ec`: `perf(frontend): Stage B code splitting, memoization, and in-flight request deduplication (-47.9% entry chunk)`

To view git history:
```bash
git log --oneline -n 5
```

To revert to the Phase 22.1 baseline commit (`4d6796f`):
```bash
git checkout 4d6796f
```
*(Do not run `git reset --hard` without verifying pre-flight database backups first).*
