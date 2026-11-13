# GRICC NEXUS — PHASE 24.6 PRODUCTION CONFIGURATION CHECKLIST
**Project:** GRICC Nexus  
**Target Domain:** `griccnexus.com` / `www.griccnexus.com`  
**Target Infrastructure:** DigitalOcean Bengaluru (`BLR1`), Ubuntu 24.04 LTS (x64)  
**Audit Date:** 2026-11-13  
**Status:** **`PASS` — CONFIGURATION AUDITED & DEPLOYMENT-READY**

---

## 1. Production Configuration Inventory

| Configuration Asset | Path | Purpose | Audit Status | Key Parameters |
| :--- | :--- | :--- | :---: | :--- |
| **Process Manager Config** | `ecosystem.config.cjs` | PM2 supervisor configuration | **VERIFIED** | Single-instance fork mode (`instances: 1`, `exec_mode: 'fork'`), 512M memory cap. |
| **Environment Template** | `.env.example` | Production environment specification | **VERIFIED** | Documented dummy values, zero real secrets, strict variable list. |
| **Bootstrap Nginx Conf** | `deploy/nginx.bootstrap.conf` | Initial ACME HTTP listener | **VERIFIED** | Solves chicken-and-egg Certbot startup on port 80. |
| **Production Nginx Conf** | `deploy/nginx.griccnexus.com.conf` | TLS reverse proxy & static hosting | **VERIFIED** | HTTP-to-HTTPS 301, TLS 1.2/1.3, conservative HSTS (86400s), SSE unbuffered. |
| **Server Provisioning Script** | `deploy/setup-server.sh` | OS hardening & tool setup | **VERIFIED** | UFW firewall, Fail2Ban, non-root `gricc` user, visudo syntax validation. |
| **Application Deploy Script**| `deploy/deploy-app.sh` | Continuous deployment pipeline | **VERIFIED** | `npm ci`, build, permissions chmod 700, test:readiness, PM2 reload, Nginx reload. |

---

## 2. Configuration Inspection Details

### 2.1 PM2 Process Manager (`ecosystem.config.cjs`)
```javascript
module.exports = {
  apps: [
    {
      name: 'gricc-backend',
      script: 'server/index.js',
      instances: 1, // Fork mode required: in-memory cache and SSE client registry are single-process
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 5000,
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      out_file: './logs/gricc-out.log',
      error_file: './logs/gricc-err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
```
- **Concurrency Safety:** Fork mode (`instances: 1`) prevents SQLite WAL database locking contention and ensures that in-memory telemetry caches and SSE subscriber sets remain unified in a single Node process.

### 2.2 Nginx Two-Stage Bootstrap & SSL Strategy
1. **Stage 1 — Bootstrap (`deploy/nginx.bootstrap.conf`):**  
   Listens on port 80, serves `/.well-known/acme-challenge/` from `/var/www/certbot`. Allows Certbot to obtain certificates without failing on missing `/etc/letsencrypt/` files.
2. **Stage 2 — Full TLS (`deploy/nginx.griccnexus.com.conf`):**  
   - HTTP $\rightarrow$ HTTPS 301 redirect.
   - Strict modern TLS 1.2 and 1.3 ciphers with ECDHE/DHE.
   - Initial conservative HSTS header: `add_header Strict-Transport-Security "max-age=86400" always;` (no preload, no includeSubDomains), allowing rollback if DNS or TLS issues arise.
   - Static asset cache: `index.html` set to `no-store`, hashed assets in `/assets/` set to `max-age=31536000, immutable`.
   - Reverse proxy for `/api/` with 10s connect and 60s read timeouts.
   - Real-time SSE stream configuration (`/api/(events|monitoring)/stream`) with `proxy_buffering off;` and `chunked_transfer_encoding on;`.

### 2.3 Server Hardening (`deploy/setup-server.sh`)
- **Firewall:** UFW configured with default incoming DENY. Only ports 22 (SSH), 80 (HTTP), and 443 (HTTPS) are allowed. Internal ports (5000, dev ports) are strictly blocked from external ingress.
- **Fail2Ban:** Enabled on SSH port to automatically ban aggressive brute-force attackers.
- **Dedicated User:** Creates non-root user `gricc` with automated root SSH key import to prevent lockout.
- **Sudoers Syntax Validation:** Generates `/etc/sudoers.d/gricc-deploy` via a temporary file and validates it with `visudo -cf` before installation, preventing server lockout caused by sudoers syntax errors.

---

## 3. Production Readiness Verification Checklist

- [x] All deployment scripts specify `bash` with `set -euo pipefail`.
- [x] Database file permissions enforce `chmod 700` on `server/data` and `server/backups`.
- [x] Environment template `.env.example` contains zero production keys or passwords.
- [x] PM2 memory restart ceiling established (`512M`).
- [x] Automatic security updates configured via `unattended-upgrades`.
- [x] Nginx protects hidden dotfiles (`location ~ /\. { deny all; }`) and blocks direct web access to `server/data/`, `server/backups/`, and `logs/`.

**Conclusion:** All production configuration files are verified syntactically sound and hardened according to production security best practices.
