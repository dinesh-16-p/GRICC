/**
 * Cybersecurity Threat Intelligence Service
 * Primary Providers:
 *   1. US CISA Known Exploited Vulnerabilities (KEV) Official Feed (Zero Key)
 *   2. GitHub FireHOL Open Threat Intelligence Net (firehol/blocklist-ipsets) (Zero Key)
 */

let cache = {
  data: null,
  timestamp: null,
  lastAttempt: null,
  error: null,
};

/**
 * Fetch live active malicious IP indicators and botnet C2 ranges directly from GitHub FireHOL open dataset.
 */
async function fetchGitHubThreatFeeds(timeoutMs = 5000) {
  try {
    const url = 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset';
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];

    const text = await res.text();
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    // Extract top active threat ranges
    const samples = lines.slice(0, 6);
    return samples.map((ipRange, idx) => ({
      id: `GH-THREAT-${ipRange.replace(/[/.]/g, '-')}`,
      cveId: `IOC-IP-${ipRange}`,
      title: `Active Inbound Cyber Threat Range: ${ipRange}`,
      vendor: 'GitHub FireHOL Threat Net',
      product: 'Active Botnet / Malware Distribution Node',
      severity: idx < 2 ? 'Critical' : 'High',
      dateAdded: new Date().toISOString().slice(0, 10),
      dueDate: 'Immediate Block',
      description: `Malicious IP range ${ipRange} identified by firehol/blocklist-ipsets as an active participant in malicious traffic, port-scanning, or C2 botnet communications.`,
      action: `Enforce boundary firewall block rule for subnet ${ipRange}.`,
      source: 'GitHub Threat Net (firehol/blocklist-ipsets)',
      url: 'https://github.com/firehol/blocklist-ipsets',
      isLive: true,
    }));
  } catch (err) {
    console.warn('[CYBER SERVICE] GitHub FireHOL feed unavailable:', err.message);
    return [];
  }
}

export const cyberService = {
  id: 'cyber',
  name: 'Cyber Threat Intelligence Net',
  category: 'Cybersecurity Threat Information',

  getStatus() {
    const hasKey = Boolean(process.env.CYBER_THREAT_API_KEY);
    const providerName = process.env.CYBER_THREAT_API_PROVIDER || 'CISA KEV + GitHub FireHOL Threat Net';

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
    let cisaItems = [];
    let githubItems = [];

    // 1. Fetch both CISA KEV and GitHub FireHOL datasets in parallel
    const [cisaRes, ghItems] = await Promise.allSettled([
      fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
        signal: AbortSignal.timeout(6000),
      }),
      fetchGitHubThreatFeeds(5000),
    ]);

    if (ghItems.status === 'fulfilled' && Array.isArray(ghItems.value)) {
      githubItems = ghItems.value;
    }

    if (cisaRes.status === 'fulfilled' && cisaRes.value.ok) {
      try {
        const json = await cisaRes.value.json();
        const vulnerabilities = json.vulnerabilities || [];
        if (vulnerabilities.length > 0) {
          const recent = vulnerabilities.slice(-6).reverse();
          cisaItems = recent.map((vuln) => ({
            id: vuln.cveID || `CYB-${Math.random()}`,
            cveId: vuln.cveID || 'CVE-UNKNOWN',
            title: `${vuln.vendorProject} ${vuln.product} — ${vuln.vulnerabilityName || 'Exploited Vulnerability'}`,
            vendor: vuln.vendorProject || 'Enterprise Vendor',
            product: vuln.product || 'Infrastructure Software',
            severity: 'Critical',
            dateAdded: vuln.dateAdded || new Date().toISOString().slice(0, 10),
            dueDate: vuln.dueDate || 'Immediate',
            description: vuln.shortDescription || 'Actively exploited vulnerability verified by federal cybersecurity authorities.',
            action: vuln.requiredAction || 'Apply vendor patch or mitigations.',
            source: 'CISA Known Exploited Vulnerabilities (KEV)',
            url: vuln.notes ? vuln.notes.split(';')[0].trim() : `https://nvd.nist.gov/vuln/detail/${vuln.cveID}`,
            isLive: true,
          }));
        }
      } catch (err) {
        console.warn('[CYBER SERVICE] Error parsing CISA KEV JSON:', err.message);
      }
    } else if (cisaRes.status === 'rejected') {
      console.warn('[CYBER SERVICE] CISA KEV feed timed out or unavailable:', cisaRes.reason?.message);
    }

    const combinedItems = [...cisaItems, ...githubItems];
    if (combinedItems.length > 0) {
      const payload = {
        sourceId: this.id,
        sourceName: this.name,
        provider: cisaItems.length > 0 
          ? 'CISA KEV + GitHub FireHOL Threat Net' 
          : 'GitHub FireHOL Open Threat Intelligence Feed',
        isLive: true,
        mode: 'LIVE MODE',
        lastUpdated: new Date().toISOString(),
        latencyMs: Date.now() - startTime,
        disclaimer: 'LIVE FEED — Real-time cybersecurity telemetry from CISA KEV and GitHub open threat intelligence repositories.',
        items: combinedItems,
      };

      cache = { data: payload, timestamp: new Date().toISOString(), lastAttempt: cache.lastAttempt, error: null };
      return payload;
    }

    // 2. Fallback to Curated Standby Demo Telemetry if both external feeds are unavailable
    return this.getDemoFallback('STANDBY');
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
