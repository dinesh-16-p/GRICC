import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  monthlyRiskTrend,
  countryRiskComparison,
  initialCategoryAnalysis,
  initialRiskDistribution,
  initialStatusAnalysis,
  rawAnalyticsIncidents,
} from '../data/analyticsData';
import {
  Activity,
  AlertOctagon,
  ShieldCheck,
  Globe2,
  TrendingUp,
  Filter,
  RefreshCw,
  Info,
  Layers,
  BarChart3,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

// Custom Dark Navy Recharts Tooltip
const CustomChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-navy-700/90 bg-navy-900/95 p-3 shadow-2xl backdrop-blur-md text-xs font-mono">
        <p className="font-bold text-slate-100 mb-1 border-b border-navy-800 pb-1">
          {label}
        </p>
        {payload.map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4 py-0.5"
            style={{ color: item.color || '#22d3ee' }}
          >
            <span className="flex items-center gap-1.5 text-slate-300">
              <span
                className="h-2 w-2 rounded-full shadow-[0_0_6px_currentColor]"
                style={{ backgroundColor: item.color || '#22d3ee' }}
              />
              {item.name}:
            </span>
            <span className="font-bold font-mono text-white">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function RiskAnalytics({ incidents = [], stats = null }) {
  // 7. FILTERS: Country, Date Range, Severity
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [selectedDateRange, setSelectedDateRange] = useState('12M'); // 12M, 6M, 30D
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');

  const availableCountries = useMemo(() => {
    const set = new Set(countryRiskComparison.map((c) => c.country));
    incidents.forEach((inc) => {
      if (inc.country) set.add(inc.country);
    });
    return Array.from(set).sort();
  }, [incidents]);

  // Dynamic Filtering Logic (backed by live SQLite incidents when available)
  const filteredData = useMemo(() => {
    const sourceIncidents = incidents.length > 0 ? incidents : rawAnalyticsIncidents;

    // 1. Filter Incidents
    const filteredIncidents = sourceIncidents.filter((inc) => {
      const matchCountry = selectedCountry === 'ALL' || inc.country === selectedCountry;
      const matchSeverity = selectedSeverity === 'ALL' || inc.severity === selectedSeverity;
      return matchCountry && matchSeverity;
    });

    // 2. Dynamic Monthly Trend (Slices by Date Range & Country filter)
    let trend = [...monthlyRiskTrend];
    if (selectedDateRange === '6M') {
      trend = trend.slice(-6);
    } else if (selectedDateRange === '30D') {
      trend = trend.slice(-2);
    }

    if (selectedCountry !== 'ALL' || selectedSeverity !== 'ALL') {
      const factor = selectedCountry !== 'ALL' ? 0.35 : 0.6;
      trend = trend.map((t) => ({
        ...t,
        score: Math.max(15, Math.round(t.score * (selectedSeverity === 'Critical' ? 1.2 : factor))),
        incidents: Math.max(2, Math.round(t.incidents * factor)),
        critical: Math.max(1, Math.round(t.critical * factor)),
      }));
    }

    // 3. Dynamic Country Comparison
    let countries = [...countryRiskComparison];
    if (incidents.length > 0) {
      const severityWeight = { Critical: 90, High: 72, Medium: 48, Low: 25 };
      const byCountry = new Map();
      filteredIncidents.forEach((inc) => {
        if (!inc.country) return;
        const entry = byCountry.get(inc.country) || { totalScore: 0, count: 0 };
        entry.totalScore += severityWeight[inc.severity] || 40;
        entry.count += 1;
        byCountry.set(inc.country, entry);
      });
      if (byCountry.size > 0) {
        countries = Array.from(byCountry.entries())
          .map(([country, data]) => ({
            country,
            score: Math.round(data.totalScore / data.count),
            incidents: data.count,
          }))
          .sort((a, b) => b.score - a.score);
      }
    } else {
      if (selectedCountry !== 'ALL') {
        countries = countries.filter((c) => c.country === selectedCountry);
      }
      if (selectedSeverity !== 'ALL') {
        countries = countries.map((c) => ({
          ...c,
          score: selectedSeverity === 'Critical' ? Math.min(95, c.score + 15) : c.score,
        }));
      }
    }

    // 4. Dynamic Risk Distribution (Donut)
    const distribution = initialRiskDistribution.map((d) => ({
      ...d,
      value: filteredIncidents.filter((i) => i.severity === d.name).length,
    }));

    // 5. Dynamic Incident Category Analysis
    const categories = initialCategoryAnalysis.map((c) => {
      const key = c.category.toLowerCase().split(' ')[0];
      const count = filteredIncidents.filter((i) =>
        (i.category || '').toLowerCase().includes(key)
      ).length;
      return { ...c, count };
    });

    // 6. Dynamic Status Analysis
    const statuses = initialStatusAnalysis.map((s) => ({
      ...s,
      count: filteredIncidents.filter((i) => i.status === s.status).length,
    }));

    // 7. KEY RISK INDICATORS
    const isUnfiltered = selectedCountry === 'ALL' && selectedSeverity === 'ALL';
    const totalIncidents =
      isUnfiltered && stats ? stats.totalIncidents : filteredIncidents.length;
    const criticalIncidents =
      isUnfiltered && stats
        ? stats.criticalIncidents
        : filteredIncidents.filter((i) => i.severity === 'Critical').length;
    const highRiskCountries =
      isUnfiltered && stats
        ? stats.highRiskCountries
        : new Set(
            filteredIncidents
              .filter((i) => i.severity === 'Critical' || i.severity === 'High')
              .map((i) => i.country)
          ).size;
    const resolvedIncidents =
      isUnfiltered && stats
        ? stats.resolvedIncidents
        : filteredIncidents.filter((i) => i.status === 'Resolved').length;
    const avgScore =
      countries.length > 0
        ? (countries.reduce((acc, c) => acc + c.score, 0) / countries.length).toFixed(1)
        : '0.0';

    return {
      trend,
      countries,
      distribution,
      categories,
      statuses,
      kpis: {
        totalIncidents,
        criticalIncidents,
        highRiskCountries,
        resolvedIncidents,
        avgScore,
      },
    };
  }, [incidents, stats, selectedCountry, selectedDateRange, selectedSeverity]);

  const resetFilters = () => {
    setSelectedCountry('ALL');
    setSelectedDateRange('12M');
    setSelectedSeverity('ALL');
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-navy-700/60 bg-gradient-to-r from-navy-850 to-navy-900/90 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white uppercase font-sans">
                Risk Analytics & Intelligence Dashboard
              </h2>
              <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
                PHASE 5 ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Comprehensive telemetry, longitudinal risk trends & multi-theatre incident distribution
            </p>
          </div>
        </div>

        {/* Demo Data Tag */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-mono font-medium text-amber-300">
            <Info className="h-3.5 w-3.5" />
            <span>DEMO DATA • SIMULATED ANALYTICS</span>
          </span>
        </div>
      </div>

      {/* 7. FILTERS BAR: Country, Date Range, Severity */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-navy-700/60 bg-navy-900/70 p-4 shadow-lg backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-cyan-400" /> Filters:
          </span>

          {/* Country Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-mono text-[11px]">Country:</span>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            >
              <option value="ALL">All Countries</option>
              {availableCountries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-mono text-[11px]">Date Range:</span>
            <select
              value={selectedDateRange}
              onChange={(e) => setSelectedDateRange(e.target.value)}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            >
              <option value="12M">Last 12 Months</option>
              <option value="6M">Last 6 Months</option>
              <option value="30D">Last 30 Days</option>
            </select>
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-mono text-[11px]">Severity:</span>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            >
              <option value="ALL">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>

        {/* Reset Filter Button */}
        {(selectedCountry !== 'ALL' || selectedDateRange !== '12M' || selectedSeverity !== 'ALL') && (
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-700 bg-navy-800 px-3 py-1.5 text-xs text-cyan-400 hover:text-white hover:bg-navy-750 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* 1. KEY RISK INDICATORS (KRIs) SUMMARY CARDS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Incidents */}
        <div className="relative overflow-hidden rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-4 shadow-lg backdrop-blur-sm hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Total Incidents
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-white">
              {filteredData.kpis.totalIncidents}
            </span>
            <span className="text-[10px] font-mono text-cyan-400">LOGGED</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 truncate">Across filtered scope</p>
        </div>

        {/* Critical Incidents */}
        <div className="relative overflow-hidden rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-4 shadow-lg backdrop-blur-sm hover:border-red-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Critical Incidents
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
              <AlertOctagon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-red-400">
              {filteredData.kpis.criticalIncidents}
            </span>
            <span className="text-[10px] font-mono text-red-400/80">P1 ALERTS</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 truncate">High-priority triage</p>
        </div>

        {/* High-Risk Countries */}
        <div className="relative overflow-hidden rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-4 shadow-lg backdrop-blur-sm hover:border-orange-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              High-Risk Countries
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400">
              <Globe2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-orange-400">
              {filteredData.kpis.highRiskCountries}
            </span>
            <span className="text-[10px] font-mono text-orange-400/80">NATIONS</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 truncate">Score threshold &gt; 50</p>
        </div>

        {/* Resolved Incidents */}
        <div className="relative overflow-hidden rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-4 shadow-lg backdrop-blur-sm hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Resolved Incidents
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-emerald-400">
              {filteredData.kpis.resolvedIncidents}
            </span>
            <span className="text-[10px] font-mono text-emerald-400/80">CONTAINED</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 truncate">Operational closure</p>
        </div>

        {/* Average Risk Score */}
        <div className="relative overflow-hidden rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-4 shadow-lg backdrop-blur-sm hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Avg Risk Score
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-cyan-300">
              {filteredData.kpis.avgScore}
            </span>
            <span className="text-[10px] font-mono text-slate-400">/ 100</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 truncate">Aggregate index rating</p>
        </div>
      </section>

      {/* CHARTS GRID 1: 2. GLOBAL RISK TREND & 3. RISK DISTRIBUTION */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 2. GLOBAL RISK TREND (Line Chart) */}
        <div className="lg:col-span-8 flex flex-col rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-6 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-navy-800 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Global Risk Trend
              </h3>
              <p className="text-[11px] text-slate-400">
                12-month historical longitudinal index tracking & active incident telemetry
              </p>
            </div>
            <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
              TIME-SERIES
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredData.trend} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 100]} />
                <Tooltip content={<CustomChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  iconType="circle"
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="Global Risk Score"
                  stroke="#22d3ee"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#22d3ee', stroke: '#083344', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#67e8f9', stroke: '#ffffff', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="incidents"
                  name="Total Incidents"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. RISK DISTRIBUTION (Donut Chart) */}
        <div className="lg:col-span-4 flex flex-col rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-6 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-navy-800 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Risk Distribution
              </h3>
              <p className="text-[11px] text-slate-400">
                Severity classification ratios
              </p>
            </div>
            <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
              SEVERITY
            </span>
          </div>

          <div className="h-72 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<CustomChartTooltip />} />
                <Pie
                  data={filteredData.distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {filteredData.distribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke="#0f172a"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '5px' }}
                  iconType="circle"
                  layout="horizontal"
                  align="center"
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* CHARTS GRID 2: 4. COUNTRY RISK COMPARISON & 5. INCIDENT CATEGORY ANALYSIS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 4. COUNTRY RISK COMPARISON (Horizontal Bar Chart) */}
        <div className="lg:col-span-6 flex flex-col rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-6 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-navy-800 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Country Risk Comparison
              </h3>
              <p className="text-[11px] text-slate-400">
                Comparative index assessment across monitored geopolitical entities
              </p>
            </div>
            <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
              GEO-RANK
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredData.countries}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 35, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} horizontal={false} />
                <XAxis type="number" stroke="#64748b" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis dataKey="country" type="category" stroke="#64748b" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Bar dataKey="score" name="Risk Index Score" radius={[0, 6, 6, 0]}>
                  {filteredData.countries.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.score >= 70
                          ? '#ef4444'
                          : entry.score >= 45
                          ? '#f97316'
                          : '#10b981'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 5. INCIDENT CATEGORY ANALYSIS */}
        <div className="lg:col-span-6 flex flex-col rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-6 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-navy-800 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Incident Category Analysis
              </h3>
              <p className="text-[11px] text-slate-400">
                Threat distribution by operational category vector
              </p>
            </div>
            <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
              VECTORS
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredData.categories}
                margin={{ top: 10, right: 20, left: -15, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.5} />
                <XAxis
                  dataKey="category"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip content={<CustomChartTooltip />} />
                <Bar dataKey="count" name="Incidents Count" fill="#38bdf8" radius={[6, 6, 0, 0]}>
                  {filteredData.categories.map((entry, index) => (
                    <Cell key={`cat-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* 6. INCIDENT STATUS ANALYSIS */}
      <section className="rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-navy-800 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">
              Incident Status Analysis
            </h3>
            <p className="text-[11px] text-slate-400">
              Pipeline breakdown across Open, Investigating, Contained, and Resolved states
            </p>
          </div>
          <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
            LIFECYCLE
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredData.statuses.map((s) => (
            <div
              key={s.status}
              className="rounded-xl border border-navy-700/80 bg-navy-950/70 p-4 transition-all hover:border-cyan-500/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                  {s.status}
                </span>
                <span
                  className="h-2.5 w-2.5 rounded-full shadow-[0_0_8px_currentColor]"
                  style={{ backgroundColor: s.color }}
                />
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold font-mono text-white">
                  {s.count}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {Math.round((s.count / filteredData.kpis.totalIncidents) * 100)}%
                </span>
              </div>

              <div className="mt-2.5 h-1.5 w-full rounded-full bg-navy-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    backgroundColor: s.color,
                    width: `${Math.round((s.count / filteredData.kpis.totalIncidents) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
