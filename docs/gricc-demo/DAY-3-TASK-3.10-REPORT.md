# GRICC NEXUS — Day 3 Task 3.10 Execution Report
## Final VPS Deployment Preparation & Step-by-Step Operator Guide

**Date:** November 14, 2026  
**Target Domain:** `griccnexus.com` / `www.griccnexus.com`  
**Target Platform:** Ubuntu 24.04 LTS (x64) VPS with Node.js 24, SQLite 3 (WAL), PM2, Nginx, Let's Encrypt  
**Branch:** `master`  
**HEAD Commit:** `d88de62376a3b8dcc4154b8f1a29a80b89bc8f2c`  
**LibSQL Branch / Commit:** `phase-24-8-libsql-adapter` (`9b7defa43de25a752c81dafe6b68cdd5431f3673`)  
**Status:** All Deployment Scripts Inspected, Hardened, and Verified — Complete Production Runbook Formulated

---

## 1. Inspection of Existing Deployment Infrastructure

An end-to-end audit was conducted across all deployment and configuration files:
- `deploy/setup-server.sh`
- `deploy/deploy-app.sh`
- `deploy/nginx.bootstrap.conf`
- `deploy/nginx.griccnexus.com.conf`
- `ecosystem.config.cjs`
- `package.json`
- `.env.example`

### 1.1 Findings & Hardening Applied

| Component | File Inspected | Finding / Potential Risk | Remediation / Verification |
| :--- | :--- | :--- | :--- |
| **Log Directory Creation** | `deploy/deploy-app.sh` & `ecosystem.config.cjs` | PM2 outputs to `./logs/gricc-out.log` and `./logs/gricc-err.log`. On a fresh repository clone, `./logs` did not exist, causing potential PM2 startup failure. | **Remediated:** Added `mkdir -p "$APP_DIR/logs"` and `chmod 700 "$APP_DIR/logs"` to step 3 in `deploy/deploy-app.sh`. |
| **Nginx Certificate Bootstrap** | `deploy/nginx.bootstrap.conf` & `nginx.griccnexus.com.conf` | Loading an SSL-enabled Nginx configuration before Certbot has generated TLS certificates causes `nginx: [emerg] cannot load certificate` and prevents Nginx from starting. | **Verified:** The repository includes `nginx.bootstrap.conf` on port 80 with webroot ACME challenge handler (`/.well-known/acme-challenge/`). This guarantees certificates can be issued before SSL configuration is activated. |
| **Process Concurrency vs SQLite** | `ecosystem.config.cjs` | Running multiple PM2 cluster workers (`instances: 'max'`) against a single SQLite database file causes write-lock contention and breaks in-memory SSE connections. | **Verified:** `ecosystem.config.cjs` explicitly enforces `instances: 1` and `exec_mode: 'fork'`. |
| **Dependency Pruning Safety** | `deploy/deploy-app.sh` | Script executes `npm prune --omit=dev` after `npm run build`. | **Verified:** `npm run test:readiness` invokes `test-production-readiness.mjs`, which imports only production runtime dependencies and Node built-in modules (`assert`, `http`, `os`, `fs`). No devDependencies are required. |
| **Directory Permissions** | `deploy/setup-server.sh` & `deploy/deploy-app.sh` | SQLite database and encrypted backups require strict filesystem permissions to prevent unauthorized access. | **Verified:** `chmod 700` is enforced on `/var/www/gricc/server/data`, `/var/www/gricc/server/backups`, and `/var/www/gricc/logs`. |
| **Sudoers Automation** | `deploy/setup-server.sh` | Non-root `gricc` user requires permission to test and reload Nginx without entering a password. | **Verified:** Script installs a validated sudoers file `/etc/sudoers.d/gricc-deploy` with canonical paths (`/usr/sbin/nginx -t`, `/usr/bin/systemctl reload nginx`), verified with `visudo -cf`. |

---

## 2. Deployment Safety Confirmations

1. **Localhost Binding & UFW Inbound Isolation:**
   - In `deploy/setup-server.sh`, UFW is configured with `default deny incoming` and explicitly allows only ports `22/tcp` (SSH), `80/tcp` (HTTP/ACME), and `443/tcp` (HTTPS).
   - Port 5000 is **not** exposed to the public Internet; it is reachable only internally via localhost reverse proxy.
