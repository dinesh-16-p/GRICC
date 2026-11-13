import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import apiService from '../services/apiService';
import {
  FileText,
  Download,
  Plus,
  RefreshCw,
  ShieldAlert,
  Eye,
  CheckCircle2,
} from 'lucide-react';

const REPORT_OPTIONS = [
  { value: 'GLOBAL_RISK_SUMMARY', label: 'Global Risk Summary' },
  { value: 'COUNTRY_RISK_REPORT', label: 'Country Risk Report' },
  { value: 'INCIDENT_SITREP', label: 'Incident Situation Report (SITREP)' },
  { value: 'CRITICAL_ALERT_REPORT', label: 'Critical Alert Report' },
  { value: 'HISTORICAL_INCIDENT_REPORT', label: 'Historical Incident Report' },
  { value: 'AUDIT_ACTIVITY_REPORT', label: 'Audit Activity Report (Admin Only)', adminOnly: true },
];

export default function ReportsPage({
  currentUser,
  countries = [],
  canModify = false,
  isAdmin = false,
}) {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  // Generator form state
  const [reportType, setReportType] = useState('GLOBAL_RISK_SUMMARY');
  const [country, setCountry] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [severity, setSeverity] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [customTitle, setCustomTitle] = useState('');

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await apiService.getReports();
      const list = res?.reports || [];
      setReports(list);
      if (list.length > 0 && !selectedReport) {
        setSelectedReport(list[0]);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load reports.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedReport]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError('');
    setIsGenerating(true);
    try {
      const res = await apiService.generateReport({
        reportType,
        title: customTitle.trim(),
        filters: { country, dateFrom, dateTo, severity, status },
        isPublished: true,
      });
      if (res?.report) {
        setReports((prev) => [res.report, ...prev]);
        setSelectedReport(res.report);
        setCustomTitle('');
      }
    } catch (err) {
      setError(err?.message || 'Failed to generate report.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (format) => {
    if (!selectedReport) return;
    setError('');
    try {
      await apiService.downloadReport(selectedReport.id, format);
    } catch (err) {
      setError(err?.message || `Failed to export ${format.toUpperCase()}.`);
    }
  };

  const handleTogglePublish = async (report) => {
    try {
      const res = await apiService.updateReportPublish(report.id, !report.isPublished);
      if (res?.report) {
        setReports((prev) => prev.map((r) => (r.id === report.id ? res.report : r)));
        if (selectedReport?.id === report.id) {
          setSelectedReport(res.report);
        }
      }
    } catch (err) {
      setError(err?.message || 'Failed to update publish status.');
    }
  };

  const uniqueCountries = Array.from(new Set(countries.map((c) => c.country || c).filter(Boolean))).sort();

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-navy-700/60 bg-navy-900/90 p-6 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-400">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white uppercase">
              Executive Intelligence Reporting
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              SQLite-backed SITREPs, risk summaries, and exportable PDF / CSV / JSON intelligence briefs
            </p>
          </div>
        </div>

        <button
          onClick={loadReports}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs font-mono text-cyan-300 hover:bg-navy-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Reports</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Report Generator Form (ADMIN & ANALYST only) */}
      {canModify && (
        <form
          onSubmit={handleGenerate}
          className="rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between border-b border-navy-800 pb-3">
            <span className="font-mono font-bold text-white uppercase">Generate New Report</span>
            <span className="font-mono text-[11px] text-slate-400">
              Author: {currentUser?.username} ({currentUser?.role})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-mono text-slate-400 mb-1">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              >
                {REPORT_OPTIONS.filter((opt) => !opt.adminOnly || isAdmin).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-slate-400 mb-1">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="ALL">All Countries</option>
                {uniqueCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-slate-400 mb-1">Custom Title (Optional)</label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Executive Weekly Brief"
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block font-mono text-slate-400 mb-1">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-slate-400 mb-1">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-mono text-slate-400 mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label className="block font-mono text-slate-400 mb-1">Incident Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-navy-700 bg-navy-950 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="Open">Open</option>
                <option value="Investigating">Investigating</option>
                <option value="Contained">Contained</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>{isGenerating ? 'Generating...' : 'Generate Report'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Split Layout: Reports Register + Report Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Saved Reports List */}
        <div className="lg:col-span-4 rounded-2xl border border-navy-700/60 bg-navy-900/70 p-4 space-y-3">
          <h3 className="text-xs font-mono font-bold text-slate-300 uppercase">
            {canModify ? 'Generated Reports' : 'Published Reports'} ({reports.length})
          </h3>
          <div className="space-y-2 max-h-[540px] overflow-y-auto">
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedReport(r)}
                className={`w-full text-left rounded-xl border p-3 text-xs transition-colors ${
                  selectedReport?.id === r.id
                    ? 'border-cyan-500/60 bg-navy-850'
                    : 'border-navy-800 bg-navy-950/60 hover:border-navy-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-cyan-400 font-bold">{r.id}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {r.isPublished ? 'PUBLISHED' : 'DRAFT'}
                  </span>
                </div>
                <div className="font-semibold text-white mt-1 line-clamp-2">{r.title}</div>
                <div className="text-[10px] font-mono text-slate-400 mt-1">
                  {new Date(r.createdAt).toLocaleString()} • {r.generatedBy}
                </div>
              </button>
            ))}
            {reports.length === 0 && (
              <p className="py-8 text-center text-xs font-mono text-slate-400">
                No reports available yet.
              </p>
            )}
          </div>
        </div>

        {/* Report Preview & Export */}
        <div className="lg:col-span-8 rounded-2xl border border-navy-700/60 bg-navy-900/70 p-5 space-y-5">
          {selectedReport ? (
            <>
              {/* GRICC Branded Report Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-navy-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                    <ShieldAlert className="h-4 w-4" />
                    <span>GRICC OFFICIAL INTELLIGENCE REPORT • {selectedReport.id}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">{selectedReport.title}</h3>
                  <div className="text-[11px] font-mono text-slate-400">
                    Generated: {new Date(selectedReport.createdAt).toLocaleString()} | By:{' '}
                    {selectedReport.generatedBy} ({selectedReport.generatedByRole})
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Filters: {JSON.stringify(selectedReport.filters)}
                  </div>
                </div>

                {canModify && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePublish(selectedReport)}
                      className="inline-flex items-center gap-1 rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-[11px] font-mono text-slate-300 hover:text-white"
                    >
                      {selectedReport.isPublished ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Eye className="h-3.5 w-3.5" />}
                      <span>{selectedReport.isPublished ? 'Published' : 'Publish'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload('pdf')}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-mono font-bold text-red-300 hover:bg-red-500/20"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload('csv')}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-mono font-bold text-emerald-300 hover:bg-emerald-500/20"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload('json')}
                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-mono font-bold text-cyan-300 hover:bg-cyan-500/20"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>JSON</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Summary Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(selectedReport.summary || {}).map(([key, val]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-navy-800 bg-navy-950/60 p-3 text-xs"
                  >
                    <div className="text-[10px] font-mono uppercase text-slate-400">{key}</div>
                    <div className="text-lg font-bold text-white mt-0.5">{val}</div>
                  </div>
                ))}
              </div>

              {/* Severity Distribution Chart */}
              {selectedReport.payload?.severityBreakdown?.length > 0 && (
                <div className="rounded-xl border border-navy-800 bg-navy-950/50 p-4">
                  <div className="text-xs font-mono font-bold text-slate-300 uppercase mb-2">
                    Filtered Incident Severity Breakdown
                  </div>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={selectedReport.payload.severityBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Data Table */}
              <div className="overflow-x-auto rounded-xl border border-navy-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-navy-800 bg-navy-950 font-mono text-[10px] uppercase text-slate-400">
                      {(selectedReport.payload?.columns || []).map((col) => (
                        <th key={col} className="px-3 py-2.5">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800/80">
                    {(selectedReport.payload?.rows || []).slice(0, 25).map((row, idx) => (
                      <tr key={idx} className="hover:bg-navy-850/50">
                        {Object.values(row).map((cell, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 text-slate-200">
                            {String(cell ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Data Source & Methodology Footer */}
              <div className="rounded-xl border border-navy-800 bg-navy-950/60 p-3.5 text-[11px] font-mono text-slate-400 space-y-1">
                <div>
                  <strong className="text-slate-200">Data Source:</strong>{' '}
                  {selectedReport.payload?.dataSources?.primaryStore}
                </div>
                <div>
                  <strong className="text-slate-200">Methodology:</strong>{' '}
                  {selectedReport.payload?.methodology}
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-xs font-mono text-slate-400">
              Select a report from the list or generate a new report.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

