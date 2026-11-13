import db from '../db/database.js';
import countryRiskService from './countryRiskService.js';
import predictiveService from './predictiveService.js';
import { advancedAnalyticsService } from './advancedAnalyticsService.js';
import { broadcastEvent } from './realtimeService.js';

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

const STANDARD_REGIONS = [
  'Asia-Pacific',
  'South Asia',
  'Middle East',
  'Europe',
  'Africa',
  'North America',
  'South America',
];

function normalizeRegion(rawRegion) {
  const r = String(rawRegion || '').toLowerCase();
  if (r.includes('south asia')) return 'South Asia';
  if (r.includes('east asia') || r.includes('southeast asia') || r.includes('oceania') || r.includes('asia-pacific')) {
    return 'Asia-Pacific';
  }
  if (r.includes('middle east')) return 'Middle East';
  if (r.includes('europe')) return 'Europe';
  if (r.includes('africa')) return 'Africa';
  if (r.includes('north america')) return 'North America';
  if (r.includes('south america') || r.includes('latin america')) return 'South America';
  return 'Asia-Pacific';
}

export function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Deterministic DBSCAN over incidents with valid coordinates.
 */
function runDbscan(points, epsilonKm = 500, minPoints = 2) {
  const visited = new Set();
  const clustered = new Set();
  const clusters = [];

  const regionQuery = (idx) => {
    const p = points[idx];
    const neighbors = [];
    for (let j = 0; j < points.length; j += 1) {
      if (haversineKm(p.latitude, p.longitude, points[j].latitude, points[j].longitude) <= epsilonKm) {
        neighbors.push(j);
      }
    }
    return neighbors;
  };

  for (let i = 0; i < points.length; i += 1) {
    if (visited.has(i)) continue;
    visited.add(i);
    const neighbors = regionQuery(i);
    if (neighbors.length < minPoints) continue;

    const clusterIndices = [];
    const queue = [...neighbors];
    const inQueue = new Set(neighbors);

    while (queue.length > 0) {
      const idx = queue.shift();
      if (!visited.has(idx)) {
        visited.add(idx);
        const subNeighbors = regionQuery(idx);
        if (subNeighbors.length >= minPoints) {
          for (const n of subNeighbors) {
            if (!inQueue.has(n)) {
              inQueue.add(n);
              queue.push(n);
            }
          }
        }
      }
      if (!clustered.has(idx)) {
        clustered.add(idx);
        clusterIndices.push(idx);
      }
    }

    if (clusterIndices.length >= minPoints) {
      clusters.push(clusterIndices.map((idx) => points[idx]));
    }
  }

  return clusters;
}

function mapIncidentGeo(row, countryRegionMap) {
  const valid = isValidCoordinate(row.latitude, row.longitude);
  return {
    id: row.id,
    title: row.title,
    country: row.country,
    region: normalizeRegion(countryRegionMap.get(String(row.country || '').toLowerCase()) || 'Global'),
    location: row.location,
    category: row.category,
    severity: row.severity,
    status: row.status,
    latitude: valid ? row.latitude : null,
    longitude: valid ? row.longitude : null,
    locationPrecision: valid ? 'EXACT_INCIDENT_COORDS' : 'UNKNOWN',
    dateReported: row.date_reported,
    lastUpdated: row.last_updated,
  };
}

function filterIncidentsList(incidents, { country = 'ALL', region = 'ALL', category = 'ALL', severity = 'ALL', startDate = '', endDate = '' } = {}) {
  return incidents.filter((inc) => {
    if (country && country !== 'ALL' && inc.country.toLowerCase() !== country.toLowerCase()) return false;
    if (region && region !== 'ALL' && inc.region.toLowerCase() !== region.toLowerCase()) return false;
    if (category && category !== 'ALL' && inc.category !== category) return false;
    if (severity && severity !== 'ALL' && inc.severity !== severity) return false;
    const d = String(inc.dateReported || '').slice(0, 10);
    if (startDate && d && d < startDate) return false;
    if (endDate && d && d > endDate) return false;
    return true;
  });
}

