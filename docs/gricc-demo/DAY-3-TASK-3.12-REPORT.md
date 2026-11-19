# GRICC NEXUS — Day 3 Task 3.12 Execution Report
## VPS Provisioning Readiness & Comprehensive Production Deployment Runbook

**Date:** November 14, 2026  
**Target Platform:** Ubuntu 24.04 LTS (x64) Minimal / Server  
**Architecture:** Node.js 24 LTS, SQLite 3 (WAL Mode), PM2 (Fork Mode), Nginx, Let's Encrypt Certbot  
**Branch:** `master`  
**HEAD Commit:** `d88de62376a3b8dcc4154b8f1a29a80b89bc8f2c`  
**LibSQL Branch / Commit:** `phase-24-8-libsql-adapter` (`9b7defa43de25a752c81dafe6b68cdd5431f3673`)  
**Deployment Status:** **READY FOR VPS PROVISIONING & PRODUCTION EXECUTION**

---

## 1. Inspection & Audit of Deployment Scripts

An end-to-end audit was conducted across all deployment configurations and scripts:
- `deploy/setup-server.sh`
- `deploy/deploy-app.sh`
- `deploy/nginx.bootstrap.conf`
- `deploy/nginx.griccnexus.com.conf`
- `ecosystem.config.cjs`
- `test-production-readiness.mjs`

### 1.1 Consistency & Script Validation Findings

| Component | Target Location | Verification Details | Evaluation |
| :--- | :--- | :--- | :--- |
| **Server Provisioning** | `deploy/setup-server.sh` | Installs Node.js 24 via NodeSource, Nginx, Certbot, PM2, UFW, Fail2ban. Creates `gricc` non-root user and installs `/etc/sudoers.d/gricc-deploy` for Nginx reloads. | **Consistent** |
| **App Deployment** | `deploy/deploy-app.sh` | Executes `npm ci`, `npm run build`, `npm prune --omit=dev`, verifies directory permissions (`700`), runs `npm run test:readiness`, and launches PM2. | **Consistent** |
| **HTTP Bootstrap** | `deploy/nginx.bootstrap.conf` | Dedicated port 80 listener for Let's Encrypt webroot challenge (`/.well-known/acme-challenge/`). Solves certificate chicken-and-egg startup crash. | **Consistent** |
| **HTTPS Production** | `deploy/nginx.griccnexus.com.conf`| Complete reverse proxy with TLSv1.2/1.3, security headers, unbuffered SSE streaming (`proxy_buffering off`), and SPA fallback. | **Consistent** |
| **Process Supervision** | `ecosystem.config.cjs` | PM2 single-instance fork mode (`instances: 1`, `exec_mode: 'fork'`). Preserves SQLite single-writer concurrency and SSE client tracking. | **Consistent** |

---

## 2. Potential Fresh-Server Failure Modes & Mitigations

During analysis of fresh Ubuntu 24.04 LTS installations, the following failure points were identified and mitigated:

1. **Interactive Debconf Prompts During Package Upgrades:**
   - *Risk:* Ubuntu 24.04 features `needrestart` by default, which can trigger interactive curses menus during `apt-get upgrade` or `apt-get install`, hanging automated execution.
   - *Mitigation:* The runbook exports `DEBIAN_FRONTEND=noninteractive` and configures `needrestart` to automatic batch mode.
2. **Missing Pre-Certificate SSL Crash:**
   - *Risk:* Activating `nginx.griccnexus.com.conf` before Let's Encrypt certificates exist crashes Nginx (`cannot load certificate .../fullchain.pem`).
   - *Mitigation:* Two-stage bootstrap procedure: port 80 `nginx.bootstrap.conf` is loaded first to obtain certificates, then switched to production HTTPS.
3. **Missing Log Directory:**
   - *Risk:* PM2 crashes on fresh checkout if `./logs` does not exist.
   - *Mitigation:* `mkdir -p "$APP_DIR/logs"` and `chmod 700 "$APP_DIR/logs"` is verified in `deploy/deploy-app.sh`.
