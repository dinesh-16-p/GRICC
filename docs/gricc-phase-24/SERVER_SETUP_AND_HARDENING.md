# GRICC 2.0 — Phase 24: Server Setup & Hardening Specification

**Document:** `SERVER_SETUP_AND_HARDENING.md`  
**Phase:** 24 of 50 — Public VPS Hosting, Domain Connection, DNS, Nginx, HTTPS & Production Deployment  
**Target Domain:** `griccnexus.com`  
**Target OS:** Ubuntu 24.04 LTS (x64)  
**Target Region:** DigitalOcean Bengaluru (`BLR1`)  
**Status:** SPECIFICATION READY FOR PROVISIONING  

---

## 1. Operating System & User Management

### 1.1 Non-Root Service User
All application processes execute under an unprivileged system user `gricc` (`UID/GID 1001`):
```bash
sudo useradd -m -s /bin/bash gricc
sudo usermod -aG sudo gricc
```
Root login via SSH is disabled once key-based access for `gricc` is confirmed.

### 1.2 SSH Hardening Policy (`/etc/ssh/sshd_config.d/gricc.conf`)
- `PermitRootLogin no` (after non-root key login verified)
- `PasswordAuthentication no` (after SSH key confirmed)
- `PubkeyAuthentication yes`
- `X11Forwarding no`
- `MaxAuthTries 4`

---

## 2. Firewall Architecture (UFW)

Only three ports are permitted inbound:
- **Port 22/tcp (SSH):** Remote administrative access (restricted by IP where feasible).
- **Port 80/tcp (HTTP):** ACME challenge validation (Let's Encrypt Certbot) and 301 HTTPS redirect.
- **Port 443/tcp (HTTPS):** Public encrypted TLS traffic.

**Explicitly Blocked Ports:**
- Port 5000 (Internal Express backend gateway) — Bound to `127.0.0.1` only.
- SQLite files — Stored in `/var/www/gricc/server/data` with permissions `chmod 700`.

---

## 3. Package Dependencies

Managed via `deploy/setup-server.sh`:
- **Runtime:** Node.js v24 LTS (`curl -fsSL https://deb.nodesource.com/setup_24.x | bash -`)
- **Process Supervisor:** PM2 (`npm install -g pm2`)
- **Reverse Proxy:** Nginx (`apt install -y nginx`)
- **TLS Engine:** Certbot & Python3 Nginx plugin (`apt install -y certbot python3-certbot-nginx`)
- **Intrusion Prevention:** Fail2Ban (`apt install -y fail2ban`) monitoring SSH failed attempts.

