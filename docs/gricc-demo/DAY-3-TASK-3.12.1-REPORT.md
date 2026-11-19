# GRICC NEXUS — Day 3 Task 3.12.1 Execution Report
## Production Deployment Runbook Safety Audit & Script Hardening

**Date:** November 14, 2026  
**Target Platform:** Ubuntu 24.04 LTS (x64) Minimal / Server  
**Technology Stack:** Node.js 24 LTS, SQLite 3 (WAL Mode), PM2 (Single-Instance Fork Mode), Nginx, Let's Encrypt  
**Branch:** `master`  
**HEAD Commit:** `d88de62376a3b8dcc4154b8f1a29a80b89bc8f2c`  
**LibSQL Branch / Commit:** `phase-24-8-libsql-adapter` (`9b7defa43de25a752c81dafe6b68cdd5431f3673`)  
**Deployment Status:** **SCRIPTS AUDITED, HARDENED & LOCAL TESTS 100% PASSED**

---

## 1. Audit of Deployment Scripts & Exact File References

An exhaustive, line-by-line inspection was performed across all deployment and configuration files:

### 1.1 `deploy/setup-server.sh`
- **Line 8–9:** Added `export DEBIAN_FRONTEND=noninteractive` immediately after `set -euo pipefail`. Prevents `apt-get upgrade` and `apt-get install` from stalling on interactive `needrestart` curses dialogues on fresh Ubuntu 24.04 LTS images.
- **Line 26–32:** Strict UFW firewalling (`default deny incoming`, permits only `22/tcp`, `80/tcp`, `443/tcp`). Port 5000 is never exposed.
- **Line 36–52:** Non-root application user `gricc` created with bash shell and imported SSH authorized keys (`chmod 700 /home/gricc/.ssh`, `chmod 600 /home/gricc/.ssh/authorized_keys`).
- **Line 58–71:** Hardened sudoers configuration `/etc/sudoers.d/gricc-deploy` validated with `visudo -cf` granting `gricc` passwordless execution of `/usr/sbin/nginx -t` and `/usr/bin/systemctl reload nginx`.
- **Line 75–76:** Node.js 24 LTS installed via official NodeSource repository.
- **Line 83:** PM2 global installation and systemd startup configuration registered for user `gricc`.
- **Line 88–94:** Directory permissions set to `chmod 755 /var/www/gricc` and `chmod 755 /var/www/certbot`, allowing Nginx (`www-data`) to traverse the directory structure and serve static files and ACME challenge tokens.

### 1.2 `deploy/deploy-app.sh`
- **Line 7:** `set -euo pipefail` ensures immediate script termination on any command error.
- **Lines 17–25 (Ordering Correction):** Reordered deployment workflow to enforce canonical **BUILD -> TEST -> PRUNE** sequence:
  1. `npm ci` installs all dependencies.
  2. `npm run build` compiles Vite frontend to `dist/`.
  3. `npm run test:readiness` runs all 18 production readiness self-tests against the newly built distribution. If tests fail, the script terminates immediately without altering running processes.
  4. `npm prune --omit=dev` strips devDependencies only **after** tests succeed.
- **Lines 28–34:** Enforces `chmod 700` on `$APP_DIR/server/data`, `$APP_DIR/server/backups`, and `$APP_DIR/logs`.
- **Lines 37–39:** Supervised launch via `pm2 startOrReload ecosystem.config.cjs --env production` and `pm2 save`.
- **Lines 42–44:** Pre-reload Nginx validation (`sudo nginx -t`) before issuing `sudo systemctl reload nginx`.

### 1.3 `ecosystem.config.cjs`
- **Line 6:** Explicitly configured `cwd: __dirname`. Ensures PM2 always resolves relative paths (including `./server/data/gricc.db`, `./logs/`, and `dotenv.config()`) relative to the application root directory `/var/www/gricc`, even when spawned or resurrected by systemd upon host reboot.
- **Lines 8–9:** Strict single-instance fork mode enforced: `instances: 1`, `exec_mode: 'fork'`.
- **Line 12:** Memory limit restart threshold set to `max_memory_restart: '512M'`.

### 1.4 `deploy/nginx.griccnexus.com.conf`
- **Lines 28–30:** Modernized HTTP/2 configuration for Nginx 1.24+ (Ubuntu 24.04 LTS) by replacing deprecated `listen 443 ssl http2;` with `listen 443 ssl;` and `http2 on;`.
- **Lines 80–97:** Dedicated SSE location block (`/api/(events|monitoring)/stream`) with `proxy_buffering off`, `proxy_cache off`, `chunked_transfer_encoding on`, `proxy_read_timeout 3600s`, and `access_log off`.
- **Lines 122–125:** Denies web access to sensitive internal paths (`/(server/data|server/backups|logs)/`).
- **Lines 128–130:** SPA client-side fallback `try_files $uri $uri/ /index.html;`.

