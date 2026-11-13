import React, { useState, useMemo } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  Check,
  Flag,
  Sliders,
  Plus,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Radio,
} from 'lucide-react';

const SEVERITY_BADGE = {
  Critical: 'border-red-500/40 bg-red-500/15 text-red-300',
  High: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  Medium: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  Low: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  Info: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
};

export default function NotificationCentre({
  isOpen,
  onClose,
  notifications = [],
  unreadCount = 0,
  onMarkRead,
  onMarkAllRead,
  watchlists = [],
  onAddWatchlist,
  onRemoveWatchlist,
  escalationRules = [],
  onUpdateRule,
  preferences = { browserNotifications: false, minSeverity: 'Medium' },
  onUpdatePreferences,
  canModify = false,
  isAdmin = false,
  sseConnected = false,
  sseStatus = null,
  onNavigateTab = null,
}) {
  const [tab, setTab] = useState('feed'); // 'feed' | 'watchlist' | 'rules'
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // Watchlist form
  const [newCountry, setNewCountry] = useState('');
  const [newMinSeverity, setNewMinSeverity] = useState('Medium');
  const [watchlistError, setWatchlistError] = useState('');
  const [browserPermStatus, setBrowserPermStatus] = useState(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  const availableCountries = useMemo(() => {
    const set = new Set();
    notifications.forEach((n) => {
      if (n.country) set.add(n.country);
    });
    watchlists.forEach((w) => {
      if (w.country) set.add(w.country);
    });
    return Array.from(set).sort();
  }, [notifications, watchlists]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      const matchCountry = countryFilter === 'ALL' || n.country === countryFilter;
      const matchSeverity = severityFilter === 'ALL' || n.severity === severityFilter;
      return matchCountry && matchSeverity;
    });
  }, [notifications, countryFilter, severityFilter]);

  if (!isOpen) return null;

  const handleAddWatchlistSubmit = async (e) => {
    e.preventDefault();
    setWatchlistError('');
    if (!newCountry.trim()) {
      setWatchlistError('Enter a country name.');
      return;
    }
    try {
      await onAddWatchlist({ country: newCountry.trim(), minSeverity: newMinSeverity });
      setNewCountry('');
    } catch (err) {
      setWatchlistError(err?.message || 'Failed to add country to watchlist.');
    }
  };

  const handleToggleBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserPermStatus('unsupported');
      return;
    }

    if (!preferences.browserNotifications) {
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
        setBrowserPermStatus(perm);
      }
      if (perm === 'granted') {
        await onUpdatePreferences({ ...preferences, browserNotifications: true });
      } else {
        setBrowserPermStatus(perm);
        await onUpdatePreferences({ ...preferences, browserNotifications: false });
      }
    } else {
      await onUpdatePreferences({ ...preferences, browserNotifications: false });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-950/70 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-md flex-col border-l border-navy-700 bg-navy-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Bell className="h-5 w-5 text-cyan-400" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Notification Centre
                </h3>
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-mono font-bold text-cyan-300 border border-cyan-500/30">
                  {unreadCount} UNREAD
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-0.5">
                <Radio
                  className={`h-3 w-3 ${
                    (sseStatus || (sseConnected ? 'connected' : 'disconnected')) === 'connected'
                      ? 'text-emerald-400'
                      : sseStatus === 'reconnecting'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}
                />
                <span>
                  {(sseStatus || (sseConnected ? 'connected' : 'disconnected')) === 'connected'
                    ? 'SSE CONNECTED'
                    : sseStatus === 'reconnecting'
                    ? 'SSE RECONNECTING...'
                    : 'SSE DISCONNECTED'}
                </span>
                {onNavigateTab && (
                  <button
                    onClick={() => {
                      onNavigateTab('monitoring');
                      onClose?.();
                    }}
                    className="text-cyan-400 hover:text-cyan-300 underline ml-1"
                  >
                    Open Monitor
                  </button>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-800 hover:text-white"
            aria-label="Close notification centre"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="grid grid-cols-3 border-b border-navy-800 bg-navy-950/60 text-xs font-mono">
          <button
            onClick={() => setTab('feed')}
            className={`py-2.5 font-semibold border-b-2 transition-colors ${
              tab === 'feed'
                ? 'border-cyan-400 text-cyan-300 bg-navy-900/60'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Alerts ({notifications.length})
          </button>
          <button
            onClick={() => setTab('watchlist')}
            className={`py-2.5 font-semibold border-b-2 transition-colors ${
              tab === 'watchlist'
                ? 'border-cyan-400 text-cyan-300 bg-navy-900/60'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Watchlist ({watchlists.length})
          </button>
          <button
            onClick={() => setTab('rules')}
            className={`py-2.5 font-semibold border-b-2 transition-colors ${
              tab === 'rules'
                ? 'border-cyan-400 text-cyan-300 bg-navy-900/60'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Rules & Prefs
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === 'feed' && (
            <>
              {/* Filters & Mark All Read */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-navy-800">
                <div className="flex items-center gap-2">
                  <select
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    className="rounded-lg border border-navy-700 bg-navy-950 px-2 py-1 text-[11px] text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="ALL">All Countries</option>
                    {availableCountries.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="rounded-lg border border-navy-700 bg-navy-950 px-2 py-1 text-[11px] text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="ALL">All Severities</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-mono text-cyan-300 hover:bg-cyan-500/20"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {/* Notification List */}
              {filteredNotifications.length === 0 ? (
                <div className="py-12 text-center text-xs font-mono text-slate-400">
                  No notifications match the selected filters.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredNotifications.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-xl border p-3.5 text-xs transition-colors ${
                        n.isRead
                          ? 'border-navy-800 bg-navy-950/50 text-slate-400'
                          : 'border-cyan-500/35 bg-navy-850/90 text-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!n.isRead && (
                            <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
                          )}
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase ${
                              SEVERITY_BADGE[n.severity] || SEVERITY_BADGE.Info
                            }`}
                          >
                            {n.severity}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {n.type}
                          </span>
                        </div>
                        {!n.isRead && (
                          <button
                            onClick={() => onMarkRead(n.id)}
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:text-cyan-200 shrink-0"
                            title="Mark as read"
                          >
                            <Check className="h-3 w-3" />
                            <span>Read</span>
                          </button>
                        )}
                      </div>

                      <h4 className="font-semibold text-white mt-1.5">{n.title}</h4>
                      <p className="text-slate-300 mt-1 leading-relaxed">{n.message}</p>

                      <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>{n.country || 'Global'}</span>
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'watchlist' && (
            <div className="space-y-4">
              {canModify && (
                <form
                  onSubmit={handleAddWatchlistSubmit}
                  className="rounded-xl border border-navy-800 bg-navy-950/70 p-3.5 space-y-2.5"
                >
                  <div className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                    <Flag className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Add Country to Watchlist</span>
                  </div>
                  {watchlistError && (
                    <p className="text-[11px] text-red-300">{watchlistError}</p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCountry}
                      onChange={(e) => setNewCountry(e.target.value)}
                      placeholder="e.g. Singapore"
                      className="flex-1 rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    />
                    <select
                      value={newMinSeverity}
                      onChange={(e) => setNewMinSeverity(e.target.value)}
                      className="rounded-lg border border-navy-700 bg-navy-900 px-2 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="Critical">Critical+</option>
                      <option value="High">High+</option>
                      <option value="Medium">Medium+</option>
                      <option value="Low">All</option>
                    </select>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-cyan-500"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                {watchlists.length === 0 ? (
                  <p className="py-8 text-center text-xs font-mono text-slate-400">
                    No countries are currently on the watchlist.
                  </p>
                ) : (
                  watchlists.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between rounded-xl border border-navy-800 bg-navy-950/60 px-3.5 py-2.5 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">{w.country}</div>
                        <div className="text-[11px] font-mono text-slate-400">
                          Alert threshold: {w.minSeverity}+
                        </div>
                      </div>
                      {canModify && (
                        <button
                          onClick={() => onRemoveWatchlist(w.id)}
                          className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/15"
                          title="Remove from watchlist"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'rules' && (
            <div className="space-y-4">
              {/* Notification Preferences */}
              <div className="rounded-xl border border-navy-800 bg-navy-950/70 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase">
                  <Sliders className="h-4 w-4 text-cyan-400" />
                  <span>Personal Notification Preferences</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <div className="text-slate-200 font-medium">Browser Push Alerts</div>
                    <div className="text-[11px] text-slate-400">
                      {browserPermStatus === 'denied'
                        ? 'Browser permission denied — using in-app notifications.'
                        : browserPermStatus === 'unsupported'
                          ? 'Browser notifications unavailable.'
                          : 'Show desktop alerts for critical events.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleBrowserNotifications}
                    disabled={browserPermStatus === 'denied' || browserPermStatus === 'unsupported'}
                    className={`rounded-lg border px-3 py-1 text-[11px] font-mono font-bold disabled:opacity-40 ${
                      preferences.browserNotifications
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-navy-700 bg-navy-900 text-slate-300'
                    }`}
                  >
                    {preferences.browserNotifications ? 'ENABLED' : 'ENABLE'}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Minimum In-App Severity</span>
                  <select
                    value={preferences.minSeverity || 'Medium'}
                    onChange={(e) =>
                      onUpdatePreferences({ ...preferences, minSeverity: e.target.value })
                    }
                    className="rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="Critical">Critical Only</option>
                    <option value="High">High & Critical</option>
                    <option value="Medium">Medium+</option>
                    <option value="Low">All</option>
                  </select>
                </div>
              </div>

              {/* Automated Escalation Rules */}
              <div className="rounded-xl border border-navy-800 bg-navy-950/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase">
                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                    <span>Escalation Rules</span>
                  </div>
                  {!isAdmin && (
                    <span className="text-[10px] font-mono text-slate-400">READ ONLY</span>
                  )}
                </div>

                <div className="space-y-2.5">
                  {escalationRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-lg border border-navy-800 bg-navy-900/70 p-3 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-white">{rule.name}</span>
                        <button
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => onUpdateRule(rule.id, { enabled: !rule.enabled })}
                          className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold border disabled:opacity-60 ${
                            rule.enabled
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                              : 'border-slate-600 bg-navy-950 text-slate-400'
                          }`}
                        >
                          {rule.enabled ? 'ACTIVE' : 'DISABLED'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>Type: {rule.ruleType}</span>
                        <span>Threshold: {rule.threshold}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

