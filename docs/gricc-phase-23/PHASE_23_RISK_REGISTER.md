# GRICC 2.0 — Phase 23: Risk Register & Operational Constraints

**Document:** `PHASE_23_RISK_REGISTER.md`  
**Phase:** 23 of 50 — Performance Optimization, Scalability Engineering & Production Preparation  
**Date:** November 13, 2026  
**Status:** ACTIVE RISK REGISTER  

---

## 1. Active Risks & Mitigation Strategies

| Risk ID | Category | Severity | Description | Mitigation Strategy | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-001** | Scalability | Medium | In-memory cache and SSE connection maps are process-local; running PM2 in multi-process cluster mode would split state. | Mandatory PM2 Fork Mode (single instance) enforced until Redis Pub/Sub backplane is integrated in future phase. | **MITIGATED (Policy Enforced)** |
| **RSK-002** | Storage | Low | SQLite WAL file can grow during heavy write bursts if checkpoints are delayed. | `PRAGMA synchronous = NORMAL` and default checkpointing configured; automated pruning script operational. | **MONITORED** |
| **RSK-003** | Security | High | Loss of `BACKUP_ENCRYPTION_KEY` would prevent decryption of `.db.enc` backups. | Documented backup recovery procedure requiring operator key custody in secure secret managers. | **DOCUMENTED** |
| **RSK-004** | Cloud | Low | S3 presigned PUT URL is hardened in code but requires live AWS/R2 bucket provisioning for offsite replication. | Detailed DevOps provisioning guide documented; local backups remain fully functional. | **ACCEPTED** |
| **RSK-005** | Performance | Low | High concurrent bursts exceeding 500 SSE connections receive HTTP 503. | `MAX_SSE_CLIENTS` boundary protects event loop; client-side exponential backoff handles retries. | **CONTROLLED** |

---

## 2. Prohibited Operational Actions

1. Do NOT enable `instances: "max"` or `exec_mode: "cluster"` in PM2 configuration.
2. Do NOT run historical audit re-hashing or alter boundary record ID 222.
3. Do NOT deploy or expose the application publicly during this phase.
4. Do NOT push local Git repository to any public or remote repository without explicit authorization.
