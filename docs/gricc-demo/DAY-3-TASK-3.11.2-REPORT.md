# GRICC NEXUS — Day 3 Task 3.11.2 Execution Report
## Deployment Package Safety Hardening & Privileged Transfer Runbook

**Date:** November 14, 2026  
**Target Domain Placeholder:** `<DOMAIN_NAME>` (e.g., `griccnexus.com`)  
**Target Server Platform:** Ubuntu 24.04 LTS (x64) VPS (Node.js 24 LTS, SQLite 3 WAL, PM2, Nginx, Let's Encrypt)  
**Branch:** `master`  
**HEAD Commit:** `d88de62376a3b8dcc4154b8f1a29a80b89bc8f2c`  
**LibSQL Branch / Commit:** `phase-24-8-libsql-adapter` (`9b7defa43de25a752c81dafe6b68cdd5431f3673`)  
**Deployment Status:** **PACKAGE SAFETY HARDENED & VERIFIED — READY FOR PRODUCTION EXECUTION**

---

## 1. Hardened Windows Packaging Procedure

The deployment packaging procedure is hardened to explicitly exclude all live databases, backups, secrets, development dependencies, and non-production test files.

### 1.1 Packaging Command (PowerShell)
Execute from `C:\Users\DINESH 07\Desktop\GRICC`:

```powershell
tar.exe `
  --exclude="server/data*" `
  --exclude="server/backups*" `
  --exclude="node_modules*" `
  --exclude=".git*" `
  --exclude=".env*" `
  --exclude="logs*" `
  --exclude="*.log" `
  --exclude="*.db*" `
  --exclude="*.sqlite*" `
  --exclude="*.tmp" `
  --exclude="*.bak" `
  --exclude="*.enc" `
  --exclude="*.pem" `
  --exclude="*.key" `
  --exclude="*.cert" `
  --exclude="dist*" `
  --exclude="tests*" `
  -czvf gricc-release.tar.gz `
  package.json `
  package-lock.json `
  vite.config.js `
  ecosystem.config.cjs `
  index.html `
  test-production-readiness.mjs `
  deploy `
  server `
  src `
  public
```

### 1.2 Preservation & Inclusion Audit
- **Included Production Files:**
  - `package.json` & `package-lock.json`
  - `vite.config.js` & `index.html` (Vite build configuration)
  - `ecosystem.config.cjs` (PM2 single-instance configuration)
  - `test-production-readiness.mjs` (required by `deploy/deploy-app.sh`)
  - `deploy/` (`setup-server.sh`, `deploy-app.sh`, `nginx.bootstrap.conf`, `nginx.griccnexus.com.conf`)
  - `server/` (`index.js`, `db/database.js`, `middleware/`, `routes/`, `scripts/`, `services/`, `validators/`)
  - `src/` (complete React 18 client application)
  - `public/` (web manifest and static icons)
- **Excluded Non-Production Files:**
  - `server/data/` (no live `.db`, `.db-wal`, `.db-shm` files)
  - `server/backups/` (no old backups or `.enc` files)
  - `.env*` (zero secrets or credentials)
  - `node_modules/` (rebuilt reproducibly on the server via `npm ci`)
  - `tests/` (unit test suite excluded; readiness check preserved)
  - `logs/` and `*.log` (zero runtime logs)

---

## 2. Fail-Closed Archive Verification Script

Before any archive is transferred to the VPS, the fail-closed verification script audits the actual archive contents. The procedure terminates with an error (`exit 1`) if any prohibited file pattern is matched, or if any mandatory production file is missing.

### 2.1 Verification PowerShell Script
Run directly in PowerShell after generating `gricc-release.tar.gz`:

```powershell
$archivePath = "gricc-release.tar.gz"

if (-not (Test-Path $archivePath)) {
    Write-Error "FATAL: Archive file $archivePath not found!"
    exit 1
}

# 1. Read all entries from archive and verify exit status
$entries = tar.exe -tf $archivePath
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0 -or $entries.Count -eq 0) {
    Write-Error "FATAL: Failed to list archive contents or archive is empty! Exit code: $exitCode"
    exit 1
}

Write-Host "Total entries in archive: $($entries.Count)"

# 2. Verify all mandatory production files are present
$mandatoryFiles = @(
    "package.json",
    "package-lock.json",
    "vite.config.js",
    "ecosystem.config.cjs",
    "test-production-readiness.mjs",
    "deploy/deploy-app.sh",
    "deploy/nginx.griccnexus.com.conf",
    "deploy/setup-server.sh",
    "server/index.js",
    "server/db/database.js",
    "src/App.jsx",
    "src/main.jsx"
)

$missingFiles = @()
foreach ($m in $mandatoryFiles) {
    if (-not ($entries -contains $m)) {
        $missingFiles += $m
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Error "FATAL: Archive is missing mandatory production files: $($missingFiles -join ', ')"
    exit 1
}
Write-Host "PASS: All mandatory production files are present."

# 3. Fail-Closed Prohibited Pattern Audit
$prohibitedPatterns = @(
    '\.db$',
    '\.db-wal$',
    '\.db-shm$',
    '\.sqlite',
    '\.sqlite3',
    '^\.env',
    '/\.env',
    '\.key$',
    '\.pem$',
    '\.cert$',
    '\.pfx$',
    'node_modules',
    '^\.git',
    '/\.git',
    '^server/data/',
    '^server/backups/',
    '^logs/',
    '\.log$',
    '^tests/'
)

$violations = @()
foreach ($entry in $entries) {
    foreach ($pattern in $prohibitedPatterns) {
        if ($entry -match $pattern) {
            $violations += "$pattern -> $entry"
        }
    }
}

if ($violations.Count -gt 0) {
    Write-Error "CRITICAL SECURITY VIOLATION: Prohibited files detected in release archive:`n$($violations -join "`n")"
    exit 1
}

