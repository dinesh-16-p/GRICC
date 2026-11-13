import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import SummaryCard from './components/SummaryCard';
import IntelligenceFeed from './components/IntelligenceFeed';
import RecentActivities from './components/RecentActivities';
import LoginPage from './components/LoginPage';
import UnauthorizedAccess from './components/UnauthorizedAccess';
import NotificationCentre from './components/NotificationCentre';
import ErrorBoundary from './components/ErrorBoundary';
const PlatformHome = lazy(() => import('./components/PlatformHome'));
const WorldMap = lazy(() => import('./components/WorldMap'));
const IncidentManagement = lazy(() => import('./components/IncidentManagement'));
const RiskAnalytics = lazy(() => import('./components/RiskAnalytics'));
const DataSourceHealth = lazy(() => import('./components/DataSourceHealth'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const CountryRiskProfiles = lazy(() => import('./components/CountryRiskProfiles'));
const ReportsPage = lazy(() => import('./components/ReportsPage'));
const PredictiveIntelligence = lazy(() => import('./components/PredictiveIntelligence'));
const StrategicDecisions = lazy(() => import('./components/StrategicDecisions'));
const AdvancedIntelligenceAnalytics = lazy(() => import('./components/AdvancedIntelligenceAnalytics'));
const AdvancedGeospatialIntelligence = lazy(() => import('./components/AdvancedGeospatialIntelligence'));
const AIIntelligenceAssistant = lazy(() => import('./components/AIIntelligenceAssistant'));
const RealTimeMonitoring = lazy(() => import('./components/RealTimeMonitoring'));
const IntelligenceCollaboration = lazy(() => import('./components/IntelligenceCollaboration'));
const SecurityAdministration = lazy(() => import('./components/SecurityAdministration'));
const PerformanceMonitoring = lazy(() => import('./components/PerformanceMonitoring'));
import { sampleAlerts } from './data/intelligenceData';
import { sampleIncidents } from './data/incidentData';
import apiService, { getAuthToken, clearAuthToken } from './services/apiService';
import {
  AlertTriangle,
  Globe2,
  BellRing,
  Flag,
  MapPin,
  Activity,
  Layers,
  Radio,
  BarChart3,
  Server,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Default local operator context (Phase 8 login gate removed per user request)
  const DEFAULT_OPERATOR_USER = {
    id: 'USR-005',
    username: 'dpillay851',
    email: 'dpillay851@gmail.com',
    fullName: 'Dinesh Pillay',
    department: 'Command & Security Governance',
    role: 'ADMIN',
  };

  const [currentUser, setCurrentUser] = useState(DEFAULT_OPERATOR_USER);
  const [isAuthChecking, setIsAuthChecking] = useState(false);
  const [sessionMessage, setSessionMessage] = useState(null);

  const userRole = currentUser?.role || 'VIEWER';
  const canModify = userRole === 'ADMIN' || userRole === 'ANALYST';
  const canDelete = userRole === 'ADMIN';
  const isAdmin = userRole === 'ADMIN';

  // Intelligence, Incident, Activity & Stats States (Phase 7 SQLite-backed)
  const [alerts, setAlerts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [isActivitiesLoading, setIsActivitiesLoading] = useState(false);
  const [stats, setStats] = useState(null);

  // Phase 9 Real-Time Notifications, Watchlists & Escalation State
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [watchlists, setWatchlists] = useState([]);
  const [escalationRules, setEscalationRules] = useState([]);
  const [notifPreferences, setNotifPreferences] = useState({
    browserNotifications: false,
    minSeverity: 'Medium',
  });
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [sseStatus, setSseStatus] = useState('disconnected');
  const [latestAlertEvent, setLatestAlertEvent] = useState(null);
  const [latestCollabEvent, setLatestCollabEvent] = useState(null);
  const notifPrefsRef = useRef(notifPreferences);

  // Phase 10 Country Risk Profiles State
  const [countryProfiles, setCountryProfiles] = useState([]);
  const [selectedProfileCountry, setSelectedProfileCountry] = useState(null);

  useEffect(() => {
    notifPrefsRef.current = notifPreferences;
  }, [notifPreferences]);

  // Phase 6 Backend & Telemetry State
  const [backendHealth, setBackendHealth] = useState(null);
  const [sources, setSources] = useState([
    { id: 'news', name: 'International News Wire', category: 'International News', provider: 'GDELT 2.0 Global Intelligence', status: 'HEALTHY', latencyMs: 12, isConfigured: true },
    { id: 'geopolitical', name: 'Geopolitical Risk Monitor', category: 'Geopolitical Risk', provider: 'UN OCHA ReliefWeb API', status: 'HEALTHY', latencyMs: 15, isConfigured: true },
    { id: 'disaster', name: 'Natural Disaster Early Warning', category: 'Natural Disaster Alerts', provider: 'NASA EONET v3 Planetary Satellite Monitor', status: 'HEALTHY', latencyMs: 10, isConfigured: true },
    { id: 'weather', name: 'Severe Weather Warning Net', category: 'Weather Emergencies', provider: 'US National Weather Service (NWS) API', status: 'HEALTHY', latencyMs: 8, isConfigured: true },
    { id: 'cyber', name: 'Cyber Threat Intelligence Net', category: 'Cybersecurity Threat Information', provider: 'CISA Known Exploited Vulnerabilities (KEV) Catalog', status: 'HEALTHY', latencyMs: 14, isConfigured: true },
  ]);
  const [telemetry, setTelemetry] = useState(null);
  const [liveDisasterEvents, setLiveDisasterEvents] = useState([]);
  const [isTelemetryLoading, setIsTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [operationalMode, setOperationalMode] = useState('DEMO MODE');

  // Configurable Refresh Interval (default 5m from localStorage)
  const [refreshInterval, setRefreshInterval] = useState(() => {
    return localStorage.getItem('gricc_refresh_interval') || '5m';
  });

  const refreshTimerRef = useRef(null);

  // Interval duration parser in ms
  const getIntervalMs = (intervalStr) => {
    switch (intervalStr) {
      case '1m':
        return 60 * 1000;
      case '5m':
        return 5 * 60 * 1000;
      case '10m':
        return 10 * 60 * 1000;
      case '15m':
        return 15 * 60 * 1000;
      case 'manual':
      default:
        return 0; // manual
    }
  };

  const handleIntervalChange = (newInterval) => {
    setRefreshInterval(newInterval);
    localStorage.setItem('gricc_refresh_interval', newInterval);
  };

  // Convert raw live provider telemetry items into standard GRICC Alert format
  const normalizeTelemetryAlerts = useCallback((data) => {
    if (!data) return [];
    const normalized = [];

    // 1. Cybersecurity threat advisories (CISA KEV)
    if (data.cyber?.items) {
      data.cyber.items.forEach((item) => {
        normalized.push({
          id: item.cveId || item.id,
          title: item.title,
          country: 'United States',
          region: 'Global / Enterprise IT',
          category: 'Cyber Threat & Infrastructure',
          severity: item.severity || 'Critical',
          timestamp: item.dateAdded || new Date().toISOString().slice(0, 10),
          summary: `${item.description} Action: ${item.action}`,
          source: item.source || 'CISA KEV Feed',
          url: item.url,
          status: 'active',
          isLive: Boolean(item.isLive),
        });
      });
    }

    // 2. Weather emergencies (NWS)
    if (data.weather?.items) {
      data.weather.items.forEach((item) => {
        normalized.push({
          id: item.id,
          title: item.headline || item.event,
          country: 'United States',
          region: item.location || 'North America',
          category: 'Natural Hazards & Meteorology',
          severity: item.severity || 'High',
          timestamp: item.effective || new Date().toISOString(),
          summary: `${item.description} Instruction: ${item.instruction}`,
          source: item.source || 'NWS Weather Net',
          url: item.url,
          status: 'active',
          isLive: Boolean(item.isLive),
        });
      });
    }

    // 3. International News (GDELT / Wire)
    if (data.news?.items) {
      data.news.items.forEach((item) => {
        normalized.push({
          id: item.id,
          title: item.headline,
          country: item.country || 'Global',
          region: 'International',
          category: item.category || 'Geopolitical Affairs',
          severity: item.severity || 'Medium',
          timestamp: item.publicationDate || new Date().toISOString(),
          summary: item.description,
          source: item.source || 'International Wire',
          url: item.url,
          status: 'active',
          isLive: Boolean(item.isLive),
        });
      });
    }

    // 4. Geopolitical situation reports (UN ReliefWeb)
    if (data.geopolitical?.items) {
      data.geopolitical.items.forEach((item) => {
        normalized.push({
          id: item.id,
          title: item.headline,
          country: item.country || 'Global Theatre',
          region: item.region || 'International',
          category: item.category || 'Geopolitical & Security',
          severity: item.severity || 'Medium',
          timestamp: item.publicationDate || new Date().toISOString(),
          summary: item.description,
          source: item.source || 'UN ReliefWeb',
          url: item.url,
          status: 'active',
          isLive: Boolean(item.isLive),
        });
      });
    }

    return normalized;
  }, []);

  // Fetch telemetry from backend
  const fetchTelemetryData = useCallback(async (isManual = false) => {
    setIsTelemetryLoading(true);
    setTelemetryError(null);

    try {
      // 1. Check Backend Health
      const healthRes = await apiService.getHealth().catch((err) => {
        console.warn('[GRICC API] Health check failed, falling back:', err.message);
        return { status: 'OFFLINE', backendStatus: 'OFFLINE', operationalMode: 'DEMO MODE' };
      });
      setBackendHealth(healthRes);
      if (healthRes.operationalMode) {
        setOperationalMode(healthRes.operationalMode);
      }

      // 2. Fetch Telemetry stream
      const telemetryRes = await apiService.getTelemetry(isManual).catch((err) => {
        console.warn('[GRICC API] Telemetry fetch failed:', err.message);
        setTelemetryError(err);
        return null;
      });

      if (telemetryRes) {
        setTelemetry(telemetryRes);
        setOperationalMode(telemetryRes.mode || 'DEMO MODE');
        if (telemetryRes.sources) {
          setSources(telemetryRes.sources);
        }

        // Live disaster geospatial events for map
        if (telemetryRes.data?.disaster?.items) {
          setLiveDisasterEvents(telemetryRes.data.disaster.items);
        }

        // Merge & persist live provider alerts in SQLite (ADMIN & ANALYST only)
        const liveAlerts = normalizeTelemetryAlerts(telemetryRes.data);
        if (liveAlerts.length > 0) {
          if (canModify) {
            try {
              const syncRes = await apiService.syncAlerts(liveAlerts);
              if (syncRes?.alerts) {
                setAlerts(syncRes.alerts);
              }
            } catch (syncErr) {
              console.warn('[GRICC API] Alert sync failed, merging locally:', syncErr.message);
              setAlerts((prevAlerts) => {
                const existingIds = new Set(prevAlerts.map((a) => a.id));
                const newUniqueLive = liveAlerts.filter((a) => !existingIds.has(a.id));
                return [...newUniqueLive, ...prevAlerts];
              });
            }
          } else {
            setAlerts((prevAlerts) => {
              const existingIds = new Set(prevAlerts.map((a) => a.id));
              const newUniqueLive = liveAlerts.filter((a) => !existingIds.has(a.id));
              return [...newUniqueLive, ...prevAlerts];
            });
          }
        }

        setLastSyncTime(new Date().toISOString());
      }
    } catch (err) {
      console.error('[GRICC API ERROR]:', err);
      setTelemetryError(err);
    } finally {
      setIsTelemetryLoading(false);
    }
  }, [normalizeTelemetryAlerts, canModify]);

  // Refresh stats and activity log from SQLite
  const refreshStatsAndActivities = useCallback(async () => {
    setIsActivitiesLoading(true);
    try {
      const [actRes, statsRes] = await Promise.allSettled([
        apiService.getActivities({ limit: 40 }),
        apiService.getStats(),
      ]);
      if (actRes.status === 'fulfilled' && actRes.value?.activities) {
        setActivities(actRes.value.activities);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value?.stats) {
        setStats(statsRes.value.stats);
      }
    } finally {
      setIsActivitiesLoading(false);
    }
  }, []);

  // Load persisted incidents, alerts, activities, stats, notifications, watchlists & rules from SQLite
  const fetchPersistenceState = useCallback(async () => {
    setIsActivitiesLoading(true);
    try {
      const [
        incRes,
        alertRes,
        actRes,
        statsRes,
        notifRes,
        watchRes,
        rulesRes,
        prefsRes,
        countriesRes,
      ] = await Promise.allSettled([
        apiService.getIncidents(),
        apiService.getAlerts(),
        apiService.getActivities({ limit: 40 }),
        apiService.getStats(),
        apiService.getNotifications({ limit: 60 }),
        apiService.getWatchlists(),
        apiService.getEscalationRules(),
        apiService.getNotificationPreferences(),
        apiService.getCountries(),
      ]);

      if (incRes.status === 'fulfilled' && incRes.value?.incidents) {
        setIncidents(incRes.value.incidents);
      } else {
        setIncidents(sampleIncidents);
      }

      if (alertRes.status === 'fulfilled' && alertRes.value?.alerts) {
        setAlerts(alertRes.value.alerts);
      } else {
        setAlerts(sampleAlerts);
      }

      if (actRes.status === 'fulfilled' && actRes.value?.activities) {
        setActivities(actRes.value.activities);
      }

      if (statsRes.status === 'fulfilled' && statsRes.value?.stats) {
        setStats(statsRes.value.stats);
      }

      if (notifRes.status === 'fulfilled' && notifRes.value?.notifications) {
        setNotifications(notifRes.value.notifications);
        setUnreadCount(notifRes.value.unreadCount || 0);
      }

      if (watchRes.status === 'fulfilled' && watchRes.value?.watchlists) {
        setWatchlists(watchRes.value.watchlists);
      }

      if (rulesRes.status === 'fulfilled' && rulesRes.value?.rules) {
        setEscalationRules(rulesRes.value.rules);
      }

      if (prefsRes.status === 'fulfilled' && prefsRes.value?.preferences) {
        setNotifPreferences(prefsRes.value.preferences);
      }

      if (countriesRes.status === 'fulfilled' && countriesRes.value?.countries) {
        setCountryProfiles(countriesRes.value.countries);
      }
    } finally {
      setIsActivitiesLoading(false);
    }
  }, []);

  // Verify existing JWT session on mount & listen for session expiration
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      apiService
        .getCurrentUser()
        .then((res) => {
          if (res?.user) {
            setCurrentUser(res.user);
          } else {
            clearAuthToken();
          }
        })
        .catch(() => {
          clearAuthToken();
        });
    }
  }, []);

  // Load persisted data and telemetry once authenticated
  useEffect(() => {
    if (!currentUser) return;
    fetchPersistenceState().then(() => {
      fetchTelemetryData(false);
    });
  }, [currentUser, fetchPersistenceState, fetchTelemetryData]);

  // Phase 9 Real-Time Server-Sent Events (SSE) subscription
  useEffect(() => {
    if (!currentUser) {
      setSseConnected(false);
      return;
    }

    const streamUrl = apiService.getEventStreamUrl();
    if (!streamUrl) return;

    const es = new EventSource(streamUrl);

    es.addEventListener('connected', () => {
      setSseConnected(true);
      setSseStatus('connected');
    });

    es.addEventListener('intelligence_alert', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.alert) {
          setLatestAlertEvent({ ...data.alert, _receivedAt: Date.now() });
          setNotifications((prev) => {
            const notifId = `intel-${data.alert.id}`;
            if (prev.some((existing) => existing.id === notifId)) return prev;
            setUnreadCount((c) => c + 1);
            return [
              {
                id: notifId,
                type: 'INTELLIGENCE_ALERT',
                severity: data.alert.severity,
                title: data.alert.title,
                message: data.alert.description,
                country: data.alert.countryId || 'Global',
                createdAt: data.alert.createdAt || new Date().toISOString(),
                isRead: false,
              },
              ...prev,
            ];
          });
        }
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('intelligence_alert_updated', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.alert) {
          setLatestAlertEvent({ ...data.alert, _receivedAt: Date.now() });
        }
      } catch {
        // ignore malformed event
      }
    });

    const collabEvents = [
      'discussion_created',
      'discussion_updated',
      'comment_added',
      'comment_updated',
      'task_assigned',
      'task_updated',
      'user_mentioned',
      'intelligence_record_shared',
    ];
    for (const evtName of collabEvents) {
      es.addEventListener(evtName, (event) => {
        try {
          const data = JSON.parse(event.data);
          setLatestCollabEvent({ type: evtName, ...data, _receivedAt: Date.now() });
        } catch {
          // ignore
        }
      });
    }

    es.addEventListener('incident_created', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.incident) {
          setIncidents((prev) =>
            prev.some((i) => i.id === data.incident.id) ? prev : [data.incident, ...prev]
          );
        }
        if (data.stats) setStats(data.stats);
        refreshStatsAndActivities();
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('incident_updated', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.incident) {
          setIncidents((prev) =>
            prev.map((i) => (i.id === data.incident.id ? data.incident : i))
          );
        }
        if (data.stats) setStats(data.stats);
        refreshStatsAndActivities();
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('incident_deleted', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id) {
          setIncidents((prev) => prev.filter((i) => i.id !== data.id));
        }
        if (data.stats) setStats(data.stats);
        refreshStatsAndActivities();
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('alert_updated', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.alert) {
          setAlerts((prev) => prev.map((a) => (a.id === data.alert.id ? data.alert : a)));
        }
        if (data.stats) setStats(data.stats);
        refreshStatsAndActivities();
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('alerts_synced', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.stats) setStats(data.stats);
        apiService
          .getAlerts()
          .then((res) => {
            if (res?.alerts) setAlerts(res.alerts);
          })
          .catch(() => {});
      } catch {
        // ignore
      }
    });

    es.addEventListener('notification', (event) => {
      try {
        const data = JSON.parse(event.data);
        const n = data.notification;
        if (!n) return;

        setNotifications((prev) => {
          if (prev.some((existing) => existing.id === n.id)) return prev;
          setUnreadCount((c) => c + 1);
          return [{ ...n, isRead: false }, ...prev];
        });

        // Browser notification only when explicitly enabled & permitted
        if (
          notifPrefsRef.current?.browserNotifications &&
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification(`GRICC: ${n.title}`, {
            body: n.message,
            tag: `gricc-notif-${n.id}`,
          });
        }
      } catch {
        // ignore malformed event
      }
    });

    es.onerror = () => {
      setSseConnected(false);
      setSseStatus(es.readyState === EventSource.CONNECTING ? 'reconnecting' : 'disconnected');
    };

    return () => {
      es.close();
      setSseConnected(false);
      setSseStatus('disconnected');
    };
  }, [currentUser, refreshStatsAndActivities]);

  // Configurable Auto-Refresh Loop with tab visibility awareness
  useEffect(() => {
    if (!currentUser) return;
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const intervalMs = getIntervalMs(refreshInterval);
    if (intervalMs > 0) {
      refreshTimerRef.current = setInterval(() => {
        // Pause automatic refresh when browser tab is hidden
        if (document.visibilityState === 'visible') {
          fetchTelemetryData(false);
        }
      }, intervalMs);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [currentUser, refreshInterval, fetchTelemetryData]);

  // Auth Handlers
  const handleLogin = async (identifier, password) => {
    const res = await apiService.login(identifier, password);
    setSessionMessage(null);
    setCurrentUser(res.user);
    setActiveTab('dashboard');
  };

  const handleLogout = async () => {
    await apiService.logout();
    setCurrentUser(DEFAULT_OPERATOR_USER);
    setSessionMessage(null);
    setActiveTab('dashboard');
  };

  // Manual Refresh Handler
  const handleManualRefresh = async () => {
    await fetchTelemetryData(canModify);
  };

  // Alert Action: Acknowledge (persisted in SQLite)
  const handleAcknowledgeAlert = async (id) => {
    const target = alerts.find((a) => a.id === id);
    if (!target) return;
    const nextStatus = target.status === 'acknowledged' ? 'active' : 'acknowledged';
    try {
      const res = await apiService.updateAlertStatus(id, nextStatus);
      if (res?.alert) {
        setAlerts((prevAlerts) =>
          prevAlerts.map((alert) => (alert.id === id ? res.alert : alert))
        );
        await refreshStatsAndActivities();
      }
    } catch (err) {
      console.error('[GRICC API] Failed to acknowledge alert:', err.message);
    }
  };

  // Alert Action: Mark as Resolved (persisted in SQLite)
  const handleResolveAlert = async (id) => {
    const target = alerts.find((a) => a.id === id);
    if (!target) return;
    const nextStatus = target.status === 'resolved' ? 'active' : 'resolved';
    try {
      const res = await apiService.updateAlertStatus(id, nextStatus);
      if (res?.alert) {
        setAlerts((prevAlerts) =>
          prevAlerts.map((alert) => (alert.id === id ? res.alert : alert))
        );
        await refreshStatsAndActivities();
      }
    } catch (err) {
      console.error('[GRICC API] Failed to resolve alert:', err.message);
    }
  };

  // Incident Action: Add New Incident (persisted in SQLite)
  const handleAddIncident = async (newIncidentData) => {
    const res = await apiService.createIncident(newIncidentData);
    if (res?.incident) {
      setIncidents((prev) => [res.incident, ...prev]);
      await refreshStatsAndActivities();
      return res.incident;
    }
    return null;
  };

  // Incident Action: Update Details / Status / Assigned Team (persisted in SQLite)
  const handleUpdateIncident = async (id, updates) => {
    const res = await apiService.updateIncident(id, updates);
    if (res?.incident) {
      setIncidents((prev) =>
        prev.map((inc) => (inc.id === id ? res.incident : inc))
      );
      await refreshStatsAndActivities();
      return res.incident;
    }
    return null;
  };

  // Incident Action: Delete Incident (persisted in SQLite)
  const handleDeleteIncident = async (id) => {
    await apiService.deleteIncident(id);
    setIncidents((prev) => prev.filter((inc) => inc.id !== id));
    await refreshStatsAndActivities();
  };

  // Phase 9 Notification, Watchlist & Escalation Handlers
  const handleMarkNotificationRead = async (id) => {
    await apiService.markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const handleMarkAllNotificationsRead = async () => {
    await apiService.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const handleAddWatchlist = async (payload) => {
    const res = await apiService.addWatchlistCountry(payload);
    if (res?.watchlist) {
      setWatchlists((prev) => [...prev, res.watchlist].sort((a, b) => a.country.localeCompare(b.country)));
    }
  };

  const handleRemoveWatchlist = async (id) => {
    await apiService.removeWatchlistCountry(id);
    setWatchlists((prev) => prev.filter((w) => w.id !== id));
  };

  const handleUpdateEscalationRule = async (id, payload) => {
    const res = await apiService.updateEscalationRule(id, payload);
    if (res?.rule) {
      setEscalationRules((prev) => prev.map((r) => (r.id === id ? res.rule : r)));
    }
  };

  const handleUpdateNotificationPreferences = async (prefs) => {
    const res = await apiService.updateNotificationPreferences(prefs);
    if (res?.preferences) {
      setNotifPreferences(res.preferences);
    }
  };

  // Dynamic Metrics
  const activeAlertsCount = alerts.filter((a) => a.status !== 'resolved').length;
  const criticalAlertsCount = alerts.filter(
    (a) => a.severity === 'Critical' && a.status !== 'resolved'
  ).length;

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center text-slate-300 font-mono text-xs gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
        <span>VERIFYING GRICC SECURITY SESSION...</span>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} sessionMessage={sessionMessage} />;
  }

  return (
    <div className="flex min-h-screen bg-navy-950 font-sans text-slate-100">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        currentUser={currentUser}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-y-auto">
        <Header
          onMenuClick={() => setMobileOpen(true)}
          operationalMode={operationalMode}
          isRefreshing={isTelemetryLoading}
          currentUser={currentUser}
          onLogout={handleLogout}
          unreadNotifications={unreadCount}
          onOpenNotifications={() => setIsNotifOpen(true)}
        />

        <main className="flex-1 px-4 py-8 md:px-8 max-w-7xl w-full mx-auto space-y-8">
          {/* Welcome Heading & Description (shown for operational deck tabs) */}
          {activeTab !== 'home' && (
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-midnight-border">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="h-2 w-2 rounded-full bg-accent-cyan shadow-[0_0_8px_#00C2FF]"></span>
                  <span className="font-mono text-xs uppercase tracking-wider text-accent-cyan font-semibold">
                    GRICC Operational Intelligence Base
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-accent-ice">
                  {activeTab === 'dashboard'
                    ? 'Global Risk Intelligence Command Deck'
                    : activeTab === 'risk-map'
                      ? 'Global Risk Map & Hazard Visualization'
                      : activeTab === 'country-risk'
                        ? 'Country Risk Profiles & Stability Index'
                        : activeTab === 'ai-assistant'
                          ? 'AI Strategic Intelligence Assistant'
                          : 'Operational Intelligence Deck'}
                </h2>
                <p className="mt-1 text-sm text-accent-muted">
                  Centralised global risk monitoring, verified open-source intelligence & telemetry gateway.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-accent-secondary bg-midnight-surface/90 border border-midnight-border rounded-xl px-3.5 py-2 shadow-sm">
                <span className="text-accent-muted">STATUS:</span>
                <span className={operationalMode === 'LIVE MODE' ? 'text-accent-teal font-bold' : 'text-risk-medium font-bold'}>
                  {operationalMode}
                </span>
                <span className="mx-1 text-midnight-border">|</span>
                <span className="text-accent-cyan">PHASE 6 GATEWAY</span>
                <span className="mx-1 text-midnight-border">|</span>
                <button
                  onClick={handleManualRefresh}
                  disabled={isTelemetryLoading}
                  className="hover:text-white transition-colors flex items-center gap-1 text-accent-cyan"
                  title="Synchronize live provider streams"
                >
                  <RefreshCw className={`h-3 w-3 ${isTelemetryLoading ? 'animate-spin' : ''}`} />
                  <span>Sync</span>
                </button>
              </div>
            </div>
          )}

          {/* Conditional View by Sidebar Active Tab */}
          <Suspense
            fallback={
              <div className="py-12 text-center text-xs font-mono text-cyan-400">
                LOADING INTELLIGENCE MODULE...
              </div>
            }
          >
          {activeTab === 'home' ? (
            /* Transformed Platform Home View (Phase 24.5 - Midnight Intelligence) */
            <section className="space-y-6">
              <ErrorBoundary name="Platform Home">
                <PlatformHome
                  stats={stats}
                  alerts={alerts}
                  incidents={incidents}
                  countryProfiles={countryProfiles}
                  operationalMode={operationalMode}
                  onNavigate={(tab) => setActiveTab(tab)}
                  onSelectCountry={(countryName) => {
                    setSelectedProfileCountry(countryName);
                    setActiveTab('country-risk');
                  }}
                />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'risk-map' ? (
            /* Dedicated Global Risk Map View (Phase 2 + Live NASA EONET Hazards + SQLite Incidents + Country Risk) */
            <section className="space-y-6">
              <ErrorBoundary name="Global Risk Map">
                <WorldMap
                  liveEvents={liveDisasterEvents}
                  incidents={incidents}
                  countryProfiles={countryProfiles}
                  onSelectCountryProfile={(countryName) => {
                    setSelectedProfileCountry(countryName);
                    setActiveTab('country-risk');
                  }}
                />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'geospatial' ? (
            /* Dedicated Advanced Geospatial Intelligence View (Phase 14) */
            <section className="space-y-6">
              <ErrorBoundary name="Advanced Geospatial Intelligence">
                <AdvancedGeospatialIntelligence
                  canModify={canModify}
                  isAdmin={isAdmin}
                  onSelectCountryProfile={(countryName) => {
                    setSelectedProfileCountry(countryName);
                    setActiveTab('country-risk');
                  }}
                />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'intel-feed' ? (
            /* Dedicated Full Intelligence Feed View (Phase 3 + Live Multi-Source Dispatches) */
            <section className="space-y-6">
              <ErrorBoundary name="Intelligence Feed">
                <IntelligenceFeed
                  alerts={alerts}
                  onAcknowledge={handleAcknowledgeAlert}
                  onResolve={handleResolveAlert}
                  canModify={canModify}
                  title="Global Intelligence Feed"
                  subtitle="Live stream of tactical advisories, cyber alerts, and geopolitical notifications"
                  compact={false}
                />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'incidents' ? (
            /* Dedicated Incident Management Register View (Phase 4 + Phase 7 Persistence) */
            <section className="space-y-6">
              <ErrorBoundary name="Incident Management">
                <IncidentManagement
                  incidents={incidents}
                  onAddIncident={handleAddIncident}
                  onUpdateIncident={handleUpdateIncident}
                  onDeleteIncident={handleDeleteIncident}
                  canModify={canModify}
                  canDelete={canDelete}
                />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'analytics' ? (
            /* Dedicated Risk Analytics Dashboard View (Phase 5 + Phase 7 DB Metrics) */
            <section className="space-y-6">
              <ErrorBoundary name="Risk Analytics">
                <RiskAnalytics incidents={incidents} stats={stats} />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'advanced-analytics' ? (
            /* Dedicated Advanced Intelligence Analytics View (Phase 13) */
            <section className="space-y-6">
              <ErrorBoundary name="Advanced Analytics">
                <AdvancedIntelligenceAnalytics canModify={canModify} />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'predictive' ? (
            /* Dedicated Predictive Intelligence & Early Warning View (Phase 11) */
            <section className="space-y-6">
              <ErrorBoundary name="Predictive Intelligence">
                <PredictiveIntelligence canModify={canModify} isAdmin={isAdmin} />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'decisions' ? (
            /* Dedicated Strategic Decision Support & Automated Response View (Phase 12) */
            <section className="space-y-6">
              <ErrorBoundary name="Strategic Decision Support">
                <StrategicDecisions canModify={canModify} />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'ai-assistant' ? (
            /* Dedicated AI-Powered Intelligence Assistant View (Phase 15) */
            <section className="space-y-6">
              <ErrorBoundary name="AI Intelligence Assistant">
                <AIIntelligenceAssistant
                  canModify={canModify}
                  isAdmin={isAdmin}
                  countries={countryProfiles}
                />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'monitoring' ? (
            /* Dedicated Real-Time Intelligence Monitoring & Alert System (Phase 16) */
            <section className="space-y-6">
              <ErrorBoundary name="Real-Time Monitoring">
                <RealTimeMonitoring
                  canModify={canModify}
                  isAdmin={isAdmin}
                  sseStatus={sseStatus}
                  latestAlertEvent={latestAlertEvent}
                  onNavigateTab={setActiveTab}
                />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'collaboration' ? (
            /* Dedicated Intelligence Collaboration & Team Workspace (Phase 17) */
            <section className="space-y-6">
              <ErrorBoundary name="Intelligence Collaboration">
                <IntelligenceCollaboration
                  currentUser={currentUser}
                  canModify={canModify}
                  isAdmin={isAdmin}
                  latestCollabEvent={latestCollabEvent}
                  onNavigateTab={setActiveTab}
                />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'security' && isAdmin ? (
            /* Dedicated Security & Compliance Administration (Phase 18 - ADMIN only) */
            <section className="space-y-6">
              <ErrorBoundary name="Security Administration">
                <SecurityAdministration isAdmin={isAdmin} />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'performance' && isAdmin ? (
            /* Dedicated Performance & Scalability Monitoring (Phase 19 - ADMIN only) */
            <section className="space-y-6">
              <ErrorBoundary name="Performance Monitoring">
                <PerformanceMonitoring isAdmin={isAdmin} />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'country-risk' ? (
            /* Dedicated Country Risk Intelligence Profiles View (Phase 10) */
            <section className="space-y-6">
              <ErrorBoundary name="Country Risk Profiles">
                <CountryRiskProfiles
                  initialCountry={selectedProfileCountry}
                  onClearInitialCountry={() => setSelectedProfileCountry(null)}
                  canModify={canModify}
                />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'reports' ? (
            /* Dedicated Executive Intelligence Reporting View (Phase 10) */
            <section className="space-y-6">
              <ErrorBoundary name="Intelligence Reports">
                <ReportsPage
                  currentUser={currentUser}
                  countries={countryProfiles}
                  canModify={canModify}
                  isAdmin={isAdmin}
                />
              </ErrorBoundary>
            </section>
          ) : activeTab === 'users' || activeTab === 'audit-logs' || activeTab === 'settings' ? (
            isAdmin ? (
              <section className="space-y-6">
                <ErrorBoundary name="User & Security Management">
                  <UserManagement
                    currentUser={currentUser}
                    initialSection={activeTab === 'audit-logs' ? 'audit' : 'users'}
                  />
                </ErrorBoundary>
              </section>
            ) : (
              <UnauthorizedAccess
                requiredRole="ADMIN"
                currentRole={userRole}
                onReturnDashboard={() => setActiveTab('dashboard')}
              />
            )
          ) : activeTab === 'sources' ? (
            /* Dedicated Data Source Health Monitor View (Phase 6) */
            <section className="space-y-6">
              <ErrorBoundary name="Data Source Health">
                <DataSourceHealth
                  sources={sources}
                  health={backendHealth}
                  isLoading={isTelemetryLoading}
                  error={telemetryError}
                  onRefresh={handleManualRefresh}
                  refreshInterval={refreshInterval}
                  onIntervalChange={handleIntervalChange}
                  lastSyncTime={lastSyncTime}
                />
              </ErrorBoundary>
            </section>
          ) : (
            /* Standard Main Dashboard View */
            <>
              {/* Four Summary Cards (SQLite Database Calculations) */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <SummaryCard
                  title="Total Incidents"
                  value={String(stats?.totalIncidents ?? incidents.length).padStart(2, '0')}
                  subtext={`${stats?.openIncidents ?? incidents.filter((i) => i.status === 'Open').length} Open in queue`}
                  icon={AlertTriangle}
                  accentColor="cyan"
                />
                <SummaryCard
                  title="High Risk Areas"
                  value={String(stats?.highRiskAreas ?? 0).padStart(2, '0')}
                  subtext="Elevated threat sectors"
                  icon={MapPin}
                  accentColor="amber"
                />
                <SummaryCard
                  title="Active Alerts"
                  value={String(stats?.activeAlerts ?? activeAlertsCount).padStart(2, '0')}
                  subtext={`${stats?.criticalAlerts ?? criticalAlertsCount} Critical unmitigated`}
                  icon={BellRing}
                  accentColor="blue"
                />
                <SummaryCard
                  title="Monitored Countries"
                  value={String(stats?.monitoredCountries ?? 0).padStart(2, '0')}
                  subtext="Active monitoring nodes"
                  icon={Globe2}
                  accentColor="indigo"
                />
              </section>

              {/* Data Source Quick Health Bar (Phase 6 Integration on Dashboard) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-navy-700/60 bg-gradient-to-r from-navy-850 to-navy-900/80 px-4 py-3 shadow-md text-xs">
                <div className="flex items-center gap-3">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white uppercase text-[11px]">
                      Live Telemetry Ingestion:
                    </span>
                    <span className="text-slate-300 font-mono">
                      {sources.filter((s) => s.status === 'HEALTHY').length} / {sources.length} Providers Operational
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-slate-400 hidden md:inline">
                    Sync: {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : 'Initialising'}
                  </span>
                  <button
                    onClick={() => setActiveTab('sources')}
                    className="inline-flex items-center gap-1 rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-1 text-xs text-cyan-400 hover:text-white hover:bg-navy-700 transition-colors font-mono"
                  >
                    <Server className="h-3 w-3" />
                    <span>Inspect Gateways →</span>
                  </button>
                </div>
              </div>

              {/* Main Content: Global Risk Monitoring Map + Intelligence Feed Overview */}
              <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-7">
                  <ErrorBoundary name="Main Dashboard Map">
                    <Suspense
                      fallback={
                        <div className="flex h-[420px] w-full flex-col items-center justify-center rounded-2xl border border-navy-700/60 bg-gradient-to-b from-navy-850/80 to-navy-900/90 p-8 shadow-2xl backdrop-blur-sm">
                          <div className="relative mb-4 flex h-14 w-14 items-center justify-center">
                            <div className="absolute inset-0 animate-ping rounded-full bg-cyan-500/20 duration-1000" />
                            <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/40 bg-navy-800 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.25)]">
                              <Globe2 className="h-6 w-6 animate-pulse" />
                            </div>
                          </div>
                          <span className="font-mono text-xs font-semibold tracking-wider text-cyan-400">
                            INITIALIZING GEOSPATIAL RADAR...
                          </span>
                          <span className="mt-1 text-[11px] text-slate-500">
                            Streaming tile telemetry & active crisis coordinates
                          </span>
                        </div>
                      }
                    >
                      <WorldMap
                        liveEvents={liveDisasterEvents}
                        incidents={incidents}
                        countryProfiles={countryProfiles}
                        onSelectCountryProfile={(countryName) => {
                          setSelectedProfileCountry(countryName);
                          setActiveTab('country-risk');
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
                <div className="xl:col-span-5">
                  <ErrorBoundary name="Main Dashboard Intelligence Feed">
                    <IntelligenceFeed
                      alerts={alerts}
                      onAcknowledge={handleAcknowledgeAlert}
                      onResolve={handleResolveAlert}
                      canModify={canModify}
                      title="Intelligence Overview"
                      subtitle="Real-time bulletins & advisories"
                      compact={true}
                    />
                  </ErrorBoundary>
                </div>
              </section>

              {/* Bottom Section: Recent Activities (SQLite Audit Log) */}
              <ErrorBoundary name="Recent Activities Log">
                <RecentActivities
                  activities={activities}
                  isLoading={isActivitiesLoading}
                  onRefresh={refreshStatsAndActivities}
                />
              </ErrorBoundary>
            </>
          )}
          </Suspense>
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-navy-800/80 bg-navy-900/60 px-4 md:px-8 py-4 text-center text-xs text-slate-400">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
            <span>
              GRICC © {new Date().getFullYear()} — Global Risk Intelligence Command Centre
            </span>
            <span className="font-mono text-[11px] text-cyan-400/80">
              ARCHITECTURE: REACT + VITE + TAILWIND CSS + EXPRESS + LEAFLET
            </span>
          </div>
        </footer>
      </div>

      {/* Live Notification Centre Drawer */}
      <NotificationCentre
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllNotificationsRead}
        watchlists={watchlists}
        onAddWatchlist={handleAddWatchlist}
        onRemoveWatchlist={handleRemoveWatchlist}
        escalationRules={escalationRules}
        onUpdateRule={handleUpdateEscalationRule}
        preferences={notifPreferences}
        onUpdatePreferences={handleUpdateNotificationPreferences}
        canModify={canModify}
        isAdmin={isAdmin}
        sseConnected={sseConnected}
        sseStatus={sseStatus}
        onNavigateTab={setActiveTab}
      />
    </div>
  );
}
