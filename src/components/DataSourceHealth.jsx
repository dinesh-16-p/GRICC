import React from 'react';
import {
  Server,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RefreshCw,
  Clock,
  Radio,
  Layers,
  ExternalLink,
  ShieldAlert,
  Zap,
} from 'lucide-react';

export default function DataSourceHealth({
  sources = [],
  health = null,
  isLoading = false,
  error = null,
  onRefresh,
  refreshInterval = '5m',
  onIntervalChange,
  lastSyncTime = null,
}) {
  const backendConnected = health?.backendStatus === 'ONLINE' && !error;

  const totalProviders = sources.length || 5;
  const healthyCount = sources.filter((s) => s.status === 'HEALTHY').length;
  const degradedCount = sources.filter((s) => s.status === 'DEGRADED').length;
  const failedCount = sources.filter((s) => s.status === 'FAILED').length;
  const notConfiguredCount = sources.filter((s) => s.status === 'NOT_CONFIGURED').length;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'HEALTHY':
        return {
          pill: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]',
          dot: 'bg-emerald-400 shadow-[0_0_6px_#34d399]',
          label: 'Healthy',
          icon: CheckCircle2,
        };
      case 'DEGRADED':
        return {
          pill: 'bg-orange-500/15 text-orange-400 border-orange-500/40 shadow-[0_0_8px_rgba(249,115,22,0.2)]',
          dot: 'bg-orange-400 shadow-[0_0_6px_#fb923c]',
          label: 'Degraded',
          icon: AlertTriangle,
        };
      case 'FAILED':
        return {
          pill: 'bg-red-500/15 text-red-400 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.2)]',
          dot: 'bg-red-400 shadow-[0_0_6px_#f87171]',
          label: 'Failed',
          icon: XCircle,
        };
      case 'NOT_CONFIGURED':
      default:
        return {
          pill: 'bg-slate-700/50 text-slate-400 border-slate-600',
          dot: 'bg-slate-500',
          label: 'Not Configured',
          icon: HelpCircle,
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Card */}
      <div className="rounded-2xl border border-navy-700/60 bg-gradient-to-r from-navy-850 to-navy-900/90 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Title & Connection Status */}
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
              <Server className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-wide text-white uppercase font-sans">
                  Data Source Health & Telemetry Gateways
                </h3>
                {backendConnected ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-mono font-bold text-emerald-400 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    BACKEND ONLINE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[11px] font-mono font-bold text-red-400 border border-red-500/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    OFFLINE (DEMO STANDBY)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                Real-time operational monitoring of external intelligence providers, latency & ingestion pipelines
              </p>
            </div>
          </div>

          {/* Controls: Refresh & Interval */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <span>Auto-Sync:</span>
              <select
                value={refreshInterval}
                onChange={(e) => onIntervalChange && onIntervalChange(e.target.value)}
                className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="1m">1 Minute</option>
                <option value="5m">5 Minutes</option>
                <option value="10m">10 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="manual">Manual Only</option>
              </select>
            </div>

            <button
              onClick={onRefresh}
              disabled={isLoading}
              className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:from-cyan-400 hover:to-blue-500 transition-all font-mono tracking-wide ${
                isLoading ? 'opacity-70 cursor-wait' : ''
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Synchronizing...' : 'Refresh Sources'}</span>
            </button>
          </div>
        </div>

        {/* Status Metrics Bar */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4 border-t border-navy-800">
          <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3">
            <span className="text-[10px] font-mono uppercase text-slate-400">Total Providers</span>
            <p className="text-xl font-extrabold font-mono text-white mt-1">{totalProviders}</p>
          </div>

          <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3">
            <span className="text-[10px] font-mono uppercase text-emerald-400">Healthy</span>
            <p className="text-xl font-extrabold font-mono text-emerald-400 mt-1">{healthyCount}</p>
          </div>

          <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3">
            <span className="text-[10px] font-mono uppercase text-orange-400">Degraded</span>
            <p className="text-xl font-extrabold font-mono text-orange-400 mt-1">{degradedCount}</p>
          </div>

          <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3">
            <span className="text-[10px] font-mono uppercase text-red-400">Failed</span>
            <p className="text-xl font-extrabold font-mono text-red-400 mt-1">{failedCount}</p>
          </div>

          <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3">
            <span className="text-[10px] font-mono uppercase text-slate-400">Last Synchronization</span>
            <p className="text-xs font-mono text-cyan-300 mt-1 truncate">
              {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : 'Awaiting sync'}
            </p>
          </div>

          <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3">
            <span className="text-[10px] font-mono uppercase text-slate-400">Operational Mode</span>
            <p className="text-xs font-mono font-bold text-amber-300 mt-1 truncate">
              {health?.operationalMode || 'DEMO MODE'}
            </p>
          </div>
        </div>

        {/* Error notification if backend unavailable */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <span>
                Backend gateway unreachable ({error.message || 'Connection refused'}). Operating safely on local demo telemetry.
              </span>
            </div>
            <button
              onClick={onRefresh}
              className="text-cyan-400 hover:underline font-mono text-xs whitespace-nowrap ml-2"
            >
              Retry Connection
            </button>
          </div>
        )}
      </div>

      {/* Provider Health Table */}
      <div className="rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 shadow-2xl backdrop-blur-sm overflow-hidden">
        <div className="border-b border-navy-800 px-6 py-4 bg-navy-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wide">
              Active Intelligence Providers Registry
            </h4>
          </div>
          <span className="text-xs font-mono text-slate-400">
            5 Registered Pipeline Adapters
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-navy-700/80 bg-navy-950/80 text-[10px] uppercase font-mono tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-3.5">Provider Service</th>
                <th className="px-6 py-3.5">Intelligence Category</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Last Successful Sync</th>
                <th className="px-6 py-3.5">Telemetry & Latency</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/80">
              {sources.map((source) => {
                const badge = getStatusBadge(source.status);
                const BadgeIcon = badge.icon;

                return (
                  <tr key={source.id} className="hover:bg-navy-800/40 transition-colors">
                    {/* Provider */}
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-bold text-white text-sm">{source.name}</div>
                        <div className="text-[11px] font-mono text-slate-400 truncate max-w-xs">
                          {source.provider}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 rounded bg-navy-950 px-2 py-0.5 text-[11px] text-cyan-300 border border-navy-700 font-mono">
                        {source.category}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider ${badge.pill}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                        <BadgeIcon className="h-3 w-3" />
                        {badge.label}
                      </span>
                    </td>

                    {/* Last Updated */}
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-[11px] text-slate-300">
                      {source.lastSuccessfulUpdate ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-cyan-400" />
                          <span>{new Date(source.lastSuccessfulUpdate).toLocaleTimeString()} UTC</span>
                        </div>
                      ) : (
                        <span className="text-slate-500">Standby (Initial)</span>
                      )}
                    </td>

                    {/* Response Status / Latency */}
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-[11px]">
                      {source.error ? (
                        <span className="text-red-400 flex items-center gap-1 truncate max-w-xs">
                          <AlertTriangle className="h-3 w-3" /> {source.error}
                        </span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="text-slate-300">
                            <strong>{source.recordCount || 0}</strong> records
                          </span>
                          <span className="text-slate-500">•</span>
                          <span className="text-cyan-400">{source.latencyMs || 12} ms</span>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={onRefresh}
                        className="inline-flex items-center gap-1 rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-500/50 hover:text-white transition-colors"
                        title="Force refresh this provider"
                      >
                        <RefreshCw className="h-3 w-3 text-cyan-400" />
                        <span>Sync</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-navy-800 bg-navy-950/60 text-[11px] font-mono text-slate-400">
          <div>
            STATUS: REAL-TIME HEALTH TELEMETRY ACTIVE
          </div>
          <div className="text-amber-400/80">
            {health?.operationalMode === 'LIVE MODE' ? '🟢 LIVE SENSORS ACTIVE' : '⚠ DEMO TELEMETRY ACTIVE (Zero API Keys Needed)'}
          </div>
        </div>
      </div>
    </div>
  );
}
