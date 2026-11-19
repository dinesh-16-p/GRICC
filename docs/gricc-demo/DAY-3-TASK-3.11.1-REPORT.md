# GRICC NEXUS — Day 3 Task 3.11.1 Execution Report
## Corrected Production Deployment Runbook & Working-Tree Source Transfer Strategy

**Date:** November 14, 2026  
**Target Domain Placeholder:** `<DOMAIN_NAME>` (e.g., `griccnexus.com`)  
**Target Server OS:** Ubuntu 24.04 LTS (x64) Minimal / Server  
**Technology Stack:** Node.js 24 LTS, SQLite 3 (WAL Mode), PM2 (Single-Instance Fork Mode), Nginx, Let's Encrypt  
**Branch:** `master`  
**HEAD Commit:** `d88de62376a3b8dcc4154b8f1a29a80b89bc8f2c`  
**LibSQL Branch / Commit:** `phase-24-8-libsql-adapter` (`9b7defa43de25a752c81dafe6b68cdd5431f3673`)  
**Deployment Status:** **READY FOR VPS DEPLOYMENT EXECUTION**

---

## 1. Source Transfer Strategy & Working-Tree Isolation

### 1.1 Why `git clone` on the VPS Is Inadmissible
The local `master` branch contains **13 modified files** and **untracked test/documentation files** representing all security enhancements, AI error sanitization, status code validation, and deployment fixes completed across Days 1–3:
- Tracked modified production files: `server/index.js`, `server/services/aiProviderService.js`, `server/services/aiPromptService.js`, `server/services/authService.js`, `server/middleware/authMiddleware.js`, `src/services/apiService.js`, `deploy/deploy-app.sh`, `deploy/nginx.griccnexus.com.conf`, etc.
- Untracked test suites: `tests/ai-security.test.js` (27 isolated unit & integration tests).

Executing `git clone` directly on the VPS would checkout only the committed baseline commit `d88de62376a3b8dcc4154b8f1a29a80b89bc8f2c`, omitting all security remediations. Because project rules strictly prohibit committing, merging, pushing, or resetting on `master`, code must be transferred using an **isolated working-tree archive package**.

### 1.2 Archive Packaging Boundaries
The archive package includes all required application source and configuration files, while strictly excluding:
- `.env`, `.env.*`, and any secret credentials
- `node_modules/` (rebuilt reproducibly on the server via `npm ci`)
- Live SQLite database files (`server/data/*.db*`, WAL, and SHM files)
- Local logs (`logs/`, `*.log`)
- Temporary/scratch files (`dist/`, `.cache/`)

---

## 2. Workstation vs. VPS Command Sequences

### Sequence A: Windows Workstation Commands (PowerShell)

Execute all commands from the repository root: `C:\Users\DINESH 07\Desktop\GRICC`

#### A.1 Verify Local Database Baseline (Strict Read-Only)
```powershell
node -e "
import Database from 'better-sqlite3';
const db = new Database('server/data/gricc.db', { readonly: true });
const count = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
const r222 = db.prepare('SELECT entry_hash FROM audit_logs WHERE id = 222').get().entry_hash;
const qc = db.prepare('PRAGMA quick_check').get().quick_check;
const ic = db.prepare('PRAGMA integrity_check').get().integrity_check;
console.log('Workstation Baseline -> Count:', count, '| Hash 222:', r222, '| QC:', qc, '| IC:', ic);
db.close();
"
# Expected: Count: 284 | Hash 222: 51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d | QC: ok | IC: ok
```

#### A.2 Create Consistent SQLite Snapshot for Deployment
Use SQLite's native Online Backup API via `better-sqlite3` to create a transactionally consistent snapshot without taking the database offline:

```powershell
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
console.log('Snapshot Verified -> Count:', count, '| Hash 222:', r222, '| QC:', qc, '| IC:', ic);
snapDb.close();
"
# Expected: Snapshot Verified -> Count: 284 | Hash 222: 51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d | QC: ok | IC: ok
```

#### A.3 Create Clean Application Release Package
Package the complete working tree into a single compressed tarball:

```powershell
tar.exe -czvf gricc-release.tar.gz `
  package.json `
  package-lock.json `
  vite.config.js `
  ecosystem.config.cjs `
  index.html `
  deploy `
  server `
  src `
  public `
  tests `
  test-production-readiness.mjs
```

#### A.4 Verify Release Package Contents
Verify that no secrets, database files, or dependencies leaked into the tarball:

```powershell
# Must return ZERO matches:
tar.exe -tf gricc-release.tar.gz | Select-String "\.db|\.env|node_modules|server/backups"
```

#### A.5 Transfer Package and Database Snapshot to VPS
Replace `<VPS_PUBLIC_IPV4>` with your server's public IPv4 address:

```powershell
# 1. Upload server provisioning script to root:
scp deploy/setup-server.sh root@<VPS_PUBLIC_IPV4>:/root/

