import React, { useState, useMemo } from 'react';
import { History, Clock, Filter, RefreshCw, ShieldAlert, BellRing, Server } from 'lucide-react';

export default function RecentActivities({ activities = [], isLoading = false, onRefresh }) {
  const [entityFilter, setEntityFilter] = useState('ALL');

  const filteredActivities = useMemo(() => {
    if (entityFilter === 'ALL') return activities;
    return activities.filter((act) => act.entityType === entityFilter);
  }, [activities, entityFilter]);

  const getEntityBadge = (type) => {
    switch (type) {
      case 'incident':
        return {
          icon: ShieldAlert,
          style: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
          label: 'INCIDENT',
        };
      case 'alert':
        return {
          icon: BellRing,
          style: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
          label: 'ALERT',
        };
      default:
        return {
          icon: Server,
          style: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
          label: 'SYSTEM',
        };
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'Critical':
        return 'text-red-400 bg-red-500/15 border-red-500/30';
      case 'High':
        return 'text-orange-400 bg-orange-500/15 border-orange-500/30';
      case 'Medium':
        return 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30';
      case 'Low':
        return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
      default:
        return 'text-slate-300 bg-navy-800 border-navy-700';
    }
  };

  return (
    <section className="rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 shadow-xl backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-navy-700/60 px-6 py-4 bg-navy-900/50">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-800/80 border border-navy-700 text-cyan-400">
            <History className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-wide text-white">
                Recent Activities
              </h3>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
                {activities.length} LOGGED
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Persistent SQLite audit log of intelligence alerts, incidents & system events
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1 text-xs text-slate-300">
            <Filter className="h-3.5 w-3.5 text-cyan-400" />
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none"
              aria-label="Filter activities by type"
            >
              <option value="ALL" className="bg-navy-900">All Events</option>
              <option value="incident" className="bg-navy-900">Incidents</option>
              <option value="alert" className="bg-navy-900">Alerts</option>
              <option value="system" className="bg-navy-900">System</option>
            </select>
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-700 bg-navy-900 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/30 hover:text-white transition-colors"
            title="Refresh activity log"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6">
        <div className="hidden sm:grid grid-cols-12 gap-4 pb-3 border-b border-navy-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-3">
          <div className="col-span-3">Timestamp / Action</div>
          <div className="col-span-5">Description</div>
          <div className="col-span-2">Entity</div>
          <div className="col-span-1">Severity</div>
          <div className="col-span-1 text-right">Actor</div>
        </div>

        {filteredActivities.length > 0 ? (
          <div className="divide-y divide-navy-800/70 max-h-80 overflow-y-auto">
            {filteredActivities.slice(0, 20).map((act) => {
              const badge = getEntityBadge(act.entityType);
              const EntityIcon = badge.icon;

              return (
                <div
                  key={act.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center px-3 py-3 text-xs hover:bg-navy-800/40 transition-colors"
                >
                  <div className="sm:col-span-3 flex flex-col">
                    <span className="font-mono text-[11px] font-bold text-cyan-300">
                      {act.action}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {act.createdAt}
                    </span>
                  </div>

                  <div className="sm:col-span-5 text-slate-200 leading-snug">
                    {act.description}
                  </div>

                  <div className="sm:col-span-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-mono font-semibold ${badge.style}`}
                    >
                      <EntityIcon className="h-3 w-3" />
                      {act.entityId}
                    </span>
                  </div>

                  <div className="sm:col-span-1">
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold ${getSeverityColor(
                        act.severity
                      )}`}
                    >
                      {act.severity}
                    </span>
                  </div>

                  <div className="sm:col-span-1 sm:text-right text-[11px] text-slate-400 font-mono truncate">
                    {act.actor}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="my-8 flex flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-navy-700 bg-navy-950/80 text-slate-400 mb-3">
              <Clock className="h-6 w-6 text-slate-400" />
            </div>
            <h4 className="text-sm font-semibold text-slate-300">
              No Activities Found
            </h4>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              No activity records match the selected filter.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
