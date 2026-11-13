import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Filter,
  Play,
  Radio,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sliders,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  Cell,
} from 'recharts';
import apiService from '../services/apiService';

const SEVERITY_COLORS = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#38bdf8',
};

const SEVERITY_BADGE = {
  Critical: 'bg-red-500/15 text-red-400 border-red-500/40',
  High: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  Medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
  Low: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
};

const STATUS_BADGE = {
  NEW: 'bg-red-500/15 text-red-300 border-red-500/40',
  ACKNOWLEDGED: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  INVESTIGATING: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  DISMISSED: 'bg-slate-700/60 text-slate-300 border-slate-600',
};

const SOURCE_MODULE_TO_TAB = {
  incidents: 'incidents',
  countries: 'countries',
  predictive: 'predictive',
  decisions: 'decisions',
  analytics: 'analytics',
  geospatial: 'geospatial',
  'ai-assistant': 'ai-assistant',
};

function formatTime(iso) {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function RealTimeMonitoring({
  canModify = false,
  isAdmin = false,
  sseStatus = 'connected',
  latestAlertEvent = null,
  onNavigateTab = null,
}) {
  const [overview, setOverview] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  // Filters & pagination
  const [severityFilter, setSeverityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [pageOffset, setPageOffset] = useState(0);
  const pageLimit = 12;

  // Sub-views & Modal
  const [activeSubTab, setActiveSubTab] = useState('feed'); // 'feed' | 'config'
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [intervalInput, setIntervalInput] = useState(60);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const [ov, al, cat, st] = await Promise.all([
        apiService.getMonitoringOverview(),
        apiService.getMonitoringAlerts({
          severity: severityFilter || undefined,
          alertType: typeFilter || undefined,
          status: statusFilter || undefined,
          countryId: countryFilter.trim() || undefined,
          limit: pageLimit,
          offset: pageOffset,
        }),
        apiService.getMonitoringCategories(),
        apiService.getMonitoringSettings(),
      ]);
      setOverview(ov);
      setAlerts(al.alerts || []);
      setTotalAlerts(al.total || 0);
      setCategories(cat.categories || []);
      setSettings(st.settings || null);
      if (st.settings?.intervalSeconds) {
        setIntervalInput(st.settings.intervalSeconds);
      }
    } catch (err) {
      setError(err.message || 'Failed to load monitoring data.');
    } finally {
      setLoading(false);
    }
  }, [severityFilter, typeFilter, statusFilter, countryFilter, pageOffset]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Refresh immediately when an SSE intelligence_alert event arrives
  useEffect(() => {
    if (latestAlertEvent) {
      loadAll();
    }
  }, [latestAlertEvent, loadAll]);

  const handleEvaluateNow = async () => {
    setEvaluating(true);
    setActionMsg('');
    setError('');
    try {
      const res = await apiService.evaluateMonitoring();
      setActionMsg(
        res.skipped
          ? 'Evaluation skipped: another evaluation cycle is currently running.'
          : `Evaluation complete: ${res.createdCount || 0} new intelligence alert(s) generated.`
      );
      await loadAll();
    } catch (err) {
      setError(err.message || 'Evaluation failed.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleStatusChange = async (alertId, nextStatus) => {
    setError('');
    try {
      const res = await apiService.updateMonitoringAlertStatus(alertId, nextStatus);
      if (selectedAlert && selectedAlert.id === alertId) {
        setSelectedAlert(res.alert);
      }
      setActionMsg(`Alert #${alertId} marked as ${nextStatus}.`);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to update alert status.');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSavingSettings(true);
    setError('');
    try {
      const res = await apiService.updateMonitoringSettings({
        intervalSeconds: Number(intervalInput),
        enabled: settings?.enabled !== false,
      });
      setSettings(res.settings);
      setActionMsg('Monitoring interval & global settings saved.');
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to save monitoring settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleGlobalEnabled = async () => {
    if (!isAdmin || !settings) return;
    setError('');
    try {
      const res = await apiService.updateMonitoringSettings({
        enabled: !settings.enabled,
      });
      setSettings(res.settings);
      setActionMsg(`Global monitoring ${res.settings.enabled ? 'enabled' : 'paused'}.`);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to toggle monitoring.');
    }
  };

  const handleUpdateCategory = async (catId, patch) => {
    if (!isAdmin) return;
    setError('');
    try {
      await apiService.updateMonitoringCategory(catId, patch);
      setActionMsg(`Updated category ${catId}.`);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to update category.');
    }
  };

  const health = overview?.health || {};
  const summary = overview?.summary || {};
  const charts = overview?.charts || {};

  const sseBadge =
    sseStatus === 'connected'
      ? { label: 'SSE Connected', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' }
      : sseStatus === 'reconnecting'
      ? { label: 'SSE Reconnecting', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40' }
      : { label: 'SSE Disconnected', cls: 'bg-red-500/15 text-red-400 border-red-500/40' };

  return (
    <div className="space-y-6">
      {/* Header & Engine Status Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <Radio className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">
              Real-Time Intelligence Monitoring & Alert System
            </h2>
            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${sseBadge.cls}`}>
              {sseBadge.label}
            </span>
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                health.isRunning
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-700 text-slate-300 border-slate-600'
              }`}
            >
              Engine: {health.isRunning ? 'ACTIVE' : 'STOPPED'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Last Evaluated: {formatTime(health.lastEvaluatedAt)}
            </span>
            <span>Interval: {health.intervalSeconds ?? 60}s</span>
            <span>Active SSE Clients: {health.activeSseConnections ?? 0}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setActiveSubTab(activeSubTab === 'feed' ? 'config' : 'feed')}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            {activeSubTab === 'feed' ? 'Categories & Settings' : 'Back to Alert Feed'}
          </button>

          <button
            onClick={loadAll}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>

          {canModify && (
            <button
              onClick={handleEvaluateNow}
              disabled={evaluating}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition"
            >
              <Play className="w-3.5 h-3.5" />
              {evaluating ? 'Evaluating...' : 'Evaluate Now'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-500/40 text-red-300 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionMsg && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-lg text-xs flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg('')} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Alerts', value: summary.totalAlerts ?? 0, color: 'text-white', icon: Bell },
          { label: 'New Alerts', value: summary.newAlerts ?? 0, color: 'text-red-400', icon: AlertTriangle },
          { label: 'Critical', value: summary.criticalAlerts ?? 0, color: 'text-orange-400', icon: ShieldAlert },
          { label: 'Acknowledged', value: summary.acknowledgedAlerts ?? 0, color: 'text-amber-400', icon: Eye },
          { label: 'Investigating', value: summary.investigatingAlerts ?? 0, color: 'text-cyan-400', icon: Activity },
          { label: 'Resolved', value: summary.resolvedAlerts ?? 0, color: 'text-emerald-400', icon: CheckCircle2 },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">{kpi.label}</p>
                <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
              <Icon className={`w-5 h-5 ${kpi.color} opacity-75`} />
            </div>
          );
        })}
      </div>

      {activeSubTab === 'config' ? (
        /* Monitoring Configuration & Categories Panel */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Engine Settings</h3>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-xs text-slate-300">Global Monitoring</span>
              <button
                onClick={handleToggleGlobalEnabled}
                disabled={!isAdmin}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                  settings?.enabled
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'}`}
              >
                {settings?.enabled ? 'ENABLED' : 'PAUSED'}
              </button>
            </div>
            <form onSubmit={handleSaveSettings} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Evaluation Interval (seconds, 10–3600)
                </label>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  disabled={!isAdmin}
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                />
              </div>
              {isAdmin ? (
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition"
                >
                  {savingSettings ? 'Saving...' : 'Save Engine Settings'}
                </button>
              ) : (
                <p className="text-[11px] text-slate-500">ADMIN role required to modify engine settings.</p>
              )}
            </form>
          </div>

          <div className="lg:col-span-2 bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Monitoring Categories ({categories.length})
              </h3>
              {!isAdmin && <span className="text-[11px] text-slate-500">Read-only (ADMIN to edit)</span>}
            </div>
            <div className="divide-y divide-slate-800">
              {categories.map((cat) => (
                <div key={cat.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{cat.name}</p>
                    <p className="text-xs text-slate-400">{cat.description}</p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <select
                      disabled={!isAdmin}
                      value={cat.minSeverity}
                      onChange={(e) => handleUpdateCategory(cat.id, { minSeverity: e.target.value })}
                      className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 disabled:opacity-60"
                    >
                      <option value="Low">Min: Low</option>
                      <option value="Medium">Min: Medium</option>
                      <option value="High">Min: High</option>
                      <option value="Critical">Min: Critical</option>
                    </select>
                    <button
                      disabled={!isAdmin}
                      onClick={() => handleUpdateCategory(cat.id, { enabled: !cat.enabled })}
                      className={`px-3 py-1 rounded-md text-xs font-semibold border transition ${
                        cat.enabled
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {cat.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                Alerts by Severity
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.bySeverity || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="severity" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {(charts.bySeverity || []).map((entry) => (
                        <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] || '#38bdf8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                Alert Volume Trend
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={charts.trends || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                Alerts by Category
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.byCategory || []} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <YAxis dataKey="category" type="category" stroke="#94a3b8" fontSize={10} width={140} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                Top Countries by Alert Count
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.byCountry || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="country" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Filter Bar & Live Alerts Feed */}
          <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Live Intelligence Alerts ({totalAlerts})
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={severityFilter}
                  onChange={(e) => {
                    setSeverityFilter(e.target.value);
                    setPageOffset(0);
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="">All Severities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPageOffset(0);
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="">All Statuses</option>
                  <option value="NEW">NEW</option>
                  <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                  <option value="INVESTIGATING">INVESTIGATING</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="DISMISSED">DISMISSED</option>
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPageOffset(0);
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Country (e.g. UKR)"
                  value={countryFilter}
                  onChange={(e) => {
                    setCountryFilter(e.target.value);
                    setPageOffset(0);
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 w-36"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-10 text-center text-sm text-slate-400">Loading real-time alerts...</div>
            ) : alerts.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                No intelligence alerts match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400">
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3">Alert</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Country</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Created</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-xs">
                    {alerts.map((alert) => (
                      <tr key={alert.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full border font-semibold ${
                              SEVERITY_BADGE[alert.severity] || SEVERITY_BADGE.Low
                            }`}
                          >
                            {alert.severity}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-white">{alert.title}</p>
                          <p className="text-slate-400 line-clamp-1 max-w-md">{alert.description}</p>
                        </td>
                        <td className="py-3 px-3 text-slate-300 font-mono text-[11px]">{alert.alertType}</td>
                        <td className="py-3 px-3 text-slate-300">{alert.countryId || 'Global'}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full border font-semibold ${
                              STATUS_BADGE[alert.status] || STATUS_BADGE.NEW
                            }`}
                          >
                            {alert.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{formatTime(alert.createdAt)}</td>
                        <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                          <button
                            onClick={() => setSelectedAlert(alert)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                          >
                            Inspect
                          </button>
                          {canModify && alert.status === 'NEW' && (
                            <button
                              onClick={() => handleStatusChange(alert.id, 'ACKNOWLEDGED')}
                              className="px-2.5 py-1 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40"
                            >
                              Ack
                            </button>
                          )}
                          {canModify && (alert.status === 'NEW' || alert.status === 'ACKNOWLEDGED') && (
                            <button
                              onClick={() => handleStatusChange(alert.id, 'INVESTIGATING')}
                              className="px-2.5 py-1 rounded bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40"
                            >
                              Investigate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalAlerts > pageLimit && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
                <span>
                  Showing {pageOffset + 1}–{Math.min(pageOffset + pageLimit, totalAlerts)} of {totalAlerts}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={pageOffset === 0}
                    onClick={() => setPageOffset(Math.max(0, pageOffset - pageLimit))}
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
                  >
                    Previous
                  </button>
                  <button
                    disabled={pageOffset + pageLimit >= totalAlerts}
                    onClick={() => setPageOffset(pageOffset + pageLimit)}
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Alert Details & Investigation Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2.5 py-0.5 text-xs rounded-full border font-semibold ${
                      SEVERITY_BADGE[selectedAlert.severity] || SEVERITY_BADGE.Low
                    }`}
                  >
                    {selectedAlert.severity}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 text-xs rounded-full border font-semibold ${
                      STATUS_BADGE[selectedAlert.status] || STATUS_BADGE.NEW
                    }`}
                  >
                    {selectedAlert.status}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{selectedAlert.alertType}</span>
                </div>
                <h3 className="text-lg font-bold text-white mt-2">{selectedAlert.title}</h3>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">{selectedAlert.description}</p>

            <div className="grid grid-cols-2 gap-3 bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs">
              <div>
                <span className="text-slate-500">Country:</span>{' '}
                <span className="text-slate-200 font-semibold">{selectedAlert.countryId || 'Global'}</span>
              </div>
              <div>
                <span className="text-slate-500">Source Module:</span>{' '}
                <span className="text-slate-200 font-semibold">{selectedAlert.sourceModule}</span>
              </div>
              <div>
                <span className="text-slate-500">Created:</span>{' '}
                <span className="text-slate-200">{formatTime(selectedAlert.createdAt)}</span>
              </div>
              <div>
                <span className="text-slate-500">Acknowledged By:</span>{' '}
                <span className="text-slate-200">{selectedAlert.acknowledgedBy || '—'}</span>
              </div>
            </div>

            {(selectedAlert.evidence || selectedAlert.metadata) &&
              Object.keys(selectedAlert.evidence || selectedAlert.metadata).length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Supporting Evidence & Metadata
                </h4>
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-cyan-300 overflow-x-auto">
                  {JSON.stringify(selectedAlert.evidence || selectedAlert.metadata, null, 2)}
                </pre>
              </div>
            )}

            {selectedAlert.statusHistory && selectedAlert.statusHistory.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Status History
                </h4>
                <div className="space-y-1.5">
                  {selectedAlert.statusHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-1.5"
                    >
                      <span className="font-semibold text-slate-200">{item.status}</span>
                      <span className="text-slate-400">
                        {item.actor} • {formatTime(item.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                {canModify && (
                  <>
                    <button
                      onClick={() => handleStatusChange(selectedAlert.id, 'ACKNOWLEDGED')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40"
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => handleStatusChange(selectedAlert.id, 'INVESTIGATING')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40"
                    >
                      Investigate
                    </button>
                    <button
                      onClick={() => handleStatusChange(selectedAlert.id, 'RESOLVED')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40"
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => handleStatusChange(selectedAlert.id, 'DISMISSED')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600"
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </div>

              {onNavigateTab && SOURCE_MODULE_TO_TAB[selectedAlert.sourceModule] && (
                <button
                  onClick={() => {
                    onNavigateTab(SOURCE_MODULE_TO_TAB[selectedAlert.sourceModule]);
                    setSelectedAlert(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open {selectedAlert.sourceModule}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
