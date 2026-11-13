import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Radio,
  RefreshCw,
  Server,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import apiService from '../services/apiService';

export default function PerformanceMonitoring({ isAdmin = false }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
    setError('');
    try {
      const res = await apiService.getPerformanceOverview();
      setOverview(res);
    } catch (err) {
      setError(err.message || 'Failed to load performance metrics.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!isAdmin) {
    return (
      <div className="bg-red-950/30 border border-red-500/40 rounded-xl p-8 text-center text-red-300 text-sm">
        Administrator privileges are required to access Performance Monitoring.
      </div>
    );
  }

  const health = overview?.health || {};
  const metrics = overview?.metrics || {};
  const latency = metrics.latency || {};
  const cache = metrics.cache || {};
  const memory = health.memory || {};
  const jobs = metrics.jobs || [];
  const topEndpoints = metrics.topEndpoints || [];
  const trends = metrics.trends || [];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Cpu className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">
              System Performance & Scalability Monitoring
            </h2>
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                health.status === 'HEALTHY'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/40'
              }`}
            >
              {health.status || 'UNKNOWN'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex flex-wrap gap-4">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Uptime: {health.uptimeSeconds ?? 'N/A'}s
            </span>
            <span className="flex items-center gap-1">
              <Database className="w-3.5 h-3.5" /> SQLite Ping: {health.dbPingMs ?? 'N/A'} ms
            </span>
            <span className="flex items-center gap-1">
              <Radio className="w-3.5 h-3.5" /> Active SSE Clients: {health.activeSseConnections ?? 0}
            </span>
          </p>
        </div>
        <button
          onClick={loadData}
          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 self-start lg:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Metrics
        </button>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-500/40 text-red-300 px-4 py-3 rounded-lg text-xs">
          {error}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Avg Latency', value: latency.avgMs != null ? `${latency.avgMs} ms` : 'N/A', color: 'text-cyan-400', icon: Zap },
          { label: 'P95 Latency', value: latency.p95Ms != null ? `${latency.p95Ms} ms` : 'N/A', color: 'text-amber-400', icon: Activity },
          { label: 'API Requests', value: metrics.totalRequests ?? 0, color: 'text-white', icon: Server },
          { label: 'Error Rate', value: metrics.errorRatePercent != null ? `${metrics.errorRatePercent}%` : '0%', color: 'text-red-400', icon: Activity },
          { label: 'Cache Hit Rate', value: cache.hitRatePercent != null ? `${cache.hitRatePercent}%` : 'N/A', color: 'text-emerald-400', icon: Database },
          { label: 'RSS Memory', value: memory.rssMb != null ? `${memory.rssMb} MB` : 'N/A', color: 'text-sky-400', icon: HardDrive },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">{kpi.label}</p>
                <p className={`text-xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
              <Icon className={`w-5 h-5 ${kpi.color} opacity-75`} />
            </div>
          );
        })}
      </div>

      {/* Latency Trend + Cache/Memory Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-slate-900/85 border border-slate-800 rounded-xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
            API Average Latency Trend (ms/min)
          </h3>
          <div className="h-52">
            {trends.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No latency trend samples recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="minute" stroke="#94a3b8" fontSize={10} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="avgMs" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Cache & Memory Telemetry</h3>
          <div className="space-y-2">
            <div className="flex justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Cache Hits / Misses</span>
              <span className="text-white font-semibold">{cache.hits ?? 0} / {cache.misses ?? 0}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Cached Entries</span>
              <span className="text-white font-semibold">{cache.entries ?? 0}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-1.5">
              <span className="text-slate-400">Heap Used / Total</span>
              <span className="text-white font-semibold">
                {memory.heapUsedMb ?? 'N/A'} / {memory.heapTotalMb ?? 'N/A'} MB
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Max Observed Latency</span>
              <span className="text-amber-300 font-semibold">{latency.maxMs ?? 'N/A'} ms</span>
            </div>
          </div>

          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 pt-2">Background Jobs</h4>
          {jobs.length === 0 ? (
            <p className="text-slate-500">No background job executions recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <div key={j.jobName} className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5">
                  <div className="flex justify-between font-semibold text-white">
                    <span>{j.jobName}</span>
                    <span className="text-cyan-400">{j.lastDurationMs} ms</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Runs: {j.runs} • Failures: {j.failures}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Endpoints Table */}
      <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
          Top API Endpoints by Volume
        </h3>
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-400">Loading metrics...</div>
        ) : topEndpoints.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">No API requests recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400">
                  <th className="py-2 px-3">Endpoint</th>
                  <th className="py-2 px-3">Requests</th>
                  <th className="py-2 px-3">Avg (ms)</th>
                  <th className="py-2 px-3">Max (ms)</th>
                  <th className="py-2 px-3">5xx Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {topEndpoints.map((ep) => (
                  <tr key={ep.endpoint} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono text-cyan-300">{ep.endpoint}</td>
                    <td className="py-2.5 px-3 text-white font-semibold">{ep.count}</td>
                    <td className="py-2.5 px-3 text-slate-300">{ep.avgMs}</td>
                    <td className="py-2.5 px-3 text-amber-300">{ep.maxMs}</td>
                    <td className="py-2.5 px-3 text-red-400">{ep.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