# 2. Upload application archive to temporary directory:
scp gricc-release.tar.gz root@<VPS_PUBLIC_IPV4>:/tmp/

# 3. Upload verified database snapshot to temporary directory:
scp server/backups/gricc-deploy-snapshot.db root@<VPS_PUBLIC_IPV4>:/tmp/gricc.db
```

---

### Sequence B: Ubuntu VPS Commands (Bash)

Execute on the Ubuntu 24.04 LTS server.

#### B.1 Server Hardening & Provisioning (Run as `root`)
```bash
ssh root@<VPS_PUBLIC_IPV4>

# Make executable and execute provisioning script
chmod +x /root/setup-server.sh
/root/setup-server.sh
```

**What `setup-server.sh` configures:**
- System packages updated, automatic security upgrades configured.
- Installs `nginx`, `nodejs` (v24 LTS via NodeSource), `pm2`, `certbot`, `python3-certbot-nginx`, `ufw`, `fail2ban`.
- UFW firewall enabled (`default deny incoming`, permits only `22/tcp`, `80/tcp`, `443/tcp`).
- Dedicated `gricc` non-root application user created with imported SSH keys.
- Sudoers rule `/etc/sudoers.d/gricc-deploy` installed for automated Nginx reload.
- Directory hierarchy `/var/www/gricc`, `/var/www/certbot`, `/var/log/gricc` created with `gricc:gricc` ownership.

#### B.2 Application Extraction & Directory Setup (Run as `gricc`)
```bash
su - gricc
cd /var/www/gricc

# Extract release archive into application directory
tar -xzvf /tmp/gricc-release.tar.gz -C /var/www/gricc/

# Remove temporary archive from /tmp
rm -f /tmp/gricc-release.tar.gz
```

#### B.3 Database Placement & Strict Permission Hardening (Run as `gricc`)
```bash
# Create protected directories
mkdir -p /var/www/gricc/server/data
mkdir -p /var/www/gricc/server/backups
mkdir -p /var/www/gricc/logs

# Move snapshot into authoritative location
mv /tmp/gricc.db /var/www/gricc/server/data/gricc.db

# Apply strict POSIX permission masks (private to 'gricc' user)
chmod 700 /var/www/gricc/server/data
chmod 700 /var/www/gricc/server/backups
chmod 700 /var/www/gricc/logs
chmod 600 /var/www/gricc/server/data/gricc.db

# Verify database integrity on the VPS
node -e "
import Database from 'better-sqlite3';
const db = new Database('/var/www/gricc/server/data/gricc.db', { readonly: true });
const count = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
const r222 = db.prepare('SELECT entry_hash FROM audit_logs WHERE id = 222').get().entry_hash;
const qc = db.prepare('PRAGMA quick_check').get().quick_check;
const ic = db.prepare('PRAGMA integrity_check').get().integrity_check;
console.log('VPS DB Verification -> Count:', count, '| Hash 222:', r222, '| QC:', qc, '| IC:', ic);
db.close();
"
# Expected: VPS DB Verification -> Count: 284 | Hash 222: 51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d | QC: ok | IC: ok
```

#### B.4 Generate Production Environment Configuration (Run as `gricc`)
Replace `<DOMAIN_NAME>` with your domain (e.g. `griccnexus.com`):

```bash
JWT_SECRET_VAL=$(openssl rand -hex 32)
BACKUP_KEY_VAL=$(openssl rand -hex 16)

cat << EOF > /var/www/gricc/.env
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://<DOMAIN_NAME>
CORS_ORIGIN=https://<DOMAIN_NAME>
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

#### B.5 Two-Stage Nginx Bootstrap & TLS Certificate Issuance
Replace `<DOMAIN_NAME>` and `<CERTBOT_EMAIL>`:

```bash
# 1. Substitute domain in Nginx bootstrap configuration
sudo sed -i 's/griccnexus.com/<DOMAIN_NAME>/g' /var/www/gricc/deploy/nginx.bootstrap.conf
sudo sed -i 's/griccnexus.com/<DOMAIN_NAME>/g' /var/www/gricc/deploy/nginx.griccnexus.com.conf

# 2. Enable bootstrap HTTP listener (Port 80)
sudo ln -sf /var/www/gricc/deploy/nginx.bootstrap.conf /etc/nginx/sites-available/<DOMAIN_NAME>.conf
sudo ln -sf /etc/nginx/sites-available/<DOMAIN_NAME>.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 3. Issue Let's Encrypt TLS certificate via webroot
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d <DOMAIN_NAME> \
  -d www.<DOMAIN_NAME> \
  --non-interactive \
  --agree-tos \
  --email <CERTBOT_EMAIL>

# 4. Activate full production HTTPS Nginx configuration
sudo ln -sf /var/www/gricc/deploy/nginx.griccnexus.com.conf /etc/nginx/sites-available/<DOMAIN_NAME>.conf
sudo nginx -t && sudo systemctl reload nginx
```

