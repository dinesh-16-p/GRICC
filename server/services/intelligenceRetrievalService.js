import db from '../db/database.js';
import countryRiskService from './countryRiskService.js';
import predictiveService from './predictiveService.js';
import { decisionService } from './decisionService.js';
import { advancedAnalyticsService } from './advancedAnalyticsService.js';
import { geospatialService } from './geospatialService.js';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(system|developer)\s+prompt/i,
  /override\s+(rbac|permissions|risk\s+score)/i,
  /reveal\s+(api[_\s]?key|jwt[_\s]?secret|password|credentials)/i,
  /execute\s+(sql|drop\s+table|delete\s+from|update\s+incidents)/i,
];

export function detectPromptInjection(text) {
  const input = String(text || '');
  return INJECTION_PATTERNS.some((re) => re.test(input));
}

export function sanitizeUntrustedText(text, maxLen = 600) {
  return String(text || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

const REGION_KEYWORDS = [
  { key: 'south asia', label: 'South Asia' },
  { key: 'asia-pacific', label: 'Asia-Pacific' },
  { key: 'east asia', label: 'Asia-Pacific' },
  { key: 'southeast asia', label: 'Asia-Pacific' },
  { key: 'middle east', label: 'Middle East' },
  { key: 'europe', label: 'Europe' },
  { key: 'africa', label: 'Africa' },
  { key: 'north america', label: 'North America' },
  { key: 'south america', label: 'South America' },
];

const SEVERITY_KEYWORDS = ['critical', 'high', 'medium', 'low'];

export const intelligenceRetrievalService = {
  extractQueryEntities(query, fallbackCountry = null) {
    const q = String(query || '').toLowerCase();
    const profiles = countryRiskService.getAllCountryProfiles();

    const mentionedCountries = profiles
      .filter((p) => q.includes(p.country.toLowerCase()))
      .map((p) => p.country);

    // Context-aware pronoun resolution ("it", "its", "that country")
    if (
      mentionedCountries.length === 0 &&
      fallbackCountry &&
      (/\b(it|its|that country|this country)\b/i.test(q) || q.includes('compare'))
    ) {
      mentionedCountries.push(fallbackCountry);
    }

    const mentionedRegion = REGION_KEYWORDS.find((r) => q.includes(r.key))?.label || null;
    const mentionedSeverities = SEVERITY_KEYWORDS.filter((s) => new RegExp(`\\b${s}\\b`, 'i').test(q)).map(
      (s) => s.charAt(0).toUpperCase() + s.slice(1)
    );

    const daysMatch = q.match(/last\s+(\d+)\s+days?/i);
    const daysWindow = daysMatch ? Math.min(365, Math.max(1, parseInt(daysMatch[1], 10))) : null;

    return {
      mentionedCountries,
      mentionedRegion,
      mentionedSeverities,
      daysWindow,
      rawQuery: sanitizeUntrustedText(query, 400),
    };
  },

  searchIntelligence(query, userRole = 'VIEWER', fallbackCountry = null) {
    const entities = this.extractQueryEntities(query, fallbackCountry);
    const qLower = entities.rawQuery.toLowerCase();
    const stopWords = new Set(['find', 'all', 'show', 'what', 'which', 'the', 'and', 'for', 'with', 'about', 'last', 'days', 'during', 'reported', 'related', 'countries', 'incidents', 'risk']);
    const keywords = qLower
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    const results = [];
    const profiles = countryRiskService.getAllCountryProfiles();

    // 1. Country Profiles
    for (const p of profiles) {
      let score = 0;
      if (entities.mentionedCountries.includes(p.country)) score += 60;
      if (entities.mentionedRegion && p.region.toLowerCase().includes(entities.mentionedRegion.toLowerCase())) score += 30;
      if (qLower.includes('rising') && p.trendDirection === 'RISING') score += 35;
      if (qLower.includes('highest') && p.riskScore >= 40) score += 25;
      if (score > 0 || keywords.some((k) => p.country.toLowerCase().includes(k))) {
        results.push({
          recordId: `COUNTRY-${p.country.toUpperCase().replace(/\s+/g, '-')}`,
          sourceType: 'COUNTRY_RISK_PROFILE',
          tier: 'VERIFIED_DATA',
          country: p.country,
          region: p.region,
          title: `${p.country} Composite Risk Profile (${p.riskScore}/100 — ${p.classification})`,
          date: p.lastCalculated,
          severity: p.classification,
          summary: `${p.counts.activeIncidents} active incident(s), ${p.counts.criticalAlerts} critical alert(s), trend: ${p.trendDirection}.`,
          url: null,
          relevanceScore: Math.min(99, Math.max(45, score)),
        });
      }
    }

    // 2. SQLite Incidents
    const incidents = db.prepare('SELECT * FROM incidents ORDER BY id DESC LIMIT 100').all();
    const cutoffIso = entities.daysWindow
      ? new Date(Date.now() - entities.daysWindow * 86400000).toISOString().slice(0, 10)
      : null;

    for (const inc of incidents) {
      let score = 0;
      const hay = `${inc.title} ${inc.description} ${inc.category} ${inc.country} ${inc.location}`.toLowerCase();
      if (entities.mentionedCountries.includes(inc.country)) score += 45;
      if (entities.mentionedSeverities.length > 0) {
        if (!entities.mentionedSeverities.includes(inc.severity)) continue;
        score += 25;
      }
      if (cutoffIso && String(inc.date_reported || '').slice(0, 10) < cutoffIso) continue;
      for (const kw of keywords) {
        if (hay.includes(kw)) score += 15;
      }
      if (score > 0) {
        results.push({
          recordId: inc.id,
          sourceType: 'INCIDENT',
          tier: 'VERIFIED_DATA',
          country: inc.country,
          title: sanitizeUntrustedText(inc.title, 160),
          date: inc.date_reported,
          severity: inc.severity,
          category: inc.category,
          summary: sanitizeUntrustedText(inc.description, 220),
          url: null,
          relevanceScore: Math.min(99, score),
        });
      }
    }

    // 3. Active Early Warnings (Phase 11)
    const warnings = predictiveService.getEarlyWarnings({ limit: 50 });
    for (const w of warnings) {
      let score = 0;
      if (entities.mentionedCountries.includes(w.country)) score += 45;
      if (qLower.includes('warning') || qLower.includes('early')) score += 35;
      if (keywords.some((k) => `${w.title} ${w.description} ${w.warningType}`.toLowerCase().includes(k))) score += 20;
      if (score > 0) {
        results.push({
          recordId: `EW-${w.id}`,
          sourceType: 'EARLY_WARNING',
          tier: 'ANALYTICAL_ASSESSMENT',
          country: w.country,
          title: sanitizeUntrustedText(w.title, 160),
          date: w.createdAt,
          severity: w.severity,
          summary: sanitizeUntrustedText(w.description, 220),
          url: null,
          relevanceScore: Math.min(98, score),
        });
      }
    }

    // 4. Analytical Insights (Phase 13)
    const { insights } = advancedAnalyticsService.getInsights({ limit: 40 });
    for (const ins of insights) {
      let score = 0;
      if (entities.mentionedCountries.some((c) => (ins.relevantCountries || []).includes(c))) score += 40;
      if (qLower.includes('insight') || qLower.includes('pattern') || qLower.includes('correlat')) score += 25;
      if (keywords.some((k) => `${ins.title} ${ins.description}`.toLowerCase().includes(k))) score += 15;
      if (score > 0) {
        results.push({
          recordId: `INS-${ins.id}`,
          sourceType: 'ANALYTICAL_INSIGHT',
          tier: 'ANALYTICAL_ASSESSMENT',
          country: (ins.relevantCountries || []).join(', ') || 'Global',
          title: sanitizeUntrustedText(ins.title, 160),
          date: ins.createdAt,
          severity: ins.confidence,
          summary: sanitizeUntrustedText(ins.description, 220),
          url: null,
          relevanceScore: Math.min(97, score),
        });
      }
    }

    // 5. Strategic Recommendations (RBAC: ADMIN & ANALYST see full recommendations; VIEWER sees read-only summary only, no internal audit logs)
    if (['ADMIN', 'ANALYST', 'VIEWER'].includes(userRole)) {
      const recs = decisionService.getRecommendations({ limit: 40 });
      for (const rec of recs) {
        let score = 0;
        if (entities.mentionedCountries.includes(rec.country)) score += 40;
        if (qLower.includes('recommend') || qLower.includes('action') || qLower.includes('response')) score += 30;
        if (score > 0) {
          results.push({
            recordId: `REC-${rec.id}`,
            sourceType: 'STRATEGIC_RECOMMENDATION',
            tier: 'ANALYTICAL_ASSESSMENT',
            country: rec.country,
            title: sanitizeUntrustedText(rec.title, 160),
            date: rec.createdAt,
            severity: rec.severity,
            summary: sanitizeUntrustedText(rec.rationale, 220),
            url: null,
            relevanceScore: Math.min(95, score),
          });
        }
      }
    }

    // 6. Geospatial Clusters (Phase 14)
    if (qLower.includes('cluster') || qLower.includes('geospatial') || qLower.includes('region') || entities.mentionedRegion) {
      const { clusters } = geospatialService.getClusters({ limit: 20 });
      for (const cl of clusters) {
        results.push({
          recordId: `CLUSTER-${cl.id}`,
          sourceType: 'GEOSPATIAL_CLUSTER',
          tier: 'ANALYTICAL_ASSESSMENT',
          country: (cl.countries || []).join(', '),
          title: `DBSCAN Cluster #${cl.id} in ${cl.region} (${cl.incidentCount} incidents)`,
          date: cl.detectedAt,
          severity: 'Medium',
          summary: `Dominant category: ${cl.dominantCategory}. ${cl.proximityDisclaimer}`,
          url: null,
          relevanceScore: 70,
        });
      }
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return {
      query: entities.rawQuery,
      entities,
      totalMatches: results.length,
      results: results.slice(0, 25),
    };
  },
};

