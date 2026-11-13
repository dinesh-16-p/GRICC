import { describe, it, expect, beforeEach } from 'vitest';
import cacheService from '../server/services/cacheService.js';

describe('CacheService Unit Tests', () => {
  beforeEach(() => {
    cacheService.clear();
  });

  it('stores and retrieves cached entries before expiration', () => {
    cacheService.set('test:key', { data: 42 }, 5000);
    const retrieved = cacheService.get('test:key');
    expect(retrieved).toEqual({ data: 42 });
  });

  it('evicts expired entries after TTL has elapsed', async () => {
    cacheService.set('test:short', 'value', 500); // 500ms min TTL
    expect(cacheService.get('test:short')).toBe('value');
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(cacheService.get('test:short')).toBeUndefined();
  });

  it('invalidates cache entries by key', () => {
    cacheService.set('key:1', 'val1');
    cacheService.invalidate('key:1');
    expect(cacheService.get('key:1')).toBeUndefined();
  });

  it('invalidates cache entries matching prefix', () => {
    cacheService.set('countries:ukraine', { score: 85 });
    cacheService.set('countries:poland', { score: 30 });
    cacheService.set('incidents:all', []);

    const count = cacheService.invalidatePrefix('countries:');
    expect(count).toBe(2);
    expect(cacheService.get('countries:ukraine')).toBeUndefined();
    expect(cacheService.get('countries:poland')).toBeUndefined();
    expect(cacheService.get('incidents:all')).toEqual([]);
  });

  it('protects against cache stampede via getOrSet', async () => {
    let callCount = 0;
    const loader = async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { loaded: true };
    };

    const [res1, res2, res3] = await Promise.all([
      cacheService.getOrSet('stampede:key', 5000, loader),
      cacheService.getOrSet('stampede:key', 5000, loader),
      cacheService.getOrSet('stampede:key', 5000, loader),
    ]);

    expect(callCount).toBe(1);
    expect(res1).toEqual({ loaded: true });
    expect(res2).toEqual({ loaded: true });
    expect(res3).toEqual({ loaded: true });
  });
});

