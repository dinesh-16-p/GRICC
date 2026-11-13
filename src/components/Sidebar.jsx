import React from 'react';
import {
  LayoutDashboard,
  Globe,
  Globe2,
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
  { id: 'home', label: 'Platform Home', icon: Globe2, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
  { id: 'dashboard', label: 'Command Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'ANALYST', 'VIEWER'] },
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
          className="fixed inset-0 z-40 bg-midnight-base/85 backdrop-blur-md lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-72 flex-col border-r border-midnight-border bg-midnight-surface/98 backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-20 items-center justify-between px-6 border-b border-midnight-border">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-cyan/20 to-blue-600/30 border border-accent-cyan/40 shadow-[0_0_15px_rgba(0,194,255,0.2)]">
              <ShieldAlert className="h-6 w-6 text-accent-cyan" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-accent-cyan"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xl tracking-wider text-accent-ice">GRICC</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30">
                  NEXUS
                </span>
              </div>
              <p className="text-[11px] font-medium tracking-wide text-accent-muted">
                Command Centre
              </p>
            </div>
          </div>

          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-accent-muted hover:bg-midnight-blue hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="px-3 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-muted font-mono">
              Operations & Intelligence
            </p>
          </div>
          <nav className="space-y-1">
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
                  className={`group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-accent-cyan/15 to-blue-600/10 text-accent-cyan shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border border-accent-cyan/35 font-semibold'
                      : 'text-accent-secondary hover:bg-midnight-blue/70 hover:text-accent-ice border border-transparent'
                  }`}
                >
                  {/* Left active accent bar */}
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-accent-cyan shadow-[0_0_8px_#00C2FF]" />
                  )}

                  <Icon
                    className={`h-4 w-4 transition-colors ${
                      isActive
                        ? 'text-accent-cyan'
                        : 'text-accent-muted group-hover:text-accent-ice'
                    }`}
                  />
                  <span className="tracking-wide">{item.label}</span>

                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-cyan shadow-[0_0_6px_#00C2FF]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer / System Badge */}
        <div className="p-4 border-t border-midnight-border bg-midnight-base/60">
          <div className="rounded-xl border border-midnight-border bg-midnight-surface p-3.5 shadow-md">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-accent-muted">Clearance Level</span>
              <span className="text-accent-cyan font-bold tracking-wider">DEFCON 4</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-midnight-base overflow-hidden">
              <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-blue-500 to-accent-cyan shadow-[0_0_8px_rgba(0,194,255,0.5)]" />
            </div>
            <p className="mt-2 text-[10px] font-mono text-accent-muted flex items-center justify-between">
              <span>ENCRYPTED SSE TELEMETRY</span>
              <span className="h-1.5 w-1.5 rounded-full bg-accent-teal" />
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

