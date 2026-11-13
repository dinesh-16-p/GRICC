# GRICC 2.0 — Phase 23: Caching & Resource Management Architecture

**Document:** `CACHING_AND_RESOURCE_MANAGEMENT.md`  
**Phase:** 23 of 50 — Performance Optimization, Scalability Engineering & Production Preparation  
**Date:** November 13, 2026  
**Status:** IMPLEMENTED, BOUNDED & VERIFIED  

---

## 1. Overview & Architectural Principles

GRICC implements a dedicated, process-local in-memory caching engine (`server/services/cacheService.js`) designed strictly for non-sensitive, shared intelligence aggregations.

### Core Security & Isolation Principles:
1. **Zero User-Private Data Caching:** Never cache private user records, JWT tokens, CSRF tokens, passwords, or personal settings in shared cache stores.
2. **Explicit Authorization Isolation:** Authorization-dependent data is never served from a global shared cache key.
3. **Bounded Capacity (LRU Eviction):** Maximum entries set to 500. When reached, oldest keys are evicted, preventing unbounded memory bloat.
4. **Cache Stampede Prevention:** Implements an `inflight` Promise map. If 50 concurrent requests demand the same uncached key, only one database evaluation executes while the remaining 49 await the same Promise.
5. **Instant Invalidation on Mutation:** Any write or mutation (creating, updating, deleting an incident or syncing an alert) immediately invalidates associated cache prefixes (`countries:`, `dashboard:stats`).

---

## 2. Active Cache Targets & Configuration

| Cache Key Pattern | TTL | Invalidation Trigger | Purpose |
| :--- | :--- | :--- | :--- |
| `dashboard:stats` | 10,000 ms (10s) | Incident / alert writes | Aggregated incident & alert counts across the theater |
| `countries:list:<query>:<class>` | 15,000 ms (15s) | Incident / alert writes, recalculate | Country risk score calculations across all monitored states |
| `ai:status` | 30,000 ms (30s) | Provider configuration updates | AI provider operational health and model capability check |

---

## 3. Stampede Protection Implementation

From `server/services/cacheService.js`:
```javascript
async getOrSet(key, ttlMs, loaderFn) {
  const cached = this.get(key);
  if (cached !== undefined) return cached;

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = Promise.resolve()
    .then(() => loaderFn())
    .then((val) => {
      this.set(key, val, ttlMs);
      inflight.delete(key);
      return val;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}
```

---

## 4. Architectural Scaling Constraints

- **Process-Local Scope:** The in-memory store resides within the single Node.js process heap.
- **PM2 Constraint:** Multi-process cluster mode remains **disabled** until an external distributed caching layer (e.g. Redis / Valkey) is integrated in future architectural phases.
- **Memory Footprint:** Verified under maximum cache utilization (< 8 MB allocated for cache store).

