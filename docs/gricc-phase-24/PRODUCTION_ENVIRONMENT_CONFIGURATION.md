# GRICC 2.0 — Phase 24: Production Environment Configuration

**Document:** `PRODUCTION_ENVIRONMENT_CONFIGURATION.md`  
**Phase:** 24 of 50 — Public VPS Hosting, Domain Connection, DNS, Nginx, HTTPS & Production Deployment  
**Domain:** `griccnexus.com`  
**Status:** SPECIFICATION CONFIGURED FOR GRICCNEXUS.COM  

---

## 1. Production `.env` Blueprint for `griccnexus.com`

Stored exclusively at `/var/www/gricc/.env` with file permissions `chmod 600` (readable only by user `gricc`):

```bash
# Network & Environment
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://griccnexus.com
CORS_ORIGIN=https://griccnexus.com,https://www.griccnexus.com
TRUST_PROXY=true

# Database Storage & WAL
DB_PATH=/var/www/gricc/server/data/gricc.db
BACKUP_DIR=/var/www/gricc/server/backups
BACKUP_RETENTION_COUNT=14

# Authentication & Cryptographic Secrets
# Generated via: node -e "console.log(crypto.randomBytes(48).toString('hex'))"
JWT_SECRET=<PRODUCTION_64_CHAR_HEX_SECRET>
JWT_EXPIRES_IN=8h

# Authenticated Backup Encryption (AES-256-GCM)
BACKUP_ENCRYPTION_KEY=<PRODUCTION_STRONG_PASSPHRASE>

# Rate Limiting
API_RATE_LIMIT_MAX=600

# Grounded Deterministic AI Engine
AI_PROVIDER=gricc-deterministic
AI_MODEL=grounded-retrieval-v1
AI_TIMEOUT_MS=12000
AI_MAX_RETRIES=2
```

---

## 2. Boot-Time Startup Enforcement (`validateProductionConfig()`)

When `NODE_ENV=production`, Express automatically asserts:
1. `JWT_SECRET` is not empty, not the development placeholder, and $\ge 32$ characters.
2. `CORS_ORIGIN` does not contain `localhost` or wildcards (`*`).
3. Cookies default to `secure: true`, `httpOnly: true`, and `sameSite: 'strict'`.