---

## 2. Verification of Deployment Ordering & Runtime Invariants

### 2.1 Readiness Test Execution
The complete production readiness self-test was executed directly against the production runtime build:

```bash
node test-production-readiness.mjs
```

**Actual Execution Output:**
```
◇ injected env (3) from .env
◇ injected env (0) from .env
====================================================
  GRICC Backend Gateway Online on Port 5000
  Frontend CORS Origin: https://gricc.example.com
  Health Check: http://localhost:5000/api/health
  Telemetry:    http://localhost:5000/api/telemetry
====================================================
[2026-11-14T12:21:16.843Z] GET /api/health 200 - 8.3ms
[AUTH] Login attempt for identifier="prod_admin" ip="127.0.0.1"
[AUTH] Authenticated user="prod_admin" role="ADMIN"
[2026-11-14T12:21:17.082Z] POST /api/auth/login 200 - 150.7ms
[AUTH] Login attempt for identifier="prod_viewer" ip="127.0.0.1"
[AUTH] Authenticated user="prod_viewer" role="VIEWER"
[2026-11-14T12:21:17.223Z] POST /api/auth/login 200 - 133.0ms
[2026-11-14T12:21:17.238Z] GET /api/users 401 - 1.2ms
[2026-11-14T12:21:17.260Z] GET /api/users 403 - 8.0ms
[2026-11-14T12:21:17.274Z] GET /api/performance/overview 403 - 7.3ms
[2026-11-14T12:21:17.286Z] GET /api/users 200 - 3.0ms
[2026-11-14T12:21:17.305Z] GET /api/performance/overview 200 - 5.7ms
[2026-11-14T12:21:17.317Z] GET /api/countries 200 - 3.7ms
[2026-11-14T12:21:17.324Z] GET /api/incidents 200 - 2.7ms
[2026-11-14T12:21:17.331Z] GET /api/ai/status 200 - 2.0ms
[2026-11-14T12:21:17.346Z] GET /api/health 200 - 1.8ms
[SERVER ERROR]: Error: CORS policy: Origin https://evil.example.com not allowed
[2026-11-14T12:21:17.377Z] GET /api/incidents/NONEXISTENT-999 404 - 2.9ms
[2026-11-14T12:21:17.382Z] GET /api/events/stream 401 - 1.0ms
[2026-11-14T12:21:17.423Z] POST /api/ai/generate-report 201 - 14.1ms
[2026-11-14T12:21:17.434Z] PATCH /api/ai/reports/AIRPT-MWGDK4BX/approve 200 - 5.2ms
[2026-11-14T12:21:17.527Z] GET /api/reports/RPT-AI-MWGDK4C7/download 200 - 72.6ms
[2026-11-14T12:21:17.648Z] GET /api/security/audit-integrity 200 - 6.2ms
[2026-11-14T12:21:17.657Z] GET /api/performance/overview 200 - 2.6ms
{
  "status": "ALL_18_PRODUCTION_READINESS_CHECKS_PASSED",
  "distAssetsChecked": 23,
  "backupSizeBytes": 647168,
  "restoredUsers": 2,
  "auditIntegrityValid": true,
  "auditCheckedCount": 12
}
```

### 2.2 Complete Test Suite Execution
All 11 test suites across the repository were executed (`npm test`):
```
 Test Files  11 passed (11)
      Tests  83 passed (83)
   Duration  43.81s
```

### 2.3 Runtime Invariants Summary
- **Runtime Dependencies:** All 17 production dependencies (`better-sqlite3`, `express`, `bcryptjs`, `jsonwebtoken`, `cors`, `helmet`, `cookie-parser`, `dotenv`, etc.) remain intact after pruning.
- **Database Write Permissions:** SQLite writes to `gricc.db`, `gricc.db-wal`, and `gricc.db-shm` inside `/var/www/gricc/server/data/`. Because directory permissions are `chmod 700` and ownership is `gricc:gricc`, the application user has complete read/write access.
- **Fail-Closed Overwrite Protection:** Automatic replacement of an existing database on the VPS is hard-blocked:
  ```bash
  TARGET_DB="/var/www/gricc/server/data/gricc.db"
  if [ -f "$TARGET_DB" ]; then
      echo "FATAL: Existing database detected. Automatic replacement is BLOCKED."
      exit 1
  fi
  ```

---

## 3. SSH & Host Security Controls

1. **Sudoers Scope:** `/etc/sudoers.d/gricc-deploy` grants passwordless sudo **strictly** to:
   - `/usr/sbin/nginx -t`
   - `/usr/bin/systemctl reload nginx`
   - `/bin/systemctl reload nginx`
   - `/usr/bin/systemctl restart nginx`
   - `/bin/systemctl restart nginx`  
   The `gricc` user does **not** have blanket root permissions, preventing privilege escalation.