function mapClusterRow(row) {
  let severityDistribution = {};
  let incidentIds = [];
  let countries = [];
  try {
    severityDistribution = JSON.parse(row.severity_distribution_json || '{}');
  } catch {
    severityDistribution = {};
  }
  try {
    incidentIds = JSON.parse(row.incident_ids_json || '[]');
  } catch {
    incidentIds = [];
  }
  try {
    countries = JSON.parse(row.countries_json || '[]');
  } catch {
    countries = [];
  }
  return {
    id: row.id,
    dedupKey: row.dedup_key,
    region: row.region,
    centerLat: row.center_lat,
    centerLng: row.center_lng,
    radiusKm: row.radius_km,
    incidentCount: row.incident_count,
    dominantCategory: row.dominant_category,
    severityDistribution,
    incidentIds,
    countries,
    proximityDisclaimer: row.proximity_disclaimer,
    detectedAt: row.detected_at,
  };
}

function mapZoneRow(row) {
  return {
    id: row.id,
    country: row.country,
    region: row.region,
    riskScore: row.risk_score,
    classification: row.classification,
    previousScore: row.previous_score,
    scoreDelta: row.score_delta,
    trendDirection: row.trend_direction,
    centerLat: row.center_lat,
    centerLng: row.center_lng,
    boundaryPrecision: row.boundary_precision,
    updatedAt: row.updated_at,
  };
}

function extractLatLng(coords) {
  if (Array.isArray(coords) && coords.length >= 2) {
    return { lat: coords[0], lng: coords[1] };
  }
  if (coords && typeof coords === 'object') {
    return { lat: coords.lat ?? null, lng: coords.lng ?? null };
  }
  return { lat: null, lng: null };
}

function buildLiveZonesFromProfiles(profiles) {
  return profiles.map((p) => {
    const { lat, lng } = extractLatLng(p.coordinates);
    return {
      id: `ZONE-${p.country.toUpperCase().replace(/\s+/g, '-')}`,
      country: p.country,
      region: normalizeRegion(p.region),
      riskScore: p.riskScore,
      classification: p.classification,
      previousScore: p.previousScore ?? null,
      scoreDelta: p.scoreDelta ?? 0,
      trendDirection: p.trendDirection || 'STABLE',
      centerLat: lat ?? 0,
      centerLng: lng ?? 0,
      boundaryPrecision: 'COUNTRY_CENTROID',
      updatedAt: p.lastCalculated,
    };
  });
}