4. **Cloudflare CDN Intercepting ACME Challenge:**
   - *Risk:* Cloudflare Orange Cloud (Proxied) intercepts HTTP-01 challenge requests, causing Certbot failure.
   - *Mitigation:* Operator must set DNS to **DNS Only (Grey Cloud)** before running Certbot.
5. **Root/Unprivileged Permission Conflicts:**
   - *Risk:* Files uploaded to `/tmp` as root cannot be moved or chmodded by `gricc`.
   - *Mitigation:* Root places database and release files, sets `chown -R gricc:gricc`, and sets `chmod 700 / 600`.
6. **Active SQLite WAL Torn Copy Risk:**
   - *Risk:* Plain `cp` on an active WAL database causes data corruption.
   - *Mitigation:* Workstation creates snapshot via SQLite Online Backup API; VPS blocks automatic overwrite if a database already exists.
7. **SSH Lockout Risk:**
   - *Risk:* Disabling password authentication before verifying SSH key authentication can permanently lock out the operator.
   - *Mitigation:* Strict procedural rule: Keep initial root SSH session active in terminal 1; verify SSH key login in terminal 2 before closing.

---

## 3. Production Environment Validation Rules

The application enforces the following environment variables directly in source code (`server/index.js` and `server/scripts/backup-database.js`):

| Variable Name | Constraint / Validation Rule in Code | Mandatory? |
| :--- | :--- | :--- |
| `NODE_ENV` | Must be `'production'`. | **YES** |
| `JWT_SECRET` | String with `length >= 32` characters; cannot be placeholder. | **YES** |
| `CORS_ORIGIN` / `FRONTEND_URL` | Explicitly configured; cannot contain `localhost` or `127.0.0.1`. | **YES** |
| `DB_PATH` | Path cannot reside within `dist/` or `src/`. | **YES** |
| `BACKUP_ENCRYPTION_KEY` | String with `length >= 8` characters (32 characters recommended for AES-256-GCM). | **YES** |
| `PORT` | Integer port; default `5000`. | **YES** |
| `TRUST_PROXY` | Set to `'true'` behind Nginx reverse proxy. | **YES** |
| `TRUST_PROXY_HOPS` | Set to `1` for single-tier Nginx proxy. | **YES** |
| `AI_PROVIDER` | Default `'gricc-deterministic'` (requires 0 external API keys). | **YES** |

---

## 4. Complete Step-by-Step Production Deployment Runbook

### Variables / Placeholders Used:
- `<DOMAIN_NAME>`: Your registered domain name (e.g. `griccnexus.com`)
- `<VPS_PUBLIC_IPV4>`: Static public IPv4 address of your Ubuntu 24.04 VPS
- `<CERTIFICATE_EMAIL>`: Valid administrator email for Let's Encrypt security notices

---

### Phase A: Workstation Packaging & Snapshot Creation (Windows PowerShell)

Execute from `C:\Users\DINESH 07\Desktop\GRICC`:

```powershell
# 1. Verify Local Authoritative Database Baseline (Strict Read-Only)
node -e "
import Database from 'better-sqlite3';
const db = new Database('server/data/gricc.db', { readonly: true });
const count = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
const r222 = db.prepare('SELECT entry_hash FROM audit_logs WHERE id = 222').get().entry_hash;
const qc = db.prepare('PRAGMA quick_check').get().quick_check;
const ic = db.prepare('PRAGMA integrity_check').get().integrity_check;
console.log('Workstation DB Verification -> Count:', count, '| Hash 222:', r222, '| QC:', qc, '| IC:', ic);
db.close();
"
# Expected: Count: 284 | Hash 222: 51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d | QC: ok | IC: ok

# 2. Generate Hot Snapshot via SQLite Online Backup API
node -e "
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
const sourceDb = new Database('server/data/gricc.db', { readonly: true });
fs.mkdirSync('server/backups', { recursive: true });
const targetPath = path.resolve('server/backups/gricc-deploy-snapshot.db');
await sourceDb.backup(targetPath);
sourceDb.close();

const snapDb = new Database(targetPath, { readonly: true });
const qc = snapDb.prepare('PRAGMA quick_check').get().quick_check;
const ic = snapDb.prepare('PRAGMA integrity_check').get().integrity_check;
const count = snapDb.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
const r222 = snapDb.prepare('SELECT entry_hash FROM audit_logs WHERE id = 222').get().entry_hash;
console.log('Snapshot Verified -> Count:', count, '| Hash 222:', r222, '| QC:', qc, '| IC:', ic);
snapDb.close();
"

# 3. Create Hardened Release Package (Excludes secrets, dependencies & databases)
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
  --exclude="docs*" `
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

