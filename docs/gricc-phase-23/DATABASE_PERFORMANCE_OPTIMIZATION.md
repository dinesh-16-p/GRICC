# GRICC 2.0 — Phase 23: SQLite Database Performance Optimization

**Document:** `DATABASE_PERFORMANCE_OPTIMIZATION.md`  
**Phase:** 23 of 50 — Performance Optimization, Scalability Engineering & Production Preparation  
**Date:** November 13, 2026  
**Status:** IMPLEMENTED, BENCHMARKED & VERIFIED  

---

## 1. Overview & SQLite Configuration

GRICC utilizes `better-sqlite3` 13.1.1 on Node.js 24.
The active production database configuration:
- **Journal Mode:** Write-Ahead Logging (`PRAGMA journal_mode = WAL;`)
- **Synchronous Mode:** `PRAGMA synchronous = NORMAL;` (optimal balance of ACID durability and write performance in WAL mode)
- **Foreign Keys:** `PRAGMA foreign_keys = ON;`
- **Cache Size:** `PRAGMA cache_size = -32000;` (~32 MB page cache in memory)
- **Busy Timeout:** `PRAGMA busy_timeout = 5000;` (prevents immediate lock errors during concurrent read/write contention)

---

## 2. Query Plan Profiling (`EXPLAIN QUERY PLAN`)

### 2.1 Problem Query: Country Risk Snapshot Case-Insensitive Filter
When querying historical snapshots by country name:
```sql
SELECT id, score, classification FROM country_risk_snapshots WHERE LOWER(country) = 'india' ORDER BY id DESC LIMIT 12;
```

**Before Optimization:**
```
SCAN country_risk_snapshots
```
*Issue:* The pre-existing index `idx_country_snapshots_lookup ON country_risk_snapshots(country, calculated_at DESC)` could not be utilized by SQLite because the query invoked the scalar function `LOWER(country)`. This resulted in a **Full Table Scan** on every lookup.

### 2.2 Solution: Functional Expression Index
Added the expression index:
```sql
CREATE INDEX IF NOT EXISTS idx_country_snapshots_lower_id ON country_risk_snapshots(LOWER(country), id DESC);
```

**After Optimization:**
```
SEARCH country_risk_snapshots USING INDEX idx_country_snapshots_lower_id (<expr>=?)
```
*Result:* Query transformed from an $O(N)$ full table scan into an $O(\log N)$ indexed B-tree point lookup.

---

## 3. Database Indexes Inventory

Total indexes in SQLite database: **68 indexes** (67 baseline + 1 Phase 23 expression index).

### Key Covered Index Paths:
1. `incidents(severity, created_at DESC)` — Fast severity filtering on dashboard.
2. `incidents(country, created_at DESC)` — Country-specific incident listings.
3. `incidents(status, created_at DESC)` — Open vs. resolved workflow querying.
4. `audit_logs(action, created_at DESC)` — Targeted audit filtering.
5. `audit_logs(user_id, created_at DESC)` — Operator audit inspection.
6. `country_risk_snapshots(LOWER(country), id DESC)` — Fast country snapshot lookups.
7. `intelligence_alerts(status, severity, id DESC)` — Live alert prioritization.

---

## 4. Integrity & Audit Boundary Preservation

Before and after the migration:
- **`PRAGMA integrity_check;`**: Returned `ok`.
- **Database Tables:** 42 tables verified.
- **Audit Boundary ID 222:** Intact with boundary hash `51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d`.
- **Pre-Flight Backup:** `server/backups/gricc-backup-2026-11-13T06-08-56-180Z.db` preserved.