export const geospatialService = {
  getMapData(filters = {}) {
    const profiles = countryRiskService.getAllCountryProfiles();
    const countryRegionMap = new Map(profiles.map((p) => [p.country.toLowerCase(), p.region]));

    const countries = profiles
      .map((p) => {
        const { lat, lng } = extractLatLng(p.coordinates);
        return {
          country: p.country,
          region: normalizeRegion(p.region),
          riskScore: p.riskScore,
          classification: p.classification,
          activeIncidents: p.counts.activeIncidents,
          criticalAlerts: p.counts.criticalAlerts,
          lat,
          lng,
          locationPrecision: isValidCoordinate(lat, lng)
            ? 'COUNTRY_CENTROID'
            : 'UNKNOWN',
          trendDirection: p.trendDirection || 'STABLE',
          lastCalculatedAt: p.lastCalculated,
        };
      })
      .filter((c) => {
        if (filters.country && filters.country !== 'ALL' && c.country.toLowerCase() !== filters.country.toLowerCase()) {
          return false;
        }
        if (filters.region && filters.region !== 'ALL' && c.region.toLowerCase() !== filters.region.toLowerCase()) {
          return false;
        }
        if (filters.classification && filters.classification !== 'ALL' && c.classification !== filters.classification) {
          return false;
        }
        return isValidCoordinate(c.lat, c.lng);
      });

    const rawIncidents = db.prepare('SELECT * FROM incidents ORDER BY id DESC').all();
    const mapped = rawIncidents.map((r) => mapIncidentGeo(r, countryRegionMap));
    const filteredIncidents = filterIncidentsList(mapped, filters);
    const validMarkers = filteredIncidents.filter((i) => i.locationPrecision === 'EXACT_INCIDENT_COORDS');
    const missingCoordsCount = filteredIncidents.length - validMarkers.length;

    return {
      generatedAt: new Date().toISOString(),
      source: 'GRICC SQLite Incidents & Country Risk Engine',
      countries,
      incidentMarkers: validMarkers,
      totalFilteredIncidents: filteredIncidents.length,
      missingCoordinatesCount: missingCoordsCount,
    };
  },

  getHeatmapData(filters = {}) {
    const profiles = countryRiskService.getAllCountryProfiles();
    const countryRegionMap = new Map(profiles.map((p) => [p.country.toLowerCase(), p.region]));
    const rawIncidents = db.prepare('SELECT * FROM incidents').all();
    const mapped = rawIncidents.map((r) => mapIncidentGeo(r, countryRegionMap));
    const filtered = filterIncidentsList(mapped, filters).filter(
      (i) => i.locationPrecision === 'EXACT_INCIDENT_COORDS'
    );

    const sevWeight = { Critical: 1.0, High: 0.75, Medium: 0.5, Low: 0.25 };
    const points = filtered.map((inc) => ({
      id: inc.id,
      lat: inc.latitude,
      lng: inc.longitude,
      intensity: sevWeight[inc.severity] || 0.3,
      severity: inc.severity,
      category: inc.category,
      country: inc.country,
      region: inc.region,
      locationPrecision: inc.locationPrecision,
    }));

    // Supported categories strictly from actual incidents in SQLite
    const supportedCategories = Array.from(new Set(rawIncidents.map((i) => i.category).filter(Boolean))).sort();

    return {
      generatedAt: new Date().toISOString(),
      filters,
      supportedCategories,
      pointCount: points.length,
      points,
    };
  },

  getRegions() {
    const profiles = countryRiskService.getAllCountryProfiles();
    const countryRegionMap = new Map(profiles.map((p) => [p.country.toLowerCase(), p.region]));
    const rawIncidents = db.prepare('SELECT * FROM incidents').all().map((r) => mapIncidentGeo(r, countryRegionMap));

    const regions = STANDARD_REGIONS.map((regName) => {
      const regCountries = profiles.filter((p) => normalizeRegion(p.region) === regName);
      const regIncidents = rawIncidents.filter((i) => i.region === regName);
      const activeIncidents = regIncidents.filter((i) => i.status !== 'Resolved');
      const criticalIncidents = regIncidents.filter((i) => i.severity === 'Critical');

      const avgRisk =
        regCountries.length > 0
          ? Math.round(regCountries.reduce((s, c) => s + c.riskScore, 0) / regCountries.length)
          : 0;
      const maxRisk =
        regCountries.length > 0 ? Math.max(...regCountries.map((c) => c.riskScore)) : 0;

      const catMap = new Map();
      for (const inc of regIncidents) {
        catMap.set(inc.category, (catMap.get(inc.category) || 0) + 1);
      }

      const hotspots = [...regCountries]
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 3)
        .map((c) => ({ country: c.country, riskScore: c.riskScore, classification: c.classification }));

      return {
        region: regName,
        countryCount: regCountries.length,
        averageRiskScore: avgRisk,
        maxRiskScore: maxRisk,
        totalIncidents: regIncidents.length,
        activeIncidents: activeIncidents.length,
        criticalIncidents: criticalIncidents.length,
        categoryDistribution: Array.from(catMap.entries()).map(([category, count]) => ({ category, count })),
        hotspots,
        countries: regCountries.map((c) => c.country),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      regions,
    };
  },

  getRegionDetail(regionName) {
    const { regions } = this.getRegions();
    const match = regions.find((r) => r.region.toLowerCase() === String(regionName || '').toLowerCase());
    if (!match) {
      throw createHttpError(404, `Region "${regionName}" not found.`, 'NotFound');
    }
    return match;
  },

  getRiskZones({ region = 'ALL', classification = 'ALL' } = {}) {
    const persisted = db.prepare('SELECT * FROM geographic_risk_zones ORDER BY risk_score DESC').all();
    const zones =
      persisted.length > 0
        ? persisted.map(mapZoneRow)
        : buildLiveZonesFromProfiles(countryRiskService.getAllCountryProfiles());

    const filtered = zones.filter((z) => {
      if (region && region !== 'ALL' && z.region.toLowerCase() !== region.toLowerCase()) return false;
      if (classification && classification !== 'ALL' && z.classification !== classification) return false;
      return true;
    });

    return {
      generatedAt: new Date().toISOString(),
      precisionNote:
        'Zones represent country-level composite risk boundaries anchored at country centroids; city/district precision is not fabricated from country-level scores.',
      count: filtered.length,
      zones: filtered,
    };
  },

  getClusters({ region = 'ALL', limit = 50 } = {}) {
    const conditions = [];
    const params = [];
    if (region && region !== 'ALL') {
      conditions.push('LOWER(region) = LOWER(?)');
      params.push(region);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

    const rows = db
      .prepare(`SELECT * FROM geospatial_clusters ${where} ORDER BY incident_count DESC, id DESC LIMIT ?`)
      .all(...params, safeLimit)
      .map(mapClusterRow);

    return {
      algorithm: 'DBSCAN (Haversine km)',
      proximityNote:
        'Geographic proximity indicates spatial concentration only and does NOT prove causal or operational linkage between incidents.',
      count: rows.length,
      clusters: rows,
    };
  },

  runGeospatialAnalysis({ epsilonKm = 500, minPoints = 2 } = {}, actor = null) {
    const safeEpsilon = Math.min(Math.max(Number(epsilonKm) || 500, 10), 5000);
    const safeMinPts = Math.min(Math.max(parseInt(minPoints, 10) || 2, 2), 20);

    const profiles = countryRiskService.getAllCountryProfiles();
    const countryRegionMap = new Map(profiles.map((p) => [p.country.toLowerCase(), p.region]));
    const rawIncidents = db.prepare('SELECT * FROM incidents').all();
    const mapped = rawIncidents.map((r) => mapIncidentGeo(r, countryRegionMap));
    const validPoints = mapped.filter((i) => i.locationPrecision === 'EXACT_INCIDENT_COORDS');
    const missingCount = mapped.length - validPoints.length;

    const rawClusters = runDbscan(validPoints, safeEpsilon, safeMinPts);
    const nowIso = new Date().toISOString();

    const insertCluster = db.prepare(`
      INSERT OR IGNORE INTO geospatial_clusters (
        dedup_key, region, center_lat, center_lng, radius_km, incident_count,
        dominant_category, severity_distribution_json, incident_ids_json, countries_json,
        proximity_disclaimer, detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const upsertZone = db.prepare(`
      INSERT INTO geographic_risk_zones (
        id, country, region, risk_score, classification, previous_score, score_delta,
        trend_direction, center_lat, center_lng, boundary_precision, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COUNTRY_CENTROID', ?)
      ON CONFLICT(country) DO UPDATE SET
        region = excluded.region,
        risk_score = excluded.risk_score,
        classification = excluded.classification,
        previous_score = excluded.previous_score,
        score_delta = excluded.score_delta,
        trend_direction = excluded.trend_direction,
        center_lat = excluded.center_lat,
        center_lng = excluded.center_lng,
        updated_at = excluded.updated_at
    `);

    const newClusters = [];
    const tx = db.transaction(() => {
      for (const group of rawClusters) {
        const centerLat = Number(
          (group.reduce((s, p) => s + p.latitude, 0) / group.length).toFixed(4)
        );
        const centerLng = Number(
          (group.reduce((s, p) => s + p.longitude, 0) / group.length).toFixed(4)
        );
        const maxDist = Math.max(
          ...group.map((p) => haversineKm(centerLat, centerLng, p.latitude, p.longitude))
        );

        const catCount = new Map();
        const sevDist = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        const countries = new Set();
        const ids = [];

        for (const p of group) {
          catCount.set(p.category, (catCount.get(p.category) || 0) + 1);
          sevDist[p.severity] = (sevDist[p.severity] || 0) + 1;
          countries.add(p.country);
          ids.push(p.id);
        }
        ids.sort();
        const dominantCategory = Array.from(catCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed';
        const dedupKey = `dbscan-${ids.join('|')}-${safeEpsilon}`;

        const info = insertCluster.run(
          dedupKey,
          group[0].region,
          centerLat,
          centerLng,
          Number(Math.max(10, maxDist).toFixed(1)),
          group.length,
          dominantCategory,
          JSON.stringify(sevDist),
          JSON.stringify(ids),
          JSON.stringify(Array.from(countries)),
          'Geographic proximity indicates spatial concentration only and does NOT prove causal or operational linkage.',
          nowIso
        );
        if (info.changes > 0) {
          const row = db.prepare('SELECT * FROM geospatial_clusters WHERE id = ?').get(info.lastInsertRowid);
          if (row) newClusters.push(mapClusterRow(row));
        }
      }

      const liveZones = buildLiveZonesFromProfiles(profiles);
      for (const z of liveZones) {
        if (isValidCoordinate(z.centerLat, z.centerLng)) {
          upsertZone.run(
            z.id,
            z.country,
            z.region,
            z.riskScore,
            z.classification,
            z.previousScore,
            z.scoreDelta,
            z.trendDirection,
            z.centerLat,
            z.centerLng,
            nowIso
          );
        }
      }

      db.prepare(`
        INSERT INTO geospatial_analysis_history (
          executed_by, epsilon_km, min_points, clusters_found, zones_updated,
          valid_coord_incidents, missing_coord_incidents, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        actor?.username || 'Operator',
        safeEpsilon,
        safeMinPts,
        rawClusters.length,
        profiles.length,
        validPoints.length,
        missingCount,
        nowIso
      );
    });
    tx();

    broadcastEvent('geospatial_analysis_updated', {
      clustersFound: rawClusters.length,
      newClustersCount: newClusters.length,
      zonesUpdated: profiles.length,
    });

    return {
      analyzedAt: nowIso,
      algorithm: 'DBSCAN (Haversine km)',
      parameters: { epsilonKm: safeEpsilon, minPoints: safeMinPts },
      clustersFound: rawClusters.length,
      newClustersCount: newClusters.length,
      zonesUpdated: profiles.length,
      validCoordinateIncidents: validPoints.length,
      missingCoordinateIncidents: missingCount,
      newClusters,
    };
  },

  getHistory({ startDate = '', endDate = '' } = {}) {
    const profiles = countryRiskService.getAllCountryProfiles();
    const countryRegionMap = new Map(profiles.map((p) => [p.country.toLowerCase(), p.region]));
    const rawIncidents = db.prepare('SELECT * FROM incidents ORDER BY date_reported ASC').all();
    const mapped = rawIncidents
      .map((r) => mapIncidentGeo(r, countryRegionMap))
      .filter((i) => i.locationPrecision === 'EXACT_INCIDENT_COORDS')
      .filter((i) => {
        const d = String(i.dateReported || '').slice(0, 10);
        if (startDate && d && d < startDate) return false;
        if (endDate && d && d > endDate) return false;
        return true;
      });

    // Group chronologically by recorded timestamp date (YYYY-MM-DD)
    const frameMap = new Map();
    for (const inc of mapped) {
      const dateKey = /^\d{4}-\d{2}-\d{2}/.test(String(inc.dateReported || ''))
        ? String(inc.dateReported).slice(0, 10)
        : '2026-11-02';
      const frame = frameMap.get(dateKey) || { date: dateKey, incidents: [], regionalCounts: {} };
      frame.incidents.push(inc);
      frame.regionalCounts[inc.region] = (frame.regionalCounts[inc.region] || 0) + 1;
      frameMap.set(dateKey, frame);
    }

    const frames = Array.from(frameMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      generatedAt: new Date().toISOString(),
      sourceNote: 'Playback frames are derived strictly from recorded SQLite incident date_reported timestamps.',
      totalFrames: frames.length,
      frames,
    };
  },

  getCountryDrillDown(countryName) {
    const profile = countryRiskService.getCountryProfile(countryName);
    const predData = predictiveService.getCountryPrediction(profile.country);
    const compData = advancedAnalyticsService.getComparison({ countries: [profile.country] });
    const warnings = predictiveService.getEarlyWarnings({ country: profile.country, status: 'active' });
    const allInsights = advancedAnalyticsService.getInsights({ limit: 50 }).insights;
    const countryInsights = allInsights.filter((ins) =>
      (ins.relevantCountries || []).some((c) => c.toLowerCase() === profile.country.toLowerCase())
    );

    return {
      country: profile.country,
      region: normalizeRegion(profile.region),
      riskScore: profile.riskScore,
      classification: profile.classification,
      coordinates: profile.coordinates,
      indicators: compData.items[0]?.indicators || {
        overall: profile.riskScore,
        political: 0,
        economic: 0,
        security: 0,
        geopolitical: 0,
      },
      activeIncidents: profile.activeIncidentsList || [],
      recentIncidents: (profile.allIncidents || []).slice(0, 10),
      prediction: predData.prediction,
      warnings,
      insights: countryInsights,
      lastCalculatedAt: profile.lastCalculated,
    };
  },

  getFilteredIncidents({ country = 'ALL', region = 'ALL', category = 'ALL', severity = 'ALL', startDate = '', endDate = '', limit = 50, offset = 0 } = {}) {
    const profiles = countryRiskService.getAllCountryProfiles();
    const countryRegionMap = new Map(profiles.map((p) => [p.country.toLowerCase(), p.region]));
    const rawIncidents = db.prepare('SELECT * FROM incidents ORDER BY id DESC').all();
    const mapped = rawIncidents.map((r) => mapIncidentGeo(r, countryRegionMap));
    const filtered = filterIncidentsList(mapped, { country, region, category, severity, startDate, endDate });

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    return {
      total: filtered.length,
      limit: safeLimit,
      offset: safeOffset,
      incidents: filtered.slice(safeOffset, safeOffset + safeLimit),
    };
  },

  getOverview() {
    const mapData = this.getMapData();
    const heatmapData = this.getHeatmapData();
    const regionsData = this.getRegions();
    const zonesData = this.getRiskZones();
    const clustersData = this.getClusters();
    const historyData = this.getHistory();

    const highCriticalZones = zonesData.zones.filter(
      (z) => z.classification === 'Critical' || z.classification === 'High'
    ).length;

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        mappedCountries: mapData.countries.length,
        geolocatedIncidents: mapData.incidentMarkers.length,
        missingCoordIncidents: mapData.missingCoordinatesCount,
        activeClusters: clustersData.count,
        highCriticalZones,
      },
      map: mapData,
      heatmap: heatmapData,
      regions: regionsData.regions,
      riskZones: zonesData,
      clusters: clustersData,
      history: historyData,
    };
  },
};
