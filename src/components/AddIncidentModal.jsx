import React, { useState } from 'react';
import { X, PlusCircle, Check, MapPin } from 'lucide-react';
import {
  INCIDENT_STATUS,
  INCIDENT_SEVERITY,
  INCIDENT_CATEGORIES,
  RESPONSE_TEAMS,
} from '../data/incidentData';

export default function AddIncidentModal({ isOpen, onClose, onAddIncident }) {
  const [formData, setFormData] = useState({
    title: '',
    country: '',
    location: '',
    category: INCIDENT_CATEGORIES[0],
    severity: INCIDENT_SEVERITY.HIGH,
    assignedTeam: RESPONSE_TEAMS[0],
    description: '',
    latitude: '',
    longitude: '',
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  if (!isOpen) return null;

  const validate = () => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Incident title is required';
    if (!formData.country.trim()) newErrors.country = 'Country is required';
    if (!formData.location.trim()) newErrors.location = 'Location / Facility is required';
    if (!formData.description.trim()) newErrors.description = 'Incident description is required';

    if (formData.latitude !== '') {
      const lat = Number(formData.latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        newErrors.latitude = 'Latitude must be between -90 and 90';
      }
    }
    if (formData.longitude !== '') {
      const lng = Number(formData.longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        newErrors.longitude = 'Longitude must be between -180 and 180';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const newIncident = {
      title: formData.title.trim(),
      country: formData.country.trim(),
      location: formData.location.trim(),
      category: formData.category,
      severity: formData.severity,
      status: INCIDENT_STATUS.OPEN,
      assignedTeam: formData.assignedTeam,
      description: formData.description.trim(),
      latitude: formData.latitude !== '' ? Number(formData.latitude) : null,
      longitude: formData.longitude !== '' ? Number(formData.longitude) : null,
    };

    try {
      await onAddIncident(newIncident);
      setFormData({
        title: '',
        country: '',
        location: '',
        category: INCIDENT_CATEGORIES[0],
        severity: INCIDENT_SEVERITY.HIGH,
        assignedTeam: RESPONSE_TEAMS[0],
        description: '',
        latitude: '',
        longitude: '',
      });
      setErrors({});
      onClose();
    } catch (err) {
      setSubmitError(err.message || 'Failed to save incident to database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl rounded-2xl border border-navy-700/80 bg-navy-900 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-navy-700/80 px-6 py-4 bg-navy-850/80">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Register New Incident
              </h3>
              <p className="text-xs text-slate-400">
                Persist a new operational incident into the SQLite Command Register
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {submitError && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs font-mono text-red-300">
              {submitError}
            </div>
          )}

          {/* Incident Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Incident Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Critical SCADA Loop Anomaly at Transmission Substation"
              className={`w-full rounded-xl border bg-navy-950 px-3.5 py-2 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 transition-all ${
                errors.title
                  ? 'border-red-500/80 focus:ring-red-500'
                  : 'border-navy-700 focus:border-cyan-500 focus:ring-cyan-500/50'
              }`}
            />
            {errors.title && (
              <p className="mt-1 text-[11px] text-red-400 font-mono">{errors.title}</p>
            )}
          </div>

          {/* Country & Location Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Country <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="e.g. Singapore, Japan, United States"
                className={`w-full rounded-xl border bg-navy-950 px-3.5 py-2 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 transition-all ${
                  errors.country
                    ? 'border-red-500/80 focus:ring-red-500'
                    : 'border-navy-700 focus:border-cyan-500 focus:ring-cyan-500/50'
                }`}
              />
              {errors.country && (
                <p className="mt-1 text-[11px] text-red-400 font-mono">{errors.country}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Specific Location <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. Jurong Island Petrochemical Cluster"
                className={`w-full rounded-xl border bg-navy-950 px-3.5 py-2 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 transition-all ${
                  errors.location
                    ? 'border-red-500/80 focus:ring-red-500'
                    : 'border-navy-700 focus:border-cyan-500 focus:ring-cyan-500/50'
                }`}
              />
              {errors.location && (
                <p className="mt-1 text-[11px] text-red-400 font-mono">{errors.location}</p>
              )}
            </div>
          </div>

          {/* Optional Coordinates for Global Risk Map */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-cyan-400" /> Latitude (Optional)
              </label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                placeholder="e.g. 1.3521"
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 font-mono"
              />
              {errors.latitude && (
                <p className="mt-1 text-[11px] text-red-400 font-mono">{errors.latitude}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-cyan-400" /> Longitude (Optional)
              </label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                placeholder="e.g. 103.8198"
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 font-mono"
              />
              {errors.longitude && (
                <p className="mt-1 text-[11px] text-red-400 font-mono">{errors.longitude}</p>
              )}
            </div>
          </div>

          {/* Category & Severity Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Incident Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs md:text-sm text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              >
                {INCIDENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Severity Level
              </label>
              <select
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs md:text-sm text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 font-mono"
              >
                <option value={INCIDENT_SEVERITY.CRITICAL}>Critical (P1)</option>
                <option value={INCIDENT_SEVERITY.HIGH}>High (P2)</option>
                <option value={INCIDENT_SEVERITY.MEDIUM}>Medium (P3)</option>
                <option value={INCIDENT_SEVERITY.LOW}>Low (P4)</option>
              </select>
            </div>
          </div>

          {/* Assigned Team */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Assigned Operational Team
            </label>
            <select
              value={formData.assignedTeam}
              onChange={(e) => setFormData({ ...formData, assignedTeam: e.target.value })}
              className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs md:text-sm text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            >
              {RESPONSE_TEAMS.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Incident Description & Field Notes <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Provide situational telemetry, containment steps, or threat indicators..."
              className={`w-full rounded-xl border bg-navy-950 px-3.5 py-2 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 transition-all ${
                errors.description
                  ? 'border-red-500/80 focus:ring-red-500'
                  : 'border-navy-700 focus:border-cyan-500 focus:ring-cyan-500/50'
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-[11px] text-red-400 font-mono">{errors.description}</p>
            )}
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-navy-700/80 px-6 py-4 bg-navy-850/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-navy-700 bg-navy-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-navy-700 hover:text-white transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:from-cyan-400 hover:to-blue-500 transition-all shadow-cyan-500/20 disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            <span>{isSubmitting ? 'Saving...' : 'Create Incident'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