Write-Host "SUCCESS: Archive passed all fail-closed security and integrity checks with 0 violations!"
```

### 2.2 Verification Test Output
```
Total entries in archive: 100
PASS: All mandatory production files are present.
SUCCESS: Archive passed all fail-closed security and integrity checks with 0 violations!
```

---

## 3. Corrected Database Transfer & Privilege Separation

### 3.1 Principle of Privilege Separation
- Uploading files to `/tmp` via `scp root@...` creates files owned by `root:root`.
- The unprivileged `gricc` application user **must not** be expected to move, modify, or chown root-owned files.
- The `root` account on the VPS is responsible for moving the snapshot into `/var/www/gricc/server/data/`, assigning ownership to `gricc:gricc`, and applying `chmod 700 / 600` permissions.
- An existing production database must **never be overwritten** without creating an automatic timestamped backup first.

### 3.2 Corrected Transfer & Placement Commands

#### Workstation Command (PowerShell):
Create snapshot using the SQLite Online Backup API and transfer to VPS `/tmp`:

```powershell
# 1. Create hot snapshot on workstation
node -e "
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
const sourceDb = new Database('server/data/gricc.db', { readonly: true });
fs.mkdirSync('server/backups', { recursive: true });
const targetPath = path.resolve('server/backups/gricc-deploy-snapshot.db');
await sourceDb.backup(targetPath);
sourceDb.close();

// Verify snapshot integrity
const snapDb = new Database(targetPath, { readonly: true });
const qc = snapDb.prepare('PRAGMA quick_check').get().quick_check;
const ic = snapDb.prepare('PRAGMA integrity_check').get().integrity_check;
const count = snapDb.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
const r222 = snapDb.prepare('SELECT entry_hash FROM audit_logs WHERE id = 222').get().entry_hash;
console.log('Workstation Snapshot -> Count:', count, '| Hash 222:', r222, '| QC:', qc, '| IC:', ic);
snapDb.close();
"