# 4. Generate Checksums and Upload to VPS
$archiveHash = (Get-FileHash -Algorithm SHA256 gricc-release.tar.gz).Hash.ToLower()
$dbHash = (Get-FileHash -Algorithm SHA256 server/backups/gricc-deploy-snapshot.db).Hash.ToLower()

"$archiveHash  gricc-release.tar.gz`n$dbHash  gricc.db" | Out-File -Encoding ascii checksums.sha256

scp deploy/setup-server.sh root@<VPS_PUBLIC_IPV4>:/root/
scp checksums.sha256 root@<VPS_PUBLIC_IPV4>:/tmp/
scp gricc-release.tar.gz root@<VPS_PUBLIC_IPV4>:/tmp/
scp server/backups/gricc-deploy-snapshot.db root@<VPS_PUBLIC_IPV4>:/tmp/gricc.db
```

---

### Phase B: VPS Server Provisioning & Privileged Placement (Run as `root`)

Log in via SSH as `root`:

```bash
ssh root@<VPS_PUBLIC_IPV4>

# 1. Non-Interactive Provisioning
export DEBIAN_FRONTEND=noninteractive
chmod +x /root/setup-server.sh
/root/setup-server.sh

# 2. Verify Transfer Integrity Checksums
cd /tmp
sha256sum -c checksums.sha256
if [ $? -ne 0 ]; then
    echo "FATAL: Checksum mismatch. Aborting."
    exit 1
fi

# 3. Extract Application Release Package
tar -xzvf /tmp/gricc-release.tar.gz -C /var/www/gricc/
rm -f /tmp/gricc-release.tar.gz

# 4. Safe Database Placement with Overwrite Protection
mkdir -p /var/www/gricc/server/data /var/www/gricc/server/backups /var/www/gricc/logs
TARGET_DB="/var/www/gricc/server/data/gricc.db"

if [ -f "$TARGET_DB" ]; then
    echo "FATAL: Existing database detected. Automatic overwrite is BLOCKED."
    exit 1
fi

mv /tmp/gricc.db "$TARGET_DB"

# 5. Enforce Strict POSIX Ownership & Permissions
chown -R gricc:gricc /var/www/gricc
chmod 755 /var/www/gricc
chmod 755 /var/www/certbot
chmod 700 /var/www/gricc/server/data /var/www/gricc/server/backups /var/www/gricc/logs
chmod 600 "$TARGET_DB"
rm -f /tmp/checksums.sha256

# 6. Two-Stage Nginx Bootstrap & Let's Encrypt TLS Issuance
sed -i "s/griccnexus.com/<DOMAIN_NAME>/g" /var/www/gricc/deploy/nginx.bootstrap.conf
sed -i "s/griccnexus.com/<DOMAIN_NAME>/g" /var/www/gricc/deploy/nginx.griccnexus.com.conf

# Activate Bootstrap on Port 80
ln -sf /var/www/gricc/deploy/nginx.bootstrap.conf /etc/nginx/sites-available/<DOMAIN_NAME>.conf
ln -sf /etc/nginx/sites-available/<DOMAIN_NAME>.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Issue Certificate via ACME Webroot
certbot certonly --webroot \
  -w /var/www/certbot \
  -d <DOMAIN_NAME> \
  -d www.<DOMAIN_NAME> \
  --non-interactive \
  --agree-tos \
  --email <CERTIFICATE_EMAIL>

