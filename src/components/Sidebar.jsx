import React from 'react';
import {
  LayoutDashboard,
  Globe,
  Radio,
  AlertTriangle,
  BarChart3,
  Server,
  Flag,
  FileText,
  Settings,
  ShieldAlert,
  Users,
  FileLock2,
  TrendingUp,
  ShieldCheck,
  Cpu,
  Compass,
  Bot,
  MessageSquare,
  X,
} from 'lucide-react';

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'risk-map', label: 'Global Risk Map', icon: Globe, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'geospatial', label: 'Geospatial Intel', icon: Compass, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'intel-feed', label: 'Intelligence Feed', icon: Radio, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'incidents', label: 'Incident Management', icon: AlertTriangle, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'analytics', label: 'Risk Analytics', icon: BarChart3, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'advanced-analytics', label: 'Advanced Analytics', icon: Cpu, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'predictive', label: 'Predictive Intel', icon: TrendingUp, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'decisions', label: 'Strategic Response', icon: ShieldCheck, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'ai-assistant', label: 'AI Intelligence', icon: Bot, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'monitoring', label: 'Real-Time Monitoring', icon: Radio, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'collaboration', label: 'Intelligence Collaboration', icon: MessageSquare, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'sources', label: 'Data Source Health', icon: Server, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'country-risk', label: 'Country Risk', icon: Flag, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'reports', label: 'Reports', icon: FileText, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'users', label: 'User Management', icon: Users, roles: ['ADMIN'] },
  { id: 'audit-logs', label: 'Audit Logs', icon: FileLock2, roles: ['ADMIN'] },
  { id: 'security', label: 'Security Administration', icon: ShieldAlert, roles: ['ADMIN'] },
  { id: 'performance', label: 'Performance Monitoring', icon: Cpu, roles: ['ADMIN'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
];

export default function Sidebar({ activeTab, setActiveTab, mobileOpen, setMobileOpen, currentUser }) {
  const userRole = currentUser?.role || 'VIEWER';
  const visibleItems = navigationItems.filter((item) => item.roles.includes(userRole));
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/80 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-72 flex-col border-r border-navy-700/60 bg-navy-900/95 backdrop-blur-md transition-transform duration-300 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-20 items-center justify-between px-6 border-b border-navy-700/60">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
              <ShieldAlert className="h-6 w-6 text-cyan-400" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xl tracking-wider text-white">GRICC</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  HQ
                </span>
              </div>
              <p className="text-[11px] font-medium tracking-wide text-slate-400">
                Command Centre
              </p>
            </div>
          </div>

          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-800 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="px-3 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Operations & Intelligence
            </p>
          </div>
          <nav className="space-y-1.5">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileOpen(false);
                  }}
                  className={`group relative flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500/15 to-blue-600/10 text-cyan-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border border-cyan-500/30 font-semibold'
                      : 'text-slate-400 hover:bg-navy-800/60 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {/* Left active accent bar */}
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                  )}

                  <Icon
                    className={`h-5 w-5 transition-colors ${
                      isActive
                        ? 'text-cyan-400'
                        : 'text-slate-400 group-hover:text-slate-300'
                    }`}
                  />
                  <span className="tracking-wide">{item.label}</span>

                  {isActive && (
                    <span className="ml-auto h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer / System Badge */}
        <div className="p-4 border-t border-navy-700/60 bg-navy-950/40">
          <div className="rounded-xl border border-navy-700/60 bg-navy-850/60 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Clearance Level</span>
              <span className="text-cyan-400 font-semibold tracking-wider">DEFCON 4</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-navy-950 overflow-hidden">
              <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              Encrypted Operational Telemetry Active
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

