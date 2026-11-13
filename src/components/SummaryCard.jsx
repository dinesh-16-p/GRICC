import React, { memo } from 'react';

function SummaryCard({
  title,
  value = '—',
  subtext = 'Awaiting telemetry feed',
  icon: Icon,
  accentColor = 'cyan',
}) {
  const accentStyles = {
    cyan: {
      iconBg: 'bg-accent-cyan/10 border-accent-cyan/30 text-accent-cyan group-hover:border-accent-cyan/60 group-hover:shadow-[0_0_15px_rgba(0,194,255,0.25)]',
      dot: 'bg-accent-cyan shadow-[0_0_8px_#00C2FF]',
      borderHover: 'hover:border-accent-cyan/50',
      badge: 'border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan',
    },
    blue: {
      iconBg: 'bg-accent-teal/10 border-accent-teal/30 text-accent-teal group-hover:border-accent-teal/60 group-hover:shadow-[0_0_15px_rgba(54,214,176,0.25)]',
      dot: 'bg-accent-teal shadow-[0_0_8px_#36D6B0]',
      borderHover: 'hover:border-accent-teal/50',
      badge: 'border-accent-teal/30 bg-accent-teal/10 text-accent-teal',
    },
    amber: {
      iconBg: 'bg-risk-high/10 border-risk-high/30 text-risk-high group-hover:border-risk-high/60 group-hover:shadow-[0_0_15px_rgba(255,138,69,0.25)]',
      dot: 'bg-risk-high shadow-[0_0_8px_#FF8A45]',
      borderHover: 'hover:border-risk-high/50',
      badge: 'border-risk-high/30 bg-risk-high/10 text-risk-high',
    },
    indigo: {
      iconBg: 'bg-blue-600/10 border-blue-500/30 text-blue-400 group-hover:border-blue-400/60 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.25)]',
      dot: 'bg-blue-400 shadow-[0_0_8px_#3b82f6]',
      borderHover: 'hover:border-blue-500/50',
      badge: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
    },
  };

  const style = accentStyles[accentColor] || accentStyles.cyan;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-midnight-border bg-midnight-surface p-5 shadow-lg backdrop-blur-sm transition-all duration-300 ${style.borderHover} hover:-translate-y-0.5 hover:shadow-cyan-950/30`}
    >
      {/* Subtle top accent gradient line */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-accent-cyan/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent-muted font-mono">
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
        <span className="text-3xl font-extrabold tracking-tight font-mono text-accent-ice">
          {value}
        </span>
        <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${style.badge}`}>
          ACTIVE
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-midnight-border pt-3 text-xs text-accent-secondary">
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        <span className="truncate">{subtext}</span>
      </div>
    </div>
  );
}

export default memo(SummaryCard);

