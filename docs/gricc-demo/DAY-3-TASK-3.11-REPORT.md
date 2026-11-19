# GRICC NEXUS — Day 3 Task 3.11 Execution Report
## VPS Deployment Execution Plan & Operator Implementation Manual

**Date:** November 14, 2026  
**Target Domain:** `https://griccnexus.com` / `https://www.griccnexus.com`  
**Target Server:** Ubuntu 24.04 LTS (x64) VPS  
**Technology Stack:** Node.js 24 LTS, SQLite 3 (WAL Mode), PM2 (Fork Mode), Nginx, Let's Encrypt Certbot  
**Branch:** `master`  
**HEAD Commit:** `d88de62376a3b8dcc4154b8f1a29a80b89bc8f2c`  
**LibSQL Branch / Commit:** `phase-24-8-libsql-adapter` (`9b7defa43de25a752c81dafe6b68cdd5431f3673`)  
**Deployment Status:** **READY FOR VPS DEPLOYMENT EXECUTION**

---

## 1. Deployment Authorization Boundary & Blocker Assessment

In strict accordance with the Task 3.11 authorization boundaries:
- **No infrastructure has been provisioned** (no VPS purchased or created).
- **No DNS records have been modified**.
- **No production database has been transferred or exposed**.
- **No source files or database schemas have been altered**.

### Evaluation of Task 3.10.1 Preflight Findings
All items identified in Task 3.10.1 have been reviewed and resolved:
1. **PM2 Log Directory Blocker:** Resolved via `mkdir -p "$APP_DIR/logs"` in `deploy/deploy-app.sh`.
2. **Nginx TLS Certificate Chicken-and-Egg Blocker:** Solved via two-stage activation using `deploy/nginx.bootstrap.conf` (port 80 only) to satisfy Let's Encrypt webroot challenges before enabling SSL configuration.
3. **Database Overwrite Risk:** Confirmed that `seedInitialUsersIfEmpty()` explicitly aborts in `NODE_ENV=production` and all entity seeding checks `SELECT COUNT(*) === 0`. The authoritative database will never be overwritten or seeded on startup.
4. **Port 5000 Network Isolation:** Confirmed that UFW firewall rules drop all inbound traffic to port 5000, isolating the backend to localhost behind Nginx.
5. **Database Integrity Baseline:** Confirmed `quick_check: ok`, `integrity_check: ok`, exactly 284 audit records, boundary record 222 hash `51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d`, and contiguous cryptographic chain.

**Conclusion:** Zero blockers remain. The system is fully prepared for VPS execution.

---

## 2. Target VPS Hardware & OS Specification

| Specification | Minimum Required | Recommended Production Baseline |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 24.04 LTS (x64) | Ubuntu 24.04 LTS (x64) Minimal / Server |
| **Processor** | 1 vCPU | 1–2 vCPUs (Dedicated or Regular Performance) |
| **System Memory** | 1 GB RAM (with swap) | 2 GB RAM |
| **Storage** | 20 GB SSD | 25–50 GB NVMe SSD Persistent Block Storage |
| **Network** | 1 Public Static IPv4 | 1 Public Static IPv4 + IPv6 support |
| **Recommended Cloud Providers**| DigitalOcean (BLR1 / NYC1), Linode / Akamai, Hetzner Cloud (Falkenstein / Ashburn), AWS Lightsail |

---

## 3. Domain & DNS Requirements for `griccnexus.com`

Before initiating certificate issuance or web requests, the operator must configure two DNS A-records at the domain registrar or DNS management console (e.g., Cloudflare, Namecheap, Route 53):

### 3.1 Required DNS Records

