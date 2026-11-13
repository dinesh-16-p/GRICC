/**
 * Natural Disaster Early Warning Service
 * Provider: NASA Earth Observatory Natural Event Tracker (EONET v3) Public API
 */

let cache = {
  data: null,
  timestamp: null,
  lastAttempt: null,
  error: null,
};

export const disasterService = {
  id: 'disaster',
  name: 'Natural Disaster Early Warning',
  category: 'Natural Disaster Alerts',

  getStatus() {
    const providerName = process.env.DISASTER_API_PROVIDER || 'NASA EONET v3 Open API';

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

    // 1. Query Legitimate NASA EONET v3 Open API (Zero key required)
    try {
      const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=12';
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });

      if (res.ok) {
        const json = await res.json();
        const events = json.events || [];
        if (events.length > 0) {
          const normalized = events.map((ev) => {
            const geom = ev.geometry?.[ev.geometry.length - 1]; // latest coordinate
            let coordinates = null;
            if (geom && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
              // NASA EONET provides [lng, lat], Leaflet requires [lat, lng]
              const lng = Number(geom.coordinates[0]);
              const lat = Number(geom.coordinates[1]);
              if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                coordinates = [lat, lng];
              }
            }

            const catTitle = ev.categories?.[0]?.title || 'Natural Hazard';
            const sourceUrl = ev.sources?.[0]?.url || 'https://eonet.gsfc.nasa.gov/';
            const sourceId = ev.sources?.[0]?.id || 'NASA EONET';

            // Determine severity heuristic based on category
            let severity = 'Medium';
            if (catTitle.toLowerCase().includes('severe storm') || catTitle.toLowerCase().includes('cyclone') || catTitle.toLowerCase().includes('volcano')) {
              severity = 'High';
            } else if (catTitle.toLowerCase().includes('wildfire')) {
              severity = 'Medium';
            }

            return {
              id: `DIS-${ev.id}`,
              title: ev.title || 'Natural Disaster Alert',
              category: catTitle,
              severity,
              coordinates,
              status: ev.closed ? 'Closed' : 'Active Event',
              date: geom?.date || new Date().toISOString(),
              source: `NASA EONET (${sourceId})`,
              url: sourceUrl,
              description: `Real-time geospatial event registered by NASA Earth Observatory: ${ev.title}.`,
              isLive: true,
            };
          });

          const payload = {
            sourceId: this.id,
            sourceName: this.name,
            provider: 'NASA EONET v3 Planetary Satellite Monitor',
            isLive: true,
            mode: 'LIVE MODE',
            lastUpdated: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
            disclaimer: 'LIVE FEED — Verified natural hazard telemetry from NASA Earth Observatory.',
            items: normalized,
          };

          cache = { data: payload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: null };
          return payload;
        }
      }
    } catch (err) {
      console.warn('[DISASTER SERVICE] NASA EONET timed out or unavailable:', err.message);
      cache.error = err;
    }

    // 2. Fallback to Curated Standby Demo Telemetry
    return this.getDemoFallback(cache.error ? 'DEGRADED' : 'STANDBY');
  },

  getDemoFallback(reason = 'STANDBY') {
    const demoPayload = {
      sourceId: this.id,
      sourceName: this.name,
      provider: 'GRICC Simulated Disaster Early Warning',
      isLive: false,
      mode: 'DEMO MODE',
      lastUpdated: new Date().toISOString(),
      disclaimer: `DEMO DATA — Operating on curated simulated natural hazard telemetry (${reason}). Live NASA EONET provider ready.`,
      items: [
        {
          id: 'DIS-DEMO-01',
          title: 'Offshore Seismic Subduction Baseline Anomaly (M 5.1)',
          category: 'Earthquakes',
          severity: 'Medium',
          coordinates: [35.6762, 139.6503],
          status: 'Active Event',
          date: new Date(Date.now() - 3600000).toISOString(),
          source: 'Simulated Pacific Tsunami Early Net',
          url: 'https://example.com/demo/seismic',
          description: 'Deep-sea crustal pressure oscillation registered 42 km offshore Honshu. Zero maritime facility impact.',
          isLive: false,
        },
        {
          id: 'DIS-DEMO-02',
          title: 'Coastal Storm Surge Flood Warning Beta',
          category: 'Severe Storms',
          severity: 'High',
          coordinates: [38.9072, -77.0369],
          status: 'Active Event',
          date: new Date(Date.now() - 7200000).toISOString(),
          source: 'Simulated NOAA Sat-Array',
          url: 'https://example.com/demo/stormsurge',
          description: 'High-tide atmospheric depression causing 1.2m tidal anomalies along low-lying intermodal freight corridors.',
          isLive: false,
        },
      ],
    };

    cache = { data: demoPayload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: cache.error };
    return demoPayload;
  },
};
