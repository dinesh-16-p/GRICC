import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { sampleLocations, RISK_LEVELS } from '../data/mapData';
import {
  Globe,
  Filter,
  ShieldAlert,
  Clock,
  MapPin,
  Layers,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';

/**
 * Controller to handle map invalidation on resize / mount
 */
function MapController() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

/**
 * Helper to build custom animated SVG/HTML Leaflet marker icons
 */
const createCustomMarkerIcon = (classification, score) => {
  let colorBg = 'bg-emerald-500';
  let borderRing = 'border-emerald-400';
  let pingBg = 'bg-emerald-400';
  let glowColor = 'rgba(16, 185, 129, 0.45)';

  if (classification === RISK_LEVELS.HIGH) {
    colorBg = 'bg-red-500';
    borderRing = 'border-red-400';
    pingBg = 'bg-red-400';
    glowColor = 'rgba(239, 68, 68, 0.55)';
  } else if (classification === RISK_LEVELS.MEDIUM) {
    colorBg = 'bg-orange-500';
    borderRing = 'border-orange-400';
    pingBg = 'bg-orange-400';
    glowColor = 'rgba(249, 115, 22, 0.55)';
  }

  return L.divIcon({
    className: 'custom-risk-marker',
    html: `
      <div class="relative flex items-center justify-center cursor-pointer group" style="width: 32px; height: 32px;">
        <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full opacity-60 ${pingBg}"></span>
        <span class="relative inline-flex items-center justify-center rounded-full h-7 w-7 border-2 ${borderRing} ${colorBg} text-[10px] font-mono font-bold text-white shadow-lg" style="box-shadow: 0 0 14px ${glowColor}">
          ${score}
        </span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

const createLiveEventMarkerIcon = () => {
  return L.divIcon({
    className: 'custom-live-event-marker',
    html: `
      <div class="relative flex items-center justify-center cursor-pointer group" style="width: 30px; height: 30px;">
        <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full opacity-75 bg-red-400"></span>
        <span class="relative inline-flex items-center justify-center rounded-md h-6 w-6 border border-red-300 bg-red-600 text-[11px] font-bold text-white shadow-lg shadow-red-500/50">
          ⚡
        </span>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
};

const createIncidentMarkerIcon = (severity) => {
  let colorClass = 'bg-emerald-600 border-emerald-300';
  if (severity === 'Critical') {
    colorClass = 'bg-red-600 border-red-300';
  } else if (severity === 'High') {
    colorClass = 'bg-orange-500 border-orange-300';
  } else if (severity === 'Medium') {
    colorClass = 'bg-amber-500 border-amber-300';
  }

  return L.divIcon({
    className: 'custom-incident-marker',
    html: `
      <div class="relative flex items-center justify-center cursor-pointer" style="width: 26px; height: 26px;">
        <span class="relative inline-flex items-center justify-center h-5 w-5 rotate-45 rounded-sm border ${colorClass} shadow-md">
          <span class="-rotate-45 text-[9px] font-mono font-bold text-white">!</span>
        </span>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
};

export default function WorldMap({
  liveEvents = [],
  incidents = [],
  countryProfiles = [],
  onSelectCountryProfile,
}) {
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [activeLocation, setActiveLocation] = useState(null);

  const profileMap = new Map(
    (countryProfiles || []).map((p) => [p.country.toLowerCase(), p])
  );

  const availableCountries = Array.from(
    new Set([
      ...sampleLocations.map((l) => l.country),
      ...(incidents || []).map((i) => i.country).filter(Boolean),
    ])
  ).sort();

  // Filter valid live events with real coordinates
  const validLiveEvents = (liveEvents || []).filter(
    (ev) =>
      Array.isArray(ev.coordinates) &&
      ev.coordinates.length === 2 &&
      !isNaN(ev.coordinates[0]) &&
      !isNaN(ev.coordinates[1])
  );

  // Filter persisted incidents with valid numeric coordinates + country/severity filters
  const validIncidents = (incidents || []).filter(
    (inc) =>
      typeof inc.latitude === 'number' &&
      typeof inc.longitude === 'number' &&
      !Number.isNaN(inc.latitude) &&
      !Number.isNaN(inc.longitude) &&
      (selectedCountry === 'ALL' || inc.country === selectedCountry) &&
      (selectedSeverity === 'ALL' || inc.severity === selectedSeverity)
  );

  // Filter locations according to user selection
  const filteredLocations = sampleLocations.filter((loc) => {
    const matchRisk = selectedFilter === 'ALL' || loc.riskClassification === selectedFilter;
    const matchCountry = selectedCountry === 'ALL' || loc.country === selectedCountry;
    return matchRisk && matchCountry;
  });

  // Calculate counts for filters
  const counts = {
    ALL: sampleLocations.length,
    HIGH: sampleLocations.filter((l) => l.riskClassification === RISK_LEVELS.HIGH).length,
    MEDIUM: sampleLocations.filter((l) => l.riskClassification === RISK_LEVELS.MEDIUM).length,
    LOW: sampleLocations.filter((l) => l.riskClassification === RISK_LEVELS.LOW).length,
  };

  return (
    <div className="flex flex-col rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 shadow-2xl backdrop-blur-sm overflow-hidden">
      {/* 7. MAP HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-navy-700/60 px-6 py-4 bg-navy-900/70">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold tracking-wide text-white uppercase font-sans">
                GLOBAL RISK MONITORING
              </h3>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
                LIVE GIS
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Geospatial multi-theatre threat telemetry & operational risk indices
            </p>
          </div>
        </div>

        {/* Demo Data Watermark Badge */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-mono font-medium text-amber-300">
            <Info className="h-3.5 w-3.5" />
            <span>DEMO DATA • SIMULATED METRICS</span>
          </span>
        </div>
      </div>

      {/* 8. FILTER SECTION & 6. RISK LEGEND */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-navy-800 bg-navy-950/40">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-medium mr-1 flex items-center gap-1 text-[11px] uppercase tracking-wider">
            <Filter className="h-3 w-3 text-cyan-400" /> Filter:
          </span>

          {/* All Countries */}
          <button
            onClick={() => setSelectedFilter('ALL')}
            className={`rounded-lg px-3 py-1.5 font-medium transition-all text-xs flex items-center gap-1.5 ${
              selectedFilter === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/80 border border-transparent'
            }`}
          >
            <span>All Countries</span>
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
              {counts.ALL}
            </span>
          </button>

          {/* High Risk Filter */}
          <button
            onClick={() => setSelectedFilter(RISK_LEVELS.HIGH)}
            className={`rounded-lg px-3 py-1.5 font-medium transition-all text-xs flex items-center gap-1.5 ${
              selectedFilter === RISK_LEVELS.HIGH
                ? 'bg-red-500/20 text-red-300 border border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/80 border border-transparent'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span>High Risk</span>
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
              {counts.HIGH}
            </span>
          </button>

          {/* Medium Risk Filter */}
          <button
            onClick={() => setSelectedFilter(RISK_LEVELS.MEDIUM)}
            className={`rounded-lg px-3 py-1.5 font-medium transition-all text-xs flex items-center gap-1.5 ${
              selectedFilter === RISK_LEVELS.MEDIUM
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/80 border border-transparent'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span>Medium Risk</span>
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
              {counts.MEDIUM}
            </span>
          </button>

          {/* Low Risk Filter */}
          <button
            onClick={() => setSelectedFilter(RISK_LEVELS.LOW)}
            className={`rounded-lg px-3 py-1.5 font-medium transition-all text-xs flex items-center gap-1.5 ${
              selectedFilter === RISK_LEVELS.LOW
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/80 border border-transparent'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Low Risk</span>
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
              {counts.LOW}
            </span>
          </button>

          {/* Country & Incident Severity Filters (Phase 10) */}
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            aria-label="Filter map by country"
          >
            <option value="ALL">All Countries</option>
            {availableCountries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            aria-label="Filter incidents by severity"
          >
            <option value="ALL">All Incident Severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        {/* 6. RISK LEGEND */}
        <div className="flex items-center gap-4 text-xs font-mono bg-navy-900/80 px-3 py-1.5 rounded-lg border border-navy-700/60">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Legend:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
            <span className="text-slate-300 text-[11px]">High Risk</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shadow-[0_0_6px_#f97316]" />
            <span className="text-slate-300 text-[11px]">Medium Risk</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
            <span className="text-slate-300 text-[11px]">Low Risk</span>
          </div>
        </div>
      </div>

      {/* 2. & 9. INTERACTIVE WORLD MAP CONTAINER */}
      <div className="relative w-full h-[460px] md:h-[520px] bg-navy-950 overflow-hidden">
        <MapContainer
          center={[24.0, 15.0]}
          zoom={2}
          minZoom={2}
          maxZoom={10}
          zoomControl={true}
          scrollWheelZoom={true}
          dragging={true}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
        >
          <MapController />

          {/* CartoDB Dark Matter / OpenStreetMap Dark Tile Layer */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            maxZoom={19}
            subdomains="abcd"
          />

          {/* 3. & 4. & 5. SAMPLE MONITORING MARKERS & POPUPS */}
          {filteredLocations.map((loc) => {
            const icon = createCustomMarkerIcon(loc.riskClassification, loc.riskScore);

            return (
              <Marker
                key={loc.id}
                position={loc.coordinates}
                icon={icon}
                eventHandlers={{
                  click: () => setActiveLocation(loc),
                }}
              >
                {/* 5. POPUP WITH ALL DETAILS */}
                <Popup maxWidth={340} minWidth={280}>
                  <div className="p-4 bg-navy-900 text-slate-100 rounded-xl space-y-3 font-sans">
                    {/* Header: Country & Classification Badge */}
                    <div className="flex items-start justify-between gap-2 border-b border-navy-700/80 pb-2.5">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-cyan-400 shrink-0" />
                          <h4 className="font-bold text-white text-base leading-tight">
                            {loc.country}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-400 pl-5">
                          {loc.city} • <span className="text-cyan-400">{loc.region}</span>
                        </p>
                      </div>

                      {/* Classification Badge */}
                      <span
                        className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          loc.riskClassification === RISK_LEVELS.HIGH
                            ? 'bg-red-500/20 text-red-400 border-red-500/40'
                            : loc.riskClassification === RISK_LEVELS.MEDIUM
                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        }`}
                      >
                        {loc.riskClassification}
                      </span>
                    </div>

                    {/* Risk Score Progress Bar */}
                    <div className="rounded-lg bg-navy-950/80 border border-navy-800 p-2.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">RISK INDEX SCORE</span>
                        <span className="font-bold text-sm text-white">
                          {loc.riskScore}{' '}
                          <span className="text-slate-400 text-xs">/ 100</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-navy-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            loc.riskClassification === RISK_LEVELS.HIGH
                              ? 'bg-gradient-to-r from-orange-500 to-red-500'
                              : loc.riskClassification === RISK_LEVELS.MEDIUM
                              ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                              : 'bg-gradient-to-r from-teal-500 to-emerald-400'
                          }`}
                          style={{ width: `${loc.riskScore}%` }}
                        />
                      </div>
                    </div>

                    {/* Metadata: Category & Timestamp */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-400 text-[11px] font-mono uppercase">
                          Category:
                        </span>
                        <span className="font-medium text-slate-200 text-right">
                          {loc.riskCategory}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-400 font-mono uppercase flex items-center gap-1">
                          <Clock className="h-3 w-3 text-cyan-400" /> Updated:
                        </span>
                        <span className="text-slate-300 font-mono">
                          {loc.lastUpdated}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="rounded-lg bg-navy-950/60 p-2.5 border border-navy-800/80">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {loc.description}
                      </p>
                    </div>

                    {/* Demo Notice */}
                    <div className="pt-1 text-center border-t border-navy-800/80 text-[10px] font-mono text-amber-400/80">
                      ⚠ DEMO DATA • NOT REAL WORLD METRIC
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* LIVE DISASTER & GEOSPATIAL HAZARD MARKERS */}
          {validLiveEvents.map((ev) => {
            const liveIcon = createLiveEventMarkerIcon();
            return (
              <Marker key={ev.id} position={ev.coordinates} icon={liveIcon}>
                <Popup maxWidth={340} minWidth={280}>
                  <div className="p-4 bg-navy-900 text-slate-100 rounded-xl space-y-3 font-sans">
                    <div className="flex items-start justify-between gap-2 border-b border-navy-700/80 pb-2">
                      <div>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-400 bg-red-500/20 px-2 py-0.5 rounded border border-red-500/40">
                          ● LIVE GEOSPATIAL EVENT
                        </span>
                        <h4 className="font-bold text-white text-sm mt-1.5 leading-snug">
                          {ev.title}
                        </h4>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">Category:</span>
                        <span className="font-medium text-slate-200">{ev.category}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">Severity:</span>
                        <span className="text-red-400 font-bold font-mono">{ev.severity || 'High'}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">Status:</span>
                        <span className="text-cyan-300 font-mono">{ev.status || 'Active'}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">Coordinates:</span>
                        <span className="font-mono text-slate-300">
                          {ev.coordinates[0].toFixed(2)}°, {ev.coordinates[1].toFixed(2)}°
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">Source:</span>
                        <span className="font-mono text-cyan-400">{ev.source}</span>
                      </div>
                    </div>

                    {ev.description && (
                      <p className="text-xs text-slate-300 leading-relaxed bg-navy-950/70 p-2 rounded-lg border border-navy-800">
                        {ev.description}
                      </p>
                    )}

                    {ev.url && (
                      <div className="pt-1 text-right">
                        <a
                          href={ev.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-cyan-400 hover:text-cyan-200 font-mono inline-flex items-center gap-1"
                        >
                          NASA Official Record ↗
                        </a>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* STORED INCIDENT MARKERS FROM SQLITE DATABASE */}
          {validIncidents.map((inc) => {
            const incIcon = createIncidentMarkerIcon(inc.severity);
            return (
              <Marker
                key={`inc-${inc.id}`}
                position={[inc.latitude, inc.longitude]}
                icon={incIcon}
              >
                <Popup maxWidth={340} minWidth={270}>
                  <div className="p-4 bg-navy-900 text-slate-100 rounded-xl space-y-3 font-sans">
                    <div className="flex items-start justify-between gap-2 border-b border-navy-700/80 pb-2">
                      <div>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-300 bg-cyan-500/15 px-2 py-0.5 rounded border border-cyan-500/40">
                          {inc.id} • STORED INCIDENT
                        </span>
                        <h4 className="font-bold text-white text-sm mt-1.5 leading-snug">
                          {inc.title}
                        </h4>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">Location:</span>
                        <span className="font-medium text-slate-200">
                          {inc.location}, {inc.country}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">Severity:</span>
                        <span className="text-amber-300 font-bold font-mono">{inc.severity}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">Status:</span>
                        <span className="text-cyan-300 font-mono">{inc.status}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">Assigned Team:</span>
                        <span className="text-slate-200 font-mono">{inc.assignedTeam}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-mono">Coordinates:</span>
                        <span className="font-mono text-slate-300">
                          {inc.latitude.toFixed(2)}°, {inc.longitude.toFixed(2)}°
                        </span>
                      </div>
                    </div>

                    {inc.description && (
                      <p className="text-xs text-slate-300 leading-relaxed bg-navy-950/70 p-2 rounded-lg border border-navy-800">
                        {inc.description}
                      </p>
                    )}

                    {(() => {
                      const profile = profileMap.get((inc.country || '').toLowerCase());
                      return (
                        <div className="pt-2 border-t border-navy-800 flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-400">
                            Country Risk:{' '}
                            <strong className="text-cyan-300">
                              {profile ? `${profile.riskScore}/100 (${profile.classification})` : 'N/A'}
                            </strong>
                          </span>
                          {onSelectCountryProfile && (
                            <button
                              type="button"
                              onClick={() => onSelectCountryProfile(inc.country)}
                              className="text-cyan-400 hover:text-cyan-200 font-bold"
                            >
                              Country Profile →
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Map Quick Status Overlay Indicator */}
        <div className="pointer-events-none absolute bottom-4 left-4 z-[400] flex items-center gap-2 rounded-lg border border-navy-700/80 bg-navy-900/90 px-3 py-1.5 text-[11px] font-mono text-slate-300 backdrop-blur-md shadow-lg">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <span>
            MONITORING SITES: <strong className="text-cyan-400">{filteredLocations.length}</strong> ACTIVE
            {validIncidents.length > 0 && (
              <span className="text-amber-300 ml-2">
                | STORED INCIDENTS: <strong>{validIncidents.length}</strong>
              </span>
            )}
            {validLiveEvents.length > 0 && (
              <span className="text-red-400 ml-2">
                | LIVE HAZARDS: <strong>{validLiveEvents.length}</strong>
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

