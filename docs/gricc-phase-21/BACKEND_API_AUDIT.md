# GRICC 2.0 — Phase 21: Backend API Audit

**Document:** `BACKEND_API_AUDIT.md`  
**Phase:** 21 — Complete Technical Audit & Architecture Assessment  
**Date:** November 13, 2026  

---

## 1. Backend API Overview

The GRICC backend is an Express 5 application structured into three primary routers mounted in `server/index.js`:
1. `/api/auth` — `server/routes/auth.js` (Authentication lifecycle)
2. `/api/users` — `server/routes/users.js` (User management and RBAC administration)
3. `/api` — `server/routes/api.js` (Operational intelligence gateway)

**Verified Total Route Count:** **139 registered route endpoints** across HTTP verbs `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`.

---

## 2. API Routes Breakdown by Functional Domain

| Domain | Base Path | Route Count | Primary Roles Allowed | Core Responsibilities |
| :--- | :--- | :---: | :--- | :--- |
| **Authentication** | `/api/auth/*` | 3 | Public / Authenticated | Login (`POST /login`), logout (`POST /logout`), session identity (`GET /me`) |
| **User Administration** | `/api/users/*` | 4 | `ADMIN` only | User listing, user creation, user updates, account activation toggle |
| **System Health & Gateway** | `/api/health`, `/api/sources`, `/api/telemetry`, `/api/refresh` | 4 | Public / `ADMIN`, `ANALYST` | Health probe, data source statuses, provider telemetry, manual cache refresh |
| **SSE Real-Time Streams** | `/api/events/stream`, `/api/monitoring/stream` | 2 | Authenticated | Live Server-Sent Events streams for threat updates, alerts, and monitoring |
| **Incidents Management** | `/api/incidents/*` | 5 | Read: All; Write: `ADMIN`, `ANALYST`; Delete: `ADMIN` | Incident CRUD, search, severity filters, audit integration |
| **Alerts & Feed Operations** | `/api/alerts/*`, `/api/activities`, `/api/stats` | 5 | Read: All; Write: `ADMIN`, `ANALYST` | Alert status updates, live synchronization, operational KPIs |
| **Audit Logs** | `/api/audit-logs` | 1 | `ADMIN` only | Paginated audit log retrieval with SHA-256 integrity metadata |
| **Notifications & Preferences** | `/api/notifications/*` | 5 | Authenticated | User notifications, mark as read, preferences, read-all |
| **Country Watchlists** | `/api/watchlists/*` | 3 | Read: All; Write: `ADMIN`, `ANALYST` | User-defined country monitoring watchlists |
| **Escalation Rules** | `/api/escalation-rules/*` | 3 | Read: All; Write/Eval: `ADMIN`, `ANALYST` | Automated alert threshold rules and manual evaluation |
| **Country Risk Profiles** | `/api/countries/*` | 4 | Read: All; Write: `ADMIN`, `ANALYST` | Multi-vector scores, historical risk trends, manual score recalculation |
| **Intelligence Reports** | `/api/reports/*` | 5 | Read: All; Write/Export: `ADMIN`, `ANALYST` | Report generation, publishing, and PDF/CSV/JSON export downloads |
| **Predictive Intelligence** | `/api/predictive/*` | 5 | Read: All; Write: `ADMIN`, `ANALYST`; Thresholds: `ADMIN` | Early warning models, threshold configuration, manual evaluation trigger |
| **Strategic Decision Support** | `/api/decisions/*` | 7 | Read: All; Write: `ADMIN`, `ANALYST` | Recommendations, what-if scenario simulations, playbooks, response actions |
| **Advanced Intelligence Analytics** | `/api/analytics/advanced/*` | 6 | Read: All; Write: `ADMIN`, `ANALYST` | Cross-country risk correlations, anomaly detection, relationship graphs |
| **Geospatial Intelligence** | `/api/geospatial/*` | 8 | Read: All; Write: `ADMIN`, `ANALYST` | Spatial clusters, risk zones, transit corridors, coordinate geocoding |
| **AI Assistant & Reports** | `/api/ai/*` | 12 | Read/Chat: All; Report Gen/Approve: `ADMIN`, `ANALYST`; Config: `ADMIN` | Grounded chat, natural search, risk explanations, summaries, draft reports, approval |
| **Real-Time Intel Monitoring** | `/api/monitoring/*` | 8 | Read: All; Write: `ADMIN`, `ANALYST`; Settings: `ADMIN` | Live alert rules, category management, engine settings, manual evaluation trigger |
| **Intelligence Collaboration** | `/api/collaboration/*` | 16 | Read: All; Write: `ADMIN`, `ANALYST` | Discussions, threaded comments, entity linking, task assignments, activity feed |
| **Security & Compliance** | `/api/security/*` | 6 | `ADMIN` only | Security overview, events management, lockout unlocking, audit chain verification |
| **Performance & Scalability** | `/api/performance/*` | 3 | `ADMIN` only | Telemetry metrics, cache hit rate, p95 API latencies, SQLite ping times |
| **Total Route Count** | | **139** | | |

---

## 3. Middleware & Security Chain Analysis

Requests flow through a standardized middleware pipeline:

```
[Incoming Request]
       │
       ▼
[Helmet (Cross-Origin Policy & Security Headers)]
       │
       ▼
[CORS Middleware (Allowlist Verification)]
       │
       ▼
[General Rate Limiter (600 req / 15 min)]
       │
       ▼
[JSON / URL-Encoded Parsers (512kb limit)]
       │
       ▼
[Performance Metric Recorder (res.on('finish'))]
       │
       ▼
[Router Matching: /api/auth | /api/users | /api]
       │
       ▼
[Auth Middleware: authenticateToken] (Extracts & verifies Bearer JWT)
       │
       ▼
[RBAC Middleware: requireRole(...allowedRoles)]
       │
       ▼
[Domain Controller / Service Execution]
       │
       ▼
[Error Handling Middleware] (Masks internal stack traces in production)
```

---

## 4. Caching & Performance Integration

Five high-frequency read endpoints leverage `cacheService.getOrSet` with stampede deduplication:
- `/api/countries` (TTL: 15s)
- `/api/predictive/overview` (TTL: 15s)
- `/api/analytics/advanced/overview` (TTL: 15s)
- `/api/geospatial/overview` (TTL: 15s)
- `/api/monitoring/overview` (TTL: 10s)

Cache invalidation is automatically triggered on state mutations:
- `cacheService.invalidatePrefix('countries:')` when an incident is created or updated.
- `cacheService.invalidatePrefix('monitoring:')` when new monitoring alerts are generated.

---

## 5. Backend Audit Findings & Recommendations

1. **BE-001 (Medium) — Lack of Schema Validation Library:**  
   Request payloads are currently validated using manual procedural `if (!field)` checks inside service files.  
   *Recommendation:* Introduce a schema validation library such as `Zod` to enforce strict request body schemas, types, and error messages centrally at the router layer.

2. **BE-002 (Low) — Standardize Async Route Wrapper:**  
   Several endpoints in `server/routes/api.js` wrap handlers in `try { ... } catch (err) { next(err); }`.  
   *Recommendation:* Use an `asyncHandler` wrapper or rely on Express 5's native promise rejection handling to eliminate repetitive boilerplate.

