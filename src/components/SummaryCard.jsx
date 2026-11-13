import React from 'react';

export default function SummaryCard({
  title,
  value = '—',
  subtext = 'Awaiting telemetry feed',
  icon: Icon,
  accentColor = 'cyan',
}) {
  const accentStyles = {
    cyan: {
      iconBg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 group-hover:border-cyan-400/60 group-hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]',
      dot: 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]',
      borderHover: 'hover:border-cyan-500/40',
      valueText: 'text-cyan-300',
    },
    blue: {
      iconBg: 'bg-blue-500/10 border-blue-500/30 text-blue-400 group-hover:border-blue-400/60 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]',
      dot: 'bg-blue-400 shadow-[0_0_8px_#3b82f6]',
      borderHover: 'hover:border-blue-500/40',
      valueText: 'text-blue-300',
    },
    amber: {
      iconBg: 'bg-amber-500/10 border-amber-500/30 text-amber-400 group-hover:border-amber-400/60 group-hover:shadow-[0_0_15px_rgba(245,158,11,0.2)]',
      dot: 'bg-amber-400 shadow-[0_0_8px_#f59e0b]',
      borderHover: 'hover:border-amber-500/40',
      valueText: 'text-amber-300',
    },
    indigo: {
      iconBg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 group-hover:border-indigo-400/60 group-hover:shadow-[0_0_15px_rgba(99,102,241,0.2)]',
      dot: 'bg-indigo-400 shadow-[0_0_8px_#6366f1]',
      borderHover: 'hover:border-indigo-500/40',
      valueText: 'text-indigo-300',
    },
  };

  const style = accentStyles[accentColor] || accentStyles.cyan;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-5 shadow-lg backdrop-blur-sm transition-all duration-300 ${style.borderHover} hover:-translate-y-0.5 hover:shadow-cyan-950/30`}
    >
      {/* Subtle top accent gradient line */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </span>
        {Icon && (
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-300 ${style.iconBg}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tracking-tight font-mono text-white">
          {value}
        </span>
        <span className="text-xs font-medium text-slate-400 font-mono">
          [PLACEHOLDER]
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-navy-800/80 pt-3 text-xs text-slate-400">
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        <span className="truncate">{subtext}</span>
      </div>
    </div>
  );
}

