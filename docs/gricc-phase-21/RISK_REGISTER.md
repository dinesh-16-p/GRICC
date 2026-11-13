# GRICC 2.0 — Phase 21: Risk Register

**Document:** `RISK_REGISTER.md`  
**Phase:** 21 — Complete Technical Audit & Architecture Assessment  
**Date:** November 13, 2026  

---

## 1. Risk Classification Methodology

- **CRITICAL:** Immediate vulnerability exposing system to remote unauthorized takeover, permanent data loss, or systemic outage.
- **HIGH:** Major functional, architectural, or security flaw that compromises data confidentiality, process reliability, or production stability.
- **MEDIUM:** Important technical debt, unhandled edge cases, lack of automated validation, or performance degradation under stress.
- **LOW:** Minor improvement, stylistic inconsistency, or non-blocking enhancement.

---

## 2. Risk Log

### RISK-01: Browser LocalStorage JWT Token Storage
- **Issue ID:** `SEC-001`
- **Severity:** **HIGH**
- **Affected Module / File:** `src/services/apiService.js` (lines 9–23)
- **Evidence:** `localStorage.setItem('gricc_auth_token', token)` stores sensitive bearer tokens in non-expiring browser storage accessible to JavaScript.
- **Reproduction Steps:**
  1. Open the application in a browser and sign in.
  2. Open Developer Tools > Application > Local Storage.
  3. Notice `gricc_auth_token` is stored as plaintext and readable via `localStorage.getItem('gricc_auth_token')`.
- **Business / Technical Impact:** If an XSS vulnerability occurs or a third-party npm package is compromised, the operator's JWT can be read and exfiltrated, giving attackers authenticated access.
- **Recommended Solution:** Transition to `HttpOnly`, `Secure`, `SameSite=Strict` cookies for web sessions, while retaining an SSE token authentication parameter for EventSource streaming.

---

### RISK-02: Historical Unchained Records in Development Database
- **Issue ID:** `DATA-001`
- **Severity:** **HIGH**
- **Affected Module / File:** `server/data/gricc.db` (`audit_logs` table)
- **Evidence:** `securityService.verifyAuditLogIntegrity()` reports `valid: false` on the local database (222 rows checked, 145 unchained records from Phases 1–17, 35 pre-normalization entries).
- **Reproduction Steps:**
  1. Run `node -e "import('./server/services/securityService.js').then(m => console.log(m.securityService.verifyAuditLogIntegrity()))"`.
  2. Observe `valid: false` and `tamperedCount: 35`.
- **Business / Technical Impact:** If `server/data/gricc.db` is accidentally uploaded to production, compliance audits will falsely flag the database as tampered.
- **Recommended Solution:** Enforce database initialization on the production server via `initializeDatabase()` (which starts with a clean genesis hash) and never copy the development database to production. Provide an optional re-hashing script for historical development data.

---

### RISK-03: Single-Instance Process Limitation
- **Issue ID:** `ARCH-001`
- **Severity:** **HIGH**
- **Affected Module / File:** `server/services/cacheService.js`, `server/services/realtimeService.js`, `server/db/database.js`
- **Evidence:** Caching (`cacheService.js`) uses an in-memory `Map()`, real-time SSE clients (`realtimeService.js`) are held in a local `Set()`, and SQLite allows only one active writer process at a time.
- **Reproduction Steps:**
  1. Start two Node.js processes running `server/index.js` on different ports.
  2. Emit an incident creation event on Server 1.
  3. Notice clients connected to Server 2 do not receive the SSE broadcast, and Server 2's cache is not invalidated.
- **Business / Technical Impact:** Attempting to horizontally scale GRICC across multiple instances behind a load balancer will result in desynchronized data and missed real-time alerts.
- **Recommended Solution:** Enforce single-instance PM2 (`instances: 1`, `fork` mode) for initial release. In GRICC 2.0 Phase 23/24, create pluggable Redis pub/sub and PostgreSQL adapters for distributed clustering.

---

