# GRICC – Backup & Recovery Guide (`BACKUP_RECOVERY.md`)

## Backup Mechanism
GRICC uses `server/scripts/backup-database.js`, which calls `better-sqlite3`'s native online `db.backup()` API. This creates a transactionally consistent snapshot even while WAL writes are active—never copy only the raw `.db` file while the server is running without WAL checkpointing.

## Creating a Backup

```bash
npm run backup:db
```

- Reads `DB_PATH` (default `./server/data/gricc.db`)
- Writes timestamped snapshot to `BACKUP_DIR` (`gricc-backup-YYYY-MM-DDTHH-MM-SS-SSSZ.db`)
- Runs `PRAGMA integrity_check` on the backup file
- Prunes backups older than `BACKUP_RETENTION_COUNT` (default `14`)

## Recommended Backup Schedule
- **Automated Daily Cron**: Run `npm run backup:db` daily at `02:00 UTC` via `cron`:
  ```cron
  0 2 * * * cd /var/www/gricc && /usr/bin/npm run backup:db >> /var/log/gricc-backup.log 2>&1
  ```
- **Off-Server Replication**: Sync `/var/backups/gricc` to encrypted off-server object storage after each backup.
- **Pre-Upgrade Backup**: Always run `npm run backup:db` before deploying updates.

## Restoring a Backup

1. **Verify into a temporary path first** (never overwrite the live DB without testing):
   ```bash
   node server/scripts/backup-database.js --restore /var/backups/gricc/<backup-file>.db --target /tmp/gricc-restore-test.db
   ```
2. **Production Restore**:
   ```bash
   pm2 stop gricc-backend
   node server/scripts/backup-database.js --restore /var/backups/gricc/<backup-file>.db --target /var/lib/gricc/gricc.db --force
   pm2 start ecosystem.config.cjs --env production
   ```
3. **Post-Restore Verification**:
   - Check `GET /api/health` returns `database: "CONNECTED"`.
   - Log in as `ADMIN` and verify `GET /api/security/audit-integrity` returns `valid: true`.

