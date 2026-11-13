# GRICC 2.0 — Phase 21: Project Architecture Audit

**Document:** `PROJECT_ARCHITECTURE.md`  
**Phase:** 21 — Complete Technical Audit & Architecture Assessment  
**Date:** November 13, 2026  

---

## 1. System Overview

GRICC (Global Risk, Intelligence & Conflict Center) is designed as a high-density, real-time geopolitical intelligence dashboard and early warning system. It aggregates structured threat signals across five intelligence disciplines:
1. **Geopolitical Risk** (Conflict, territorial disputes, sanctions, civil unrest)
2. **Cybersecurity Threats** (CISA Known Exploited Vulnerabilities, active campaigns)
3. **Natural Disasters** (Earthquakes, storms, floods, volcanic activity via NASA EONET)
4. **Severe Weather Emergencies** (NOAA / National Weather Service active advisories)
5. **International News Wire** (GDELT 2.0 Global Intelligence document streams)

The platform enables security analysts and executive decision-makers to track country risk profiles, simulate crisis scenarios, coordinate investigation playbooks, query an AI intelligence assistant, and monitor active threats via real-time Server-Sent Events (SSE).

---

## 2. Technology Stack Inventory

### 2.1 Frontend Stack
- **Framework:** React 18.3.1 (Single Page Application architecture)
- **Build Tool:** Vite 5.4.8 (ESM-native dev server and Rollup production bundler)
- **Styling:** Tailwind CSS 3.4.14 with PostCSS 8.4.47 and Autoprefixer 10.4.20
- **UI Components & Icons:** Lucide React 1.16.0
- **Data Visualizations:** Recharts 3.10.1
- **Geospatial Mapping:** Leaflet 1.9.4 and React-Leaflet 4.2.1

### 2.2 Backend Stack
- **Runtime Environment:** Node.js 20+ (LTS) / Node.js 24 (Tested)
- **HTTP Application Framework:** Express 5.3.0
- **Database Engine:** SQLite 3 via Better-SQLite3 13.1.1 (native C++ binding)
- **Security & Hardening:** Helmet 8.3.0, CORS 2.8.6, Express Rate Limit 8.7.4
- **Authentication & Cryptography:** JSONWebToken 9.0.3, Bcryptjs 3.0.3, Node.js Native Crypto (SHA-256)
- **Document Generation:** PDFKit 0.20.2
- **Process & Environment:** Dotenv 18.0.9, PM2 (Configuration via `ecosystem.config.cjs`)

---

