# GRICC 2.0 — Phase 24.1: Production Environment Checklist
**Pre-Flight Operational & Environment Verification Matrix**

**Project:** GRICC Nexus  
**Production Domain:** `griccnexus.com` / `www.griccnexus.com`  
**Document:** `PRODUCTION_ENVIRONMENT_CHECKLIST.md`  
**Date:** November 13, 2026  
**Auditor:** DevOps & Systems Architecture Engineer  

---

## 1. Environment Variable Audit & Validation

The following table details every production environment variable required on the target VPS:

| Variable | Recommended Production Value | Required? | Purpose & Verification Rule |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `production` | **Yes** | Enables Express production optimizations, secure cookies, and disables development bypasses. |
| `PORT` | `5000` | **Yes** | Internal listener port bound behind Nginx reverse proxy. |
| `FRONTEND_URL` | `https://griccnexus.com` | **Yes** | Canonical client URL used for redirects, CORS origin matching, and alerts. |
| `CORS_ORIGIN` | `https://griccnexus.com,https://www.griccnexus.com` | **Yes** | Comma-delimited list of allowed browser origins. Must not contain `localhost`. |
| `TRUST_PROXY` | `true` | **Yes** | Instructs Express to extract real client IP from `X-Forwarded-For` header. |
| `TRUST_PROXY_HOPS`| `1` | Optional | Specifies Nginx as the single trusted upstream proxy hop. |
| `DB_PATH` | `./server/data/gricc.db` | **Yes** | Location of primary SQLite database. Must be outside `dist/` and `src/`. |
| `BACKUP_DIR` | `./server/backups` | **Yes** | Local directory for encrypted snapshot backups. |
| `BACKUP_RETENTION_COUNT` | `14` | Optional | Number of rolling local encrypted backup snapshots retained. |
| `BACKUP_ENCRYPTION_KEY` | *(Strong 32+ char passphrase)* | **Yes** | AES-256-GCM symmetric encryption passphrase for database archives. |
| `BACKUP_S3_PRESIGNED_URL`| *(Optional Cloud URL)* | Optional | Secure pre-signed endpoint for offsite cloud backup synchronization. |
| `JWT_SECRET` | *(Strong 64+ char random secret)* | **Yes** | Cryptographic key for HMAC-SHA256 session token generation and verification. |
| `JWT_EXPIRES_IN` | `8h` | Optional | Token validity window. Defaults to 8 hours. |
| `DATA_CACHE_TTL_SECONDS` | `60` | Optional | Internal memory cache TTL for external live telemetry feeds. |
| `AI_PROVIDER` | `gricc-deterministic` | **Yes** | Default zero-key grounded AI retrieval provider. |
| `AI_MODEL` | `grounded-retrieval-v1` | Optional | Model identifier for deterministic synthesis. |
| `AI_TIMEOUT_MS` | `12000` | Optional | Timeout threshold in milliseconds for AI requests. |
| `AI_MAX_RETRIES` | `2` | Optional | Exponential backoff retry limit for AI endpoints. |

---

## 2. Secure Secret Generation Procedures

In accordance with strict security standards, secrets must NEVER be committed to Git. The system administrator will generate fresh secrets during VPS provisioning using Node.js or OpenSSL:

### 2.1 JWT Secret Generation (64-character hex string)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output example: 4f9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f
```

### 2.2 Backup Encryption Key Generation (48-character base64 string)
```bash
node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"
# Output example: J7kL9mN2pQ4rS6tU8vW0xY2zA4bC6dE8fG0hI2jK4lM=
```

---

## 3. Deployment Directory Hierarchy Checklist

| Path | Owner | Perms | Required Purpose | Verified? |
| :--- | :--- | :--- | :--- | :--- |
| `/var/www/gricc` | `gricc:gricc` | `0750` | Application root directory | Verified in `setup-server.sh` |
| `/var/www/gricc/dist` | `gricc:gricc` | `0755` | Compiled React frontend bundle | Verified in `deploy-app.sh` |
| `/var/www/gricc/server/data` | `gricc:gricc` | `0700` | SQLite database directory | Verified in `deploy-app.sh` |
| `/var/www/gricc/server/backups` | `gricc:gricc` | `0700` | Encrypted backup directory | Verified in `deploy-app.sh` |
| `/var/www/gricc/logs` | `gricc:gricc` | `0750` | PM2 application log files | Verified in `ecosystem.config.cjs` |
| `/var/www/certbot` | `gricc:gricc` | `0755` | Let's Encrypt ACME webroot | Verified in `setup-server.sh` |
| `/var/log/gricc` | `gricc:gricc` | `0750` | System daemon log sink | Verified in `setup-server.sh` |

---

## 4. Live Telemetry Zero-Key Fallback Validation

GRICC 2.0 does not require expensive commercial subscriptions to operate in production. All 5 primary intelligence categories operate out-of-the-box using verified open authoritative data feeds:

1. **Natural Disasters:** NASA EONET v3 Planetary Event API (Zero-key public API).
2. **Cybersecurity:** US CISA Known Exploited Vulnerabilities (KEV) Catalog (Zero-key public JSON).
3. **Severe Weather Emergencies:** US National Weather Service (NWS) Active Alert API (Zero-key public API).
4. **Geopolitical Risk:** UN OCHA ReliefWeb Global Crisis API (Zero-key public API).
5. **International News:** GDELT 2.0 Global Database of Events, Language, and Tone (Zero-key public API).

*If commercial API keys are left blank in `.env`, GRICC safely ingests these public endpoints and caches results according to `DATA_CACHE_TTL_SECONDS`.*

---

## 5. Pre-Deployment Operational Verification Matrix

- [x] All 42 unit & integration tests passing (`npm test`).
- [x] All 18 production readiness checks passing (`npm run test:readiness`).
- [x] Clean frontend bundle compiled in `dist/` with chunk sizes within limits (`npm run build`).
- [x] Authoritative SQLite database contains 276 verified audit records.
- [x] Boundary Row 222 hash `51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d` intact.
- [x] Pre-flight encrypted backup `server/backups/gricc-backup-2026-11-13T06-55-25-837Z.db.enc` intact.
- [x] Nginx configuration verified for SPA fallback, SSE unbuffering, and security headers.
- [x] PM2 configuration verified for single-instance fork mode (`instances: 1`, `exec_mode: 'fork'`).
- [x] Sudoers rule defined for user `gricc` to reload Nginx without password prompt.
- [x] Root SSH authorized keys configured to import into user `gricc` to prevent lockout.
- [ ] DigitalOcean Droplet created and accessible via SSH. *(BLOCKED BY INFRASTRUCTURE)*
- [ ] Domain `griccnexus.com` registered and DNS A/CNAME records pointed to VPS IP. *(BLOCKED BY INFRASTRUCTURE)*
- [ ] Let's Encrypt TLS certificate issued for `griccnexus.com` and `www.griccnexus.com`. *(BLOCKED BY INFRASTRUCTURE)*

