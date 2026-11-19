import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Tooltip, useMap } from 'react-leaflet';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import apiService from '../services/apiService';
import {
  Map as MapIcon,
  Layers,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  Info,
  Crosshair,
  ShieldAlert,
  Compass,
  ExternalLink,
} from 'lucide-react';

const CLASS_COLORS = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#10b981',
};

const SEV_COLORS = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#f59e0b',
  Low: '#34d399',
};

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY || 'BE8E5HFWGrNH05pGD0M4';

const BASE_TILES = {
  maptiler_dark: {
    id: 'maptiler_dark',
    name: 'MapTiler Dark',
    url: `https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
    attribution: '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; OpenStreetMap',
  },
  maptiler_satellite: {
    id: 'maptiler_satellite',
    name: 'MapTiler Satellite',
    url: `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`,
    attribution: '&copy; MapTiler &copy; OpenStreetMap',
  },
  carto_dark: {
    id: 'carto_dark',
    name: 'CartoDB Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
};

function MapResizeController() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export default function AdvancedGeospatialIntelligence({ canModify = false, isAdmin = false, onSelectCountryProfile }) {
  const [overview, setOverview] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [drillDown, setDrillDown] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [baseTileStyle, setBaseTileStyle] = useState('maptiler_dark');
  const [error, setError] = useState('');

  // Filters
  const [filters, setFilters] = useState({
    region: 'ALL',
    classification: 'ALL',
    category: 'ALL',
    severity: 'ALL',
    startDate: '',
    endDate: '',
  });

  // Map Layer Toggles
  const [layers, setLayers] = useState({
    countries: true,
    incidents: true,
    heatmap: true,
    zones: false,
    clusters: true,
  });

  // DBSCAN Config (for ADMIN/ANALYST analysis run)
  const [epsilonKm, setEpsilonKm] = useState(500);
  const [minPoints, setMinPoints] = useState(2);

  // Historical Playback State
  const [playbackMode, setPlaybackMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIdx, setPlaybackIdx] = useState(0);
  const [playbackSpeedMs, setPlaybackSpeedMs] = useState(1400);
  const playbackTimerRef = useRef(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const ov = await apiService.getGeospatialOverview();
      setOverview(ov);
      setMapData(ov.map);
      setHeatmapData(ov.heatmap);
    } catch (err) {
      setError(err?.message || 'Failed to load Advanced Geospatial Intelligence.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Apply geospatial filters dynamically
  const applyFilters = async (nextFilters) => {
    setFilters(nextFilters);
    setError('');
    try {
      const [m, h] = await Promise.all([
        apiService.getGeospatialMap(nextFilters),
        apiService.getGeospatialHeatmap(nextFilters),
      ]);
      setMapData(m);
      setHeatmapData(h);
    } catch (err) {
      setError(err?.message || 'Failed to apply geospatial filters.');
    }
  };

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setError('');
    try {
      await apiService.runGeospatialAnalysis({
        epsilonKm: Number(epsilonKm),
        minPoints: Number(minPoints),
      });
      await loadAll();
    } catch (err) {
      setError(err?.message || 'Failed to execute DBSCAN geospatial analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectCountry = async (country) => {
    setError('');
    try {
      const data = await apiService.getGeospatialCountryDrillDown(country);
      setDrillDown(data);
    } catch (err) {
      setError(err?.message || `Failed to load drill-down for ${country}.`);
    }
  };

  // Historical Playback Timer
  const frames = overview?.history?.frames || [];
  useEffect(() => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    if (playbackMode && isPlaying && frames.length > 0) {
      playbackTimerRef.current = setInterval(() => {
        setPlaybackIdx((prev) => (prev + 1 >= frames.length ? 0 : prev + 1));
      }, playbackSpeedMs);
    }
    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    };
  }, [playbackMode, isPlaying, frames.length, playbackSpeedMs]);

  const activePlaybackFrame = playbackMode && frames.length > 0 ? frames[playbackIdx] || frames[0] : null;
  const visibleIncidents = activePlaybackFrame
    ? activePlaybackFrame.incidents
    : mapData?.incidentMarkers || [];

  const summary = overview?.summary || {};
  const regions = overview?.regions || [];
  const zones = overview?.riskZones?.zones || [];
  const clusters = overview?.clusters?.clusters || [];
  const supportedCategories = heatmapData?.supportedCategories || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <MapIcon className="h-6 w-6 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Advanced Geospatial Intelligence
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Interactive global risk mapping, threat heatmaps, DBSCAN incident clustering, regional analytics, and chronological playback.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canModify && (
            <>
              {isAdmin && (
                <div className="flex items-center gap-1.5 rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1 text-xs text-slate-300">
                  <span>ε(km):</span>
                  <input
                    type="number"
                    min={10}
                    max={5000}
                    value={epsilonKm}
                    onChange={(e) => setEpsilonKm(e.target.value)}
                    className="w-16 bg-navy-950 border border-navy-700 rounded px-1.5 py-0.5 text-white font-mono"
                  />
                  <span>MinPts:</span>
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={minPoints}
                    onChange={(e) => setMinPoints(e.target.value)}
                    className="w-12 bg-navy-950 border border-navy-700 rounded px-1.5 py-0.5 text-white font-mono"
                  />
                </div>
              )}
              <button
                onClick={handleRunAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50"
              >
                <Crosshair className="h-4 w-4" />
                <span>{isAnalyzing ? 'Clustering...' : 'Run DBSCAN & Zone Sync'}</span>
              </button>
            </>
          )}
          <button
            onClick={loadAll}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-navy-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Data Precision Disclaimer */}
      <div className="flex items-start gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-200">
        <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
        <span>
          Exact incident coordinates (<code className="font-mono">EXACT_INCIDENT_COORDS</code>) are strictly distinguished from country-centroid risk zones (<code className="font-mono">COUNTRY_CENTROID</code>). Geographic proximity in DBSCAN clusters indicates spatial concentration only and does NOT prove causal linkage.
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Mapped Countries</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.mappedCountries ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">High/Critical zones: {summary.highCriticalZones ?? 0}</p>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Geolocated Incidents</p>
          <p className="mt-2 text-2xl font-bold text-cyan-300">{summary.geolocatedIncidents ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Missing coords: {summary.missingCoordIncidents ?? 0}</p>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">DBSCAN Clusters</p>
          <p className="mt-2 text-2xl font-bold text-amber-300">{summary.activeClusters ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Spatial density groupings</p>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Playback Frames</p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">{frames.length}</p>
          <p className="text-xs text-slate-400 mt-1">Recorded chronological dates</p>
        </div>
      </div>

      {/* Geospatial Filters & Layer Controls */}
      <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.region}
              onChange={(e) => applyFilters({ ...filters, region: e.target.value })}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="ALL">All Regions</option>
              {regions.map((r) => (
                <option key={r.region} value={r.region}>{r.region}</option>
              ))}
            </select>
            <select
              value={filters.classification}
              onChange={(e) => applyFilters({ ...filters, classification: e.target.value })}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="ALL">All Risk Levels</option>
              <option value="Critical">Critical Risk</option>
              <option value="High">High Risk</option>
              <option value="Medium">Medium Risk</option>
              <option value="Low">Low Risk</option>
            </select>
            <select
              value={filters.category}
              onChange={(e) => applyFilters({ ...filters, category: e.target.value })}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="ALL">All Threat Categories</option>
              {supportedCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={filters.severity}
              onChange={(e) => applyFilters({ ...filters, severity: e.target.value })}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="ALL">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Layers className="h-4 w-4 text-cyan-400" />
            {[
              { key: 'countries', label: 'Countries' },
              { key: 'incidents', label: 'Incidents' },
              { key: 'heatmap', label: 'Heatmap' },
              { key: 'zones', label: 'Risk Zones' },
              { key: 'clusters', label: 'DBSCAN Clusters' },
            ].map((lyr) => (
              <button
                key={lyr.key}
                onClick={() => setLayers((prev) => ({ ...prev, [lyr.key]: !prev[lyr.key] }))}
                className={`rounded-lg px-2.5 py-1 font-medium border ${
                  layers[lyr.key]
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-navy-950 text-slate-400 border-navy-700'
                }`}
              >
                {lyr.label}
              </button>
            ))}

            {/* Base Tile Layer Style */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[11px] font-mono text-slate-400">Map Style:</span>
              <select
                value={baseTileStyle}
                onChange={(e) => setBaseTileStyle(e.target.value)}
                className="bg-navy-950 border border-navy-700 text-xs font-mono text-cyan-300 rounded px-2 py-1 focus:outline-none"
              >
                <option value="maptiler_dark">MapTiler Dataviz Dark</option>
                <option value="maptiler_satellite">MapTiler Satellite Hybrid</option>
                <option value="carto_dark">CartoDB Dark Matter</option>
              </select>
            </div>
          </div>
        </div>

        {/* Historical Playback Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-navy-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPlaybackMode((v) => !v);
                setIsPlaying(false);
                setPlaybackIdx(0);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold border ${
                playbackMode
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-navy-800 text-slate-300 border-navy-700'
              }`}
            >
              {playbackMode ? 'Playback Active' : 'Enable Historical Playback'}
            </button>
            {playbackMode && frames.length > 0 && (
              <>
                <button
                  onClick={() => setIsPlaying((p) => !p)}
                  className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-xs text-cyan-300"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setPlaybackIdx(0);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-1 text-xs text-slate-300"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
                <select
                  value={playbackSpeedMs}
                  onChange={(e) => setPlaybackSpeedMs(Number(e.target.value))}
                  className="rounded-lg border border-navy-700 bg-navy-950 px-2 py-1 text-xs text-slate-200"
                >
                  <option value={1400}>1x Speed</option>
                  <option value={700}>2x Speed</option>
                </select>
              </>
            )}
          </div>
          {playbackMode && activePlaybackFrame && (
            <div className="flex items-center gap-3 text-xs text-slate-300">
              <span className="font-mono text-cyan-300">
                Date: {activePlaybackFrame.date} ({activePlaybackFrame.incidents.length} incident(s))
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(frames.length - 1, 0)}
                value={playbackIdx}
                onChange={(e) => setPlaybackIdx(Number(e.target.value))}
                className="accent-cyan-400"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Map + Country Drill-Down Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className={`${drillDown ? 'xl:col-span-8' : 'xl:col-span-12'} rounded-xl border border-navy-700/60 bg-navy-900/80 p-4 space-y-3`}>
          {tileError && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Map base tiles could not be loaded (network/offline restriction). Coordinate markers, risk zones, and clusters remain active on the vector canvas.
            </div>
          )}

          <div className="h-[460px] w-full rounded-xl overflow-hidden border border-navy-700/70 bg-navy-950">
            <MapContainer
              center={[22, 18]}
              zoom={2}
              minZoom={2}
              maxZoom={12}
              style={{ height: '100%', width: '100%', background: '#070e1c' }}
            >
              <MapResizeController />
              <TileLayer
                key={baseTileStyle}
                attribution={BASE_TILES[baseTileStyle]?.attribution || '&copy; MapTiler &copy; OpenStreetMap'}
                url={BASE_TILES[baseTileStyle]?.url || BASE_TILES.maptiler_dark.url}
                eventHandlers={{ tileerror: () => setTileError(true) }}
              />

              {/* Geographic Risk Zones */}
              {layers.zones &&
                zones.map((z) => (
                  <Circle
                    key={`zone-${z.id}`}
                    center={[z.centerLat, z.centerLng]}
                    radius={450000}
                    pathOptions={{
                      color: CLASS_COLORS[z.classification] || '#22d3ee',
                      fillColor: CLASS_COLORS[z.classification] || '#22d3ee',
                      fillOpacity: 0.14,
                      weight: 1.5,
                      dashArray: '4 4',
                    }}
                  >
                    <Tooltip>
                      {z.country} Risk Zone: {z.riskScore}/100 ({z.classification}) — {z.boundaryPrecision}
                    </Tooltip>
                  </Circle>
                ))}

              {/* Threat Heatmap Circles */}
              {layers.heatmap &&
                (heatmapData?.points || []).map((pt) => (
                  <Circle
                    key={`heat-${pt.id}`}
                    center={[pt.lat, pt.lng]}
                    radius={220000 * pt.intensity}
                    pathOptions={{
                      color: 'transparent',
                      fillColor: SEV_COLORS[pt.severity] || '#f59e0b',
                      fillOpacity: 0.28,
                    }}
                  />
                ))}

              {/* DBSCAN Clusters */}
              {layers.clusters &&
                clusters.map((cl) => (
                  <Circle
                    key={`cluster-${cl.id}`}
                    center={[cl.centerLat, cl.centerLng]}
                    radius={Math.max(120000, cl.radiusKm * 1000)}
                    pathOptions={{
                      color: '#a78bfa',
                      fillColor: '#a78bfa',
                      fillOpacity: 0.18,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1 text-slate-900">
                        <p className="font-bold">DBSCAN Cluster #{cl.id} ({cl.region})</p>
                        <p>Incidents: {cl.incidentCount} | Dominant: {cl.dominantCategory}</p>
                        <p className="text-[11px] italic">{cl.proximityDisclaimer}</p>
                      </div>
                    </Popup>
                  </Circle>
                ))}

              {/* Country Risk Markers */}
              {layers.countries &&
                (mapData?.countries || []).map((c) => (
                  <CircleMarker
                    key={`country-${c.country}`}
                    center={[c.lat, c.lng]}
                    radius={9}
                    pathOptions={{
                      color: '#ffffff',
                      weight: 1.5,
                      fillColor: CLASS_COLORS[c.classification] || '#22d3ee',
                      fillOpacity: 0.9,
                    }}
                    eventHandlers={{
                      click: () => handleSelectCountry(c.country),
                    }}
                  >
                    <Tooltip>
                      {c.country}: {c.riskScore}/100 ({c.classification}) — Click for drill-down
                    </Tooltip>
                  </CircleMarker>
                ))}

              {/* Exact Incident Markers */}
              {layers.incidents &&
                visibleIncidents.map((inc) => (
                  <CircleMarker
                    key={`inc-${inc.id}`}
                    center={[inc.latitude, inc.longitude]}
                    radius={5}
                    pathOptions={{
                      color: SEV_COLORS[inc.severity] || '#22d3ee',
                      weight: 1.5,
                      fillColor: SEV_COLORS[inc.severity] || '#22d3ee',
                      fillOpacity: 0.85,
                    }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1 text-slate-900">
                        <p className="font-bold">{inc.title}</p>
                        <p>{inc.country} | {inc.severity} | {inc.category}</p>
                        <p className="font-mono text-[10px]">Precision: {inc.locationPrecision}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
            </MapContainer>
          </div>

          {/* Map Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 pt-1">
            <div className="flex flex-wrap items-center gap-4">
              {Object.entries(CLASS_COLORS).map(([label, hex]) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hex }} />
                  <span>{label} Risk</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-400" />
                <span>DBSCAN Cluster</span>
              </span>
            </div>
            <span className="font-mono text-[11px]">Click any country marker for geographic drill-down</span>
          </div>
        </div>

        {/* Country Geographic Drill-Down Panel */}
        {drillDown && (
          <div className="xl:col-span-4 rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-white">{drillDown.country}</h2>
                <p className="text-xs text-slate-400">{drillDown.region}</p>
              </div>
              <button
                onClick={() => setDrillDown(null)}
                className="text-xs text-slate-400 hover:text-white border border-navy-700 rounded px-2 py-1"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-navy-700 bg-navy-950 p-2.5">
                <span className="text-slate-400">Composite Score</span>
                <p className="text-lg font-bold text-cyan-300">{drillDown.riskScore}/100 ({drillDown.classification})</p>
              </div>
              <div className="rounded-lg border border-navy-700 bg-navy-950 p-2.5">
                <span className="text-slate-400">Phase 11 Forecast</span>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {drillDown.prediction?.hasSufficientHistory
                    ? `${drillDown.prediction.direction} -> ${drillDown.prediction.projectedNextScore}`
                    : 'INSUFFICIENT_DATA'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
              {['political', 'economic', 'security', 'geopolitical'].map((k) => (
                <div key={k} className="rounded border border-navy-800 bg-navy-950/70 p-2">
                  <p className="text-slate-400 capitalize">{k}</p>
                  <p className="font-mono font-bold text-white">{drillDown.indicators?.[k] ?? 0}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-white">Active Incidents ({drillDown.activeIncidents?.length ?? 0})</p>
              <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                {(drillDown.recentIncidents || []).slice(0, 4).map((inc) => (
                  <div key={inc.id} className="rounded border border-navy-800 bg-navy-950/60 p-2 text-[11px]">
                    <p className="font-semibold text-slate-200">{inc.title}</p>
                    <p className="text-slate-400">{inc.severity} | {inc.status}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-400 space-y-1">
              <p>Active Warnings: <span className="text-amber-300 font-mono">{drillDown.warnings?.length ?? 0}</span></p>
              <p>Analytical Insights: <span className="text-cyan-300 font-mono">{drillDown.insights?.length ?? 0}</span></p>
            </div>

            {onSelectCountryProfile && (
              <button
                onClick={() => onSelectCountryProfile(drillDown.country)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open Full Country Risk Profile</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Regional Threat Intelligence & DBSCAN Clusters */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">Regional Threat Intelligence</h2>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regions}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="region" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                <Legend />
                <Bar dataKey="averageRiskScore" name="Avg Risk Score" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                <Bar dataKey="totalIncidents" name="Total Incidents" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-violet-400" />
            <h2 className="text-base font-semibold text-white">DBSCAN Incident Clusters</h2>
          </div>
          {clusters.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">
              No spatial clusters persisted yet. Click &ldquo;Run DBSCAN &amp; Zone Sync&rdquo; to detect geographic concentrations.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {clusters.map((cl) => (
                <div key={cl.id} className="rounded-lg border border-navy-700/70 bg-navy-950/60 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-violet-300">
                      Cluster #{cl.id} — {cl.region} ({cl.incidentCount} incidents)
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">Radius: {cl.radiusKm} km</span>
                  </div>
                  <p className="text-slate-300">
                    Dominant Category: {cl.dominantCategory} | Countries: {cl.countries.join(', ')}
                  </p>
                  <p className="text-[10px] font-mono text-slate-500">
                    Linked IDs: {cl.incidentIds.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

