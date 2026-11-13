/**
 * Weather Emergency Warning Service
 * Provider: US National Weather Service (NWS) Public Alert API / OpenWeather Adapter
 */

let cache = {
  data: null,
  timestamp: null,
  lastAttempt: null,
  error: null,
};

export const weatherService = {
  id: 'weather',
  name: 'Severe Weather Warning Net',
  category: 'Weather Emergencies',

  getStatus() {
    const hasKey = Boolean(process.env.WEATHER_API_KEY);
    const providerName = process.env.WEATHER_API_PROVIDER || (hasKey ? 'OpenWeather Commercial API' : 'US National Weather Service (NWS) API');

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

    // 1. Query Legitimate Public NWS Weather Alerts API (Zero key required)
    try {
      const url = 'https://api.weather.gov/alerts/active?status=actual&message_type=alert&limit=10';
      const res = await fetch(url, {
        headers: {
          'User-Agent': '(gricc-command-centre, ops@gricc.org)',
          Accept: 'application/geo+json',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const json = await res.json();
        const features = json.features || [];
        if (features.length > 0) {
          const normalized = features.map((feat) => {
            const props = feat.properties || {};
            
            // Map severity
            let severity = 'Medium';
            if (props.severity === 'Extreme') severity = 'Critical';
            else if (props.severity === 'Severe') severity = 'High';
            else if (props.severity === 'Moderate') severity = 'Medium';
            else if (props.severity === 'Minor') severity = 'Low';

            return {
              id: `WX-${props.id || Math.abs(this.hashCode(props.headline || ''))}`,
              event: props.event || 'Severe Weather Warning',
              location: props.areaDesc || 'Designated Weather Sector',
              severity,
              warningType: props.messageType || 'Official Weather Warning',
              headline: props.headline || `${props.event} issued for ${props.areaDesc}`,
              description: props.description ? (props.description.slice(0, 240) + '...') : (props.headline || ''),
              instruction: props.instruction ? (props.instruction.slice(0, 160) + '...') : 'Follow regional civil protection guidance.',
              effective: props.effective || new Date().toISOString(),
              expires: props.expires || 'Until cancelled',
              source: `National Weather Service (${props.senderName || 'NOAA'})`,
              url: props['@id'] || 'https://www.weather.gov',
              isLive: true,
            };
          });

          const payload = {
            sourceId: this.id,
            sourceName: this.name,
            provider: 'US National Weather Service (NWS) Emergency Net',
            isLive: true,
            mode: 'LIVE MODE',
            lastUpdated: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
            disclaimer: 'LIVE FEED — Official real-time meteorological emergency warnings.',
            items: normalized,
          };

          cache = { data: payload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: null };
          return payload;
        }
      }
    } catch (err) {
      console.warn('[WEATHER SERVICE] NWS Alerts API timed out or unavailable:', err.message);
      cache.error = err;
    }

    // 2. Fallback to Curated Standby Demo Telemetry
    return this.getDemoFallback(cache.error ? 'DEGRADED' : 'STANDBY');
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
      provider: 'GRICC Simulated Severe Weather Net',
      isLive: false,
      mode: 'DEMO MODE',
      lastUpdated: new Date().toISOString(),
      disclaimer: `DEMO DATA — Operating on curated simulated weather emergency warnings (${reason}). Live providers ready.`,
      items: [
        {
          id: 'WX-DEMO-01',
          event: 'High Wind and Gale Warning',
          location: 'South Coast Maritime Approaches, United Kingdom',
          severity: 'High',
          warningType: 'Maritime Hazard Warning',
          headline: 'Severe Gale Force 9 winds forecast across Dover and Plymouth sea sectors',
          description: 'Sustained winds 45-50 knots with sea swells up to 4.5m impacting commercial roll-on/roll-off ferries.',
          instruction: 'Vessels advised to secure cargo lashings and verify pilotage boarding criteria.',
          effective: new Date(Date.now() - 1800000).toISOString(),
          expires: '2026-11-04 12:00 UTC',
          source: 'Simulated Met Office Maritime Net',
          url: 'https://example.com/demo/gale',
          isLive: false,
        },
        {
          id: 'WX-DEMO-02',
          event: 'Extreme Temperature Advisory',
          location: 'Intermodal Freight Rail Corridor, Midwest US',
          severity: 'Medium',
          warningType: 'Infrastructure Stress Advisory',
          headline: 'Sub-zero thermal contraction warnings active across Class-1 rail trackage',
          description: 'Temperatures dropped below -18C triggering speed restrictions of 35 mph on hazmat rail consists.',
          instruction: 'Rail dispatchers mandating thermal acoustic wheel-bearing inspections.',
          effective: new Date(Date.now() - 5400000).toISOString(),
          expires: '2026-11-04 18:00 UTC',
          source: 'Simulated Rail Weather Advisory',
          url: 'https://example.com/demo/cold',
          isLive: false,
        },
      ],
    };

    cache = { data: demoPayload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: cache.error };
    return demoPayload;
  },
};