### RISK-04: Absence of Continuous Automated Unit & E2E Tests
- **Issue ID:** `TEST-001`
- **Severity:** **HIGH**
- **Affected Module / File:** `package.json`, root project structure
- **Evidence:** `package.json` contains no `"test"` script. Testing relies on running `node test-production-readiness.mjs` manually.
- **Reproduction Steps:**
  1. Inspect `package.json` scripts: only `"dev"`, `"dev:server"`, `"start:server"`, `"build"`, `"preview"`, `"backup:db"`, and `"bootstrap:admin"` exist.
- **Business / Technical Impact:** Code changes in future phases could introduce regressions without automated CI pipeline gates stopping them.
- **Recommended Solution:** Install `vitest` for unit tests and `playwright` for E2E tests, and wire them into `npm test` and GitHub Actions / GitLab CI.

---

### RISK-05: Absence of Declarative Schema Validation on API Inputs
- **Issue ID:** `BE-001`
- **Severity:** **MEDIUM**
- **Affected Module / File:** `server/routes/api.js`, `server/services/*.js`
- **Evidence:** Route inputs are validated procedurally (e.g. `if (!title || !country)`) across controllers rather than through a typed schema validator.
- **Reproduction Steps:**
  1. Review `server/services/persistenceService.js` (line 146): procedural `if (!title || !country...)` throws error.
- **Business / Technical Impact:** Inconsistent error responses (some endpoints return 400 with `{ error: 'ValidationError' }`, others return generic `{ error: 'Error' }`), and type coercion edge cases.
- **Recommended Solution:** Integrate `Zod` to define strict input schemas for all 139 route endpoints with uniform HTTP 422 / 400 error payloads.

---

### RISK-06: Development Authentication Fallback if Misconfigured
- **Issue ID:** `SEC-002`
- **Severity:** **MEDIUM**
- **Affected Module / File:** `server/services/authService.js` (lines 216–220), `server/middleware/authMiddleware.js`
- **Evidence:** In non-production environments (`NODE_ENV !== 'production'`), master dev passwords (`admin123`) and fallback operator authorization are active.
- **Reproduction Steps:**
  1. Start server with `NODE_ENV=development`.
  2. Send request without `Authorization` header to `/api/countries`.
  3. Observe request succeeds with operator credentials.
- **Business / Technical Impact:** If an administrator deploys GRICC to the internet and forgets to set `NODE_ENV=production` in `.env`, the API will be accessible without authentication.
- **Recommended Solution:** `validateProductionConfig()` already checks production variables. Add a mandatory startup confirmation check that blocks all network requests if bound to non-localhost when `NODE_ENV !== 'production'`.

---

### RISK-07: Local-Only Database Backups Without Off-Site Replication
- **Issue ID:** `DEP-002`
- **Severity:** **MEDIUM**
- **Affected Module / File:** `server/scripts/backup-database.js`
- **Evidence:** The automated backup script stores snapshots in `server/backups/` on the local filesystem.
- **Reproduction Steps:**
  1. Run `npm run backup:db`.
  2. Backups are stored exclusively in `./server/backups/`.
- **Business / Technical Impact:** If the hosting server suffers catastrophic disk failure or data center loss, all local backups are destroyed simultaneously.
- **Recommended Solution:** Implement an S3-compatible sync command in `backup-database.js` to upload timestamped backups to encrypted object storage (AWS S3, Cloudflare R2).

---

### RISK-08: Absence of Frontend Error Boundaries
- **Issue ID:** `FE-001`
- **Severity:** **LOW**
- **Affected Module / File:** `src/App.jsx`, `src/components/*`
- **Evidence:** Components are loaded via `React.lazy()` with `<Suspense>`, but are not wrapped in `<ErrorBoundary>`.
- **Reproduction Steps:**
  1. Introduce a simulated render error inside a nested widget (e.g., `throw new Error('Render fail')`).
  2. Observe the entire application renders a white/blank screen.
- **Business / Technical Impact:** A rendering glitch in an isolated tab (e.g. Recharts or Leaflet) unmounts the whole application, interrupting operator monitoring.
- **Recommended Solution:** Wrap tab views in localized React Error Boundaries that render a graceful fallback panel without crashing the entire app.

