# GRICC 2.0 — Phase 24.1: Security Configuration Review
**Comprehensive Pre-Flight Security & Hardening Review**

**Project:** GRICC Nexus  
**Domain Target:** `griccnexus.com`  
**OS Target:** Ubuntu 24.04 LTS (x64)  
**Document:** `SECURITY_CONFIGURATION_REVIEW.md`  
**Date:** November 13, 2026  
**Auditor:** Application Security & Infrastructure Hardening Specialist  

---

## 1. Operating System & Identity Security

### 1.1 Non-Root Service Execution
- **Account:** Dedicated system account `gricc` (`UID 1001` or first non-system UID).
- **Home Directory:** `/home/gricc` (mode `0750`).
- **Shell:** `/bin/bash`.
- **Privilege Separation:** Application processes run strictly under `gricc`. Root execution of Node.js or PM2 is prohibited.
- **Sudoers Scope:** Restricted to `/etc/sudoers.d/gricc-deploy`:
  ```text
  gricc ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx, /bin/systemctl restart nginx
  ```
  This eliminates the need for interactive root passwords during automated deployments while preventing unrestricted root escalation.

### 1.2 SSH Remote Access & Lockout Prevention
- **Authentication Method:** Public-key authentication (`PubkeyAuthentication yes`).
- **Root Login Policy:** `PermitRootLogin no` after verifying that user `gricc` possesses valid SSH authorized keys.
- **Password Authentication:** `PasswordAuthentication no`.
- **Lockout Prevention:** In `deploy/setup-server.sh`, the provisioning script safely copies `/root/.ssh/authorized_keys` to `/home/gricc/.ssh/authorized_keys` with strict permissions:
  ```bash
  mkdir -p /home/gricc/.ssh
  if [ -f /root/.ssh/authorized_keys ]; then
      cp /root/.ssh/authorized_keys /home/gricc/.ssh/authorized_keys
      chown -R gricc:gricc /home/gricc/.ssh
      chmod 700 /home/gricc/.ssh
      chmod 600 /home/gricc/.ssh/authorized_keys
  fi
  ```
  This guarantees that operators provisioning cloud instances with root SSH keys retain administrative access through `gricc` without risking lockout.

### 1.3 Ingress Filtering & Firewall Architecture (UFW)
- **Default Policy:**
  - `ufw default deny incoming`
  - `ufw default allow outgoing`
- **Permitted Ingress Rules:**
  - `22/tcp` (SSH) — Remote administration.
  - `80/tcp` (HTTP) — Let's Encrypt ACME verification and permanent 301 HTTPS redirection.
  - `443/tcp` (HTTPS) — Encrypted production web traffic.
- **Strictly Blocked Local Ports:**
  - Port `5000` (Node.js Express backend) — Bound strictly to loopback `127.0.0.1`.
  - Port `3000` (Vite dev server) — Prohibited in production.
  - SQLite files and database ports — Prohibited from any network exposure.

### 1.4 Intrusion Prevention (Fail2Ban)
- **Service:** `fail2ban` system service.
- **Jail:** `sshd` jail enabled.
- **Threshold:** 5 failed authentication attempts within 10 minutes results in a 1-hour IP ban.

---

## 2. Web Server & Transport Layer Security (Nginx & TLS)

### 2.1 TLS Protocol & Cipher Suite
- **Protocols:** TLSv1.2 and TLSv1.3 only (SSLv2, SSLv3, TLSv1.0, and TLSv1.1 explicitly disabled).
- **Cipher Preference:** Server cipher preference off (allows modern clients to negotiate optimal AEAD ciphers).
- **Approved Ciphers:**
  - `ECDHE-ECDSA-AES128-GCM-SHA256`
  - `ECDHE-RSA-AES128-GCM-SHA256`
  - `ECDHE-ECDSA-AES256-GCM-SHA384`
  - `ECDHE-RSA-AES256-GCM-SHA384`
  - `DHE-RSA-AES128-GCM-SHA256`
  - `DHE-RSA-AES256-GCM-SHA384`
- **Session Cache:** `shared:SSL:10m` with 1-day timeout; session tickets disabled for forward secrecy.

### 2.2 Security Response Headers
The following headers are emitted on all HTTPS responses:
1. **HTTP Strict Transport Security (HSTS):**
   ```nginx
   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
   ```
2. **MIME Sniffing Protection:**
   ```nginx
   add_header X-Content-Type-Options "nosniff" always;
   ```
3. **Clickjacking Defense:**
   ```nginx
   add_header X-Frame-Options "DENY" always;
   ```
