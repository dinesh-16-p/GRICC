/**
 * Modular In-Memory TTL Cache Service with stampede protection and prefix invalidation.
 * Used strictly for shared, non-user-private intelligence summaries.
 */
const store = new Map();
const inflight = new Map();

let hits = 0;
let misses = 0;
let evictions = 0;

export const cacheService = {
  get(key) {
    const entry = store.get(key);
    if (!entry) {
      misses += 1;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      evictions += 1;
      misses += 1;
      return undefined;
    }
    hits += 1;
    return entry.value;
  },

  set(key, value, ttlMs = 15000) {
    if (store.size >= 500 && !store.has(key)) {
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) {
        store.delete(oldestKey);
        evictions += 1;
      }
    }
    store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(500, ttlMs),
    });
    return value;
  },

  async getOrSet(key, ttlMs, loaderFn) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }
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
  },

  invalidate(key) {
    return store.delete(key);
  },

  invalidatePrefix(prefix) {
    let count = 0;
    for (const k of store.keys()) {
      if (k.startsWith(prefix)) {
        store.delete(k);
        count += 1;
      }
    }
    return count;
  },

  clear() {
    store.clear();
    inflight.clear();
  },

  getStats() {
    const total = hits + misses;
    return {
      entries: store.size,
      hits,
      misses,
      evictions,
      hitRatePercent: total > 0 ? Number(((hits / total) * 100).toFixed(2)) : 0,
    };
  },
};

export default cacheService;