2. **Reverse Proxy & SSE Streaming:**
   - In `deploy/nginx.griccnexus.com.conf`, standard API calls (`/api/`) are proxied to `http://127.0.0.1:5000` with standard proxy headers (`X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`).
   - SSE streaming routes (`/api/(events|monitoring)/stream`) are routed with `proxy_buffering off`, `proxy_cache off`, `chunked_transfer_encoding on`, and `proxy_read_timeout 3600s`.
3. **Single Process Backend:**
   - `ecosystem.config.cjs` sets `instances: 1` and `exec_mode: 'fork'`.
   - Single-process execution preserves in-memory cache, SSE client tracking, background escalation monitors, and single-writer SQLite WAL concurrency.
4. **Production Secret Generation:**
   - Production secrets (`JWT_SECRET`, `BACKUP_ENCRYPTION_KEY`) must never be committed to git.
   - The deployment runbook specifies generating 256-bit random secrets via `openssl rand -hex 32` directly on the server, saved in `/var/www/gricc/.env` with `chmod 600`.
5. **Database & Storage Persistence:**
   - Native NVMe SSD block storage ensures SQLite WAL journal files (`gricc.db-wal` and `gricc.db-shm`) persist safely across process restarts and server reboots.
6. **Health Check Endpoint:**
   - Public unauthenticated health endpoint `GET /api/health` returns HTTP 200 with DB health status, operational mode, and uptime.

---

## 3. Database Backup Preparation Procedure

A verified database backup procedure was executed and tested. The procedure utilizes `better-sqlite3`'s native Online Backup API (`sourceDb.backup()`), which performs a hot backup while the database remains online, ensuring transactional consistency and zero locking of concurrent readers.

### 3.1 Step-by-Step Operator Backup Command
To create an instantaneous, consistent pre-deployment snapshot on the host:

```bash
# Execute as 'gricc' user in application root
node -e "
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const sourcePath = path.resolve('server/data/gricc.db');
const backupDir = path.resolve('server/backups');
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, \`gricc-backup-\${stamp}.db\`);

console.log('Initiating hot SQLite online backup...');
const sourceDb = new Database(sourcePath, { readonly: true });
await sourceDb.backup(backupPath);
sourceDb.close();

console.log('Verifying backup file integrity...');
const backupDb = new Database(backupPath, { readonly: true });
const qc = backupDb.prepare('PRAGMA quick_check').get();
const ic = backupDb.prepare('PRAGMA integrity_check').get();
const count = backupDb.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
const row222 = backupDb.prepare('SELECT id, prev_hash, entry_hash FROM audit_logs WHERE id = 222').get();

// Audit chain validation
const rows = backupDb.prepare('SELECT id, prev_hash, entry_hash FROM audit_logs ORDER BY id ASC').all();
let valid = true;
for (let i = 1; i < rows.length; i++) {
  if (rows[i].prev_hash !== rows[i - 1].entry_hash) {
    valid = false;
    break;
  }
}
backupDb.close();

console.log(JSON.stringify({
  backupFile: backupPath,
  quick_check: qc.quick_check,
  integrity_check: ic.integrity_check,
  auditRecordCount: count,
  boundaryRecord222: row222,
  chainValid: valid
}, null, 2));
"
```

### 3.2 Test Verification Output
Execution of this backup procedure produced the following verified results:
- **Backup Creation:** Online backup created successfully with zero interruption.
- **`quick_check`:** `ok`
- **`integrity_check`:** `ok`
- **`audit_logs` Count:** `284`
- **Boundary Record 222 Hash:** `51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d`
- **Cryptographic Chain:** Contiguous and valid across all 284 records (`chainValid: true`).
- **Original Database State:** Untouched and intact.

---

## 4. Complete Step-by-Step Production Deployment Runbook

### Step 1: VPS Prerequisites & Infrastructure Selection
1. **Provider:** DigitalOcean, Linode, Hetzner Cloud, or AWS Lightsail.
2. **Datacenter Region:** Close to primary user base (e.g., Bengaluru `BLR1` or US East).
3. **Hardware Spec:**
   - **OS:** Ubuntu 24.04 LTS (x64) Minimal / Standard image
   - **CPU:** 1–2 vCPUs
   - **Memory:** 1 GB minimum, 2 GB recommended
   - **Disk:** 25 GB NVMe SSD persistent storage