# Activate Production HTTPS Nginx Configuration
ln -sf /var/www/gricc/deploy/nginx.griccnexus.com.conf /etc/nginx/sites-available/<DOMAIN_NAME>.conf
nginx -t && systemctl reload nginx

# Ensure automated renewal reloads Nginx
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat << 'EOF' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
#!/bin/sh
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

---

### Phase C: Unprivileged Application Execution (Run as `gricc`)

Switch to the `gricc` application user:

```bash
su - gricc
cd /var/www/gricc

# 1. Independent Database Integrity Verification on VPS
node -e "
import Database from 'better-sqlite3';
const db = new Database('/var/www/gricc/server/data/gricc.db', { readonly: true });
const count = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
const r222 = db.prepare('SELECT entry_hash FROM audit_logs WHERE id = 222').get().entry_hash;
const qc = db.prepare('PRAGMA quick_check').get().quick_check;
const ic = db.prepare('PRAGMA integrity_check').get().integrity_check;

const rows = db.prepare('SELECT id, prev_hash, entry_hash FROM audit_logs ORDER BY id ASC').all();
let valid = true;
for (let i = 1; i < rows.length; i++) {
  if (rows[i].prev_hash !== rows[i - 1].entry_hash) {
    valid = false;
    break;
  }
}
db.close();

console.log(JSON.stringify({ count, record222Hash: r222, quick_check: qc, integrity_check: ic, auditChainValid: valid }, null, 2));
if (count !== 284 || qc !== 'ok' || ic !== 'ok' || !valid) {
  console.error('DATABASE VERIFICATION FAILED');
  process.exit(1);
}
"

# 2. Write Production Environment Configuration (.env)
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

# 3. Build Production Bundle & Launch PM2 Supervisor
./deploy/deploy-app.sh

# 4. Persist PM2 processes across reboots
pm2 save
```

---

### Phase D: SSH Hardening (Optional & Recommended, Run as `root`)

> [!WARNING]
> Keep your active SSH session open in terminal 1 while testing SSH key login in a second terminal before disconnecting!

```bash
# 1. Edit /etc/ssh/sshd_config.d/hardening.conf
cat << 'EOF' > /etc/ssh/sshd_config.d/hardening.conf
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
EOF

# 2. Test configuration syntax and reload SSH daemon
sshd -t && systemctl reload ssh
```

---

### Phase E: Production Smoke Testing (Run from Workstation)

```bash
# 1. Verify HTTP to HTTPS 301 Redirect
curl -I http://<DOMAIN_NAME>/

# 2. Verify static frontend delivery
curl -I https://<DOMAIN_NAME>/

# 3. Verify public health check endpoint
curl -s https://<DOMAIN_NAME>/api/health | jq .

# 4. Verify SSE stream connectivity
curl -N https://<DOMAIN_NAME>/api/events/stream
```

---

## 5. Authoritative Database Baseline Status

- **Status:** Pristine; opened strictly in `{ readonly: true }` mode.
- **`quick_check`:** Passed (`ok`)
- **`integrity_check`:** Passed (`ok`)
- **`audit_logs` Count:** `284`
- **Boundary Record 222 Hash:** `51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d`
- **Audit Chain Integrity:** Valid and contiguous from record 1 through 284 (`valid: true`).

---

## 6. Summary of Remaining User Actions & Blocker Status

1. **Host Provisioning:** Launch an Ubuntu 24.04 LTS instance (1–2 vCPUs, 2 GB RAM, 25 GB NVMe SSD).
2. **DNS Setup:** Map `A` records for `<DOMAIN_NAME>` and `www.<DOMAIN_NAME>` to `<VPS_PUBLIC_IPV4>` (DNS Only / Grey Cloud in Cloudflare).
3. **Execute Runbook:**
   - Execute Phase A on Windows workstation.
   - Execute Phase B as `root` on VPS.
   - Execute Phase C as `gricc` on VPS.
   - Execute Phase D (SSH Hardening) as `root` on VPS.
   - Execute Phase E from workstation.

**ZERO UNRESOLVED TECHNICAL BLOCKERS REMAIN. SYSTEM IS FULLY PREPARED FOR LIVE VPS PROVISIONING.**

