# GRICC 2.0 — Phase 21: Database Audit

**Document:** `DATABASE_AUDIT.md`  
**Phase:** 21 — Complete Technical Audit & Architecture Assessment  
**Date:** November 13, 2026  

---

## 1. Database Configuration & Engine Analysis

- **Engine:** SQLite 3 via `better-sqlite3` v13.1.1 (Synchronous C++ Native Driver)
- **Database File:** `server/data/gricc.db` (Size: **765,952 bytes** / ~748 kB)
- **Runtime PRAGMAs Verified:**
  - `journal_mode = wal` (Write-Ahead Logging: enables concurrent readers alongside a writer)
  - `foreign_keys = 1` (Foreign key constraint enforcement enabled)
  - `busy_timeout = 5000` (Waits up to 5,000ms on database locks before returning `SQLITE_BUSY`)
  - `synchronous = 1` (`NORMAL` durability mode optimal for WAL)
  - `cache_size = -16000` (16 MB in-memory SQLite page cache)
  - `integrity_check = ok` (Verified structurally intact, zero corruption detected)

---

## 2. Database Schema Inventory (Verified 42 Tables)

| # | Table Name | Row Count | Primary Purpose | Foreign Key Relationships |
| :---: | :--- | :---: | :--- | :--- |
| 1 | `activity_logs` | 4 | System and incident operator activities | None |
| 2 | `ai_conversations` | 0 | Assistant conversation threads | References `users(id)` |
| 3 | `ai_generated_reports`| 0 | AI generated intelligence reports | References `users(id)` |
| 4 | `ai_messages` | 0 | Messages within AI conversations | References `ai_conversations(id)` |
| 5 | `ai_usage_logs` | 0 | Token/latency metrics for AI queries | References `users(id)` |
| 6 | `alerts` | 22 | Aggregated threat advisories | None |
| 7 | `analytical_insights` | 0 | Automated pattern insights | None |
| 8 | `audit_logs` | 222 | Security and compliance audit trail | References `users(id)` |
| 9 | `collaboration_activity`| 0 | Team workspace activity feed | References `intelligence_discussions(id)` |
| 10 | `country_risk_snapshots`| 0 | Historical country risk score points | None |
| 11 | `decision_logs` | 0 | Strategic scenario decisions audit | None |
| 12 | `detected_anomalies` | 0 | Statistical anomaly detections | None |
| 13 | `discussion_members` | 0 | Users assigned to discussions | References `intelligence_discussions(id)`, `users(id)` |
| 14 | `early_warning_thresholds`| 4 | Trigger thresholds for warnings | None |
| 15 | `early_warnings` | 0 | Predictive early warning alerts | None |
| 16 | `escalation_rules` | 3 | Automated alert escalation definitions | None |
| 17 | `geographic_risk_zones`| 0 | Geospatial danger boundaries | None |
| 18 | `geopolitical_relationships`| 8 | Diplomatic and strategic relations | None |
| 19 | `geospatial_analysis_history`| 0 | Historical map analysis runs | None |
| 20 | `geospatial_clusters`| 0 | Spatial incident clusters | None |
| 21 | `incidents` | 9 | Core recorded security incidents | None |
| 22 | `intelligence_alerts`| 5 | Phase 16 sensor-based threat alerts | None |
| 23 | `intelligence_comments`| 0 | Threaded discussion comments | References `intelligence_discussions(id)`, `users(id)` |
| 24 | `intelligence_discussions`| 0 | Investigation collaborative cases | References `users(id)` |
| 25 | `investigation_tasks`| 0 | Assigned tactical investigation tasks| References `intelligence_discussions(id)`, `users(id)` |
| 26 | `monitoring_categories`| 9 | Threat categories for sensor engine | None |
| 27 | `monitoring_settings`| 1 | Global monitoring frequency/limits | None |
| 28 | `notification_preferences`| 0 | User notification filter thresholds| References `users(id)` |
| 29 | `notification_reads` | 0 | Read tracking per user and notification| References `users(id)`, `notifications(id)` |
| 30 | `notifications` | 34 | User and role alert notifications | None |
| 31 | `reports` | 0 | Published intelligence reports | None |
| 32 | `response_actions` | 0 | Playbook action items and tasks | None |
| 33 | `response_playbooks` | 4 | Standard Operating Procedures (SOPs)| None |
| 34 | `revoked_tokens` | 6 | JWT blacklist tracking revoked tokens| References `users(id)` |
| 35 | `role_assignments` | 5 | User to RBAC role mappings | References `users(id)` |
| 36 | `security_events` | 46 | Security incident and lockout logs | References `users(id)` |
| 37 | `security_settings` | 1 | Global password/lockout policies | None |
| 38 | `shared_intelligence_records`| 0 | Entities linked into discussions | References `intelligence_discussions(id)`, `users(id)` |
| 39 | `strategic_recommendations`| 0 | Generated decision recommendations | None |
| 40 | `task_status_history`| 0 | Audit trail for task state changes | References `investigation_tasks(id)`, `users(id)` |
| 41 | `users` | 5 | Platform operator and analyst accounts| None |
| 42 | `watchlists` | 0 | Monitored country list per user | References `users(id)` |

---

## 3. Database Indexing Analysis (Verified 67 Indexes)

The database includes 67 defined indexes covering foreign keys, lookup keys, and date-sorted ordering queries.

### Phase 19 Composite Indexes:
- `idx_incidents_sev_created` on `incidents(severity, created_at DESC)`: Eliminates temporary B-tree allocations on incident severity filtering.
- `idx_incidents_country_created` on `incidents(country, created_at DESC)`
- `idx_incidents_status_created` on `incidents(status, created_at DESC)`
- `idx_audit_action_created` on `audit_logs(action, created_at DESC)`: Converts full index scans to index searches.
- `idx_audit_user_created` on `audit_logs(user_id, created_at DESC)`
- `idx_intel_alerts_status_sev` on `intelligence_alerts(status, severity)`
- `idx_collab_tasks_status_due` on `investigation_tasks(status, due_date)`
- `idx_sec_events_type_created` on `security_events(event_type, created_at DESC)`

---

## 4. Audit Log Hash-Chain Verification

The `audit_logs` table features cryptographic SHA-256 hash-chaining (`prev_hash` and `entry_hash`) to detect unauthorized modifications or record deletions.

### Live Database Integrity Check Results:
- **Total Audit Rows Checked:** 222
- **Hashed Count:** 77
- **Legacy Unchained Count (Phases 1–17):** 145 (Normal for developmental database before Phase 18)
- **Format Mismatch Count (Phase 18 Pre-Normalization):** 35
- **Fresh Production DB Verification:** **100% VALID** (Verified via `test-production-readiness.mjs` with 0 mismatches)

---

## 5. Database Audit Findings & Recommendations

1. **DB-001 (High) — Development Database Isolation in Production:**  
   The development database file (`server/data/gricc.db`) contains development activity, test security events, and historical unchained audit rows.  
   *Recommendation:* Never copy `server/data/gricc.db` into public production. Allow the production server to initialize a clean database automatically on startup and bootstrap the initial admin account via `npm run bootstrap:admin`.

2. **DB-002 (Medium) — Migration Framework Modernization:**  
   Migrations and table creation are currently executed via procedural DDL statements inside `server/db/database.js` (`CREATE TABLE IF NOT EXISTS`).  
   *Recommendation:* Introduce a versioned migration tool (such as `knex` migrations or lightweight SQL migration files) to track forward and rollback schema migrations formally in GRICC 2.0.

