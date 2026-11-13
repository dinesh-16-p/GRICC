import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Unlock,
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
  Cell,
} from 'recharts';
import apiService from '../services/apiService';

const SEVERITY_COLORS = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#38bdf8',
  Info: '#94a3b8',
};

const SEVERITY_BADGE = {
  Critical: 'bg-red-500/15 text-red-400 border-red-500/40',
  High: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  Medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
  Low: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  Info: 'bg-slate-700/60 text-slate-300 border-slate-600',
};

const STATUS_BADGE = {
  OPEN: 'bg-red-500/15 text-red-300 border-red-500/40',
  INVESTIGATING: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  DISMISSED: 'bg-slate-700/60 text-slate-300 border-slate-600',
};

function formatTime(iso) {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SecurityAdministration({ isAdmin = false }) {
  const [overview, setOverview] = useState(null);
  const [events, setEvents] = useState([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [settingsForm, setSettingsForm] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [subTab, setSubTab] = useState('events'); // 'events' | 'policies' | 'integrity'

  // Filters
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadAll = useCallback(async () => {
    if (!isAdmin) return;
    setError('');
    try {
      const [ov, ev] = await Promise.all([
        apiService.getSecurityOverview(),
        apiService.getSecurityEvents({
          eventType: eventTypeFilter,
          severity: severityFilter,
          status: statusFilter,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          limit: 50,
        }),
      ]);
      setOverview(ov);
      setEvents(ev.events || []);
      setTotalEvents(ev.total || 0);
      setIntegrity(ov.auditIntegrity || null);
      if (ov.settings) {
        setSettingsForm(ov.settings);
      }
    } catch (err) {
      setError(err.message || 'Failed to load security administration data.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, eventTypeFilter, severityFilter, statusFilter, startDate, endDate]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!isAdmin) {
    return (
      <div className="bg-red-950/30 border border-red-500/40 rounded-xl p-8 text-center text-red-300 text-sm">
        Administrator privileges are required to access Security Administration.
      </div>
    );
  }

  const handleStatusChange = async (eventId, nextStatus) => {
    setError('');
    try {
      await apiService.updateSecurityEventStatus(eventId, nextStatus);
      setActionMsg(`Security event ${eventId} marked as ${nextStatus}.`);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to update security event.');
    }
  };

  const handleUnlockUser = async (userId, username) => {
    if (!window.confirm(`Unlock user account "${username}"?`)) return;
    setError('');
    try {
      await apiService.unlockUserAccount(userId);
      setActionMsg(`Account "${username}" unlocked.`);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to unlock account.');
    }
  };

  const handleVerifyIntegrity = async () => {
    setError('');
    try {
      const res = await apiService.verifyAuditIntegrity();
      setIntegrity(res.integrity);
      setActionMsg(
        res.integrity.valid
          ? `Audit chain verified (${res.integrity.hashedCount} hashed entries valid).`
          : `Audit chain warning: ${res.integrity.tamperedCount} tampered entry(ies) detected!`
      );
    } catch (err) {
      setError(err.message || 'Audit integrity verification failed.');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!window.confirm('Apply updated security policy settings? This action is audited.')) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiService.updateSecuritySettings(settingsForm);
      setSettingsForm(res.settings);
      setActionMsg('Security policy settings updated.');
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to save security settings.');
    } finally {
      setSaving(false);
    }
  };

  const summary = overview?.summary || {};
  const cfg = overview?.configurationStatus || {};
  const lockedAccounts = overview?.lockedAccounts || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <ShieldCheck className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">
              Security & Compliance Administration
            </h2>
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                summary.auditIntegrityValid
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                  : 'bg-red-500/15 text-red-400 border-red-500/40'
              }`}
            >
              Audit Chain: {summary.auditIntegrityValid ? 'VERIFIED' : 'INTEGRITY ALERT'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex flex-wrap gap-4">
            <span>JWT Secret: {cfg.jwtSecretConfigured ? 'Configured' : 'Ephemeral Fallback'}</span>
            <span>Bcrypt: {cfg.bcryptEnabled ? 'Active' : 'Disabled'}</span>
            <span>Rate Limiting: {cfg.rateLimitingEnabled ? 'Active' : 'Disabled'}</span>
            <span>Helmet Headers: {cfg.helmetHeadersEnabled ? 'Active' : 'Disabled'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleVerifyIntegrity}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Verify Audit Chain
          </button>
          <button
            onClick={loadAll}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-500/40 text-red-300 px-4 py-3 rounded-lg text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionMsg && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-lg text-xs flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg('')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Open Events', value: summary.openEvents ?? 0, color: 'text-red-400', icon: ShieldAlert },
          { label: 'Total Events', value: summary.totalEvents ?? 0, color: 'text-white', icon: AlertTriangle },
          { label: 'Failed Logins', value: summary.failedLogins ?? 0, color: 'text-orange-400', icon: Lock },
          { label: 'Unauthorized / Priv', value: summary.unauthorizedAttempts ?? 0, color: 'text-amber-400', icon: ShieldAlert },
          { label: 'Locked Accounts', value: summary.lockedAccountsCount ?? 0, color: 'text-cyan-400', icon: Lock },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">{kpi.label}</p>
                <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
              <Icon className={`w-5 h-5 ${kpi.color} opacity-75`} />
            </div>
          );
        })}
      </div>

      {/* Sub-Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        {[
          { id: 'events', label: `Security Events (${totalEvents})` },
          { id: 'integrity', label: 'Audit Integrity & Locked Accounts' },
          { id: 'policies', label: 'Security Policies & Settings' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              subTab === t.id
                ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: SECURITY EVENTS */}
      {subTab === 'events' && (
        <div className="space-y-5">
          <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
              Security Event Severity Distribution
            </h3>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview?.severityDistribution || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="severity" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {(overview?.severityDistribution || []).map((entry) => (
                      <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] || '#38bdf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Security Event Log</h3>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={eventTypeFilter}
                  onChange={(e) => setEventTypeFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="ALL">All Event Types</option>
                  <option value="FAILED_LOGIN">FAILED_LOGIN</option>
                  <option value="ACCOUNT_LOCKED">ACCOUNT_LOCKED</option>
                  <option value="UNAUTHORIZED_ACCESS">UNAUTHORIZED_ACCESS</option>
                  <option value="PRIVILEGE_ESCALATION_ATTEMPT">PRIVILEGE_ESCALATION_ATTEMPT</option>
                  <option value="INVALID_TOKEN">INVALID_TOKEN</option>
                  <option value="SECURITY_CONFIGURATION_CHANGED">SECURITY_CONFIGURATION_CHANGED</option>
                </select>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="ALL">All Severities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                  <option value="Info">Info</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OPEN">OPEN</option>
                  <option value="INVESTIGATING">INVESTIGATING</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="DISMISSED">DISMISSED</option>
                </select>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-10 text-center text-xs text-slate-400">Loading security events...</div>
            ) : events.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">No security events match the filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400">
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3">Event</th>
                      <th className="py-2.5 px-3">Endpoint</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full border font-semibold ${SEVERITY_BADGE[ev.severity]}`}>
                            {ev.severity}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-white">{ev.eventType}</p>
                          <p className="text-slate-400">{ev.description}</p>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300">{ev.endpoint || '—'}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full border font-semibold ${STATUS_BADGE[ev.status]}`}>
                            {ev.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">{formatTime(ev.createdAt)}</td>
                        <td className="py-3 px-3 text-right whitespace-nowrap space-x-1.5">
                          {ev.status === 'OPEN' && (
                            <button
                              onClick={() => handleStatusChange(ev.id, 'INVESTIGATING')}
                              className="px-2 py-1 rounded bg-cyan-600/20 text-cyan-300 border border-cyan-500/40"
                            >
                              Investigate
                            </button>
                          )}
                          {(ev.status === 'OPEN' || ev.status === 'INVESTIGATING') && (
                            <button
                              onClick={() => handleStatusChange(ev.id, 'RESOLVED')}
                              className="px-2 py-1 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                            >
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT INTEGRITY & LOCKED ACCOUNTS */}
      {subTab === 'integrity' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Audit Log Hash-Chain Integrity</h3>
              <button
                onClick={handleVerifyIntegrity}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
              >
                Run Verification
              </button>
            </div>
            {integrity && (
              <div className="space-y-2 text-xs bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-2 font-semibold">
                  {integrity.valid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  )}
                  <span className={integrity.valid ? 'text-emerald-400' : 'text-red-400'}>
                    {integrity.valid ? 'Hash Chain Valid' : `Tampering Detected (${integrity.tamperedCount})`}
                  </span>
                </div>
                <p className="text-slate-300">Total Audit Rows Checked: {integrity.totalChecked}</p>
                <p className="text-slate-300">SHA-256 Hash-Chained Rows: {integrity.hashedCount}</p>
                <p className="text-slate-400">Legacy Pre-Phase-18 Rows: {integrity.legacyUnchainedCount}</p>
                <p className="text-slate-500">Verified At: {formatTime(integrity.verifiedAt)}</p>
                {integrity.tamperedEntries && integrity.tamperedEntries.length > 0 && (
                  <div className="pt-2 border-t border-slate-800 text-red-300">
                    Tampered IDs: {integrity.tamperedEntries.map((t) => `#${t.id} (${t.reason})`).join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Temporarily Locked Accounts ({lockedAccounts.length})
            </h3>
            {lockedAccounts.length === 0 ? (
              <p className="text-xs text-slate-400">No user accounts are currently locked.</p>
            ) : (
              <div className="space-y-2">
                {lockedAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {acc.fullName} (@{acc.username})
                      </p>
                      <p className="text-slate-400">
                        Failed attempts: {acc.failedLoginAttempts} • Locked until {formatTime(acc.lockedUntil)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleUnlockUser(acc.id, acc.username)}
                      className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 flex items-center gap-1"
                    >
                      <Unlock className="w-3.5 h-3.5" /> Unlock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SECURITY POLICIES */}
      {subTab === 'policies' && settingsForm && (
        <form onSubmit={handleSaveSettings} className="bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Security Policy Configuration</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Max Failed Logins (3–20)</label>
              <input
                type="number"
                min={3}
                max={20}
                value={settingsForm.maxFailedLogins}
                onChange={(e) => setSettingsForm({ ...settingsForm, maxFailedLogins: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Lockout Duration Minutes (1–1440)</label>
              <input
                type="number"
                min={1}
                max={1440}
                value={settingsForm.lockoutDurationMinutes}
                onChange={(e) => setSettingsForm({ ...settingsForm, lockoutDurationMinutes: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Min Password Length (8–64)</label>
              <input
                type="number"
                min={8}
                max={64}
                value={settingsForm.minPasswordLength}
                onChange={(e) => setSettingsForm({ ...settingsForm, minPasswordLength: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">JWT Lifetime Hours (1–24)</label>
              <input
                type="number"
                min={1}
                max={24}
                value={settingsForm.jwtLifetimeHours}
                onChange={(e) => setSettingsForm({ ...settingsForm, jwtLifetimeHours: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Alert After Failed Logins (2–20)</label>
              <input
                type="number"
                min={2}
                max={20}
                value={settingsForm.alertOnFailedLogins}
                onChange={(e) => setSettingsForm({ ...settingsForm, alertOnFailedLogins: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Event Retention Days (7–3650)</label>
              <input
                type="number"
                min={7}
                max={3650}
                value={settingsForm.securityEventRetentionDays}
                onChange={(e) => setSettingsForm({ ...settingsForm, securityEventRetentionDays: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-slate-300 pt-2">
            {[
              ['requireUppercase', 'Require Uppercase'],
              ['requireLowercase', 'Require Lowercase'],
              ['requireNumber', 'Require Number'],
              ['requireSpecialChar', 'Require Special Char'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(settingsForm[key])}
                  onChange={(e) => setSettingsForm({ ...settingsForm, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold"
          >
            {saving ? 'Saving...' : 'Save Security Policy'}
          </button>
        </form>
      )}
    </div>
  );
}

