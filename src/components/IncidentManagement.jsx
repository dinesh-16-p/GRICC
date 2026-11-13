import React, { useState, useMemo } from 'react';
import AddIncidentModal from './AddIncidentModal';
import IncidentDetailsModal from './IncidentDetailsModal';
import {
  INCIDENT_STATUS,
  INCIDENT_SEVERITY,
} from '../data/incidentData';
import {
  ShieldAlert,
  Search,
  Filter,
  Plus,
  Eye,
  Clock,
  MapPin,
  Tag,
  AlertTriangle,
  CheckCircle2,
  Users,
  RefreshCw,
  Info,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';

export default function IncidentManagement({
  incidents,
  onAddIncident,
  onUpdateIncident,
  onDeleteIncident,
  canModify = true,
  canDelete = true,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [countryFilter, setCountryFilter] = useState('ALL');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Extract unique countries for the country filter dropdown
  const uniqueCountries = useMemo(() => {
    const countries = Array.from(new Set(incidents.map((i) => i.country))).filter(Boolean);
    return countries.sort();
  }, [incidents]);

  // Filtered and searched incidents
  const filteredIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      // 1. Search Query (ID, title, country, location)
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        incident.id.toLowerCase().includes(q) ||
        incident.title.toLowerCase().includes(q) ||
        incident.country.toLowerCase().includes(q) ||
        incident.location.toLowerCase().includes(q) ||
        incident.category.toLowerCase().includes(q);

      // 2. Severity Filter
      const matchesSeverity =
        severityFilter === 'ALL' || incident.severity === severityFilter;

      // 3. Status Filter
      const matchesStatus =
        statusFilter === 'ALL' || incident.status === statusFilter;

      // 4. Country Filter
      const matchesCountry =
        countryFilter === 'ALL' || incident.country === countryFilter;

      return matchesSearch && matchesSeverity && matchesStatus && matchesCountry;
    });
  }, [incidents, searchQuery, severityFilter, statusFilter, countryFilter]);

  // Severity styling map
  const severityBadge = (severity) => {
    switch (severity) {
      case INCIDENT_SEVERITY.CRITICAL:
        return 'bg-red-500/15 text-red-400 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.2)]';
      case INCIDENT_SEVERITY.HIGH:
        return 'bg-orange-500/15 text-orange-400 border-orange-500/40 shadow-[0_0_8px_rgba(249,115,22,0.2)]';
      case INCIDENT_SEVERITY.MEDIUM:
        return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40 shadow-[0_0_8px_rgba(234,179,8,0.2)]';
      case INCIDENT_SEVERITY.LOW:
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  // Status styling map
  const statusBadge = (status) => {
    switch (status) {
      case INCIDENT_STATUS.OPEN:
        return {
          pill: 'bg-blue-500/15 text-cyan-300 border-blue-500/40',
          dot: 'bg-cyan-400 animate-ping',
        };
      case INCIDENT_STATUS.INVESTIGATING:
        return {
          pill: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
          dot: 'bg-amber-400 animate-pulse',
        };
      case INCIDENT_STATUS.CONTAINED:
        return {
          pill: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
          dot: 'bg-purple-400',
        };
      case INCIDENT_STATUS.RESOLVED:
        return {
          pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
          dot: 'bg-emerald-400',
        };
      default:
        return {
          pill: 'bg-navy-800 text-slate-300 border-navy-700',
          dot: 'bg-slate-400',
        };
    }
  };

  const handleOpenDetails = (incident) => {
    setSelectedIncident(incident);
    setIsDetailsModalOpen(true);
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSeverityFilter('ALL');
    setStatusFilter('ALL');
    setCountryFilter('ALL');
  };

  // Metrics summary
  const openCount = incidents.filter((i) => i.status === INCIDENT_STATUS.OPEN).length;
  const investigatingCount = incidents.filter(
    (i) => i.status === INCIDENT_STATUS.INVESTIGATING
  ).length;
  const criticalCount = incidents.filter(
    (i) => i.severity === INCIDENT_SEVERITY.CRITICAL
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-navy-700/60 bg-gradient-to-r from-navy-850 to-navy-900/90 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">
                Incident Management Register
              </h2>
              <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
                ACTIVE QUEUE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Authoritative command log for threat containment, operational dispatch & mitigation
            </p>
          </div>
        </div>

        {/* Right Action: Add Incident Button */}
        {canModify && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:from-cyan-400 hover:to-blue-500 transition-all shadow-cyan-500/20 tracking-wide uppercase font-mono"
            >
              <Plus className="h-4 w-4" />
              <span>Add Incident</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Register Container */}
      <div className="rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 shadow-2xl backdrop-blur-sm overflow-hidden">
        {/* Controls: Search & Multi-Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-navy-800 p-5 bg-navy-950/40">
          {/* Search Bar */}
          <div className="relative w-full lg:w-80">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, title, country, location..."
              className="w-full rounded-xl border border-navy-700/80 bg-navy-950 py-2 pl-10 pr-4 text-xs text-slate-200 placeholder-slate-400 focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-[10px] font-mono text-slate-400 hover:text-white"
              >
                CLEAR
              </button>
            )}
          </div>

          {/* Filters Bar: Severity, Status, Country */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* Severity Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono uppercase text-slate-400">Severity:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              >
                <option value="ALL">All Severities</option>
                <option value={INCIDENT_SEVERITY.CRITICAL}>Critical</option>
                <option value={INCIDENT_SEVERITY.HIGH}>High</option>
                <option value={INCIDENT_SEVERITY.MEDIUM}>Medium</option>
                <option value={INCIDENT_SEVERITY.LOW}>Low</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono uppercase text-slate-400">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              >
                <option value="ALL">All Statuses</option>
                <option value={INCIDENT_STATUS.OPEN}>Open</option>
                <option value={INCIDENT_STATUS.INVESTIGATING}>Investigating</option>
                <option value={INCIDENT_STATUS.CONTAINED}>Contained</option>
                <option value={INCIDENT_STATUS.RESOLVED}>Resolved</option>
              </select>
            </div>

            {/* Country Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono uppercase text-slate-400">Country:</span>
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="rounded-lg border border-navy-700 bg-navy-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              >
                <option value="ALL">All Countries</option>
                {uniqueCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Filters */}
            {(searchQuery || severityFilter !== 'ALL' || statusFilter !== 'ALL' || countryFilter !== 'ALL') && (
              <button
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-1.5 text-xs text-cyan-400 hover:text-white hover:bg-navy-700 transition-colors"
                title="Reset all filters"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* 1. INCIDENT REGISTER TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-navy-700/80 bg-navy-900/90 text-[10px] uppercase font-mono tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Incident ID</th>
                <th className="px-5 py-3.5">Title & Scope</th>
                <th className="px-5 py-3.5">Country & Location</th>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-5 py-3.5">Severity</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Assigned Team</th>
                <th className="px-5 py-3.5">Reported</th>
                <th className="px-5 py-3.5">Last Updated</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/80">
              {filteredIncidents.length > 0 ? (
                filteredIncidents.map((incident) => {
                  const sInfo = statusBadge(incident.status);

                  return (
                    <tr
                      key={incident.id}
                      onClick={() => handleOpenDetails(incident)}
                      className="group cursor-pointer hover:bg-navy-800/50 transition-colors"
                    >
                      {/* Incident ID */}
                      <td className="px-5 py-4 font-mono font-bold text-cyan-400 whitespace-nowrap">
                        {incident.id}
                      </td>

                      {/* Title */}
                      <td className="px-5 py-4 max-w-xs">
                        <span className="font-semibold text-white group-hover:text-cyan-200 transition-colors line-clamp-2">
                          {incident.title}
                        </span>
                      </td>

                      {/* Country & Location */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-medium text-slate-200 flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-cyan-400" />
                          <span>{incident.country}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                          {incident.location}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded bg-navy-950 px-2 py-0.5 text-[11px] text-slate-300 border border-navy-700/60 font-mono">
                          {incident.category.split('&')[0]}
                        </span>
                      </td>

                      {/* Severity */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${severityBadge(
                            incident.severity
                          )}`}
                        >
                          {incident.severity}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${sInfo.pill}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${sInfo.dot}`} />
                          {incident.status}
                        </span>
                      </td>

                      {/* Assigned Team */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="text-[11px] text-slate-300 font-medium flex items-center gap-1">
                          <Users className="h-3 w-3 text-cyan-400 shrink-0" />
                          <span className="truncate max-w-[140px]">{incident.assignedTeam}</span>
                        </span>
                      </td>

                      {/* Date Reported */}
                      <td className="px-5 py-4 whitespace-nowrap font-mono text-[11px] text-slate-400">
                        {incident.dateReported.split(' ')[0]}
                      </td>

                      {/* Last Updated */}
                      <td className="px-5 py-4 whitespace-nowrap font-mono text-[11px] text-cyan-400">
                        {incident.lastUpdated.split(' ')[0]}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetails(incident);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-500/50 hover:text-white transition-colors"
                          title="View incident details"
                        >
                          <Eye className="h-3.5 w-3.5 text-cyan-400" />
                          <span>Dossier</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-navy-700 bg-navy-950 text-slate-400 mb-3">
                        <AlertTriangle className="h-6 w-6 text-slate-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-300">
                        No incidents matched the selected filters
                      </h4>
                      <p className="mt-1 text-xs text-slate-400">
                        Adjust query terms or reset filters to display active incident records.
                      </p>
                      <button
                        onClick={resetAllFilters}
                        className="mt-3 text-xs text-cyan-400 hover:underline font-mono"
                      >
                        Reset filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Register Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-navy-800 bg-navy-950/60 px-6 py-3 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              DISPLAYING: <strong className="text-white">{filteredIncidents.length}</strong> OF{' '}
              {incidents.length} INCIDENTS
            </span>
            <span>•</span>
            <span className="text-cyan-400">
              OPEN: {openCount} | INVESTIGATING: {investigatingCount}
            </span>
          </div>

          <div className="text-slate-400">
            REGISTER STATUS: OPERATIONAL • DEMO DATA
          </div>
        </div>
      </div>

      {/* Add Incident Modal */}
      <AddIncidentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddIncident={onAddIncident}
      />

      {/* Incident Details & Status/Team Update Modal */}
      <IncidentDetailsModal
        isOpen={isDetailsModalOpen}
        incident={incidents.find((i) => i.id === selectedIncident?.id) || selectedIncident}
        onClose={() => setIsDetailsModalOpen(false)}
        onUpdateIncident={onUpdateIncident}
        onDeleteIncident={onDeleteIncident}
        canModify={canModify}
        canDelete={canDelete}
      />
    </div>
  );
}
