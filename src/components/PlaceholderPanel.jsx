import React from 'react';
import { Maximize2, MoreHorizontal, Radar, Activity } from 'lucide-react';

export default function PlaceholderPanel({
  title,
  subtitle,
  badge = 'STANDBY',
  icon: Icon = Radar,
  height = 'h-80',
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 shadow-xl backdrop-blur-sm overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-navy-700/60 px-6 py-4 bg-navy-900/50">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-800/80 border border-navy-700 text-cyan-400">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-white">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-slate-400 font-medium">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-400 tracking-wider">
            {badge}
          </span>
          <button
            className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-800 hover:text-slate-200 transition-colors"
            title="Options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Panel Body / Placeholder Workspace */}
      <div
        className={`relative flex ${height} flex-col items-center justify-center p-6 text-center overflow-hidden`}
      >
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#14234b_1px,transparent_1px),linear-gradient(to_bottom,#14234b_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-25" />

        {/* Central placeholder graphic */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-cyan-500/40 bg-navy-950/60 shadow-[0_0_25px_rgba(6,182,212,0.1)]">
            <Icon className="h-8 w-8 text-cyan-400/80 animate-pulse" />
            <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-cyan-400/60" />
          </div>

          <h4 className="text-sm font-medium text-slate-200">
            {title} Component
          </h4>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            Visualization panel initialized. Awaiting Phase 2 module telemetry and data mapping.
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-full border border-navy-700 bg-navy-950/80 px-3 py-1 text-[11px] font-mono text-cyan-400/80">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
            STATUS: READY FOR DATA BINDING
          </div>
        </div>
      </div>
    </div>
  );
}