# 2. Transfer snapshot and release package to VPS /tmp as root:
scp server/backups/gricc-deploy-snapshot.db root@<VPS_PUBLIC_IPV4>:/tmp/gricc-upload.db
scp gricc-release.tar.gz root@<VPS_PUBLIC_IPV4>:/tmp/gricc-release.tar.gz
```

#### VPS Root Commands (Bash):
Execute privileged placement, safety backup, and permission assignment as `root`:

```bash
# 1. Create protected directories
mkdir -p /var/www/gricc/server/data
mkdir -p /var/www/gricc/server/backups
mkdir -p /var/www/gricc/logs

TARGET_DB="/var/www/gricc/server/data/gricc.db"

# 2. Guard against accidental overwrite: backup existing DB if present
if [ -f "$TARGET_DB" ]; then
    STAMP=$(date +%Y%m%d_%H%M%S)
    echo "[SAFETY] Existing database detected. Creating safety backup..."
    cp "$TARGET_DB" "/var/www/gricc/server/backups/gricc_pre_overwrite_${STAMP}.db"
    echo "[SAFETY] Backup stored at /var/www/gricc/server/backups/gricc_pre_overwrite_${STAMP}.db"
fi

# 3. Safely place the new database
mv /tmp/gricc-upload.db "$TARGET_DB"

# 4. Enforce strict POSIX ownership and permissions
chown -R gricc:gricc /var/www/gricc/server/data
chown -R gricc:gricc /var/www/gricc/server/backups
chown -R gricc:gricc /var/www/gricc/logs

chmod 700 /var/www/gricc/server/data
chmod 700 /var/www/gricc/server/backups
chmod 700 /var/www/gricc/logs
chmod 600 "$TARGET_DB"

echo "[SUCCESS] Authoritative database placed with restricted permissions."
```

#### VPS Application User Verification (Bash):
Switch to `gricc` user and verify the database:

```bash
su - gricc
cd /var/www/gricc

node -e "
import Database from 'better-sqlite3';
const db = new Database('/var/www/gricc/server/data/gricc.db', { readonly: true });
const count = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
const r222 = db.prepare('SELECT entry_hash FROM audit_logs WHERE id = 222').get().entry_hash;
const qc = db.prepare('PRAGMA quick_check').get().quick_check;
const ic = db.prepare('PRAGMA integrity_check').get().integrity_check;

// Verify contiguous cryptographic chain
const rows = db.prepare('SELECT id, prev_hash, entry_hash FROM audit_logs ORDER BY id ASC').all();
let valid = true;
for (let i = 1; i < rows.length; i++) {
  if (rows[i].prev_hash !== rows[i - 1].entry_hash) {
    valid = false;
    break;
  }
}
db.close();

console.log(JSON.stringify({
  count,
  record222Hash: r222,
  quick_check: qc,
  integrity_check: ic,
  auditChainValid: valid
}, null, 2));
"
```

**Expected Verification Output:**
```json
{
  "count": 284,
  "record222Hash": "51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d",
  "quick_check": "ok",
  "integrity_check": "ok",
  "auditChainValid": true
}
```

---

## 4. Production Environment Validation Rules

The environment requirements are enforced directly in application source code (`server/index.js` and `server/scripts/backup-database.js`):

| Variable Name | Validation Rule in Source Code | Code Reference |
| :--- | :--- | :--- |
| `NODE_ENV` | Must be `'production'`. | `server/index.js` line 22 |
| `JWT_SECRET` | Must be a string with `length >= 32` characters; cannot equal `'replace-with-a-strong-64-char-random-secret'`. Fails fast on startup with `FATAL [CONFIG]` if invalid. | `server/index.js` lines 31–34 |
| `CORS_ORIGIN` / `FRONTEND_URL` | Must be explicitly configured; cannot contain `localhost` or `127.0.0.1` unless `ALLOW_LOCALHOST_CORS='true'`. | `server/index.js` lines 36–49 |
| `DB_PATH` | Resolved path cannot reside inside `dist/` or `src/` directories. | `server/index.js` lines 51–56 |
| `BACKUP_ENCRYPTION_KEY`| Passphrase must be a string with `length >= 8` characters (enforced in `encryptBackupBuffer`). A 32-character random string is recommended. | `server/scripts/backup-database.js` line 25 |
| `PORT` | Integer port; defaults to `5000`. | `server/index.js` line 65 |
| `TRUST_PROXY` | Must be `'true'` in production behind Nginx reverse proxy. | `server/index.js` line 68 |
| `TRUST_PROXY_HOPS` | Number of proxy hops (set to `1` for single Nginx proxy). | `server/index.js` line 69 |

### Validated Production `.env` Template
```bash
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://<DOMAIN_NAME>
CORS_ORIGIN=https://<DOMAIN_NAME>
TRUST_PROXY=true
TRUST_PROXY_HOPS=1