4. **Networking:** 1 Dedicated IPv4 address.

### Step 2: DNS Records Configuration
In your DNS management console (Cloudflare, Namecheap, Route 53, etc.), configure the following records pointing to the VPS public IP:

| Type | Name / Host | Value / Target | TTL | Proxy Status |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` (or `griccnexus.com`) | `<VPS_PUBLIC_IPV4>` | 300s / Auto | DNS Only (Initially) |
| **A** | `www` | `<VPS_PUBLIC_IPV4>` | 300s / Auto | DNS Only (Initially) |

*Note: If using Cloudflare DNS, set Proxy status to **DNS Only (Grey Cloud)** during certificate issuance to ensure Let's Encrypt HTTP-01 webroot challenge succeeds cleanly.*

---

### Step 3: Ubuntu Server Hardening & Provisioning
Log in as `root` via SSH:

```bash
ssh root@<VPS_PUBLIC_IPV4>
```

Upload and execute the server provisioning script:

```bash
# Upload setup-server.sh or transfer repository
scp deploy/setup-server.sh root@<VPS_PUBLIC_IPV4>:/root/

# Run provisioning script
chmod +x /root/setup-server.sh
/root/setup-server.sh
```

**What `setup-server.sh` completes automatically:**
- Updates system packages and installs security upgrades.
- Installs `nginx`, `nodejs` (24 LTS via NodeSource), `pm2`, `certbot`, `python3-certbot-nginx`, `ufw`, `fail2ban`.
- Configures UFW firewall (allows only 22, 80, 443; drops all other incoming traffic).
- Creates non-root user `gricc` with SSH key copied from root.
- Installs hardened sudoers rule `/etc/sudoers.d/gricc-deploy` for Nginx reloads.
- Creates `/var/www/gricc`, `/var/www/certbot`, and `/var/log/gricc` with ownership assigned to `gricc:gricc`.

---

### Step 4: Application Transfer & Directory Setup
Transfer the project code to `/var/www/gricc`:

```bash
# Option A: Git Clone (recommended)
su - gricc
cd /var/www
git clone <YOUR_GIT_REPOSITORY_URL> gricc
cd /var/www/gricc

# Option B: Secure Copy (rsync/scp) from workstation
# rsync -avz --exclude 'node_modules' --exclude '.git' ./ gricc@<VPS_PUBLIC_IPV4>:/var/www/gricc/
```

Ensure ownership is set correctly:
```bash
sudo chown -R gricc:gricc /var/www/gricc
```

---

### Step 5: Database Placement & Permission Hardening
Copy the authoritative database `server/data/gricc.db` to `/var/www/gricc/server/data/gricc.db`:

```bash
# Ensure strict permissions
chmod 700 /var/www/gricc/server/data
chmod 700 /var/www/gricc/server/backups
chmod 700 /var/www/gricc/logs
chmod 600 /var/www/gricc/server/data/gricc.db
```

Verify that the authoritative database on the server matches the expected 284 audit records and boundary hash:
```bash
cd /var/www/gricc
node -e "
import Database from 'better-sqlite3';
const db = new Database('server/data/gricc.db', { readonly: true });
const count = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
const r222 = db.prepare('SELECT entry_hash FROM audit_logs WHERE id = 222').get().entry_hash;
console.log('Server DB verification: Count =', count, '| Hash 222 =', r222);
db.close();
"
```

---

### Step 6: Production Environment Variable Configuration
Create `/var/www/gricc/.env` owned by `gricc:gricc` with permissions `600`:

```bash
# Generate high-entropy cryptographic secrets
JWT_SECRET_VAL=$(openssl rand -hex 32)
BACKUP_KEY_VAL=$(openssl rand -hex 16)

cat << EOF > /var/www/gricc/.env
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://griccnexus.com
CORS_ORIGIN=https://griccnexus.com
TRUST_PROXY=true
TRUST_PROXY_HOPS=1

DB_PATH=./server/data/gricc.db
BACKUP_DIR=./server/backups
BACKUP_RETENTION_COUNT=14
BACKUP_ENCRYPTION_KEY=${BACKUP_KEY_VAL}

JWT_SECRET=${JWT_SECRET_VAL}
JWT_EXPIRES_IN=8h