## 3. High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                CLIENT BROWSER (SPA)                               |
|                                                                                   |
|  [ React 18 UI ] <---> [ Vite Dynamic Chunks ] <---> [ localStorage Auth JWT ]    |
|         |                                                      |                  |
|         v                                                      v                  |
|  [ API Service ] (fetchWithRetry)              [ EventSource Real-Time Client ]   |
+-----------------------------------------------------------------------------------+
                                   |           |
             REST API (/api/*)     |           | SSE Streams (/api/events/stream)
                                   v           v
+-----------------------------------------------------------------------------------+
|                               REVERSE PROXY (NGINX)                               |
|  - TLS Termination (Let's Encrypt HTTPS)                                          |
|  - Static Assets Hosting (/assets/* immutable cache, /index.html no-store)        |
|  - Proxy Buffering Disabled for SSE Streams                                       |
+-----------------------------------------------------------------------------------+
                                   |
                                   v (Port 5000)
+-----------------------------------------------------------------------------------+
|                            EXPRESS 5 APPLICATION SERVER                           |
|                                                                                   |
|  [ Security Middleware ] -> Helmet, CORS Allowlist, Rate Limiters, Trust Proxy    |
|  [ Auth Middleware ]     -> Bearer JWT, Revocation Check, RBAC (requireRole)      |
|  [ Performance Layer ]   -> CacheService (TTL + Stampede Guard), Telemetry Metric |
|                                                                                   |
|  [ Route Handlers ]                                                               |
|    * /api/auth          * /api/incidents        * /api/analytics/advanced         |
|    * /api/users         * /api/predictive       * /api/geospatial                 |
|    * /api/countries     * /api/decisions        * /api/ai                         |
|    * /api/monitoring    * /api/collaboration    * /api/security                   |
|                                                                                   |
|  [ Background Schedulers & Engines ]                                              |
|    * Escalation Evaluation Engine (60s timer)                                     |
|    * Real-Time Monitoring Evaluator (10s evaluate / 30s prune)                    |
|    * Collaboration Task Reminder (5m timer, overlap-guarded)                      |
|                                                                                   |
|  [ Domain Services (26 Modules) ]                                                 |
|    * Persistence, Alerting, Country Risk, News, Geo, Disaster, Cyber, Weather     |
|    * AI Intelligence, Prompt, Retrieval, Report, Conversation                     |
+-----------------------------------------------------------------------------------+
                                   |
                                   v (better-sqlite3)
+-----------------------------------------------------------------------------------+
|                           SQLITE 3 DATABASE ENGINE                                |
|                                                                                   |
|  - File Path: /server/data/gricc.db (Persistent Storage)                          |
|  - Configuration: journal_mode = WAL, busy_timeout = 5000, foreign_keys = ON      |
|  - 42 Relational Tables, 67 Indexes, Composite Optimization                      |
|  - Audit Hash Chain: SHA-256 parent-child tamper detection                        |
+-----------------------------------------------------------------------------------+
```

---

## 4. Phase-by-Phase Module Mapping (Phases 1–20)

| Phase | Functional Domain | Backend Components | Frontend Components |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Foundation & Wireframe | `server/index.js`, basic Express scaffold | `src/App.jsx`, `src/index.css` |
| **Phase 2** | Dashboard & Metrics | `persistenceService.js` (Stats) | `SummaryCard.jsx`, `Header.jsx` |
| **Phase 3** | Country Risk Profiles | `countryRiskService.js`, `/api/countries` | `CountryRiskProfiles.jsx` |
| **Phase 4** | Threat Feeds Integration | `newsService`, `geopoliticalService`, `weatherService` | `IntelligenceFeed.jsx`, `AlertCard.jsx` |
| **Phase 5** | Incident Management | `persistenceService.js` (`incidents` table) | `IncidentManagement.jsx`, `AddIncidentModal.jsx`, `IncidentDetailsModal.jsx` |
| **Phase 6** | Real-Time Telemetry & SSE | `realtimeService.js`, `disasterService`, `cyberService` | `DataSourceHealth.jsx`, SSE EventSource handlers |
| **Phase 7** | Persistent SQLite DB | `database.js` (WAL mode, schema creation) | Full CRUD state updates |
| **Phase 8** | Authentication & RBAC | `authService.js`, `authMiddleware.js`, `/api/auth` | `LoginPage.jsx`, `UserManagement.jsx` |
| **Phase 9** | Notifications & Watchlists | `alertingService.js`, `/api/notifications` | `NotificationCentre.jsx`, SSE notification triggers |
| **Phase 10** | Advanced Risk Modeling | `countryRiskService.js` (Weighted formula) | Dynamic score computation |
| **Phase 11** | Predictive Early Warning | `predictiveService.js`, `/api/predictive/*` | `PredictiveIntelligence.jsx` |
| **Phase 12** | Strategic Decision Support | `decisionService.js`, `/api/decisions/*` | `StrategicDecisions.jsx` |
| **Phase 13** | Advanced Analytics | `advancedAnalyticsService.js`, `/api/analytics/advanced/*` | `AdvancedIntelligenceAnalytics.jsx` |
| **Phase 14** | Advanced Geospatial Intel | `geospatialService.js`, `/api/geospatial/*` | `AdvancedGeospatialIntelligence.jsx`, `WorldMap.jsx` |
| **Phase 15** | AI Intelligence Assistant | `aiIntelligenceService.js`, `aiProviderService.js`, `aiReportService.js` | `AIIntelligenceAssistant.jsx` |
| **Phase 16** | Real-Time Intel Monitoring | `realTimeMonitoringService.js`, `/api/monitoring/*` | `RealTimeMonitoring.jsx` |
| **Phase 17** | Collaboration Workspace | `collaborationService.js`, `/api/collaboration/*` | `IntelligenceCollaboration.jsx` |
| **Phase 18** | Security & Compliance | `securityService.js`, `/api/security/*`, audit hash chain | `SecurityAdministration.jsx` |
| **Phase 19** | Performance & Scalability | `cacheService.js`, `performanceService.js`, composite indexes, code-splitting | `PerformanceMonitoring.jsx`, Vite chunk config |
| **Phase 20** | Final Integration & QA | `test-production-readiness.mjs`, backup CLI, audit chain normalization | Full QA validation and production build |

---

## 5. Architectural Strengths & Structural Limitations

### 5.1 Key Strengths
1. **Zero External Cloud Lock-in:** The default configuration (`gricc-deterministic`) operates completely autonomously without requiring external commercial APIs or SaaS dependencies.
2. **Deterministic Response Times:** Fast SQLite queries (<1ms) and memory caching (<5ms warm hits) provide immediate UI updates.
3. **Graceful Degradation:** When live external feeds are unavailable, the telemetry engine transparently switches to curated standby data without crashing or blanking the UI.

### 5.2 Structural Limitations
1. **Single-Process Constraint:** In-memory `cacheService` and SSE client registries are bound to a single Node.js process. Multi-instance clustering requires Redis pub/sub.
2. **SQLite Single-Writer Model:** High write concurrency (hundreds of simultaneous write transactions) can result in `SQLITE_BUSY` contention despite WAL mode.

