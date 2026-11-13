import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import apiService from '../services/apiService';
import {
  Cpu,
  RefreshCw,
  Play,
  Info,
  AlertTriangle,
  Network,
  BarChart3,
  Lightbulb,
  GitCompare,
} from 'lucide-react';

const COMPARE_COLORS = ['#22d3ee', '#34d399', '#f59e0b', '#f87171', '#a78bfa'];

const SEV_STYLES = {
  Critical: 'border-red-500/40 bg-red-500/15 text-red-300',
  High: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  Medium: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  Low: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
};

const VERIFICATION_STYLES = {
  VERIFIED_FACT: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  SOURCED_INDICATOR: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
  ANALYTICAL_ASSESSMENT: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
};

function getCorrelationCellStyle(cell) {
  if (!cell || cell.r === null || cell.insufficientData) {
    return 'bg-navy-950 text-slate-500 border-navy-800';
  }
  if (cell.r >= 0.75) return 'bg-red-500/30 text-red-200 border-red-500/40';
  if (cell.r >= 0.4) return 'bg-orange-500/20 text-orange-200 border-orange-500/30';
  if (cell.r <= -0.4) return 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30';
  return 'bg-navy-900 text-slate-300 border-navy-700/60';
}

export default function AdvancedIntelligenceAnalytics({ canModify = false }) {
  const [overview, setOverview] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [trends, setTrends] = useState(null);
  const [trendFilters, setTrendFilters] = useState({
    granularity: 'monthly',
    country: 'ALL',
    region: 'ALL',
    category: 'ALL',
    severity: 'ALL',
    startDate: '',
    endDate: '',
  });
  const [relTypeFilter, setRelTypeFilter] = useState('ALL');
  const [selectedRelCountry, setSelectedRelCountry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await apiService.getAdvancedAnalyticsOverview();
      setOverview(data);
      setComparison(data.comparison);
      setTrends(data.trends);
      if (selectedCountries.length === 0 && data?.comparison?.comparedCountries) {
        setSelectedCountries(data.comparison.comparedCountries);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load Advanced Intelligence Analytics.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCountries.length]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setError('');
    try {
      await apiService.runAdvancedAnalysis();
      await loadOverview();
    } catch (err) {
      setError(err?.message || 'Failed to execute advanced analytical engine.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleCompareCountry = async (country) => {
    const exists = selectedCountries.includes(country);
    const next = exists
      ? selectedCountries.filter((c) => c !== country)
      : [...selectedCountries, country].slice(0, 5);
    if (next.length === 0) return;
    setSelectedCountries(next);
    try {
      const res = await apiService.getCountryComparison(next);
      setComparison(res);
    } catch (err) {
      setError(err?.message || 'Failed to update country comparison.');
    }
  };

  const handleApplyTrendFilters = async (nextFilters) => {
    setTrendFilters(nextFilters);
    try {
      const res = await apiService.getIntelligenceTrends(nextFilters);
      setTrends(res);
    } catch (err) {
      setError(err?.message || 'Failed to filter intelligence trends.');
    }
  };

  const summary = overview?.summary || {};
  const correlations = overview?.correlations || { countries: [], matrix: [], pairs: [] };
  const anomalies = overview?.anomalies || [];
  const relationships = overview?.relationships || { nodes: [], edges: [] };
  const insights = overview?.insights || [];

  const visibleEdges = (relationships.edges || []).filter((e) => {
    if (relTypeFilter !== 'ALL' && e.relationshipType !== relTypeFilter) return false;
    if (
      selectedRelCountry &&
      e.sourceCountry !== selectedRelCountry &&
      e.targetCountry !== selectedRelCountry
    ) {
      return false;
    }
    return true;
  });

  // Circular layout coordinates for SVG geopolitical network graph
  const nodes = relationships.nodes || [];
  const cx = 210;
  const cy = 140;
  const radius = 105;
  const nodePositions = new Map();
  nodes.forEach((n, idx) => {
    const angle = (2 * Math.PI * idx) / Math.max(nodes.length, 1) - Math.PI / 2;
    nodePositions.set(n.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      ...n,
    });
  });

  const availableCountries = comparison?.availableCountries || correlations.countries || [];
  const availableCategories = Array.from(
    new Set((trends?.categoryTrends || []).map((c) => c.category))
  );
  const availableRegions = Array.from(
    new Set((trends?.regionalMovement || []).map((r) => r.region))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Cpu className="h-6 w-6 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Advanced Intelligence Analytics
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Cross-country Pearson correlations, anomaly detection, geopolitical relationship networks, comparative indicators, and trend analytics.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {canModify && (
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              <span>{isAnalyzing ? 'Analyzing...' : 'Run Analytical Engine'}</span>
            </button>
          )}
          <button
            onClick={loadOverview}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-navy-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Analytical Integrity Disclaimer */}
      <div className="flex items-start gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-200">
        <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
        <span>
          {correlations.correlationNote ||
            'Statistical correlation measures co-movement across recorded observations and does NOT imply causation.'}{' '}
          Verified facts, sourced indicators, and analytical assessments are explicitly labeled across all modules.
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Countries Analyzed</p>
          <p className="mt-2 text-2xl font-bold text-white">{summary.totalCountriesAnalyzed ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Relationships mapped: {summary.totalRelationships ?? 0}</p>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Active Anomalies</p>
          <p className="mt-2 text-2xl font-bold text-amber-300">{summary.activeAnomalies ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Statistical baseline deviations</p>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Significant Correlations</p>
          <p className="mt-2 text-2xl font-bold text-cyan-300">{summary.significantCorrelations ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Cross-country Pearson pairs</p>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Emerging Threat Patterns</p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">{summary.emergingThreatPatterns ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Insights logged: {summary.totalInsights ?? 0}</p>
        </div>
      </div>

      {/* Multi-Country Comparative Intelligence */}
      <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-semibold text-white">Multi-Country Comparative Intelligence</h2>
              <p className="text-xs text-slate-400">Select up to 5 countries to compare indicator dimensions, incidents, and Phase 11 forecasts.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableCountries.map((c) => {
              const active = selectedCountries.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => handleToggleCompareCountry(c)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-navy-950 text-slate-400 border-navy-700 hover:text-white'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={comparison?.radarSeries || []}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="metric" stroke="#94a3b8" fontSize={11} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#64748b" fontSize={10} />
                {(comparison?.comparedCountries || []).map((c, idx) => (
                  <Radar
                    key={c}
                    name={c}
                    dataKey={c}
                    stroke={COMPARE_COLORS[idx % COMPARE_COLORS.length]}
                    fill={COMPARE_COLORS[idx % COMPARE_COLORS.length]}
                    fillOpacity={0.18}
                  />
                ))}
                <Legend />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="lg:col-span-7 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-navy-700/80 text-slate-400 uppercase">
                <tr>
                  <th className="py-2 pr-3">Country</th>
                  <th className="py-2 pr-3">Overall</th>
                  <th className="py-2 pr-3">Political</th>
                  <th className="py-2 pr-3">Economic</th>
                  <th className="py-2 pr-3">Security</th>
                  <th className="py-2 pr-3">Incidents</th>
                  <th className="py-2">Phase 11 Forecast</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/70 text-slate-200">
                {(comparison?.items || []).map((item) => (
                  <tr key={item.country}>
                    <td className="py-2.5 pr-3 font-semibold text-cyan-300">{item.country}</td>
                    <td className="py-2.5 pr-3 font-mono">{item.riskScore}/100</td>
                    <td className="py-2.5 pr-3 font-mono">{item.indicators.political}</td>
                    <td className="py-2.5 pr-3 font-mono">{item.indicators.economic}</td>
                    <td className="py-2.5 pr-3 font-mono">{item.indicators.security}</td>
                    <td className="py-2.5 pr-3 font-mono">{item.activeIncidents}</td>
                    <td className="py-2.5 font-mono text-[11px]">
                      {item.prediction.hasSufficientHistory
                        ? `${item.prediction.direction} -> ${item.prediction.projectedNextScore} (${item.prediction.confidence})`
                        : 'INSUFFICIENT_DATA'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Correlation Heatmap & Geopolitical Relationship Network */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Correlation Matrix */}
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Cross-Country Risk Correlation Heatmap</h2>
            <p className="text-xs text-slate-400">
              Pearson r (-1.0 to +1.0) with sample size (n). Correlation indicates co-movement, not causation.
            </p>
          </div>

          {correlations.countries.length === 0 ? (
            <p className="text-sm text-slate-400">No country correlation data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-center text-[11px] border-collapse">
                <thead>
                  <tr>
                    <th className="p-1.5 text-left text-slate-400">Country</th>
                    {correlations.countries.map((c) => (
                      <th key={c} className="p-1.5 text-slate-300 font-medium truncate max-w-[75px]" title={c}>
                        {c.slice(0, 8)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {correlations.matrix.map((row) => (
                    <tr key={row.country}>
                      <td className="p-1.5 text-left font-semibold text-slate-200 whitespace-nowrap">
                        {row.country}
                      </td>
                      {correlations.countries.map((colCountry) => {
                        const cell = row.correlations[colCountry];
                        return (
                          <td key={colCountry} className="p-0.5">
                            <div
                              title={`${row.country} vs ${colCountry} | r=${cell?.r ?? 'N/A'} | n=${cell?.n ?? 0} | ${cell?.basis}`}
                              className={`rounded border px-1.5 py-1 font-mono ${getCorrelationCellStyle(cell)}`}
                            >
                              {cell?.r !== null && cell?.r !== undefined ? cell.r.toFixed(2) : 'N/A'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Geopolitical Relationship Network */}
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-cyan-400" />
              <h2 className="text-base font-semibold text-white">Geopolitical Relationship Network</h2>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={relTypeFilter}
                onChange={(e) => setRelTypeFilter(e.target.value)}
                className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs text-slate-200"
              >
                <option value="ALL">All Types</option>
                <option value="DIPLOMATIC">Diplomatic</option>
                <option value="TRADE_ECONOMIC">Trade &amp; Economic</option>
                <option value="REGIONAL_COOPERATION">Regional Cooperation</option>
                <option value="TENSION_CONFLICT">Tension / Friction</option>
              </select>
              {selectedRelCountry && (
                <button
                  onClick={() => setSelectedRelCountry(null)}
                  className="rounded-lg border border-navy-700 bg-navy-800 px-2 py-1 text-xs text-cyan-300"
                >
                  Clear: {selectedRelCountry}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-6 flex justify-center bg-navy-950/70 rounded-xl border border-navy-800 p-2">
              <svg viewBox="0 0 420 280" className="w-full max-w-[420px] h-64">
                {visibleEdges.map((edge) => {
                  const s = nodePositions.get(edge.sourceCountry);
                  const t = nodePositions.get(edge.targetCountry);
                  if (!s || !t) return null;
                  const stroke =
                    edge.relationshipType === 'TENSION_CONFLICT'
                      ? '#f87171'
                      : edge.relationshipType === 'TRADE_ECONOMIC'
                      ? '#34d399'
                      : '#22d3ee';
                  return (
                    <line
                      key={edge.id}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke={stroke}
                      strokeOpacity={0.65}
                      strokeWidth={Math.max(1.5, Math.abs(edge.strengthScore) / 28)}
                      strokeDasharray={edge.verificationStatus === 'ANALYTICAL_ASSESSMENT' ? '4 3' : undefined}
                    />
                  );
                })}
                {nodes.map((node) => {
                  const pos = nodePositions.get(node.id);
                  const isSel = selectedRelCountry === node.id;
                  return (
                    <g
                      key={node.id}
                      onClick={() => setSelectedRelCountry(isSel ? null : node.id)}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={isSel ? 17 : 14}
                        fill="#0f172a"
                        stroke={isSel ? '#22d3ee' : '#475569'}
                        strokeWidth={isSel ? 2.5 : 1.5}
                      />
                      <text
                        x={pos.x}
                        y={pos.y + 3}
                        textAnchor="middle"
                        fill="#e2e8f0"
                        fontSize="8"
                        fontWeight="bold"
                      >
                        {node.id.slice(0, 3).toUpperCase()}
                      </text>
                      <text
                        x={pos.x}
                        y={pos.y + 26}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize="8"
                      >
                        {node.id}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="md:col-span-6 space-y-2 max-h-64 overflow-y-auto pr-1">
              {visibleEdges.map((edge) => (
                <div key={edge.id} className="rounded-lg border border-navy-800 bg-navy-950/60 p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">
                      {edge.sourceCountry} ↔ {edge.targetCountry}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border font-mono ${VERIFICATION_STYLES[edge.verificationStatus] || ''}`}>
                      {edge.verificationStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{edge.summary}</p>
                  <p className="text-[10px] font-mono text-slate-500">
                    {edge.relationshipType} | Strength: {edge.strengthScore} | Source: {edge.sourceAttribution}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Intelligence Trend Analysis */}
      <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">Intelligence Trend Analysis</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={trendFilters.granularity}
              onChange={(e) => handleApplyTrendFilters({ ...trendFilters, granularity: e.target.value })}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
            <select
              value={trendFilters.country}
              onChange={(e) => handleApplyTrendFilters({ ...trendFilters, country: e.target.value })}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="ALL">All Countries</option>
              {availableCountries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={trendFilters.region}
              onChange={(e) => handleApplyTrendFilters({ ...trendFilters, region: e.target.value })}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="ALL">All Regions</option>
              {availableRegions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={trendFilters.category}
              onChange={(e) => handleApplyTrendFilters({ ...trendFilters, category: e.target.value })}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="ALL">All Categories</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={trendFilters.severity}
              onChange={(e) => handleApplyTrendFilters({ ...trendFilters, severity: e.target.value })}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="ALL">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends?.timeSeries || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="period" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                <Legend />
                <Line type="monotone" dataKey="totalIncidents" name="Total Incidents" stroke="#22d3ee" strokeWidth={2} />
                <Line type="monotone" dataKey="criticalIncidents" name="Critical" stroke="#f87171" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends?.regionalMovement || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="region" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                <Legend />
                <Bar dataKey="incidents" name="Regional Incidents" fill="#34d399" radius={[6, 6, 0, 0]} />
                <Bar dataKey="critical" name="Critical" fill="#f87171" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Threat Pattern & Anomaly Detection + Analytical Insights */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-semibold text-white">Threat Pattern &amp; Anomaly Detection</h2>
          </div>

          {anomalies.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">
              No anomalies persisted yet. Run the Analytical Engine to evaluate statistical baselines.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {anomalies.map((anom) => (
                <div key={anom.id} className="rounded-lg border border-navy-700/70 bg-navy-950/60 p-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${SEV_STYLES[anom.severity] || ''}`}>
                      {anom.severity}
                    </span>
                    <span className="text-xs font-semibold text-cyan-300">{anom.country}</span>
                    <span className="text-[11px] font-mono text-slate-400">{anom.anomalyType}</span>
                    <span className="text-[11px] font-mono text-emerald-300">Confidence: {anom.confidence}</span>
                  </div>
                  <p className="text-xs text-slate-300">{anom.explanation}</p>
                  <p className="text-[10px] font-mono text-slate-500">
                    Incidents: {anom.linkedIncidentIds.join(', ') || 'None'} | Warnings: {anom.linkedWarningIds.join(', ') || 'None'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">Analytical Insights</h2>
          </div>

          {insights.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">
              No analytical insights generated yet. Run the Analytical Engine to synthesize evidence-backed insights.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {insights.map((ins) => (
                <div key={ins.id} className="rounded-lg border border-navy-700/70 bg-navy-950/60 p-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">{ins.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                      {ins.confidence}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{ins.description}</p>
                  <p className="text-[10px] font-mono text-slate-500">
                    Countries: {ins.relevantCountries.join(', ')} | Period: {ins.timePeriod} | Sources: {ins.dataSources}
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

