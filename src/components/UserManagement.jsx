import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../services/apiService';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Edit3,
  Power,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileLock2,
  Clock,
} from 'lucide-react';

const ROLE_STYLES = {
  ADMIN: 'border-red-500/40 bg-red-500/15 text-red-300',
  ANALYST: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
  VIEWER: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
};

export default function UserManagement({ currentUser, initialSection = 'users' }) {
  const [section, setSection] = useState(initialSection); // 'users' | 'audit'
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formState, setFormState] = useState({
    username: '',
    email: '',
    fullName: '',
    department: 'Intelligence Operations',
    role: 'ANALYST',
    password: '',
  });
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiService.getUsers({
        search: searchQuery.trim() || undefined,
        role: roleFilter !== 'ALL' ? roleFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      });
      setUsers(res?.users || []);
    } catch (err) {
      setError(err?.message || 'Failed to load users.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, roleFilter, statusFilter]);

  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiService.getAuditLogs({
        limit: 100,
        action: auditActionFilter !== 'ALL' ? auditActionFilter : undefined,
      });
      setAuditLogs(res?.logs || []);
    } catch (err) {
      setError(err?.message || 'Failed to load audit logs.');
    } finally {
      setIsLoading(false);
    }
  }, [auditActionFilter]);

  useEffect(() => {
    if (section === 'users') {
      loadUsers();
    } else {
      loadAuditLogs();
    }
  }, [section, loadUsers, loadAuditLogs]);

  const openAddModal = () => {
    setEditingUser(null);
    setFormState({
      username: '',
      email: '',
      fullName: '',
      department: 'Intelligence Operations',
      role: 'ANALYST',
      password: '',
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormState({
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      department: user.department || '',
      role: user.role,
      password: '',
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setFormError('');
    setIsSaving(true);

    try {
      if (editingUser) {
        const payload = {
          email: formState.email,
          fullName: formState.fullName,
          department: formState.department,
          role: formState.role,
        };
        if (formState.password.trim()) {
          payload.password = formState.password;
        }
        await apiService.updateUser(editingUser.id, payload);
      } else {
        await apiService.createUser(formState);
      }
      setIsModalOpen(false);
      await loadUsers();
    } catch (err) {
      setFormError(err?.message || 'Failed to save user.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (user) => {
    setError('');
    try {
      await apiService.updateUserStatus(user.id, !user.isActive);
      await loadUsers();
    } catch (err) {
      setError(err?.message || 'Failed to update user status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-navy-700/60 bg-gradient-to-r from-navy-850 to-navy-900/90 p-6 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 text-cyan-400">
            {section === 'users' ? <Users className="h-6 w-6" /> : <FileLock2 className="h-6 w-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white uppercase">
                {section === 'users' ? 'User & Access Management' : 'Security Audit Logs'}
              </h2>
              <span className="rounded bg-red-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-red-300 border border-red-500/30">
                ADMIN ONLY
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage command centre accounts, RBAC roles, and inspect security audit telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSection('users')}
            className={`rounded-xl px-3.5 py-2 text-xs font-mono font-bold border transition-colors ${
              section === 'users'
                ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                : 'border-navy-700 bg-navy-950/60 text-slate-400 hover:text-white'
            }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setSection('audit')}
            className={`rounded-xl px-3.5 py-2 text-xs font-mono font-bold border transition-colors ${
              section === 'audit'
                ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                : 'border-navy-700 bg-navy-950/60 text-slate-400 hover:text-white'
            }`}
          >
            Audit Logs
          </button>
          {section === 'users' && (
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition-all"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add User</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {section === 'users' ? (
        <>
          {/* Search & Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy-700/60 bg-navy-900/70 p-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username, name, email, or department..."
                className="w-full rounded-xl border border-navy-700 bg-navy-950/80 py-2 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">ADMIN</option>
                <option value="ANALYST">ANALYST</option>
                <option value="VIEWER">VIEWER</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
              </select>

              <button
                onClick={loadUsers}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-xs font-mono text-cyan-300 hover:bg-navy-800"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-navy-800 bg-navy-950/80 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3.5">Operator</th>
                    <th className="px-5 py-3.5">Department</th>
                    <th className="px-5 py-3.5">Role</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Last Login</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800/80">
                  {users.map((u) => {
                    const isSelf = currentUser?.id === u.id;
                    return (
                      <tr key={u.id} className="hover:bg-navy-850/60 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">
                            {u.fullName}{' '}
                            {isSelf && (
                              <span className="ml-1 text-[10px] font-mono text-cyan-400">(YOU)</span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            @{u.username} • {u.email}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-300">{u.department}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${
                              ROLE_STYLES[u.role] || ROLE_STYLES.VIEWER
                            }`}
                          >
                            <Shield className="h-3 w-3" />
                            {u.role}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {u.isActive ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              ACTIVE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-red-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                              DEACTIVATED
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-mono text-[11px] text-slate-400">
                          {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => openEditModal(u)}
                            className="inline-flex items-center gap-1 rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-[11px] font-mono text-cyan-300 hover:bg-navy-800"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={isSelf}
                            title={isSelf ? 'Cannot deactivate your own account' : ''}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-mono disabled:opacity-40 disabled:cursor-not-allowed ${
                              u.isActive
                                ? 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                            }`}
                          >
                            <Power className="h-3 w-3" />
                            <span>{u.isActive ? 'Deactivate' : 'Activate'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-400 font-mono">
                        No users match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Audit Logs View */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy-700/60 bg-navy-900/70 p-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-slate-400">ACTION FILTER:</span>
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="ALL">All Audit Events</option>
                <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
                <option value="LOGIN_FAILED">LOGIN_FAILED</option>
                <option value="LOGOUT">LOGOUT</option>
                <option value="INCIDENT_CREATED">INCIDENT_CREATED</option>
                <option value="INCIDENT_UPDATED">INCIDENT_UPDATED</option>
                <option value="INCIDENT_RESOLVED">INCIDENT_RESOLVED</option>
                <option value="INCIDENT_DELETED">INCIDENT_DELETED</option>
                <option value="ALERT_ACKNOWLEDGED">ALERT_ACKNOWLEDGED</option>
                <option value="USER_CREATED">USER_CREATED</option>
                <option value="ROLE_CHANGED">ROLE_CHANGED</option>
                <option value="USER_DEACTIVATED">USER_DEACTIVATED</option>
                <option value="UNAUTHORIZED_ACCESS_ATTEMPT">UNAUTHORIZED_ACCESS_ATTEMPT</option>
              </select>
            </div>
            <button
              onClick={loadAuditLogs}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-xs font-mono text-cyan-300 hover:bg-navy-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Logs</span>
            </button>
          </div>

          <div className="rounded-2xl border border-navy-700/60 bg-navy-900/70 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-navy-800 bg-navy-950/80 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Record</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800/80">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-navy-850/60">
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        <Clock className="inline h-3 w-3 mr-1 text-slate-500" />
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-200 whitespace-nowrap">
                        {log.username || 'system'}{' '}
                        {log.userRole && (
                          <span className="text-[10px] text-cyan-400">({log.userRole})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-cyan-300 whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                        {log.recordId || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{log.details}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-[10px] font-mono font-bold ${
                            log.status === 'SUCCESS'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-red-500/15 text-red-300 border border-red-500/30'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-mono">
                        No audit log entries found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-navy-700 bg-navy-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-navy-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Shield className="h-4 w-4 text-cyan-400" />
                <span>{editingUser ? `Edit User: ${editingUser.username}` : 'Create New User'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-navy-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              {!editingUser && (
                <div>
                  <label className="block font-mono text-slate-300 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={formState.username}
                    onChange={(e) => setFormState({ ...formState, username: e.target.value })}
                    placeholder="e.g. j.mercier"
                    className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-slate-300 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formState.fullName}
                    onChange={(e) => setFormState({ ...formState, fullName: e.target.value })}
                    className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-slate-300 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-slate-300 mb-1">Department</label>
                  <input
                    type="text"
                    value={formState.department}
                    onChange={(e) => setFormState({ ...formState, department: e.target.value })}
                    className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-slate-300 mb-1">Role *</label>
                  <select
                    value={formState.role}
                    onChange={(e) => setFormState({ ...formState, role: e.target.value })}
                    className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="ANALYST">ANALYST</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-mono text-slate-300 mb-1">
                  {editingUser ? 'New Password (leave blank to keep current)' : 'Password (min 8 chars) *'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={formState.password}
                  onChange={(e) => setFormState({ ...formState, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-navy-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-navy-700 px-4 py-2 text-slate-300 hover:bg-navy-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 font-bold text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isSaving ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

