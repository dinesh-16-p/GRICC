import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { getDb } from '../server/db/database.js';
import { countryRiskService } from '../server/services/countryRiskService.js';
import persistenceService from '../server/services/persistenceService.js';
import cacheService from '../server/services/cacheService.js';
import { getConnectedClientCount } from '../server/services/realtimeService.js';

describe('Phase 23: Performance & Scalability Optimization Tests', () => {
  const db = getDb();

  it('verifies that idx_country_snapshots_lower_id expression index exists and is utilized', () => {
    const indexRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_country_snapshots_lower_id'")
      .get();
    expect(indexRow).toBeDefined();

    const plan = db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id, score, classification FROM country_risk_snapshots WHERE LOWER(country) = 'india' ORDER BY id DESC LIMIT 12"
      )
      .all();
    const planText = plan.map((p) => p.detail).join(' ');
    expect(planText).toContain('idx_country_snapshots_lower_id');
    expect(planText).not.toContain('SCAN country_risk_snapshots');
  });

  it('executes getAllCountryProfiles efficiently with pre-aggregated snapshots (no N+1)', () => {
    const tStart = performance.now();
    const profiles = countryRiskService.getAllCountryProfiles();
    const duration = performance.now() - tStart;

    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.length).toBeGreaterThan(0);
    // Computation across all monitored countries should complete under 100ms
    expect(duration).toBeLessThan(100);
  });

  it('verifies in-memory TTL caching with getOrSet and instant cache invalidation on write', async () => {
    cacheService.invalidatePrefix('test:perf:');
    let dbQueryCount = 0;

    const loader = async () => {
      dbQueryCount++;
      return { count: 42, timestamp: Date.now() };
    };

    // First call (cache miss)
    const res1 = await cacheService.getOrSet('test:perf:metric', 10000, loader);
    expect(dbQueryCount).toBe(1);

    // Second call (cache hit)
    const res2 = await cacheService.getOrSet('test:perf:metric', 10000, loader);
    expect(dbQueryCount).toBe(1);
    expect(res2.count).toBe(42);

    // Invalidation
    cacheService.invalidatePrefix('test:perf:');
    const res3 = await cacheService.getOrSet('test:perf:metric', 10000, loader);
    expect(dbQueryCount).toBe(2);
  });

  it('bounds getAllIncidents query size to prevent unbounded memory allocation', () => {
    const incidents = persistenceService.getAllIncidents({ limit: 5 });
    expect(Array.isArray(incidents)).toBe(true);
    expect(incidents.length).toBeLessThanOrEqual(5);

    const defaultBounded = persistenceService.getAllIncidents();
    expect(Array.isArray(defaultBounded)).toBe(true);
    expect(defaultBounded.length).toBeLessThanOrEqual(2000);
  });

  it('verifies SSE connection registry initializes safely and reports connected count', () => {
    const count = getConnectedClientCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