| Type | Host / Name | Target / Destination | TTL | Cloudflare Proxy Status |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` (or `griccnexus.com`) | `<VPS_PUBLIC_IPV4>` | 300s (Auto) | **DNS Only (Grey Cloud)** |
| **A** | `www` (or `www.griccnexus.com`) | `<VPS_PUBLIC_IPV4>` | 300s (Auto) | **DNS Only (Grey Cloud)** |

> [!IMPORTANT]
> If utilizing Cloudflare DNS, ensure proxy status is toggled to **DNS Only (Grey Cloud)** during certificate issuance. Cloudflare CDN edge proxying intercepts HTTP challenge requests, causing Let's Encrypt webroot verification to fail. Proxying may be re-enabled after certificate issuance if desired.

### 3.2 DNS Propagation Verification
Verify that both root and `www` domains resolve to the VPS public IP:

```bash
# On your local workstation:
dig +short A griccnexus.com
dig +short A www.griccnexus.com

# Alternatively via nslookup:
nslookup griccnexus.com
nslookup www.griccnexus.com
```

Both commands must return your `<VPS_PUBLIC_IPV4>` address before proceeding to TLS issuance.

---

## 4. Step-by-Step VPS Deployment Execution Commands

### Stage 1: Initial Server Access & System Provisioning
Execute as `root` on the freshly created Ubuntu 24.04 VPS:

```bash
# 1. SSH into the server
ssh root@<VPS_PUBLIC_IPV4>

# 2. Transfer and run the automated provisioning script
# (From local workstation:)
scp deploy/setup-server.sh root@<VPS_PUBLIC_IPV4>:/root/

# (On server:)
chmod +x /root/setup-server.sh
/root/setup-server.sh
```

**Actions executed by `setup-server.sh`:**
- Updates system packages and enables automatic unattended security upgrades.
- Installs `nginx`, `nodejs` (v24 LTS via NodeSource), `pm2`, `certbot`, `python3-certbot-nginx`, `ufw`, `fail2ban`.
- Configures UFW firewall (default deny incoming, allow 22, 80, 443).
- Creates non-root application user `gricc` (sudo group) and imports SSH authorized keys.
- Installs `/etc/sudoers.d/gricc-deploy` allowing `gricc` to reload Nginx without password.
- Provisions `/var/www/gricc`, `/var/www/certbot`, and `/var/log/gricc` with `gricc:gricc` ownership.

---

### Stage 2: Application Transfer & Database Placement
Execute as `gricc` user:

```bash
# 3. Switch to application user
su - gricc
cd /var/www

# 4. Clone repository into /var/www/gricc
git clone <GIT_REPOSITORY_URL> gricc
cd /var/www/gricc

# 5. Securely transfer authoritative database from local workstation
# (From local workstation:)
scp server/data/gricc.db gricc@<VPS_PUBLIC_IPV4>:/var/www/gricc/server/data/gricc.db

# 6. Set directory and file permissions
chmod 700 /var/www/gricc/server/data
chmod 700 /var/www/gricc/server/backups
chmod 700 /var/www/gricc/logs
chmod 600 /var/www/gricc/server/data/gricc.db

# 7. Verify authoritative database integrity on the server
node -e "
import Database from 'better-sqlite3';
const db = new Database('server/data/gricc.db', { readonly: true });
const count = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
const r222 = db.prepare('SELECT entry_hash FROM audit_logs WHERE id = 222').get().entry_hash;
const qc = db.prepare('PRAGMA quick_check').get().quick_check;
const ic = db.prepare('PRAGMA integrity_check').get().integrity_check;
console.log('Server DB Verification -> Count:', count, '| Hash 222:', r222, '| QC:', qc, '| IC:', ic);
db.close();
"
# Expected output: Server DB Verification -> Count: 284 | Hash 222: 51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d | QC: ok | IC: ok
```

---

### Stage 3: Secure Production Environment Configuration
Generate random cryptographic secrets on the server and create `/var/www/gricc/.env`:

```bash
# Generate 256-bit cryptographically secure secrets
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

### Stage 4: HTTPS Certificate Issuance & Nginx Activation
Execute Nginx two-stage configuration:

