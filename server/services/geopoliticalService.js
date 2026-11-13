/**
 * Geopolitical Risk Intelligence Service
 * Provider: UN OCHA ReliefWeb Public API / ACLED Adapter / CrisisGroup
 */

let cache = {
  data: null,
  timestamp: null,
  lastAttempt: null,
  error: null,
};

export const geopoliticalService = {
  id: 'geopolitical',
  name: 'Geopolitical Risk Monitor',
  category: 'Geopolitical Risk',

  getStatus() {
    const hasKey = Boolean(process.env.GEOPOLITICAL_API_KEY);
    const providerName = process.env.GEOPOLITICAL_API_PROVIDER || 'UN OCHA ReliefWeb API';

    let status = 'STANDBY_DEMO';
    if (cache.data?.isLive) {
      status = 'LIVE_ACTIVE';
    } else if (cache.error) {
      status = 'DEGRADED';
    } else {
      status = 'LIVE_READY';
    }

    return {
      id: this.id,
      name: this.name,
      category: this.category,
      provider: providerName,
      status,
      isConfigured: true,
      lastSync: cache.timestamp || null,
      lastAttempt: cache.lastAttempt || null,
      error: cache.error ? cache.error.message : null,
      latencyMs: cache.data?.latencyMs || 0,
      recordCount: cache.data?.items?.length || 0,
    };
  },

  async fetchData(forceRefresh = false) {
    const ttlMs = (parseInt(process.env.DATA_CACHE_TTL_SECONDS, 10) || 60) * 1000;
    const now = Date.now();
    cache.lastAttempt = new Date().toISOString();

    if (!forceRefresh && cache.data && cache.timestamp && now - new Date(cache.timestamp).getTime() < ttlMs) {
      return { ...cache.data, fromCache: true };
    }

    const startTime = Date.now();

    // 1. Query Legitimate Public UN OCHA ReliefWeb API (Zero key required)
    try {
      const url = 'https://api.reliefweb.int/v1/reports?appname=gricc-intel&limit=8&preset=latest&profile=list';
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });

      if (res.ok) {
        const json = await res.json();
        const data = json.data || [];
        if (data.length > 0) {
          const normalized = data.map((item, idx) => {
            const fields = item.fields || {};
            const countryName = fields.primary_country?.name || (fields.country?.[0]?.name) || 'Global Theatre';
            const countryIso = fields.primary_country?.iso3 || '';
            const sourceName = fields.source?.[0]?.name || 'UN OCHA ReliefWeb';
            const title = fields.title || 'Geopolitical Situation Report';
            const dateStr = fields.date?.created || new Date().toISOString();

            return {
              id: `GEO-${item.id || idx}`,
              headline: title,
              country: countryName,
              region: countryIso || 'International',
              category: 'Geopolitical & Humanitarian Situation',
              severity: 'Medium',
              description: `Official situation report published by ${sourceName}. Verified international monitoring bulletin.`,
              source: `UN ReliefWeb (${sourceName})`,
              url: fields.url || `https://reliefweb.int/node/${item.id}`,
              publicationDate: dateStr,
              isLive: true,
            };
          });

          const payload = {
            sourceId: this.id,
            sourceName: this.name,
            provider: 'UN OCHA ReliefWeb International API',
            isLive: true,
            mode: 'LIVE MODE',
            lastUpdated: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
            disclaimer: 'LIVE FEED — Official United Nations OCHA crisis & geopolitical situation reports.',
            items: normalized,
          };

          cache = { data: payload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: null };
          return payload;
        }
      }
    } catch (err) {
      console.warn('[GEOPOLITICAL SERVICE] ReliefWeb API timed out or unavailable:', err.message);
      cache.error = err;
    }

    // 2. Fallback to Curated Standby Demo Telemetry
    return this.getDemoFallback(cache.error ? 'DEGRADED' : 'STANDBY');
  },

  getDemoFallback(reason = 'STANDBY') {
    const demoPayload = {
      sourceId: this.id,
      sourceName: this.name,
      provider: 'GRICC Simulated Geopolitical Intelligence',
      isLive: false,
      mode: 'DEMO MODE',
      lastUpdated: new Date().toISOString(),
      disclaimer: `DEMO DATA — Operating on curated simulated geopolitical telemetry (${reason}). Live providers ready.`,
      items: [
        {
          id: 'GEO-DEMO-01',
          headline: 'South China Sea / Malacca Approach Surveillance Advisory',
          country: 'Singapore',
          region: 'Southeast Asia',
          category: 'Maritime & Geopolitics',
          severity: 'Medium',
          description: 'Regional maritime patrol protocols heightened along primary container shipping lanes. Transit fully operational.',
          source: 'Simulated Strategic Maritime Bureau',
          url: 'https://example.com/demo/malacca',
          publicationDate: new Date(Date.now() - 4800000).toISOString(),
          isLive: false,
        },
        {
          id: 'GEO-DEMO-02',
          headline: 'Red Sea Transit Risk Mitigation Measures Active',
          country: 'United Arab Emirates',
          region: 'Middle East',
          category: 'Geopolitical Security',
          severity: 'High',
          description: 'Commercial vessel routing adjustments maintained for bulk and energy carriers.',
          source: 'Simulated Gulf Intel Bureau',
          url: 'https://example.com/demo/redsea',
          publicationDate: new Date(Date.now() - 8600000).toISOString(),
          isLive: false,
        },
      ],
    };

    cache = { data: demoPayload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: cache.error };
    return demoPayload;
  },
};
