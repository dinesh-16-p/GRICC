# GRICC 2.0 — Phase 24: Database Deployment & Migration Guide

**Document:** `DATABASE_DEPLOYMENT_AND_MIGRATION.md`  
**Phase:** 24 of 50 — Public VPS Hosting, Domain Connection, DNS, Nginx, HTTPS & Production Deployment  
**Domain:** `griccglobal.com`  
**Status:** MIGRATION PLAN READY  

---

## 1. Authoritative Source Database Verification

Before migrating to the production VPS:
- **Authoritative Database:** `c:\Users\DINESH 07\Desktop\GRICC\server\data\gricc.db`
- **Schema:** 42 tables, 68 indexes.
- **Audit Ledger:** 271 total records.
- **Genesis Boundary:** Row ID 222 with canonical hash `51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d`.
- **Pre-Flight Encrypted Backup:** `server/backups/gricc-backup-2026-11-13T06-55-25-837Z.db.enc`.

---

## 2. Safe Database Transfer Procedure

Because SQLite is running in WAL mode, copying the file directly while active can lead to journal inconsistency. The transfer procedure uses an authenticated export:

### Step 1: Generate Quiesced Local Backup
```bash
node -e "
import('./server/scripts/backup-database.js').then(m =>
  m.createDatabaseBackup({ encryptionKey: process.env.BACKUP_ENCRYPTION_KEY })
).then(console.log);
"
```

### Step 2: Transfer Encrypted Archive to VPS
```bash
scp server/backups/gricc-backup-*.db.enc gricc@<VPS_IP>:/var/www/gricc/server/backups/
```

### Step 3: Decrypt and Restore on VPS Target
```bash
ssh gricc@<VPS_IP>
cd /var/www/gricc
node server/scripts/backup-database.js --restore="server/backups/gricc-backup-*.db.enc" --key="$BACKUP_ENCRYPTION_KEY" --force
```

### Step 4: Post-Restore Verification Checks
On the VPS:
1. `PRAGMA integrity_check;` $\rightarrow$ `ok`.
2. Verify Row ID 222 hash matches `51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d`.
3. Verify file permissions: `chmod 600 /var/www/gricc/server/data/gricc.db`.

