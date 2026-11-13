import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import apiService from '../services/apiService';
import {
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  Check,
  CheckCircle2,
  Info,
  Sliders,
  Activity,
} from 'lucide-react';

const CONFIDENCE_STYLES = {
  HIGH: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  MEDIUM: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
  LOW: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  INSUFFICIENT_DATA: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
};

const SEV_STYLES = {
  Critical: 'border-red-500/40 bg-red-500/15 text-red-300',
  High: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  Medium: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  Low: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
};

export default function PredictiveIntelligence({ canModify = false, isAdmin = false }) {
  const [overview, setOverview] = useState(null);
  const [selectedCountryData, setSelectedCountryData] = useState(null);
  const [warningStatusFilter, setWarningStatusFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiService.getPredictiveOverview();
      setOverview(res);
    } catch (err) {
      setError(err?.message || 'Failed to load predictive intelligence overview.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const openCountryDetail = async (country) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiService.getCountryPrediction(country);
      setSelectedCountryData(res);
    } catch (err) {
      setError(err?.message || 'Failed to load country prediction profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    setError('');
    try {
      await apiService.evaluateEarlyWarnings();
      await loadOverview();
    } catch (err) {
      setError(err?.message || 'Failed to evaluate early-warning rules.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleWarningStatus = async (id, status) => {
    try {
      await apiService.updateEarlyWarningStatus(id, status);
      await loadOverview();
    } catch (err) {
      setError(err?.message || 'Failed to update early-warning status.');
    }
  };

  const handleToggleThreshold = async (thr) => {
    try {
      await apiService.updateEarlyWarningThreshold(thr.id, { enabled: !thr.enabled });
      await loadOverview();
    } catch (err) {
      setError(err?.message || 'Failed to update threshold.');
    }
  };

  // Detailed Country Prediction Profile View
  if (selectedCountryData) {
    const { prediction, warnings = [] } = selectedCountryData;
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-navy-700/60 bg-navy-900/90 p-6 shadow-xl space-y-3">
          <button
            onClick={() => setSelectedCountryData(null)}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>BACK TO PREDICTIVE OVERVIEW</span>
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-white">
                {prediction.country} — Predictive Risk Profile
              </h2>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                {prediction.region} • Snapshots Analyzed: {prediction.snapshotCount}
              </p>
            </div>
            <span
              className={`rounded-md border px-2.5 py-1 text-xs font-mono font-bold uppercase ${
                CONFIDENCE_STYLES[prediction.confidence] || CONFIDENCE_STYLES.INSUFFICIENT_DATA
              }`}
            >
              CONFIDENCE: {prediction.confidence}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Observed Score</div>
            <div className="mt-1 text-2xl font-bold text-white">{prediction.currentScore} / 100</div>
          </div>
          <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Projected Next (T+1)</div>
            <div className="mt-1 text-2xl font-bold text-cyan-300">
              {prediction.projectedNextScore !== null ? `${prediction.projectedNextScore} / 100` : 'N/A'}
            </div>
          </div>
          <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Direction & Rate</div>
            <div className="mt-1 text-2xl font-bold text-amber-300">
              {prediction.direction} ({prediction.rateOfChange >= 0 ? `+${prediction.rateOfChange}` : prediction.rateOfChange})
            </div>
          </div>
          <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Active Incidents</div>
            <div className="mt-1 text-2xl font-bold text-red-400">{prediction.activeIncidents}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase">
            Historical Observations vs. Mathematical Projection
          </h3>
          {prediction.hasSufficientHistory ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={prediction.comparisonSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      fontSize: '12px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="historicalScore"
                    name="Historical Observation"
                    stroke="#22d3ee"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedScore"
                    name="Projected Trajectory"
                    stroke="#f59e0b"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{prediction.insufficientDataReason}</span>
            </div>
          )}

          <p className="text-[11px] font-mono text-slate-400 pt-2 border-t border-navy-800">
            {prediction.methodology}
          </p>
        </div>

        <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase">
            Country Early Warnings ({warnings.length})
          </h3>
          {warnings.length > 0 ? (
            <div className="space-y-2">
              {warnings.map((w) => (
                <div
                  key={w.id}
                  className="rounded-xl border border-navy-800 bg-navy-950/70 p-3 text-xs flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold text-white">{w.title}</div>
                    <div className="text-slate-400 mt-0.5">{w.description}</div>
                  </div>
                  <span className="font-mono text-[10px] uppercase text-cyan-300 shrink-0">
                    {w.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs font-mono text-slate-400">No early warnings recorded for {prediction.country}.</p>
          )}
        </div>
      </div>
    );
  }

  const warnings = (overview?.earlyWarnings || []).filter(
    (w) => warningStatusFilter === 'ALL' || w.status === warningStatusFilter
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-navy-700/60 bg-navy-900/90 p-6 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-400">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white uppercase">
              Predictive Intelligence & Early Warning
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Deterministic trend projections, emerging threat detection & configurable early-warning thresholds
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadOverview}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs font-mono text-cyan-300 hover:bg-navy-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          {canModify && (
            <button
              onClick={handleEvaluate}
              disabled={isEvaluating}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              <Activity className="h-3.5 w-3.5" />
              <span>{isEvaluating ? 'Evaluating...' : 'Evaluate Warnings'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Methodology Disclaimer */}
      {overview?.disclaimer && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-mono text-amber-200">
          <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{overview.disclaimer}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Monitored Countries</div>
          <div className="mt-1 text-2xl font-bold text-white">
            {overview?.summary?.monitoredCountries ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Rising Risk Countries</div>
          <div className="mt-1 text-2xl font-bold text-amber-300">
            {overview?.summary?.risingRiskCountries ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Active Early Warnings</div>
          <div className="mt-1 text-2xl font-bold text-red-400">
            {overview?.summary?.activeWarnings ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/70 p-4">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Emerging Threat Signals</div>
          <div className="mt-1 text-2xl font-bold text-cyan-300">
            {overview?.summary?.emergingThreatSignals ?? 0}
          </div>
        </div>
      </div>

      {/* Global Forecast & Threat Category Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase">
            Global Risk Forecast (Baseline vs. Projected Average)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overview?.globalForecastSeries || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    fontSize: '12px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="historicalAvg"
                  name="Observed Baseline"
                  stroke="#22d3ee"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="projectedAvg"
                  name="Projected Trajectory"
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase">Threat Category Trends</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview?.emergingThreats?.categoryTrends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="category" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="active" name="Active" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total" name="Total" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top 10 Emerging Risk Countries */}
      <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 overflow-hidden shadow-xl">
        <div className="border-b border-navy-800 px-5 py-3.5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase">
            Top 10 Emerging Risk Countries (Click for Prediction Profile)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-navy-800 bg-navy-950/80 font-mono text-[10px] uppercase text-slate-400">
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Observed Score</th>
                <th className="px-4 py-3">Projected (T+1)</th>
                <th className="px-4 py-3">Direction / Rate</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Active Incidents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/80">
              {(overview?.topEmergingCountries || []).map((c) => (
                <tr
                  key={c.country}
                  onClick={() => openCountryDetail(c.country)}
                  className="hover:bg-navy-850/70 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-semibold text-white">{c.country}</td>
                  <td className="px-4 py-3 font-mono text-cyan-300">{c.currentScore}/100</td>
                  <td className="px-4 py-3 font-mono text-amber-300">
                    {c.projectedNextScore !== null ? `${c.projectedNextScore}/100` : 'Insufficient History'}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-200">
                    {c.direction} ({c.rateOfChange >= 0 ? `+${c.rateOfChange}` : c.rateOfChange})
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-mono font-bold ${
                        CONFIDENCE_STYLES[c.confidence] || CONFIDENCE_STYLES.INSUFFICIENT_DATA
                      }`}
                    >
                      {c.confidence}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-300">{c.activeIncidents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Early-Warning Alert Panel & Configurable Thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-800 pb-3">
            <h3 className="text-sm font-bold text-white uppercase flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span>Early-Warning Alert Panel ({warnings.length})</span>
            </h3>
            <select
              value={warningStatusFilter}
              onChange={(e) => setWarningStatusFilter(e.target.value)}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="ALL">All Statuses</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="space-y-2.5 max-h-80 overflow-y-auto">
            {warnings.length > 0 ? (
              warnings.map((w) => (
                <div
                  key={w.id}
                  className="rounded-xl border border-navy-800 bg-navy-950/70 p-3.5 text-xs space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                          SEV_STYLES[w.severity] || SEV_STYLES.Medium
                        }`}
                      >
                        {w.severity}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{w.warningType}</span>
                    </div>
                    <span className="font-mono text-[10px] uppercase text-cyan-300">{w.status}</span>
                  </div>
                  <div className="font-semibold text-white">{w.title}</div>
                  <p className="text-slate-300">{w.description}</p>
                  {canModify && w.status !== 'resolved' && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      {w.status === 'active' && (
                        <button
                          onClick={() => handleWarningStatus(w.id, 'acknowledged')}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-mono text-cyan-300 hover:bg-cyan-500/20"
                        >
                          <Check className="h-3 w-3" />
                          <span>Acknowledge</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleWarningStatus(w.id, 'resolved')}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-300 hover:bg-emerald-500/20"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Resolve</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-xs font-mono text-slate-400">
                No early warnings recorded. Click &quot;Evaluate Warnings&quot; to run threshold checks.
              </p>
            )}
          </div>
        </div>

        {/* Configurable Thresholds */}
        <div className="lg:col-span-4 rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-navy-800 pb-3">
            <h3 className="text-sm font-bold text-white uppercase flex items-center gap-2">
              <Sliders className="h-4 w-4 text-cyan-400" />
              <span>Thresholds</span>
            </h3>
            {!isAdmin && <span className="text-[10px] font-mono text-slate-400">READ ONLY</span>}
          </div>
          <div className="space-y-2.5">
            {(overview?.thresholds || []).map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-navy-800 bg-navy-950/70 p-3 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{t.name}</span>
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => handleToggleThreshold(t)}
                    className={`rounded border px-2 py-0.5 text-[10px] font-mono font-bold disabled:opacity-60 ${
                      t.enabled
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-600 bg-navy-900 text-slate-400'
                    }`}
                  >
                    {t.enabled ? 'ACTIVE' : 'OFF'}
                  </button>
                </div>
                <div className="font-mono text-[11px] text-cyan-300">
                  Value: {t.thresholdValue}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

