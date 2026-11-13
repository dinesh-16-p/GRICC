import React, { useState, useMemo } from 'react';
import AlertCard from './AlertCard';
import { sampleAlerts, ALERT_SEVERITY } from '../data/intelligenceData';
import {
  Radio,
  Search,
  Filter,
  ShieldAlert,
  SlidersHorizontal,
  RefreshCw,
  Info,
  CheckCircle,
} from 'lucide-react';

export default function IntelligenceFeed({
  alerts = sampleAlerts,
  onAcknowledge,
  onResolve,
  canModify = true,
  title = 'Intelligence Feed',
  subtitle = 'Real-time multi-source threat telemetry, advisories & situational alerts',
  compact = false,
}) {
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter alerts by severity and search query (title, country, category)
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // 1. Severity filter
      const matchesSeverity =
        selectedSeverity === 'ALL' || alert.severity === selectedSeverity;

      // 2. Search query filter (title, country, category)
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        alert.title.toLowerCase().includes(query) ||
        alert.country.toLowerCase().includes(query) ||
        alert.category.toLowerCase().includes(query) ||
        alert.region.toLowerCase().includes(query);

      return matchesSeverity && matchesSearch;
    });
  }, [alerts, selectedSeverity, searchQuery]);

  // Counts for each filter button
  const counts = useMemo(() => {
    return {
      ALL: alerts.length,
      [ALERT_SEVERITY.CRITICAL]: alerts.filter(
        (a) => a.severity === ALERT_SEVERITY.CRITICAL
      ).length,
      [ALERT_SEVERITY.HIGH]: alerts.filter(
        (a) => a.severity === ALERT_SEVERITY.HIGH
      ).length,
      [ALERT_SEVERITY.MEDIUM]: alerts.filter(
        (a) => a.severity === ALERT_SEVERITY.MEDIUM
      ).length,
      [ALERT_SEVERITY.LOW]: alerts.filter(
        (a) => a.severity === ALERT_SEVERITY.LOW
      ).length,
    };
  }, [alerts]);

  return (
    <div className="flex flex-col rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 shadow-2xl backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-navy-700/60 px-6 py-4 bg-navy-900/70">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold tracking-wide text-white uppercase font-sans">
                {title}
              </h3>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
                ACTIVE FEED
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">{subtitle}</p>
          </div>
        </div>

        {/* Demo Data Tag */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-mono font-medium text-amber-300">
            <Info className="h-3.5 w-3.5" />
            <span>DEMO DATA • SIMULATED ALERTS</span>
          </span>
        </div>
      </div>

      {/* Controls: Search Bar & Severity Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-6 py-3.5 border-b border-navy-800 bg-navy-950/40">
        {/* Search Input: Search by title, country, category */}
        <div className="relative w-full lg:w-72">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, country, category..."
            className="w-full rounded-xl border border-navy-700/80 bg-navy-950 py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-400 focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-[10px] font-mono text-slate-400 hover:text-white"
            >
              CLEAR
            </button>
          )}
        </div>

        {/* Filters: All, Critical, High, Medium, Low */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-medium mr-1 flex items-center gap-1 text-[11px] uppercase tracking-wider">
            <Filter className="h-3 w-3 text-cyan-400" /> Severity:
          </span>

          {/* All Alerts */}
          <button
            onClick={() => setSelectedSeverity('ALL')}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all text-xs flex items-center gap-1.5 ${
              selectedSeverity === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/80 border border-transparent'
            }`}
          >
            <span>All</span>
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
              {counts.ALL}
            </span>
          </button>

          {/* Critical */}
          <button
            onClick={() => setSelectedSeverity(ALERT_SEVERITY.CRITICAL)}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all text-xs flex items-center gap-1.5 ${
              selectedSeverity === ALERT_SEVERITY.CRITICAL
                ? 'bg-red-500/20 text-red-300 border border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/80 border border-transparent'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span>Critical</span>
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
              {counts[ALERT_SEVERITY.CRITICAL]}
            </span>
          </button>

          {/* High */}
          <button
            onClick={() => setSelectedSeverity(ALERT_SEVERITY.HIGH)}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all text-xs flex items-center gap-1.5 ${
              selectedSeverity === ALERT_SEVERITY.HIGH
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/80 border border-transparent'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span>High</span>
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
              {counts[ALERT_SEVERITY.HIGH]}
            </span>
          </button>

          {/* Medium */}
          <button
            onClick={() => setSelectedSeverity(ALERT_SEVERITY.MEDIUM)}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all text-xs flex items-center gap-1.5 ${
              selectedSeverity === ALERT_SEVERITY.MEDIUM
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/80 border border-transparent'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-yellow-400" />
            <span>Medium</span>
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
              {counts[ALERT_SEVERITY.MEDIUM]}
            </span>
          </button>

          {/* Low */}
          <button
            onClick={() => setSelectedSeverity(ALERT_SEVERITY.LOW)}
            className={`rounded-lg px-2.5 py-1 font-medium transition-all text-xs flex items-center gap-1.5 ${
              selectedSeverity === ALERT_SEVERITY.LOW
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/80 border border-transparent'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Low</span>
            <span className="rounded-full bg-navy-800 px-1.5 py-0.2 text-[10px] font-mono text-slate-300">
              {counts[ALERT_SEVERITY.LOW]}
            </span>
          </button>
        </div>
      </div>

      {/* Alert Cards List Area */}
      <div
        className={`p-6 overflow-y-auto space-y-4 ${
          compact ? 'max-h-[520px]' : 'max-h-[640px]'
        }`}
      >
        {filteredAlerts.length > 0 ? (
          filteredAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={onAcknowledge}
              onResolve={onResolve}
              canModify={canModify}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-navy-700 bg-navy-950/80 text-slate-400 mb-3">
              <ShieldAlert className="h-6 w-6 text-slate-400" />
            </div>
            <h4 className="text-sm font-semibold text-slate-300">
              No matching alerts found
            </h4>
            <p className="mt-1 text-xs text-slate-400 max-w-xs">
              No intelligence advisories match the current severity filter or search parameters.
            </p>
            <button
              onClick={() => {
                setSelectedSeverity('ALL');
                setSearchQuery('');
              }}
              className="mt-3 text-xs text-cyan-400 hover:underline font-mono"
            >
              Reset filters & search
            </button>
          </div>
        )}
      </div>

      {/* Footer / Status bar */}
      <div className="border-t border-navy-800 bg-navy-950/60 px-6 py-2.5 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
          <span>
            DISPATCHED: <strong className="text-white">{filteredAlerts.length}</strong> / {alerts.length} ALERTS
          </span>
        </div>
        <div className="text-slate-400 hidden sm:block">
          STATUS: SIMULATED INGESTION ACTIVE
        </div>
      </div>
    </div>
  );
}
