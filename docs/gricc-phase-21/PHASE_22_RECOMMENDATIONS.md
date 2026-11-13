# GRICC 2.0 — Phase 21: Recommendations for Phase 22

**Document:** `PHASE_22_RECOMMENDATIONS.md`  
**Phase:** 21 — Complete Technical Audit & Architecture Assessment  
**Date:** November 13, 2026  

---

## 1. Phase 22 Strategic Focus: Hardening, Automated Testing & Security Modernization

Following the comprehensive technical audit of Phase 21, the objective for **Phase 22** should be to address high-priority architectural risks without breaking existing functionality, establishing an enterprise-ready foundation before adding new user-facing capabilities in Phases 23–50.

---

## 2. Prioritized Task Roadmap

### Priority 0: Immediate Architectural & Security Hardening (P0)

1. **P0-1: Implement Automated Test Framework (Vitest + Integration Runner)**
   - Install `vitest` and configure `vite.config.js` with test environment settings.
   - Add automated unit tests for:
     - `server/services/cacheService.js` (TTL expiration, stampede prevention, eviction).
     - `server/services/securityService.js` (audit hash chaining, password policy validator).
     - `server/services/countryRiskService.js` (weighted risk calculation formulas).
   - Add an `"test"` script in `package.json` integrated with `test-production-readiness.mjs`.

2. **P0-2: Security Hardening: HttpOnly Cookie Authentication Option**
   - Implement an optional `HttpOnly; Secure; SameSite=Strict` cookie authentication flow alongside standard Bearer headers.
   - Maintain full backward compatibility for API calls and SSE connections.
   - Prevents token exposure in browser `localStorage`.

3. **P0-3: Strict Request Schema Validation via Zod**
   - Introduce `zod` for declarative request validation.
   - Create centralized validation schemas for core mutation routes:
     - `POST /api/incidents`, `PUT /api/incidents/:id`
     - `POST /api/auth/login`
     - `POST /api/ai/chat`, `POST /api/ai/generate-report`
     - `POST /api/collaboration/discussions`, `POST /api/collaboration/tasks`
   - Unify error responses into standardized RFC-7807 problem details payloads.

---

### Priority 1: Reliability & Operations (P1)

4. **P1-1: Historical Audit Chain Migration Tool**
   - Create `server/scripts/rehash-audit-chain.js` to reconcile legacy development audit rows (145 unchained records from Phases 1–17) with the current Phase 20 cryptographic hash standard.
   - Ensures developmental databases pass `verifyAuditLogIntegrity()` without false positive alerts.

5. **P1-2: React Error Boundary Implementation**
   - Create a reusable `ErrorBoundary.jsx` component with localized error reporting and refresh buttons.
   - Wrap each tab in `src/App.jsx` (`WorldMap`, `RiskAnalytics`, `IncidentManagement`, etc.) so an isolated chart or map rendering exception will not crash the master dashboard.

6. **P1-3: Off-Site Cloud Backup Adapter**
   - Extend `server/scripts/backup-database.js` with an optional `--s3` / `--upload` flag using standard AWS S3 / Cloudflare R2 presigned uploads or SDK.
   - Provides off-site disaster recovery for SQLite database backups.

---

### Priority 2: Scalability Preparation (P2)

7. **P2-1: Architecture Modernization Blueprint for Distributed Clustering**
   - Design pluggable interfaces for:
     - `CacheProvider` (Default: In-Memory Map; Enterprise: Redis).
     - `EventBusProvider` (Default: Local EventEmitter; Enterprise: Redis Pub/Sub).
     - `DatabaseAdapter` (Default: SQLite WAL; Enterprise: PostgreSQL).
   - Keeps single-node deployments lightweight and zero-dependency while enabling horizontal multi-node scaling when enterprise demands arise.

---

## 3. Explicit Items Requiring Human Approval Before Phase 22

Per strict architectural rules, the following items must be approved by the platform owner before implementation begins:
1. Approval to add `vitest` and `zod` as new development/production dependencies in `package.json`.
2. Selection of cookie-based vs. header-based session authentication default.
3. Decision on whether to re-hash historical development audit logs or keep them archived as legacy entries.

