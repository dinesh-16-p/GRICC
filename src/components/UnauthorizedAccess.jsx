import React from 'react';
import { ShieldOff, ArrowLeft } from 'lucide-react';

export default function UnauthorizedAccess({
  requiredRole = 'ADMIN',
  currentRole = 'VIEWER',
  onReturnDashboard,
}) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-navy-900/80 p-10 text-center max-w-xl mx-auto my-8 shadow-2xl space-y-5">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/40 bg-red-500/15 text-red-400">
        <ShieldOff className="h-8 w-8" />
      </div>

      <div className="space-y-2">
        <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-3 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider text-red-300">
          HTTP 403 • ACCESS RESTRICTED
        </span>
        <h2 className="text-2xl font-bold text-white">Unauthorized Access</h2>
        <p className="text-sm text-slate-400">
          Your current role (<strong className="text-cyan-300 font-mono">{currentRole}</strong>) does not have permission to access this module. Required privilege:{' '}
          <strong className="text-white font-mono">{requiredRole}</strong>.
        </p>
      </div>

      {onReturnDashboard && (
        <button
          onClick={onReturnDashboard}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-xs font-mono font-bold text-cyan-300 hover:bg-cyan-500/25 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>RETURN TO DASHBOARD</span>
        </button>
      )}
    </div>
  );
}