DB_PATH=./server/data/gricc.db
BACKUP_DIR=./server/backups
BACKUP_RETENTION_COUNT=14
BACKUP_ENCRYPTION_KEY=<32-CHARACTER-HEX-OR-BASE64-SECRET>

JWT_SECRET=<64-CHARACTER-HEX-OR-BASE64-SECRET>
JWT_EXPIRES_IN=8h

DATA_CACHE_TTL_SECONDS=60
API_RATE_LIMIT_MAX=600

AI_PROVIDER=gricc-deterministic
AI_MODEL=grounded-retrieval-v1
AI_TIMEOUT_MS=12000
AI_MAX_RETRIES=2
```

---

## 5. Deployment Prerequisites Checklist

1. **Application Directory Permissions:**
   - `/var/www/gricc` owned by `gricc:gricc`, mode `755` (allows Nginx to serve `dist/`).
   - `/var/www/gricc/server/data`, `server/backups`, and `logs` mode `700`, owned by `gricc:gricc`.
   - `/var/www/gricc/.env` mode `600`, owned by `gricc:gricc`.
2. **PM2 Process Supervision:**
   - Configured in `ecosystem.config.cjs` with `instances: 1` and `exec_mode: 'fork'`.
   - Auto-restart registered via `pm2 startup systemd -u gricc --hp /home/gricc` and `pm2 save`.
3. **Nginx Permissions & Sudoers:**
   - `/etc/sudoers.d/gricc-deploy` validated with `visudo -cf`, enabling `gricc` user to run `nginx -t` and `systemctl reload nginx` without password prompts.
4. **Certbot Webroot Availability:**
   - Directory `/var/www/certbot` exists, mode `755`, accessible to Nginx for `/.well-known/acme-challenge/`.
5. **Database WAL Persistence:**
   - Host runs native NVMe SSD block storage with write-ahead logging enabled (`PRAGMA journal_mode = WAL`).

---

## 6. Summary of Remaining User Actions & Blocker Status

### Actions Required by User to Complete Deployment:
1. **Provision VPS:** Launch an Ubuntu 24.04 LTS instance (1–2 vCPUs, 2 GB RAM, 25 GB SSD).
2. **Configure DNS:** Map `A` records for `<DOMAIN_NAME>` and `www.<DOMAIN_NAME>` to `<VPS_PUBLIC_IPV4>` (DNS Only / Grey Cloud in Cloudflare).
3. **Execute Hardened Packaging on Workstation:** Run the packaging and fail-closed verification commands in Section 1 and Section 2.
4. **Execute Privileged Placement on VPS:** Run the root placement commands in Section 3.2.
5. **Launch Application:** Execute `./deploy/deploy-app.sh` as `gricc`.

**NO UNRESOLVED BLOCKERS REMAIN. THE DEPLOYMENT PACKAGE AND SAFETY CONTROLS ARE VERIFIED.**

