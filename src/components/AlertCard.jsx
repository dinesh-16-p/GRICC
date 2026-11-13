import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  MapPin,
  Tag,
  ShieldCheck,
  Check,
  ExternalLink,
} from 'lucide-react';
import { ALERT_SEVERITY } from '../data/intelligenceData';

export default function AlertCard({ alert, onAcknowledge, onResolve, canModify = true }) {
  const {
    id,
    title,
    country,
    region,
    category,
    severity,
    timestamp,
    summary,
    source,
    status,
  } = alert;

  // Severity specific colors matching prompt:
  // Red for Critical, orange for High, yellow for Medium, green for Low
  const severityConfig = {
    [ALERT_SEVERITY.CRITICAL]: {
      badge: 'bg-red-500/15 text-red-400 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.25)]',
      border: 'border-l-4 border-l-red-500',
      icon: AlertOctagon,
      iconColor: 'text-red-400',
      accentDot: 'bg-red-500 shadow-[0_0_6px_#ef4444]',
    },
    [ALERT_SEVERITY.HIGH]: {
      badge: 'bg-orange-500/15 text-orange-400 border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.25)]',
      border: 'border-l-4 border-l-orange-500',
      icon: AlertTriangle,
      iconColor: 'text-orange-400',
      accentDot: 'bg-orange-500 shadow-[0_0_6px_#f97316]',
    },
    [ALERT_SEVERITY.MEDIUM]: {
      badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40 shadow-[0_0_10px_rgba(234,179,8,0.25)]',
      border: 'border-l-4 border-l-yellow-400',
      icon: AlertCircle,
      iconColor: 'text-yellow-400',
      accentDot: 'bg-yellow-400 shadow-[0_0_6px_#facc15]',
    },
    [ALERT_SEVERITY.LOW]: {
      badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.25)]',
      border: 'border-l-4 border-l-emerald-500',
      icon: CheckCircle2,
      iconColor: 'text-emerald-400',
      accentDot: 'bg-emerald-400 shadow-[0_0_6px_#34d399]',
    },
  };

  const config = severityConfig[severity] || severityConfig[ALERT_SEVERITY.LOW];
  const SeverityIcon = config.icon;

  const isResolved = status === 'resolved';
  const isAcknowledged = status === 'acknowledged';

  return (
    <article
      className={`group relative flex flex-col justify-between rounded-xl border border-navy-700/70 bg-gradient-to-b from-navy-850/90 to-navy-900/90 p-4 transition-all duration-200 hover:border-cyan-500/40 hover:shadow-lg ${
        config.border
      } ${isResolved ? 'opacity-70 bg-navy-950/60' : ''}`}
    >
      {/* Top Header: ID, Severity Badge, Status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-slate-400 tracking-wider">
            {id}
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-navy-700" />
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${config.badge}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${config.accentDot}`} />
            {severity}
          </span>
        </div>

        {/* Status Pill */}
        <div>
          {isResolved ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="h-3 w-3" />
              RESOLVED
            </span>
          ) : isAcknowledged ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-cyan-300 border border-blue-500/30">
              <Check className="h-3 w-3" />
              ACKNOWLEDGED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-navy-800 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-400 border border-navy-700">
              ACTIVE
            </span>
          )}
        </div>
      </div>

      {/* Alert Title */}
      <div className="mt-2.5">
        <h4 className="text-sm font-semibold tracking-wide text-white group-hover:text-cyan-200 transition-colors">
          {title}
        </h4>
      </div>

      {/* Country, Region & Category Tags */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1 font-medium text-slate-300">
          <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          {country}, <span className="text-slate-400">{region}</span>
        </span>
        <span className="text-navy-700">•</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400/90 bg-navy-950/80 px-2 py-0.5 rounded border border-navy-700/60">
          <Tag className="h-3 w-3 text-cyan-400" />
          {category}
        </span>
      </div>

      {/* Intelligence Summary */}
      <p className="mt-2.5 text-xs text-slate-300 leading-relaxed bg-navy-950/40 p-2.5 rounded-lg border border-navy-800/80">
        {summary}
      </p>

      {/* Metadata: Date/Time & Source Label */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-navy-800/80 pt-2.5 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-mono">
            <Clock className="h-3 w-3 text-slate-400" />
            {timestamp}
          </span>
          {alert.isLive ? (
            <span className="font-mono text-[9px] font-bold text-cyan-300 bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-500/40">
              ● LIVE INTEL
            </span>
          ) : (
            <span className="font-mono text-[9px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              DEMO DATA
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-slate-300 bg-navy-950 px-2 py-0.5 rounded border border-navy-700/60 truncate max-w-[200px]">
            {source}
          </span>
          {alert.url && (
            <a
              href={alert.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-200 transition-colors p-0.5"
              title="Open authoritative source dispatch"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Alert Action Buttons: Acknowledge & Mark as Resolved (ADMIN & ANALYST only) */}
      {canModify && (
        <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-navy-800/80 pt-2.5">
        <button
          onClick={() => onAcknowledge(id)}
          disabled={isResolved}
          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
            isAcknowledged
              ? 'bg-blue-500/20 text-cyan-300 border border-blue-500/40'
              : 'border border-navy-700 bg-navy-800 text-slate-300 hover:border-cyan-500/40 hover:text-white hover:bg-navy-750'
          } ${isResolved ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Acknowledge alert telemetry"
        >
          <Check className="h-3.5 w-3.5 text-cyan-400" />
          <span>{isAcknowledged ? 'Acknowledged' : 'Acknowledge'}</span>
        </button>

        <button
          onClick={() => onResolve(id)}
          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
            isResolved
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'border border-navy-700 bg-navy-800 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 hover:bg-navy-750'
          }`}
          title="Mark alert as resolved"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span>{isResolved ? 'Resolved' : 'Mark as Resolved'}</span>
        </button>
        </div>
      )}
    </article>
  );
}
