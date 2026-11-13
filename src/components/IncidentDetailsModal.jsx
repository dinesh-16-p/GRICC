import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  MapPin,
  Clock,
  CheckCircle2,
  Tag,
  Save,
  Building,
  Trash2,
  History,
} from 'lucide-react';
import {
  INCIDENT_STATUS,
  INCIDENT_SEVERITY,
  RESPONSE_TEAMS,
} from '../data/incidentData';
import apiService from '../services/apiService';

export default function IncidentDetailsModal({
  incident,
  isOpen,
  onClose,
  onUpdateIncident,
  onDeleteIncident,
  canModify = true,
  canDelete = true,
}) {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [activityLogs, setActivityLogs] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (incident && isOpen) {
      setSelectedStatus(incident.status);
      setSelectedTeam(incident.assignedTeam);
      setSelectedSeverity(incident.severity);
      setEditedTitle(incident.title);
      setEditedDescription(incident.description);
      setSaveSuccess(false);
      setConfirmDelete(false);
      setErrorMsg(null);

      // Load incident activity history from SQLite
      apiService
        .getIncidentById(incident.id)
        .then((res) => {
          if (res?.incident?.activityLogs) {
            setActivityLogs(res.incident.activityLogs);
          }
        })
        .catch(() => {
          setActivityLogs([]);
        });
    }
  }, [incident, isOpen]);

  if (!isOpen || !incident) return null;

  const handleSave = async (overrideStatus = null) => {
    setIsSaving(true);
    setErrorMsg(null);
    const nextStatus = overrideStatus || selectedStatus;

    try {
      await onUpdateIncident(incident.id, {
        title: editedTitle.trim() || incident.title,
        description: editedDescription.trim() || incident.description,
        severity: selectedSeverity,
        status: nextStatus,
        assignedTeam: selectedTeam,
      });

      setSelectedStatus(nextStatus);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 600);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update incident.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await onDeleteIncident(incident.id);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete incident.');
    } finally {
      setIsDeleting(false);
    }
  };

  const severityStyles = {
    [INCIDENT_SEVERITY.CRITICAL]: 'bg-red-500/15 text-red-400 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
    [INCIDENT_SEVERITY.HIGH]: 'bg-orange-500/15 text-orange-400 border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.2)]',
    [INCIDENT_SEVERITY.MEDIUM]: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40 shadow-[0_0_10px_rgba(234,179,8,0.2)]',
    [INCIDENT_SEVERITY.LOW]: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl rounded-2xl border border-navy-700/80 bg-navy-900 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-700/80 px-6 py-4 bg-navy-850/80">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-cyan-400">
                  {incident.id}
                </span>
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${
                    severityStyles[selectedSeverity] || severityStyles[INCIDENT_SEVERITY.LOW]
                  }`}
                >
                  {selectedSeverity}
                </span>
              </div>
              <h3 className="text-base font-bold text-white tracking-wide mt-0.5">
                Incident Dossier & Operational Status
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs font-mono text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Editable Operational Title */}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
              Operational Title
            </label>
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              className="w-full rounded-xl border border-navy-700/80 bg-navy-950 px-3.5 py-2 text-sm font-bold text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>

          {/* Location & Geographic Scope */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-navy-800 bg-navy-950/70 p-4">
            <div className="space-y-1">
              <span className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-cyan-400" /> Country & Coordinates
              </span>
              <p className="text-sm font-semibold text-slate-100">
                {incident.country}
                {incident.latitude != null && incident.longitude != null && (
                  <span className="ml-2 font-mono text-xs text-cyan-400">
                    ({Number(incident.latitude).toFixed(2)}°, {Number(incident.longitude).toFixed(2)}°)
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5 text-cyan-400" /> Facility / Sector
              </span>
              <p className="text-sm font-semibold text-slate-100">{incident.location}</p>
            </div>
          </div>

          {/* Category & Timestamps */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3">
              <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                <Tag className="h-3 w-3 text-cyan-400" /> Category
              </span>
              <p className="mt-1 font-medium text-slate-200">{incident.category}</p>
            </div>

            <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3">
              <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                <Clock className="h-3 w-3 text-slate-400" /> Date Reported
              </span>
              <p className="mt-1 font-mono text-[11px] text-slate-300">
                {incident.dateReported}
              </p>
            </div>

            <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3">
              <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                <Clock className="h-3 w-3 text-cyan-400" /> Last Updated
              </span>
              <p className="mt-1 font-mono text-[11px] text-cyan-300">
                {incident.lastUpdated}
              </p>
            </div>
          </div>

          {/* Editable Incident Description */}
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block mb-1.5">
              Intelligence Briefing & Field Telemetry
            </label>
            <textarea
              rows={3}
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              className="w-full rounded-xl border border-navy-800 bg-navy-950/80 p-3.5 text-xs md:text-sm text-slate-200 leading-relaxed focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>

          {/* Editable Section: Status, Severity & Assigned Team */}
          <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-r from-navy-850 to-navy-900/90 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-700/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
                  Response Dispatch & Lifecycle Controls
                </span>
              </div>

              {/* Quick Lifecycle Actions */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSave(INCIDENT_STATUS.INVESTIGATING)}
                  disabled={isSaving}
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-amber-300 hover:bg-amber-500/20"
                >
                  Investigate
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(INCIDENT_STATUS.CONTAINED)}
                  disabled={isSaving}
                  className="rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-purple-300 hover:bg-purple-500/20"
                >
                  Contain
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(INCIDENT_STATUS.RESOLVED)}
                  disabled={isSaving}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-300 hover:bg-emerald-500/20"
                >
                  Resolve
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none font-medium"
                >
                  <option value={INCIDENT_STATUS.OPEN}>Open</option>
                  <option value={INCIDENT_STATUS.INVESTIGATING}>Investigating</option>
                  <option value={INCIDENT_STATUS.CONTAINED}>Contained</option>
                  <option value={INCIDENT_STATUS.RESOLVED}>Resolved</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Severity
                </label>
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none font-medium"
                >
                  <option value={INCIDENT_SEVERITY.CRITICAL}>Critical</option>
                  <option value={INCIDENT_SEVERITY.HIGH}>High</option>
                  <option value={INCIDENT_SEVERITY.MEDIUM}>Medium</option>
                  <option value={INCIDENT_SEVERITY.LOW}>Low</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Assigned Unit
                </label>
                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none font-medium"
                >
                  {RESPONSE_TEAMS.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Persisted Activity History for this Incident */}
          <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-4">
            <div className="flex items-center gap-2 mb-2.5 text-xs font-mono font-bold uppercase text-slate-300">
              <History className="h-3.5 w-3.5 text-cyan-400" />
              <span>Incident Audit Trail ({activityLogs.length})</span>
            </div>
            {activityLogs.length > 0 ? (
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {activityLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] border-b border-navy-800/60 pb-1.5"
                  >
                    <span className="text-slate-300">{log.description}</span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {log.createdAt}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No audit entries recorded for this incident yet.</p>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-700/80 px-6 py-4 bg-navy-850/80">
          <div className="flex items-center gap-3">
            {canDelete && onDeleteIncident && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all border ${
                  confirmDelete
                    ? 'bg-red-600 text-white border-red-500 hover:bg-red-500'
                    : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{confirmDelete ? 'Confirm Delete' : 'Delete'}</span>
              </button>
            )}
            {saveSuccess && (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Saved to SQLite!
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-navy-700 bg-navy-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-navy-700 hover:text-white transition-all"
            >
              Close
            </button>
            {canModify && (
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:from-cyan-400 hover:to-blue-500 transition-all shadow-cyan-500/20 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