2. **SSH Hardening & Lockout Recovery:**
   - SSH keys are imported to both `root` and `gricc`.
   - **Precaution:** The operator must keep an active SSH session in Terminal 1 and verify public key login in Terminal 2 before disabling password authentication in `/etc/ssh/sshd_config.d/hardening.conf`.
   - **Lockout Recovery:** If SSH configuration fails, cloud management console web access (VNC / Emergency Web Console) provides out-of-band root login.
3. **Firewall Isolation:**
   - UFW default policy: `deny incoming`, `allow outgoing`.
   - Open ports: `22/tcp` (SSH), `80/tcp` (HTTP), `443/tcp` (HTTPS).
   - Port 5000 is **not** exposed to the public Internet; it is reachable only locally from `127.0.0.1` via Nginx reverse proxy.
4. **Secret Isolation:**
   - Secrets are generated on the server (`openssl rand -hex 32`) directly into `/var/www/gricc/.env` (`chmod 600`).
   - Secrets are excluded from git via `.gitignore` and are never echoed to shell logs.

---

## 4. HTTPS & DNS Prerequisites

1. **DNS Resolution Requirement:**
   - Before requesting Let's Encrypt certificates, both `<DOMAIN_NAME>` and `www.<DOMAIN_NAME>` must resolve to `<VPS_PUBLIC_IPV4>`:
     ```bash
     dig +short A <DOMAIN_NAME>
     dig +short A www.<DOMAIN_NAME>
     ```
   - Cloudflare proxying must be set to **DNS Only (Grey Cloud)** during certificate issuance.
2. **Certificate Paths & Certbot Alignment:**
   - Certbot webroot: `/var/www/certbot`
   - Certbot output path: `/etc/letsencrypt/live/<DOMAIN_NAME>/fullchain.pem`
   - Nginx configuration directive:
     ```nginx
     ssl_certificate     /etc/letsencrypt/live/<DOMAIN_NAME>/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/<DOMAIN_NAME>/privkey.pem;
     ```
   - Aligned identically across `deploy/nginx.griccnexus.com.conf` and the Certbot command.
3. **Automated Renewal Hook:**
   - Installed at `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`:
     ```bash
     #!/bin/sh
     systemctl reload nginx
     ```
   - Executed automatically by systemd `certbot.timer` upon successful certificate renewal.

---

## 5. Authoritative Database Baseline Status

- **Database Path:** `server/data/gricc.db` (opened strictly with `{ readonly: true }`)
- **`PRAGMA quick_check`:** `{"quick_check":"ok"}`
- **`PRAGMA integrity_check`:** `{"integrity_check":"ok"}`
- **Audit Record Count:** Exactly `284` records.
- **Boundary Record 222 Hash:** `51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d`
- **Full Cryptographic Chain Integrity:** Valid and contiguous from ID 1 through ID 284 (`valid: true, tampered: 0`).

---

## 6. Verification Status Matrix

| Component / Step | Test Method | Result / Status |
| :--- | :--- | :--- |
| **Release Archive Creation & Exclusions** | Tested via `tar.exe` with explicit exclude filters | **VERIFIED (Exit code 0)** |
| **Fail-Closed Archive Verifier** | Tested against 3 deliberately contaminated test archives | **VERIFIED (All 3 rejected with exit code 1)** |
| **Hot SQLite Online Backup** | Tested via `better-sqlite3` `sourceDb.backup()` | **VERIFIED (Exit code 0, 284 records, hash match)** |
| **Production Readiness Self-Test** | `node test-production-readiness.mjs` | **VERIFIED (18/18 checks passed)** |
| **Full Unit & Integration Test Suite**| `npm test` (Vitest) | **VERIFIED (83/83 tests passed across 11 files)** |
| **Local Authoritative DB Baseline** | Direct PRAGMA & chain verification | **VERIFIED (284 records, chain valid)** |
| **VPS Remote Network Provisioning** | Live VPS execution | **NOT VERIFIED** (Awaiting real VPS & DNS from user) |
| **Live Let's Encrypt Certificate Issuance**| ACME HTTP-01 challenge over public Internet | **NOT VERIFIED** (Requires public DNS propagation) |

---

## 7. Remaining User Actions

To execute live production deployment, the operator must:
1. **Provision VPS:** Launch Ubuntu 24.04 LTS instance (1–2 vCPUs, 2 GB RAM, 25 GB SSD).
2. **Configure DNS:** Map `A` records for `<DOMAIN_NAME>` and `www.<DOMAIN_NAME>` to `<VPS_PUBLIC_IPV4>` (DNS Only / Grey Cloud in Cloudflare).
3. **Execute Runbook:** Follow Phase A (PowerShell on workstation), Phase B (root on VPS), and Phase C (`gricc` on VPS) as documented in Task 3.12.

**ALL LOCAL PRECHECKS, SCRIPT HARDENING, AND SAFETY GATES ARE VERIFIED AND COMPLETE.**

