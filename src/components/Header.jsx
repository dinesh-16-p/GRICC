import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Menu, LogOut, ChevronDown, Shield } from 'lucide-react';

export default function Header({
  onMenuClick,
  operationalMode = 'DEMO MODE',
  isRefreshing = false,
  currentUser = null,
  onLogout,
  unreadNotifications = 0,
  onOpenNotifications,
}) {
  const isLive = operationalMode === 'LIVE MODE';
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = (currentUser?.fullName || currentUser?.username || 'GR')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const roleBadgeColor =
    currentUser?.role === 'ADMIN'
      ? 'text-red-300'
      : currentUser?.role === 'ANALYST'
        ? 'text-cyan-400'
        : 'text-slate-300';

  return (
    <header className="sticky top-0 z-30 flex h-20 w-full items-center justify-between border-b border-navy-700/60 bg-navy-900/90 px-4 md:px-8 backdrop-blur-md">
      {/* Left Section: Mobile Menu + Page Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-slate-400 hover:bg-navy-800 hover:text-white lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-6 w-6" />
        </button>

        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-white">
              Global Risk Intelligence
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-400 border border-blue-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
              SECURE
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">
            Global Risk Intelligence Command Centre • Operational View
          </p>
        </div>
      </div>

      {/* Middle & Right Section: Search, Status, Notification, Profile */}
      <div className="flex items-center gap-3 md:gap-5">
        {/* Search Bar */}
        <div className="relative hidden md:block w-64 lg:w-80">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            placeholder="Search threats, regions, incidents..."
            className="w-full rounded-xl border border-navy-700/80 bg-navy-950/60 py-2 pl-10 pr-4 text-xs md:text-sm text-slate-200 placeholder-slate-400 focus:border-cyan-500/60 focus:bg-navy-950 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
            readOnly
          />
          <kbd className="hidden lg:inline-flex absolute right-3 top-2.5 items-center rounded border border-navy-700 bg-navy-900 px-1.5 text-[10px] font-mono text-slate-400">
            ⌘K
          </kbd>
        </div>

        {/* System Status Indicator: DEMO MODE vs LIVE MODE */}
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-md transition-all ${
            isLive
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.1)]'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isLive ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isLive ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            ></span>
          </span>
          <span className="tracking-wider uppercase font-mono text-[11px]">
            {isRefreshing ? 'SYNCING...' : operationalMode}
          </span>
        </div>

        {/* Notification Icon with Live Unread Counter */}
        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative rounded-xl border border-navy-700/60 bg-navy-850/60 p-2.5 text-slate-300 hover:border-cyan-500/40 hover:bg-navy-800 hover:text-white transition-all"
          aria-label="View notifications"
        >
          <Bell className="h-4 w-4 md:h-5 md:w-5" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-mono font-bold text-white shadow-md">
              {unreadNotifications > 99 ? '99+' : unreadNotifications}
            </span>
          )}
        </button>

        {/* Divider */}
        <div className="hidden sm:block h-7 w-px bg-navy-700/60" />

        {/* User Profile Dropdown Menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className="flex items-center gap-3 pl-1 pr-2 py-1 rounded-xl hover:bg-navy-800/70 transition-colors"
            aria-label="Open user profile menu"
          >
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 font-semibold text-white shadow-md text-xs tracking-wider border border-cyan-400/30">
                {initials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-navy-900 bg-emerald-400"></span>
            </div>

            <div className="hidden text-left xl:block">
              <div className="text-xs font-semibold text-white leading-tight">
                {currentUser?.fullName || 'Operator'}
              </div>
              <div className={`text-[11px] font-mono font-bold ${roleBadgeColor}`}>
                {currentUser?.role || 'VIEWER'}
              </div>
            </div>

            <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-navy-700 bg-navy-900/95 p-4 shadow-2xl backdrop-blur-md z-50 space-y-3">
              <div className="border-b border-navy-800 pb-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    {currentUser?.fullName || 'Operator'}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold border border-navy-700 bg-navy-950 ${roleBadgeColor}`}
                  >
                    <Shield className="h-2.5 w-2.5" />
                    {currentUser?.role}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-400">@{currentUser?.username}</p>
                <p className="text-[11px] text-slate-400 truncate">{currentUser?.email}</p>
                {currentUser?.department && (
                  <p className="text-[11px] text-cyan-300/90">{currentUser.department}</p>
                )}
              </div>

              {currentUser?.lastLogin && (
                <div className="text-[10px] font-mono text-slate-400">
                  Last login: {new Date(currentUser.lastLogin).toLocaleString()}
                </div>
              )}

              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-xs font-mono font-bold text-red-300 hover:bg-red-500/20 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>SIGN OUT</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

