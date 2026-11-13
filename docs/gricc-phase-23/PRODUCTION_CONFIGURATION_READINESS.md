# GRICC 2.0 — Phase 23: Production Configuration & Operational Readiness

**Document:** `PRODUCTION_CONFIGURATION_READINESS.md`  
**Phase:** 23 of 50 — Performance Optimization, Scalability Engineering & Production Preparation  
**Date:** November 13, 2026  
**Status:** VALIDATED & READY FOR AIR-GAPPED / PRIVATE STAGING  

---

## 1. Overview & Operational Constraints

In accordance with strict Phase 23 requirements:
> *"Prepare the application for future deployment without deploying it. Do not purchase a domain, VPS or external services. Do not deploy the website publicly."*

This document provides a verified operational audit of the production configuration, startup guards, and process supervision.

---

## 2. Environment Configuration Validation

The application enforces strict boot-time validation via `validateProductionConfig()` in `server/index.js`. If `NODE_ENV=production`:
- **JWT_SECRET:** Must be set and cannot be the default or insecure development secret. Must be $\ge 32$ characters.
- **CORS_ORIGIN:** Must be explicitly configured to valid HTTPS production origins; wildcard `*` or `localhost` origins are rejected at startup.
- **PORT:** Valid numeric port (1–65535).
- **Cookie Security:** Cookies automatically configure `secure: true`, `httpOnly: true`, and `sameSite: 'strict'`.

---

## 3. Production Process Supervision Architecture

### 3.1 PM2 Configuration
GRICC must be managed via PM2 in **Fork Mode** (Single Instance) due to process-local cache and SSE registries:

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'gricc-backend',
      script: './server/index.js',
      instances: 1,           // MANDATORY: Single instance only
      exec_mode: 'fork',      // MANDATORY: Do not use cluster mode
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      max_memory_restart: '500M',
      listen_timeout: 8000,
      kill_timeout: 5000,
    },
  ],
};
```

### 3.2 Health Check & Telemetry Endpoints
- **Liveness Probe:** `GET /api/health` — Returns status `HEALTHY` and database connection state (`CONNECTED`).
- **Readiness Probe:** Verified via `test-production-readiness.mjs` (all 18 production readiness assertions pass).
- **Telemetry Probe:** `GET /api/telemetry` — Returns system uptime, memory RSS, heap usage, and event loop metrics.
