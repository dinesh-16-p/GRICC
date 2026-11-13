import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import apiService from '../services/apiService';
import {
  Flag,
  Search,
  ArrowLeft,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  CheckCircle2,
} from 'lucide-react';

const CLASS_STYLES = {
  Critical: 'border-red-500/40 bg-red-500/15 text-red-300',
  High: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  Medium: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  Low: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
};

export default function CountryRiskProfiles({
  initialCountry = null,
  onClearInitialCountry,
  canModify = false,
}) {
  const [countries, setCountries] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [error, setError] = useState('');

  const loadCountries = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiService.getCountries({
        search: searchQuery.trim() || undefined,
        classification: classificationFilter !== 'ALL' ? classificationFilter : undefined,
      });
      setCountries(res?.countries || []);
    } catch (err) {
      setError(err?.message || 'Failed to load country risk profiles.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, classificationFilter]);

  const openCountryProfile = useCallback(async (countryName) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiService.getCountryProfile(countryName);
      if (res?.profile) {
        setSelectedProfile(res.profile);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load country profile.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCountries();
  }, [loadCountries]);

  useEffect(() => {
    if (initialCountry) {
      openCountryProfile(initialCountry);
      if (onClearInitialCountry) onClearInitialCountry();
    }
  }, [initialCountry, openCountryProfile, onClearInitialCountry]);

  const handleRecalculate = async () => {
    if (!selectedProfile) return;
    setIsRecalculating(true);
    try {
      const res = await apiService.recalculateCountryRisk(selectedProfile.country);
      if (res?.profile) {
        setSelectedProfile(res.profile);
        await loadCountries();
      }
    } catch (err) {
      setError(err?.message || 'Failed to recalculate risk snapshot.');
    } finally {
      setIsRecalculating(false);
    }
  };

  if (selectedProfile) {
    const p = selectedProfile;
    return (
      <div className="space-y-6">
        {/* Back & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-navy-700/60 bg-navy-900/90 p-6 shadow-xl">
          <div className="space-y-2">
            <button
              onClick={() => setSelectedProfile(null)}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>BACK TO ALL COUNTRIES</span>
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-white">{p.country}</h2>
              <span
                className={`rounded-md border px-2.5 py-0.5 text-xs font-mono font-bold uppercase ${
                  CLASS_STYLES[p.classification] || CLASS_STYLES.Low
                }`}
              >
                {p.classification} RISK • {p.riskScore}/100
              </span>
              <span className="text-xs font-mono text-slate-400">{p.region}</span>
            </div>
            <p className="text-xs font-mono text-slate-400 flex flex-wrap items-center gap-3">
              <span>
                <Clock className="inline h-3 w-3 mr-1" />
                Last Intelligence Update: {new Date(p.lastIntelligenceUpdate).toLocaleString()}
              </span>
              <span>•</span>
              <span>Calculated: {new Date(p.lastCalculated).toLocaleString()}</span>
            </p>
          </div>

          {canModify && (
            <button
              onClick={handleRecalculate}
              disabled={isRecalculating}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-xs font-mono font-bold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
              <span>{isRecalculating ? 'CALCULATING...' : 'RECORD SNAPSHOT'}</span>
            </button>
          )}
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Calculated Risk Score</div>
            <div className="mt-1 text-2xl font-bold text-white">{p.riskScore} / 100</div>
            <div className="mt-1 text-[11px] font-mono text-slate-400 flex items-center gap-1">
              {p.trendDirection === 'RISING' ? (
                <TrendingUp className="h-3.5 w-3.5 text-red-400" />
              ) : p.trendDirection === 'IMPROVING' ? (
                <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Minus className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span>
                {p.trendDirection} (prev: {p.previousScore}, Δ {p.scoreDelta >= 0 ? `+${p.scoreDelta}` : p.scoreDelta})
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Active Incidents</div>
            <div className="mt-1 text-2xl font-bold text-cyan-300">{p.counts.activeIncidents}</div>
            <div className="mt-1 text-[11px] font-mono text-slate-400">
              {p.counts.resolvedIncidents} resolved / {p.counts.totalIncidents} total
            </div>
          </div>

          <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Critical Alerts</div>
            <div className="mt-1 text-2xl font-bold text-red-400">{p.counts.criticalAlerts}</div>
            <div className="mt-1 text-[11px] font-mono text-slate-400">
              {p.counts.activeAlerts} active alerts total
            </div>
          </div>

          <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Verified External Feeds</div>
            <div className="mt-1 text-2xl font-bold text-emerald-300">
              {p.counts.verifiedExternalAlerts}
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-400">
              {p.counts.internalAlerts} internal / demo alerts
            </div>
          </div>
        </div>

        {/* Transparent Score Explanation & Source Distinction */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
              <Info className="h-4 w-4 text-cyan-400" />
              <span>Risk Score Methodology & Breakdown</span>
            </h3>
            <p className="text-xs text-slate-400">{p.scoreExplanation.methodology}</p>

            <div className="space-y-3">
              {p.scoreExplanation.components.map((comp) => (
                <div key={comp.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-200">{comp.label}</span>
                    <span className="font-mono text-cyan-300">
                      {comp.points} / {comp.maxPoints} pts
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-navy-950 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full"
                      style={{ width: `${Math.round((comp.points / comp.maxPoints) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400">{comp.detail}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3 text-[11px] font-mono text-slate-300 space-y-1">
              <div>
                <strong className="text-cyan-400">Calculated Indicator Source:</strong>{' '}
                {p.dataSources.calculatedIndicatorSource}
              </div>
              <div>
                <strong className="text-emerald-400">External Intelligence Feeds:</strong>{' '}
                {p.dataSources.verifiedExternalSources.length > 0
                  ? p.dataSources.verifiedExternalSources.join(', ')
                  : 'None active for this country'}
              </div>
            </div>
          </div>

          {/* Severity Distribution & Threat Categories */}
          <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">
              Incident Severity Distribution
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={p.severityDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="severity" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" name="Total" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="activeCount" name="Active" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h4 className="text-xs font-mono font-bold text-slate-300 uppercase mb-2">
                Threat Categories
              </h4>
              <div className="flex flex-wrap gap-2">
                {p.threatCategories.length > 0 ? (
                  p.threatCategories.map((cat) => (
                    <span
                      key={cat.category}
                      className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs font-mono text-slate-200"
                    >
                      {cat.category}: <strong className="text-cyan-400">{cat.count}</strong>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">No recorded incident categories.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Historical Incident Trends */}
        <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">
            Historical Incident Trends (SQLite Time Series)
          </h3>
          {p.historicalTrends.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={p.historicalTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      fontSize: '12px',
                    }}
                  />
                  <Line type="monotone" dataKey="total" name="Total Incidents" stroke="#22d3ee" strokeWidth={2} />
                  <Line type="monotone" dataKey="critical" name="Critical" stroke="#ef4444" strokeWidth={2} />
                  <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-slate-400 font-mono py-4">
              No historical incident records for {p.country} yet.
            </p>
          )}
        </div>

        {/* Active Incidents & Critical Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span>Active Incidents ({p.activeIncidentsList.length})</span>
            </h3>
            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {p.activeIncidentsList.length > 0 ? (
                p.activeIncidentsList.map((inc) => (
                  <div
                    key={inc.id}
                    className="rounded-xl border border-navy-800 bg-navy-950/70 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-cyan-400 font-bold">{inc.id}</span>
                      <span className="font-mono text-[11px] text-amber-300">
                        {inc.severity} • {inc.status}
                      </span>
                    </div>
                    <div className="font-semibold text-white">{inc.title}</div>
                    <div className="text-slate-400">{inc.location}</div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> No active incidents.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <span>Critical Alerts ({p.criticalAlertsList.length})</span>
            </h3>
            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {p.criticalAlertsList.length > 0 ? (
                p.criticalAlertsList.map((alt) => (
                  <div
                    key={alt.id}
                    className="rounded-xl border border-navy-800 bg-navy-950/70 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-red-400 font-bold">{alt.id}</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {alt.isLive ? 'EXTERNAL LIVE' : 'INTERNAL DEMO'}
                      </span>
                    </div>
                    <div className="font-semibold text-white">{alt.title}</div>
                    <div className="text-slate-400">{alt.source}</div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 font-mono">No active critical alerts.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-navy-700/60 bg-navy-900/90 p-6 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-400">
            <Flag className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white uppercase">
              Country Risk Intelligence Profiles
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Transparent SQLite-backed country risk scoring, historical incident trends & threat assessments
            </p>
          </div>
        </div>

        <button
          onClick={loadCountries}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs font-mono text-cyan-300 hover:bg-navy-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Profiles</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Search & Classification Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy-700/60 bg-navy-900/70 p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search country or region..."
            className="w-full rounded-xl border border-navy-700 bg-navy-950/80 py-2 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <select
          value={classificationFilter}
          onChange={(e) => setClassificationFilter(e.target.value)}
          className="rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
        >
          <option value="ALL">All Risk Levels</option>
          <option value="Critical">Critical (75–100)</option>
          <option value="High">High (50–74)</option>
          <option value="Medium">Medium (25–49)</option>
          <option value="Low">Low (0–24)</option>
        </select>
      </div>

      {/* Country Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {countries.map((c) => (
          <button
            key={c.country}
            type="button"
            onClick={() => openCountryProfile(c.country)}
            className="text-left rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 hover:border-cyan-500/50 hover:bg-navy-850/80 transition-colors space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white">{c.country}</h3>
                <p className="text-[11px] font-mono text-slate-400">{c.region}</p>
              </div>
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${
                  CLASS_STYLES[c.classification] || CLASS_STYLES.Low
                }`}
              >
                {c.classification} • {c.riskScore}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-navy-800 text-xs font-mono">
              <div>
                <div className="text-[10px] text-slate-400">ACTIVE INC.</div>
                <div className="font-bold text-cyan-300">{c.counts.activeIncidents}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">CRIT. ALERTS</div>
                <div className="font-bold text-red-400">{c.counts.criticalAlerts}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">TREND</div>
                <div className="font-bold text-slate-200">{c.trendDirection}</div>
              </div>
            </div>
          </button>
        ))}

        {countries.length === 0 && !isLoading && (
          <div className="col-span-full py-12 text-center text-xs font-mono text-slate-400">
            No countries match the selected search or risk level.
          </div>
        )}
      </div>
    </div>
  );
}