4. **Referrer Policy:**
   ```nginx
   add_header Referrer-Policy "strict-origin-when-cross-origin" always;
   ```
5. **Permissions Policy:**
   ```nginx
   add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;
   ```

### 2.3 Web Application Access Control & Sensitive File Shielding
```nginx
# Block hidden files (.env, .git, etc.)
location ~ /\. {
    deny all;
    access_log off;
    log_not_found off;
}

# Block server data, backups, and logs
location ~ ^/(server/data|server/backups|logs)/ {
    deny all;
    return 404;
}
```

---

## 3. Application Layer Security (Express & Node.js)

### 3.1 Authentication & Cookie Policy
- **Session Cookie (`gricc_session`):**
  - `httpOnly: true` (Inaccessible to browser JavaScript, mitigating XSS token theft).
  - `secure: true` in production (Transmitted only over HTTPS).
  - `sameSite: 'strict'` (Mitigates Cross-Site Request Forgery).
  - `path: '/'`.
- **CSRF Protection (`gricc_csrf`):**
  - Implements the Double-Submit Cookie pattern.
  - Non-HTTP-only cookie readable by client-side JavaScript to include in the `x-csrf-token` request header.
  - Server-side middleware validates equality before allowing state-changing operations (`POST`, `PUT`, `PATCH`, `DELETE`).

### 3.2 JWT Token Architecture
- **Secret Requirement:** Minimum 32 random characters (enforced at startup by `validateProductionConfig()`).
- **Expiration:** Default 8 hours (`JWT_EXPIRES_IN=8h`).
- **Rotation & Revocation:** Session tokens feature unique JTIs (`jwtId`). Previous JTIs are blacklisted upon rotation or explicit logout.

### 3.3 Reverse Proxy Trust & Rate Limiting
- **Trust Proxy Configuration:** In production, Express executes `app.set('trust proxy', 1)`.
- **Client IP Resolution:** Derived from `X-Forwarded-For` set by Nginx:
  ```nginx
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  ```
- **Rate Limiting:** Global rate limiting protects against brute force and denial-of-service attacks:
  - Auth endpoints: 5 failed attempts per IP per 15 minutes before lock.
  - General API endpoints: 600 requests per 15-minute window.

### 3.4 Cross-Origin Resource Sharing (CORS)
- **Allowed Origins:** Strictly limited to `https://griccnexus.com` and `https://www.griccnexus.com`.
- **Wildcard Policy:** Wildcard origins (`*`) are disallowed when credentials/cookies are active.
- **Enforcement:** Unauthorized origins receive `403 Forbidden` / `CORS policy: Origin ... not allowed`.

---

## 4. Cryptographic Storage & Backup Security

### 4.1 Database File System Protection
- Primary SQLite database path: `/var/www/gricc/server/data/gricc.db`.
- Directory permissions: `chmod 700 /var/www/gricc/server/data` (owned by `gricc:gricc`).
- File permissions: `chmod 600 /var/www/gricc/server/data/gricc.db`.

### 4.2 Authenticated Backup Encryption (AES-256-GCM)
- **Algorithm:** AES-256-GCM with PBKDF2 key derivation.
- **PBKDF2 Parameters:** 100,000 iterations, SHA-512 digest, 16-byte random salt.
- **Initialization Vector:** 12-byte cryptographically secure random IV per backup.
- **Authentication Tag:** 16-byte GCM authentication tag preventing undetected ciphertext tampering.
- **Key Source:** `BACKUP_ENCRYPTION_KEY` environment variable (never checked into Git).

---

## 5. Security Audit Finding Classification

| Security Domain | Status | Notes |
| :--- | :--- | :--- |
| OS & User Isolation | `PASS` | Dedicated non-root `gricc` user, sudoers scoped |
| SSH & Lockout Hardening | `PASS` | Root keys imported to `gricc`, key-based access |
| Network Ingress (UFW) | `PASS` | Only ports 22, 80, 443 permitted |
| Nginx Reverse Proxy | `PASS` | SSE unbuffering, security headers, file shielding |
| Transport Layer (TLS) | `READY (OFFLINE)` | Blocked by live domain & ACME issuance |
| JWT & Cookie Security | `PASS` | HttpOnly, Secure, SameSite=strict, CSRF protected |
| Database Protection | `PASS` | Strict chmod 700/600, encrypted AES-256-GCM backups |
| Cryptographic Audit Ledger | `PASS` | 276 records verified, Row 222 boundary preserved |

