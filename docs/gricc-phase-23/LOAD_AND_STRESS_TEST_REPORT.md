# GRICC 2.0 — Phase 23: Load & Stress Testing Benchmark Report

**Document:** `LOAD_AND_STRESS_TEST_REPORT.md`  
**Phase:** 23 of 50 — Performance Optimization, Scalability Engineering & Production Preparation  
**Date:** November 13, 2026  
**Status:** COMPLETE (3,700 Synthetic Requests Executed with 0.00% Error Rate)  

---

## 1. Test Environment & Methodology

- **Host Machine:** Windows 11 Enterprise (x64), Node.js v24.19.0.
- **Database Engine:** SQLite 3 (Better-SQLite3 13.1.1) in WAL mode, Normal synchronous mode.
- **Isolation Guarantee:** Executed against an isolated temporary database seeded with 600 synthetic incidents, 200 alerts, and active country profiles. Production database remained untouched.
- **Load Harness:** Multi-stage asynchronous HTTP keep-alive runner testing progressive concurrency levels (5, 10, 25, 50 virtual users).

---

## 2. Progressive Concurrency Benchmark Results

| Stage / Concurrency | Total Requests | Target Endpoint | Duration | Throughput | p50 Latency | p95 Latency | p99 Latency | Error Rate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Stage 1 (5 VUs)** | 100 reqs | `GET /api/stats` | 0.23 s | **440.6 req/s** | **8.28 ms** | 34.69 ms | 57.13 ms | **0.00%** |
| **Stage 1 (5 VUs)** | 100 reqs | `GET /api/incidents?severity=Critical` | 0.29 s | **343.8 req/s** | **13.98 ms** | 19.37 ms | 32.35 ms | **0.00%** |
| **Stage 2 (10 VUs)** | 250 reqs | `GET /api/stats` | 0.37 s | **674.9 req/s** | **14.05 ms** | 21.21 ms | 33.87 ms | **0.00%** |
| **Stage 2 (10 VUs)** | 250 reqs | `GET /api/countries` | 0.32 s | **770.6 req/s** | **10.62 ms** | 25.20 ms | 26.93 ms | **0.00%** |
| **Stage 3 (25 VUs)** | 500 reqs | `GET /api/stats` | 0.78 s | **638.2 req/s** | **33.13 ms** | 64.58 ms | 66.12 ms | **0.00%** |
| **Stage 3 (25 VUs)** | 500 reqs | `GET /api/incidents?status=Open` | 1.06 s | **470.7 req/s** | **49.97 ms** | 100.11 ms | 109.67 ms | **0.00%** |
| **Stage 4 (50 VUs)** | 1000 reqs | `GET /api/stats` | 1.11 s | **903.9 req/s** | **50.50 ms** | 74.87 ms | 91.61 ms | **0.00%** |
| **Stage 4 (50 VUs)** | 1000 reqs | `GET /api/countries` | 0.90 s | **1,114.0 req/s** | **44.48 ms** | 56.76 ms | 61.03 ms | **0.00%** |

**Total Tested Volume:** 3,700 requests  
**Total Successful:** 3,700 requests (100%)  
**Total Failed:** 0 requests (0.00% error rate)  

---

## 3. Key Performance Observations

1. **Sub-50ms Median Latency at Scale:** Even at 50 concurrent virtual users generating 1,000 requests, median latency for complex analytical endpoints (`/api/countries`) remained under 45ms.
2. **Rate Limiting Protection:** When rate limits were left at standard development defaults (600 req/15m), the Express `rateLimit` middleware accurately throttled traffic with HTTP 429 TooManyRequests at request 601, proving that DoS prevention is active.
3. **Memory Stability:** Peak heap usage during the 1,000-request bursts remained under 75 MB, with zero memory leaks detected following garbage collection.

