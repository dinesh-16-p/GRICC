import db from '../db/database.js';
import cacheService from './cacheService.js';
import { getConnectedClientCount } from './realtimeService.js';

const MAX_SAMPLES = 500;
const latencySamples = [];
const endpointStats = new Map();
const jobStats = new Map();
const trendBuckets = [];

let totalRequests = 0;
let totalErrors = 0;

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Number(sorted[idx].toFixed(2));
}

export const performanceService = {
  recordApiRequest({ method, path, statusCode, durationMs }) {
    totalRequests += 1;
    if (statusCode >= 500) totalErrors += 1;

    const cleanDuration = Number(durationMs.toFixed(2));
    latencySamples.push(cleanDuration);
    if (latencySamples.length > MAX_SAMPLES) latencySamples.shift();

    const key = `${method} ${String(path).split('?')[0]}`;
    const existing = endpointStats.get(key) || {
      endpoint: key,
      count: 0,
      errors: 0,
      totalMs: 0,
      maxMs: 0,
    };
    existing.count += 1;
    if (statusCode >= 500) existing.errors += 1;
    existing.totalMs += cleanDuration;
    if (cleanDuration > existing.maxMs) existing.maxMs = cleanDuration;
    endpointStats.set(key, existing);

    const minuteKey = new Date().toISOString().slice(0, 16);
    const lastBucket = trendBuckets[trendBuckets.length - 1];
    if (lastBucket && lastBucket.minute === minuteKey) {
      lastBucket.requests += 1;
      lastBucket.totalMs += cleanDuration;
      lastBucket.avgMs = Number((lastBucket.totalMs / lastBucket.requests).toFixed(2));
    } else {
      trendBuckets.push({
        minute: minuteKey,
        requests: 1,
        totalMs: cleanDuration,
        avgMs: cleanDuration,
      });
      if (trendBuckets.length > 30) trendBuckets.shift();
    }
  },

  recordJobRun(jobName, durationMs, success = true, errorMessage = null) {
    const existing = jobStats.get(jobName) || {
      jobName,
      runs: 0,
      failures: 0,
      lastDurationMs: 0,
      lastRunAt: null,
      lastError: null,
    };
    existing.runs += 1;
    if (!success) existing.failures += 1;
    existing.lastDurationMs = Number(durationMs.toFixed(2));
    existing.lastRunAt = new Date().toISOString();
    existing.lastError = success ? null : errorMessage;
    jobStats.set(jobName, existing);
  },

  getHealth() {
    const mem = process.memoryUsage();
    let dbOk = false;
    let dbLatencyMs = 0;
    try {
      const s = performance.now();
      db.prepare('SELECT 1').get();
      dbLatencyMs = Number((performance.now() - s).toFixed(2));
      dbOk = true;
    } catch {
      dbOk = false;
    }

    return {
      status: dbOk ? 'HEALTHY' : 'DEGRADED',
      uptimeSeconds: Math.floor(process.uptime()),
      activeSseConnections: getConnectedClientCount(),
      dbPingMs: dbLatencyMs,
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      },
    };
  },

  getMetrics() {
    const sorted = [...latencySamples].sort((a, b) => a - b);
    const avgLatencyMs =
      sorted.length > 0
        ? Number((sorted.reduce((sum, v) => sum + v, 0) / sorted.length).toFixed(2))
        : 0;

    const topEndpoints = Array.from(endpointStats.values())
      .map((e) => ({
        endpoint: e.endpoint,
        count: e.count,
        errors: e.errors,
        avgMs: Number((e.totalMs / e.count).toFixed(2)),
        maxMs: e.maxMs,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return {
      totalRequests,
      totalErrors,
      errorRatePercent: totalRequests > 0 ? Number(((totalErrors / totalRequests) * 100).toFixed(2)) : 0,
      latency: {
        avgMs: avgLatencyMs,
        p95Ms: percentile(sorted, 95),
        maxMs: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
        sampleCount: sorted.length,
      },
      cache: cacheService.getStats(),
      jobs: Array.from(jobStats.values()),
      topEndpoints,
      trends: trendBuckets,
    };
  },

  getOverview() {
    return {
      generatedAt: new Date().toISOString(),
      health: this.getHealth(),
      metrics: this.getMetrics(),
    };
  },
};

export default performanceService;