DATA_CACHE_TTL_SECONDS=60
API_RATE_LIMIT_MAX=600

AI_PROVIDER=gricc-deterministic
AI_MODEL=grounded-retrieval-v1
AI_TIMEOUT_MS=12000
AI_MAX_RETRIES=2
EOF

chmod 600 /var/www/gricc/.env
```

---

### Step 7: Nginx Bootstrap & Let's Encrypt Certificate Issuance

To prevent Nginx from failing on nonexistent SSL certificate files:

1. **Activate Bootstrap Configuration (Port 80 only):**
   ```bash
   sudo ln -sf /var/www/gricc/deploy/nginx.bootstrap.conf /etc/nginx/sites-available/griccnexus.com.conf
   sudo ln -sf /etc/nginx/sites-available/griccnexus.com.conf /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl reload nginx
   ```

2. **Obtain Let's Encrypt TLS Certificate via Webroot:**
   ```bash
   sudo certbot certonly --webroot \
     -w /var/www/certbot \
     -d griccnexus.com \
     -d www.griccnexus.com \
     --non-interactive \
     --agree-tos \
     --email admin@griccnexus.com
   ```

3. **Activate Full Production HTTPS Configuration:**
   ```bash
   sudo ln -sf /var/www/gricc/deploy/nginx.griccnexus.com.conf /etc/nginx/sites-available/griccnexus.com.conf
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

### Step 8: Build Frontend & Launch Backend via PM2

Switch to `gricc` user and run the automated deployment script:

```bash
su - gricc
cd /var/www/gricc
./deploy/deploy-app.sh
```

**What `deploy-app.sh` executes:**
1. Runs `npm ci` (clean reproducible install).
2. Runs `npm run build` (compiles Vite React frontend to `/var/www/gricc/dist`).
3. Runs `npm prune --omit=dev` (prunes dev tools for a minimal attack surface).
4. Sets `chmod 700` on database, backup, and log directories.
5. Runs `npm run test:readiness` (automated end-to-end self-test of JWT, CORS, DB, and Health endpoints).
6. Starts/Reloads backend with PM2 (`pm2 startOrReload ecosystem.config.cjs --env production`).
7. Tests and reloads Nginx.

---

### Step 9: Configure PM2 Autostart on Server Reboot
To ensure GRICC NEXUS recovers automatically after host reboot:

```bash
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u gricc --hp /home/gricc
```

---

### Step 10: Production Verification & Smoke Testing

Execute the following smoke tests:

1. **HTTP to HTTPS 301 Redirect:**
   ```bash
   curl -I http://griccnexus.com/
   # Expected: HTTP/1.1 301 Moved Permanently -> Location: https://griccnexus.com/
   ```

2. **HTTPS Static Frontend Load:**
   ```bash
   curl -I https://griccnexus.com/
   # Expected: HTTP/2 200 OK (Content-Type: text/html)
   ```

3. **Backend Health Check via Reverse Proxy:**
   ```bash
   curl -s https://griccnexus.com/api/health | jq .
   # Expected:
   # {
   #   "status": "HEALTHY",
   #   "backendStatus": "ONLINE",
   #   "database": "CONNECTED",
   #   ...
   # }
   ```

4. **SSE Stream Connection:**
   ```bash
   curl -N https://griccnexus.com/api/events/stream
   # Expected: Immediate HTTP 200 with text/event-stream headers and heartbeat event
   ```

5. **PM2 Process Status & Memory:**
   ```bash
   pm2 status
   pm2 logs gricc-backend --lines 20
   ```

---

## 5. Summary of Strict Preservation & Compliance

- **No Unauthorized Infrastructure Actions:** No VPS was provisioned, no DNS records were modified, and no network deployment was initiated.
- **Authoritative Database Protection:** `server/data/gricc.db` remained strictly protected; 284 audit records, boundary record 222 hash, and the cryptographic chain were verified identical to baseline.
- **Secret Isolation:** Zero passwords, API keys, or JWT secrets were printed or committed.
- **Git State:**
  - Branch: `master`
  - HEAD Commit: `d88de62376a3b8dcc4154b8f1a29a80b89bc8f2c`
  - LibSQL Branch: `phase-24-8-libsql-adapter` at `9b7defa43de25a752c81dafe6b68cdd5431f3673`
  - Existing working-tree entries preserved verbatim.

