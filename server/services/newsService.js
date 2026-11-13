/**
 * International News Intelligence Service
 * Provider: GDELT 2.0 Global Intelligence API / NewsAPI / MediaStack
 */

let cache = {
  data: null,
  timestamp: null,
  lastAttempt: null,
  error: null,
};

export const newsService = {
  id: 'news',
  name: 'International News Wire',
  category: 'International News',

  getStatus() {
    const hasKey = Boolean(process.env.NEWS_API_KEY);
    const providerName = process.env.NEWS_API_PROVIDER || (hasKey ? 'NewsAPI Commercial' : 'GDELT Global Intelligence');
    
    let status = 'STANDBY_DEMO';
    if (cache.data?.isLive) {
      status = 'LIVE_ACTIVE';
    } else if (cache.error) {
      status = 'DEGRADED';
    } else if (hasKey) {
      status = 'LIVE_READY';
    }

    return {
      id: this.id,
      name: this.name,
      category: this.category,
      provider: providerName,
      status,
      isConfigured: hasKey || true, // GDELT works with zero keys
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

    // 1. If commercial key is present in environment, query configured endpoint
    if (process.env.NEWS_API_KEY && process.env.NEWS_API_ENDPOINT) {
      try {
        const response = await fetch(process.env.NEWS_API_ENDPOINT, {
          headers: {
            Authorization: `Bearer ${process.env.NEWS_API_KEY}`,
            'X-Api-Key': process.env.NEWS_API_KEY,
          },
          signal: AbortSignal.timeout(6000),
        });

        if (response.ok) {
          const json = await response.json();
          const rawArticles = json.articles || json.data || [];
          const normalized = this.normalizeArticles(rawArticles, 'NewsAPI');
          
          const payload = {
            sourceId: this.id,
            sourceName: this.name,
            provider: process.env.NEWS_API_PROVIDER || 'NewsAPI',
            isLive: true,
            mode: 'LIVE MODE',
            lastUpdated: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
            disclaimer: 'LIVE FEED — Verified multi-source international news wire.',
            items: normalized,
          };

          cache = { data: payload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: null };
          return payload;
        }
      } catch (err) {
        console.warn('[NEWS SERVICE] Commercial API failed, attempting GDELT public wire:', err.message);
        cache.error = err;
      }
    }

    // 2. Query Legitimate Public GDELT 2.0 Global Intelligence API (Zero key required)
    try {
      const gdeltUrl = 'https://api.gdeltproject.org/api/v2/doc/doc?query=(geopolitical%20OR%20security%20OR%20sanctions%20OR%20maritime%20OR%20cyberattack)&mode=artlist&maxrecords=12&format=json';
      const res = await fetch(gdeltUrl, { signal: AbortSignal.timeout(6000) });

      if (res.ok) {
        const json = await res.json();
        const articles = json.articles || [];
        if (articles.length > 0) {
          const normalized = this.normalizeGdeltArticles(articles);
          const payload = {
            sourceId: this.id,
            sourceName: this.name,
            provider: 'GDELT 2.0 Global Intelligence Wire',
            isLive: true,
            mode: 'LIVE MODE',
            lastUpdated: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
            disclaimer: 'LIVE FEED — Verified open global telemetry indexed via GDELT Project.',
            items: normalized,
          };

          cache = { data: payload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: null };
          return payload;
        }
      }
    } catch (err) {
      console.warn('[NEWS SERVICE] Public GDELT wire unavailable or timed out:', err.message);
      cache.error = err;
    }

    // 3. Fallback: Standby Curated Demo Telemetry
    return this.getDemoFallback(cache.error ? 'DEGRADED' : 'STANDBY');
  },

  normalizeGdeltArticles(articles) {
    const seenUrls = new Set();
    const result = [];

    for (const art of articles) {
      if (!art.url || seenUrls.has(art.url)) continue;
      seenUrls.add(art.url);

      // Determine category heuristic
      const titleLower = (art.title || '').toLowerCase();
      let category = 'Geopolitical Affairs';
      let severity = 'Medium';

      if (titleLower.includes('cyber') || titleLower.includes('hack') || titleLower.includes('ransomware')) {
        category = 'Cybersecurity Threat';
        severity = 'High';
      } else if (titleLower.includes('military') || titleLower.includes('missile') || titleLower.includes('conflict') || titleLower.includes('war')) {
        category = 'Security & Defense';
        severity = 'High';
      } else if (titleLower.includes('port') || titleLower.includes('strait') || titleLower.includes('shipping') || titleLower.includes('cargo')) {
        category = 'Maritime Logistics';
        severity = 'Medium';
      } else if (titleLower.includes('sanction') || titleLower.includes('embargo') || titleLower.includes('trade')) {
        category = 'Trade & Geopolitics';
        severity = 'Medium';
      }

      result.push({
        id: `NEWS-${Math.abs(this.hashCode(art.url))}`,
        headline: art.title || 'Untitled International Dispatch',
        description: art.seendate ? `Published on ${art.seendate.slice(0, 8)} by ${art.domain || 'Wire Service'}` : (art.title || ''),
        source: art.domain ? `GDELT Wire (${art.domain})` : 'International News Wire',
        url: art.url,
        country: art.sourcecountry || 'International',
        category,
        severity,
        publicationDate: art.seendate ? this.parseGdeltDate(art.seendate) : new Date().toISOString(),
        isLive: true,
      });
    }

    return result.slice(0, 8);
  },

  normalizeArticles(raw, providerLabel) {
    const seen = new Set();
    const result = [];

    for (const item of raw) {
      const url = item.url || item.link;
      if (!url || seen.has(url)) continue;
      seen.add(url);

      result.push({
        id: `NEWS-${Math.abs(this.hashCode(url))}`,
        headline: item.title || 'International Advisory',
        description: item.description || item.snippet || item.title || '',
        source: item.source?.name || item.author || providerLabel,
        url,
        country: item.country || 'Global',
        category: item.category || 'Global Affairs',
        severity: 'Medium',
        publicationDate: item.publishedAt || item.published_at || new Date().toISOString(),
        isLive: true,
      });
    }
    return result.slice(0, 8);
  },

  parseGdeltDate(str) {
    if (!str || str.length < 8) return new Date().toISOString();
    const y = str.slice(0, 4);
    const m = str.slice(4, 6);
    const d = str.slice(6, 8);
    return `${y}-${m}-${d} UTC`;
  },

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  },

  getDemoFallback(reason = 'STANDBY') {
    const demoPayload = {
      sourceId: this.id,
      sourceName: this.name,
      provider: 'GRICC Simulated Wire (Demo Standby)',
      isLive: false,
      mode: 'DEMO MODE',
      lastUpdated: new Date().toISOString(),
      disclaimer: `DEMO DATA — Operating on curated simulated telemetry (${reason}). Configure NEWS_API_KEY in .env for custom commercial feeds.`,
      items: [
        {
          id: 'NEWS-DEMO-01',
          headline: 'Suez Canal Transit Scheduling Revised for Bulk Carrier Convoys',
          description: 'Navigational authorities implemented 4-hour staggered convoy windows during maintenance dredging.',
          source: 'Simulated Maritime Wire',
          country: 'Egypt',
          category: 'Maritime Logistics',
          severity: 'Medium',
          publicationDate: new Date(Date.now() - 3600000).toISOString(),
          url: 'https://example.com/demo/suez',
          isLive: false,
        },
        {
          id: 'NEWS-DEMO-02',
          headline: 'North Atlantic Port Operations Impacted by Seasonal Gale Advisory',
          description: 'Intermodal freight connections facing temporary 18-hour container dwell extensions.',
          source: 'Simulated Logistics Intel',
          country: 'United Kingdom',
          category: 'Supply Chain',
          severity: 'Low',
          publicationDate: new Date(Date.now() - 7200000).toISOString(),
          url: 'https://example.com/demo/north-atlantic',
          isLive: false,
        },
      ],
    };

    cache = { data: demoPayload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: cache.error };
    return demoPayload;
  },
};