```bash
# 8. Enable bootstrap HTTP listener on port 80
sudo ln -sf /var/www/gricc/deploy/nginx.bootstrap.conf /etc/nginx/sites-available/griccnexus.com.conf
sudo ln -sf /etc/nginx/sites-available/griccnexus.com.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 9. Request Let's Encrypt TLS certificate via webroot mode
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d griccnexus.com \
  -d www.griccnexus.com \
  --non-interactive \
  --agree-tos \
  --email admin@griccnexus.com

# 10. Switch to full production HTTPS configuration
sudo ln -sf /var/www/gricc/deploy/nginx.griccnexus.com.conf /etc/nginx/sites-available/griccnexus.com.conf
sudo nginx -t && sudo systemctl reload nginx
```

---

### Stage 5: Frontend Build & PM2 Backend Launch
Execute application deployment as `gricc` user:

```bash
su - gricc
cd /var/www/gricc

# 11. Run automated deployment script
./deploy/deploy-app.sh
```

**What `deploy-app.sh` executes:**
1. Installs production dependencies (`npm ci`).
2. Compiles Vite React bundle to `/var/www/gricc/dist` (`npm run build`).
3. Prunes devDependencies (`npm prune --omit=dev`).
4. Verifies database, backup, and log directories (`chmod 700`).
5. Runs automated production self-test (`npm run test:readiness`).
6. Starts / reloads Express backend in PM2 fork mode (`pm2 startOrReload ecosystem.config.cjs --env production`).
7. Tests and reloads Nginx (`sudo nginx -t && sudo systemctl reload nginx`).

```bash
# 12. Persist PM2 processes across reboots
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u gricc --hp /home/gricc
```

---

### Stage 6: Production Verification & Smoke Testing
Verify all endpoints from your workstation:

```bash
# 1. Test HTTP to HTTPS 301 Redirect
curl -I http://griccnexus.com/
# Expected: HTTP/1.1 301 Moved Permanently -> Location: https://griccnexus.com/

# 2. Test HTTPS Static Frontend Delivery
curl -I https://griccnexus.com/
# Expected: HTTP/2 200 OK (Content-Type: text/html)

# 3. Test Public Health Check
curl -s https://griccnexus.com/api/health | jq .
# Expected: { "status": "HEALTHY", "backendStatus": "ONLINE", "database": "CONNECTED", ... }

# 4. Test SSE Real-Time Stream
curl -N https://griccnexus.com/api/events/stream
# Expected: HTTP/2 200 OK (Content-Type: text/event-stream) with heartbeat events
```

---

## 5. Database Operational Maintenance Runbook

### 5.1 Creating a Hot Pre-Maintenance Backup
```bash
# Run as 'gricc' user in /var/www/gricc:
node server/scripts/backup-database.js
# Creates timestamped backup in /var/www/gricc/server/backups/
```

### 5.2 Restoring Database from Backup (If Needed)
```bash
# 1. Stop backend to eliminate concurrent write activity
pm2 stop gricc-backend

# 2. Restore verified snapshot
node server/scripts/backup-database.js \
  --restore server/backups/gricc-backup-<TIMESTAMP>.db \
  --target server/data/gricc.db \
  --force

# 3. Restart backend
pm2 start gricc-backend
```

---

## 6. Summary of Remaining User Actions

To achieve live public deployment, the following actions remain for the user:

1. **Provision VPS:** Purchase and launch an Ubuntu 24.04 LTS instance (1–2 vCPU, 2 GB RAM, 25 GB SSD) on DigitalOcean, Linode, Hetzner, or Lightsail.
2. **Point DNS:** Add `A` records for `griccnexus.com` and `www.griccnexus.com` pointing to the VPS IP (set to DNS Only in Cloudflare).
3. **Execute Runbook:** Follow Stages 1 through 6 in Section 4 above using your SSH client.

**GRICC NEXUS IS VERIFIED, PREPARED, AND READY FOR LIVE PRODUCTION DEPLOYMENT.**