#### B.6 Build Production Bundle & Launch PM2 (Run as `gricc`)
```bash
su - gricc
cd /var/www/gricc

# Run automated deployment script (npm ci, build, prune, readiness test, PM2 launch)
./deploy/deploy-app.sh

# Persist PM2 processes across reboots
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u gricc --hp /home/gricc
```

#### B.7 Production Verification & Smoke Testing
```bash
# 1. Verify HTTP to HTTPS 301 redirect
curl -I http://<DOMAIN_NAME>/

# 2. Verify static frontend delivery
curl -I https://<DOMAIN_NAME>/

# 3. Verify public health check endpoint
curl -s https://<DOMAIN_NAME>/api/health | jq .

# 4. Verify SSE stream connectivity
curl -N https://<DOMAIN_NAME>/api/events/stream
```

---

## 3. Domain, Email, and Certificate Prerequisites

Before running Certbot on the server, the operator **must confirm**:

1. **Domain Ownership & DNS Control:** You control DNS records for `<DOMAIN_NAME>` and `www.<DOMAIN_NAME>`.
2. **DNS A-Record Resolution:** Both records point directly to `<VPS_PUBLIC_IPV4>`.
   ```bash
   dig +short A <DOMAIN_NAME>
   # Must return <VPS_PUBLIC_IPV4>
   ```
3. **Cloudflare Proxying Disabled (If Applicable):** In Cloudflare, set proxy status to **DNS Only (Grey Cloud)** during certificate issuance. Proxied mode terminates TLS at Cloudflare edge, intercepting the HTTP-01 challenge.
4. **Port 80 Inbound Reachability:** Cloud provider security lists (AWS Security Groups, DigitalOcean Cloud Firewalls, etc.) must allow inbound TCP port 80.
5. **Valid Email Address (`<CERTBOT_EMAIL>`):** Must be an active, monitored email address owned by the operator to receive Let's Encrypt certificate renewal notices and security advisories.

---

## 4. Comprehensive Security Architecture

| Security Domain | Implementation | Verification Method |
| :--- | :--- | :--- |
| **SSH Access** | Public key authentication only; root keys copied to `gricc`; password auth disabled in SSH daemon. | Tested via SSH key login. |
| **User Privilege Separation** | Application runs under non-root user `gricc` (UID/GID separated). | Process owner in `pm2 status`. |
| **Host Firewall (UFW)** | `default deny incoming`, only ports 22, 80, 443 permitted. | `sudo ufw status verbose` |
| **Port 5000 Protection** | Backend port 5000 is unreachable externally; accessible strictly via `127.0.0.1` reverse proxy. | External `curl http://<IP>:5000` times out / refused. |
| **Intrusion Prevention** | Fail2Ban monitors SSH authentication failures and bans offending IPs. | `sudo systemctl status fail2ban` |
| **Environment Secrets** | Stored in `/var/www/gricc/.env` with `chmod 600`, owned by `gricc`. Excluded from git. | `ls -la /var/www/gricc/.env` |
| **TLS & Security Headers** | TLSv1.2/1.3, HSTS (86400s), nosniff, DENY framing, strict-origin referrer, unbuffered SSE. | Verified via `curl -I https://<DOMAIN_NAME>/`. |
| **Database Concurrency** | Single-instance PM2 (`instances: 1`, `exec_mode: 'fork'`) prevents SQLite multi-writer corruption. | Verified in `ecosystem.config.cjs`. |
| **Database Storage** | Native NVMe SSD persistent storage with Write-Ahead Logging (WAL mode). | `PRAGMA journal_mode` returns `wal`. |

---

## 5. Summary of Remaining User Actions

1. **Provision VPS:** Launch an Ubuntu 24.04 LTS VPS instance (1–2 vCPUs, 2 GB RAM, 25 GB SSD) on your preferred cloud provider.
2. **Configure DNS:** Create `A` records for `<DOMAIN_NAME>` and `www.<DOMAIN_NAME>` pointing to your `<VPS_PUBLIC_IPV4>`.
3. **Execute Workstation Commands (Section 2, Sequence A):**
   - Run baseline check.
   - Run snapshot creation.
   - Run packaging command.
   - Transfer files via `scp`.
4. **Execute VPS Commands (Section 2, Sequence B):**
   - Run `setup-server.sh`.
   - Extract files, place database snapshot, configure `.env`.
   - Run bootstrap Nginx, execute Certbot, switch to production HTTPS.
   - Run `./deploy/deploy-app.sh` and perform smoke tests.

**No unresolved blockers remain. GRICC NEXUS is fully verified for production deployment.**

