import React from 'react';
import InteractiveGlobe from './InteractiveGlobe';
import {
  ShieldAlert,
  ArrowRight,
  Globe2,
  AlertTriangle,
  Radio,
  BarChart3,
  TrendingUp,
  Cpu,
  Bot,
  MapPin,
  CheckCircle2,
  Lock,
  Layers,
  Activity,
  Compass,
  FileText,
  Server,
  Zap,
} from 'lucide-react';

export default function PlatformHome({
  stats = null,
  alerts = [],
  incidents = [],
  countryProfiles = [],
  operationalMode = 'DEMO MODE',
  onNavigate,
  onSelectCountry,
}) {
  const isLive = operationalMode === 'LIVE MODE';

  // Compute live metrics from actual state
  const totalIncidentsCount = stats?.totalIncidents ?? incidents.length;
  const highRiskAreasCount = stats?.highRiskAreas ?? countryProfiles.filter((c) => c.riskScore >= 60).length;
  const activeAlertsCount = stats?.activeAlerts ?? alerts.filter((a) => a.status !== 'resolved').length;
  const criticalAlertsCount = stats?.criticalAlerts ?? alerts.filter((a) => a.severity === 'Critical').length;
  const monitoredCountriesCount = stats?.monitoredCountries ?? (countryProfiles.length > 0 ? countryProfiles.length : 12);

  // Top 3 recent alerts for the live highlights section
  const liveHighlights = alerts.slice(0, 3);

  // Top 4 critical/high incidents for featured developments
  const featuredIncidents = incidents
    .filter((i) => i.severity === 'Critical' || i.severity === 'High')
    .slice(0, 4);

  return (
    <div className="space-y-12">
      {/* =========================================================================
          1. HERO SECTION
          ========================================================================= */}
      <section className="relative overflow-hidden rounded-3xl border border-midnight-border bg-gradient-to-br from-midnight-surface via-midnight-base to-midnight-surface p-6 md:p-10 lg:p-12 shadow-2xl">
        {/* Subtle decorative background glow */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-accent-cyan/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-accent-teal/10 blur-3xl" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Branding, Headline, Supporting Text & CTAs */}
          <div className="lg:col-span-6 space-y-6">
            {/* Top Operational Pill */}
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-cyan/30 bg-midnight-blue/70 px-3.5 py-1.5 text-xs font-mono text-accent-cyan shadow-[0_0_15px_rgba(0,194,255,0.15)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-cyan opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-cyan"></span>
              </span>
              <span className="font-bold tracking-wider uppercase">GRICC NEXUS COMMAND PLATFORM</span>
              <span className="text-midnight-border">•</span>
              <span className="text-accent-secondary">{operationalMode}</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-accent-ice leading-[1.15]">
              GLOBAL INTELLIGENCE.{' '}
              <span className="bg-gradient-to-r from-accent-cyan to-accent-teal bg-clip-text text-transparent">
                DEEPER INSIGHTS.
              </span>
            </h1>

            {/* Supporting Text */}
            <p className="text-base sm:text-lg text-accent-secondary leading-relaxed max-w-xl">
              Understand global developments, assess geopolitical risks and explore emerging threats through a unified intelligence platform.
            </p>

            {/* Action CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <button
                onClick={() => onNavigate && onNavigate('dashboard')}
                className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-accent-cyan to-blue-600 px-6 py-3.5 text-sm font-bold text-midnight-base hover:from-cyan-400 hover:to-blue-500 transition-all shadow-[0_0_20px_rgba(0,194,255,0.3)] hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Access Command Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => onNavigate && onNavigate('risk-map')}
                className="inline-flex items-center gap-2 rounded-xl border border-midnight-border bg-midnight-blue/60 px-5 py-3.5 text-sm font-semibold text-accent-ice hover:bg-midnight-hover hover:border-accent-cyan/40 transition-all"
              >
                <Globe2 className="h-4 w-4 text-accent-cyan" />
                <span>Global Risk Map</span>
              </button>

              <button
                onClick={() => onNavigate && onNavigate('ai-assistant')}
                className="inline-flex items-center gap-2 rounded-xl border border-midnight-border bg-midnight-blue/40 px-4 py-3.5 text-sm font-medium text-accent-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all"
              >
                <Bot className="h-4 w-4 text-accent-teal" />
                <span>AI Assistant</span>
              </button>
            </div>

            {/* Live Ingestion Telemetry Sources */}
            <div className="pt-4 border-t border-midnight-border/70">
              <div className="text-[11px] font-mono text-accent-muted uppercase tracking-wider mb-2">
                Authoritative Zero-Key Ingestion Telemetry:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {['NASA EONET', 'CISA KEV', 'UN OCHA', 'NOAA NWS', 'GDELT 2.0'].map((src) => (
                  <span
                    key={src}
                    className="inline-flex items-center gap-1 rounded-md bg-midnight-blue/80 border border-midnight-border px-2.5 py-1 text-[11px] font-mono text-accent-secondary"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-teal" />
                    <span>{src}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Interactive 3D Earth Globe Visual */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center">
            <InteractiveGlobe
              locations={countryProfiles.length > 0 ? countryProfiles : undefined}
              incidents={incidents}
              onSelectCountry={(country) => {
                if (onSelectCountry) onSelectCountry(country);
                else if (onNavigate) onNavigate('country-risk');
              }}
              height={440}
              showControls={true}
            />
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. GLOBAL RISK SUMMARY METRICS
          ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-accent-ice">Global Intelligence Pulse</h2>
            <p className="text-xs text-accent-muted">Synthesized live indicators and risk classifications</p>
          </div>
          <button
            onClick={() => onNavigate && onNavigate('analytics')}
            className="text-xs font-mono text-accent-cyan hover:underline flex items-center gap-1"
          >
            <span>Full Analytics Deck →</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {/* Card 1: Total Incidents */}
          <div className="group rounded-2xl border border-midnight-border bg-midnight-surface p-5 shadow-lg hover:border-accent-cyan/40 hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between text-xs font-mono uppercase text-accent-muted">
              <span>Total Incidents</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-accent-ice">
                {String(totalIncidentsCount).padStart(2, '0')}
              </span>
              <span className="text-xs font-mono text-accent-teal">VERIFIED</span>
            </div>
            <p className="mt-2 text-xs text-accent-secondary border-t border-midnight-border pt-2.5">
              Active tracking in primary risk ledger
            </p>
          </div>

          {/* Card 2: High Risk Areas */}
          <div className="group rounded-2xl border border-midnight-border bg-midnight-surface p-5 shadow-lg hover:border-risk-high/40 hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between text-xs font-mono uppercase text-accent-muted">
              <span>High Risk Theaters</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-risk-high/10 border border-risk-high/30 text-risk-high">
                <MapPin className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-risk-high">
                {String(highRiskAreasCount).padStart(2, '0')}
              </span>
              <span className="text-xs font-mono text-accent-muted">SECTORS</span>
            </div>
            <p className="mt-2 text-xs text-accent-secondary border-t border-midnight-border pt-2.5">
              Elevated geopolitical & conflict threat
            </p>
          </div>

          {/* Card 3: Active Alerts */}
          <div className="group rounded-2xl border border-midnight-border bg-midnight-surface p-5 shadow-lg hover:border-risk-critical/40 hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between text-xs font-mono uppercase text-accent-muted">
              <span>Active Alerts</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-risk-critical/10 border border-risk-critical/30 text-risk-critical">
                <Radio className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-accent-ice">
                {String(activeAlertsCount).padStart(2, '0')}
              </span>
              <span className="text-xs font-mono text-risk-critical font-bold">
                {criticalAlertsCount} CRITICAL
              </span>
            </div>
            <p className="mt-2 text-xs text-accent-secondary border-t border-midnight-border pt-2.5">
              Multi-source situational advisories
            </p>
          </div>

          {/* Card 4: Monitored Countries */}
          <div className="group rounded-2xl border border-midnight-border bg-midnight-surface p-5 shadow-lg hover:border-accent-teal/40 hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between text-xs font-mono uppercase text-accent-muted">
              <span>Sovereign States</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-teal/10 border border-accent-teal/30 text-accent-teal">
                <Globe2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-mono text-accent-ice">
                {String(monitoredCountriesCount).padStart(2, '0')}
              </span>
              <span className="text-xs font-mono text-accent-teal">NODES</span>
            </div>
            <p className="mt-2 text-xs text-accent-secondary border-t border-midnight-border pt-2.5">
              Continuous baseline & stability monitoring
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. LIVE INTELLIGENCE HIGHLIGHTS & RECENT DEVELOPMENTS
          ========================================================================= */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Live Intelligence Highlights */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between border-b border-midnight-border pb-2">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-accent-cyan animate-pulse" />
              <h3 className="font-bold text-accent-ice text-base">Live Intelligence Highlights</h3>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('intel-feed')}
              className="text-xs font-mono text-accent-cyan hover:underline"
            >
              All Alerts ({alerts.length}) →
            </button>
          </div>

          <div className="space-y-3">
            {liveHighlights.length === 0 ? (
              <div className="rounded-xl border border-midnight-border bg-midnight-surface p-6 text-center text-xs font-mono text-accent-muted">
                Awaiting live intelligence feed stream...
              </div>
            ) : (
              liveHighlights.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-xl border border-midnight-border bg-midnight-surface p-4 shadow-md hover:border-accent-cyan/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                        alert.severity === 'Critical'
                          ? 'border-risk-critical/40 bg-risk-critical/15 text-risk-critical'
                          : alert.severity === 'High'
                            ? 'border-risk-high/40 bg-risk-high/15 text-risk-high'
                            : 'border-risk-medium/40 bg-risk-medium/15 text-risk-medium'
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-[11px] font-mono text-accent-muted">
                      {alert.country} • {alert.category}
                    </span>
                  </div>
                  <h4 className="font-semibold text-accent-ice text-sm mb-1">{alert.title}</h4>
                  <p className="text-xs text-accent-secondary line-clamp-2 leading-relaxed">
                    {alert.summary || alert.description}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-accent-muted pt-2 border-t border-midnight-border/60">
                    <span>Source: {alert.source || 'Authoritative Feed'}</span>
                    <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Featured Geopolitical Developments */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between border-b border-midnight-border pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-accent-teal" />
              <h3 className="font-bold text-accent-ice text-base">Priority Conflict Incidents</h3>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('incidents')}
              className="text-xs font-mono text-accent-cyan hover:underline"
            >
              Incident Deck →
            </button>
          </div>

          <div className="space-y-3">
            {featuredIncidents.length === 0 ? (
              <div className="rounded-xl border border-midnight-border bg-midnight-surface p-6 text-center text-xs font-mono text-accent-muted">
                No active critical incidents in queue.
              </div>
            ) : (
              featuredIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-xl border border-midnight-border bg-midnight-surface p-3.5 shadow-md hover:border-accent-teal/40 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs font-bold text-accent-ice">{inc.country}</span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                        inc.severity === 'Critical'
                          ? 'border-risk-critical/40 bg-risk-critical/15 text-risk-critical'
                          : 'border-risk-high/40 bg-risk-high/15 text-risk-high'
                      }`}
                    >
                      {inc.severity}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-accent-ice truncate">{inc.title}</div>
                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-accent-muted">
                    <span>Status: {inc.status}</span>
                    <span>Team: {inc.assigned_team || 'Cyber Ops'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. UNIFIED INTELLIGENCE MODULES GRID
          ========================================================================= */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-accent-ice">Specialized Analytical Engines</h2>
          <p className="text-xs text-accent-muted">Seamless operational modules within GRICC Nexus</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {[
            {
              id: 'geospatial',
              title: 'Advanced Geospatial Intel',
              desc: 'Interactive coordinate clustering, territory risk zoning and satellite telemetry overlay.',
              icon: Compass,
              accent: 'text-accent-cyan',
            },
            {
              id: 'predictive',
              title: 'Predictive Intelligence',
              desc: 'Early warning indicators, horizon scanning, and machine learning risk trend forecasting.',
              icon: TrendingUp,
              accent: 'text-accent-teal',
            },
            {
              id: 'decisions',
              title: 'Strategic Decision Engine',
              desc: 'War-gaming scenario simulation, impact matrix assessment, and mitigation plan generator.',
              icon: ShieldAlert,
              accent: 'text-risk-high',
            },
            {
              id: 'ai-assistant',
              title: 'AI Intelligence Assistant',
              desc: 'Grounded retrieval assistant for natural-language threat inquiries and structured briefings.',
              icon: Bot,
              accent: 'text-accent-cyan',
            },
            {
              id: 'collaboration',
              title: 'Analyst Collaboration Workspace',
              desc: 'Shared investigation channels, structured thread discussions, and multi-analyst review.',
              icon: Activity,
              accent: 'text-accent-teal',
            },
            {
              id: 'reports',
              title: 'Executive Intelligence Reports',
              desc: 'Authenticated PDF report builder, situational threat briefings, and cryptographic export.',
              icon: FileText,
              accent: 'text-accent-ice',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                onClick={() => onNavigate && onNavigate(item.id)}
                className="group cursor-pointer rounded-2xl border border-midnight-border bg-midnight-surface p-5 shadow-lg hover:border-accent-cyan/50 hover:bg-midnight-hover hover:-translate-y-1 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-midnight-blue border border-midnight-border ${item.accent} group-hover:scale-110 transition-transform`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-accent-muted group-hover:text-accent-cyan group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-bold text-accent-ice text-base mb-1.5 group-hover:text-accent-cyan transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs text-accent-secondary leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          5. PROFESSIONAL FOOTER
          ========================================================================= */}
      <footer className="rounded-2xl border border-midnight-border bg-midnight-surface p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-midnight-border/80 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-cyan/20 to-blue-600/30 border border-accent-cyan/40">
              <ShieldAlert className="h-5 w-5 text-accent-cyan" />
            </div>
            <div>
              <div className="font-extrabold text-lg text-accent-ice tracking-wider">GRICC NEXUS</div>
              <div className="text-[11px] font-mono text-accent-muted">Global Risk, Intelligence & Conflict Center</div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-accent-secondary">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-accent-teal" />
              <span>STRICT RESTRICTED ACCESS</span>
            </span>
            <span className="text-midnight-border">•</span>
            <span>NODE: BLR1-INDIA</span>
            <span className="text-midnight-border">•</span>
            <span className="text-accent-cyan">VERSION 2.0-HQ</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-xs text-accent-secondary">
          <div>
            <h4 className="font-mono text-[11px] font-bold uppercase text-accent-ice mb-2">Platform Core</h4>
            <ul className="space-y-1.5">
              <li><button onClick={() => onNavigate && onNavigate('dashboard')} className="hover:text-accent-cyan">Command Dashboard</button></li>
              <li><button onClick={() => onNavigate && onNavigate('risk-map')} className="hover:text-accent-cyan">Global Risk Map</button></li>
              <li><button onClick={() => onNavigate && onNavigate('incidents')} className="hover:text-accent-cyan">Incident Management</button></li>
              <li><button onClick={() => onNavigate && onNavigate('country-risk')} className="hover:text-accent-cyan">Country Risk Profiles</button></li>
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-[11px] font-bold uppercase text-accent-ice mb-2">Analytics & AI</h4>
            <ul className="space-y-1.5">
              <li><button onClick={() => onNavigate && onNavigate('analytics')} className="hover:text-accent-cyan">Risk Analytics</button></li>
              <li><button onClick={() => onNavigate && onNavigate('predictive')} className="hover:text-accent-cyan">Predictive Intelligence</button></li>
              <li><button onClick={() => onNavigate && onNavigate('decisions')} className="hover:text-accent-cyan">Strategic Response</button></li>
              <li><button onClick={() => onNavigate && onNavigate('ai-assistant')} className="hover:text-accent-cyan">AI Intelligence Assistant</button></li>
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-[11px] font-bold uppercase text-accent-ice mb-2">Operations</h4>
            <ul className="space-y-1.5">
              <li><button onClick={() => onNavigate && onNavigate('monitoring')} className="hover:text-accent-cyan">Real-Time Monitoring</button></li>
              <li><button onClick={() => onNavigate && onNavigate('collaboration')} className="hover:text-accent-cyan">Analyst Workspace</button></li>
              <li><button onClick={() => onNavigate && onNavigate('sources')} className="hover:text-accent-cyan">Data Gateway Health</button></li>
              <li><button onClick={() => onNavigate && onNavigate('reports')} className="hover:text-accent-cyan">Briefing Reports</button></li>
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-[11px] font-bold uppercase text-accent-ice mb-2">Authoritative Feeds</h4>
            <p className="text-[11px] leading-relaxed text-accent-muted">
              Live zero-key integration with NASA Earth Observatory, US CISA KEV, UN OCHA ReliefWeb, US NOAA NWS, and GDELT 2.0 Global Database.
            </p>
          </div>
        </div>

        <div className="border-t border-midnight-border/60 pt-4 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono text-accent-muted gap-2">
          <div>© 2026 GRICC Nexus. Global Risk, Intelligence & Conflict Center. All rights reserved.</div>
          <div className="text-accent-secondary">SECURE COMMAND VIEW • AUDIT LEDGER ACTIVE</div>
        </div>
      </footer>
    </div>
  );
}
