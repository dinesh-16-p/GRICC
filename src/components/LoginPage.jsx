import React, { useState } from 'react';
import {
  ShieldAlert,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Clock,
} from 'lucide-react';

export default function LoginPage({ onLogin, sessionMessage = null }) {
  const [identifier, setIdentifier] = useState('dpillay851@gmail.com');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const quickAccounts = [
    { label: 'Dinesh Pillay', id: 'dpillay851@gmail.com', role: 'ADMIN', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    { label: 'Command Operator', id: 'operator@gricc.intel', role: 'ADMIN', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
    { label: 'Marcus Vance', id: 'admin@gricc.intel', role: 'ADMIN', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
    { label: 'Elena Rostova', id: 'analyst@gricc.intel', role: 'ANALYST', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
    { label: 'Julian Thorne', id: 'viewer@gricc.intel', role: 'VIEWER', badge: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
  ];

  const handleQuickLogin = async (accId) => {
    setIdentifier(accId);
    setPassword('admin123');
    setError('');
    setIsSubmitting(true);
    try {
      await onLogin(accId, 'admin123');
    } catch (err) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim() || !password) {
      setError('Please enter both your username (or email) and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onLogin(identifier.trim(), password);
    } catch (err) {
      setError(err?.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle Background Grid & Radial Glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.12),transparent_55%)]" />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* GRICC Brand Logo Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 shadow-[0_0_25px_rgba(6,182,212,0.2)]">
            <ShieldAlert className="h-9 w-9 text-cyan-400" />
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-wider text-white">GRICC</h1>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                HQ
              </span>
            </div>
            <p className="text-xs font-mono uppercase tracking-widest text-slate-400 mt-1">
              Global Risk Intelligence Command Centre
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-navy-700/70 bg-navy-900/90 p-7 shadow-2xl backdrop-blur-md space-y-5">
          <div className="border-b border-navy-800 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Lock className="h-4 w-4 text-cyan-400" />
              <span>Operator Authentication</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Sign in with your authorized command credentials to access intelligence feeds and incident operations.
            </p>
          </div>

          {sessionMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{sessionMessage}</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="gricc-identifier"
                className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5"
              >
                Username or Email
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="gricc-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="operator@gricc.intel"
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-navy-700 bg-navy-950/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="gricc-password"
                className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="gricc-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-navy-700 bg-navy-950/80 py-2.5 pl-10 pr-11 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 px-4 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>VERIFYING CREDENTIALS...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>AUTHENTICATE TO COMMAND CENTRE</span>
                </>
              )}
            </button>
          </form>

          {/* 1-Click Fast Dev Sign-In Selector */}
          <div className="pt-4 border-t border-navy-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono uppercase tracking-wider text-slate-400 font-bold">1-Click Fast Access</span>
              <span className="font-mono text-[10px] text-cyan-400">Password: admin123</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {quickAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleQuickLogin(acc.id)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-navy-950/70 hover:bg-navy-800 border border-navy-700/60 hover:border-cyan-500/50 text-xs transition-all text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-white font-medium truncate">{acc.label}</span>
                    <span className="text-slate-400 text-[11px] hidden sm:inline">({acc.id})</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold shrink-0 ${acc.badge}`}>
                    {acc.role}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-navy-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>RBAC PROTECTED</span>
            <span className="text-cyan-400/90">JWT + BCRYPT + AUDIT LOGGED</span>
          </div>
        </div>

        <p className="text-center text-[11px] font-mono text-slate-500">
          Authorized personnel only. All access attempts are audited.
        </p>
      </div>
    </div>
  );
}

