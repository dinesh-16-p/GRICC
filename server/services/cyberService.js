/**
 * Cybersecurity Threat Intelligence Service
 * Provider: US Cybersecurity and Infrastructure Security Agency (CISA) KEV Public Catalog / NVD
 */

let cache = {
  data: null,
  timestamp: null,
  lastAttempt: null,
  error: null,
};

export const cyberService = {
  id: 'cyber',
  name: 'Cyber Threat Intelligence Net',
  category: 'Cybersecurity Threat Information',

  getStatus() {
    const hasKey = Boolean(process.env.CYBER_THREAT_API_KEY);
    const providerName = process.env.CYBER_THREAT_API_PROVIDER || 'CISA Known Exploited Vulnerabilities (KEV) Catalog';

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

    // 1. Query Legitimate CISA Known Exploited Vulnerabilities (KEV) Official Feed (Zero key required)
    try {
      const url = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });

      if (res.ok) {
        const json = await res.json();
        const vulnerabilities = json.vulnerabilities || [];
        if (vulnerabilities.length > 0) {
          // Take the most recently added vulnerabilities (from end of catalog)
          const recent = vulnerabilities.slice(-8).reverse();

          const normalized = recent.map((vuln) => {
            return {
              id: vuln.cveID || `CYB-${Math.random()}`,
              cveId: vuln.cveID || 'CVE-UNKNOWN',
              title: `${vuln.vendorProject} ${vuln.product} — ${vuln.vulnerabilityName || 'Exploited Vulnerability'}`,
              vendor: vuln.vendorProject || 'Enterprise Vendor',
              product: vuln.product || 'Infrastructure Software',
              severity: 'Critical', // CISA KEV catalog lists only actively exploited vulnerabilities in the wild
              dateAdded: vuln.dateAdded || new Date().toISOString().slice(0, 10),
              dueDate: vuln.dueDate || 'Immediate',
              description: vuln.shortDescription || 'Actively exploited vulnerability verified by federal cybersecurity authorities.',
              action: vuln.requiredAction || 'Apply vendor patch or mitigations.',
              source: 'CISA Known Exploited Vulnerabilities (KEV)',
              url: vuln.notes ? vuln.notes.split(';')[0].trim() : `https://nvd.nist.gov/vuln/detail/${vuln.cveID}`,
              isLive: true,
            };
          });

          const payload = {
            sourceId: this.id,
            sourceName: this.name,
            provider: 'CISA Known Exploited Vulnerabilities (KEV) Authoritative Feed',
            isLive: true,
            mode: 'LIVE MODE',
            lastUpdated: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
            disclaimer: 'LIVE FEED — Official cybersecurity advisories and active CVE exploit telemetry from CISA.',
            items: normalized,
          };

          cache = { data: payload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: null };
          return payload;
        }
      }
    } catch (err) {
      console.warn('[CYBER SERVICE] CISA KEV feed timed out or unavailable:', err.message);
      cache.error = err;
    }

    // 2. Fallback to Curated Standby Demo Telemetry
    return this.getDemoFallback(cache.error ? 'DEGRADED' : 'STANDBY');
  },

  getDemoFallback(reason = 'STANDBY') {
    const demoPayload = {
      sourceId: this.id,
      sourceName: this.name,
      provider: 'GRICC Simulated Cyber Defense Net',
      isLive: false,
      mode: 'DEMO MODE',
      lastUpdated: new Date().toISOString(),
      disclaimer: `DEMO DATA — Operating on curated simulated cybersecurity advisories (${reason}). Live CISA KEV provider ready.`,
      items: [
        {
          id: 'CVE-2026-9042',
          cveId: 'CVE-2026-9042',
          title: 'Industrial SCADA Substation Firmware Memory Corruption Vulnerability',
          vendor: 'Industrial Power Grid Systems',
          product: 'Substation Relay RTU 400',
          severity: 'Critical',
          dateAdded: '2026-11-02',
          dueDate: 'Immediate',
          description: 'Buffer overflow in network telemetry ingestion handler allows authenticated remote command execution.',
          action: 'Isolate management interfaces to out-of-band management VLAN and apply hotfix 4.2.1.',
          source: 'Simulated CISA CERT Bulletin',
          url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-9042',
          isLive: false,
        },
        {
          id: 'CVE-2026-7811',
          cveId: 'CVE-2026-7811',
          title: 'Maritime Manifest Electronic Interchange Protocol Injection',
          vendor: 'Port EDI Clearing Systems',
          product: 'Container Gate EDI Core',
          severity: 'High',
          dateAdded: '2026-11-01',
          dueDate: '2026-11-15',
          description: 'XML external entity injection flaw allows unauthorized extraction of customs manifest schemas.',
          action: 'Disable external XML entity resolution in EDI parsing pipeline.',
          source: 'Simulated Maritime Cyber Defense Net',
          url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-7811',
          isLive: false,
        },
      ],
    };

    cache = { data: demoPayload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: cache.error };
    return demoPayload;
  },
};
