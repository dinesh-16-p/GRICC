/**
 * GRICC Centralized Frontend API Service
 * Manages communication with Express Backend with timeout, retries, and error resilience.
 */

const API_BASE_URL = '/api';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const AUTH_TOKEN_KEY = 'gricc_auth_token';

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getCsrfToken() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)gricc_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// In-flight GET request deduplication map to prevent concurrent request stampedes
const inflightGetRequests = new Map();

/**
 * Robust fetch wrapper with timeout, abort handling, auth header injection, CSRF protection, and exponential backoff retry.
 */
async function executeFetchWithRetry(url, options = {}, retries = MAX_RETRIES, backoff = 500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const token = getAuthToken();
  const csrfToken = getCsrfToken();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase());

  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(csrfToken && isMutation ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorBody = {};
      try {
        errorBody = await response.json();
      } catch (e) {
        // ignore non-json error body
      }

      // Notify app on 401 for non-login requests so expired/revoked sessions log out cleanly
      if (response.status === 401 && !url.includes('/auth/login') && typeof window !== 'undefined') {
        clearAuthToken();
        window.dispatchEvent(new CustomEvent('gricc:session-expired', { detail: errorBody }));
      }

      const err = new Error(errorBody.message || `HTTP ${response.status} ${response.statusText}`);
      err.status = response.status;
      err.code = errorBody.code || null;
      err.details = errorBody;
      throw err;
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);

    const isAbort = err.name === 'AbortError';
    const isNetwork = !err.status; // failed before receiving response

    // Retry only on network failure or 503/504 errors if retries remain
    if (retries > 0 && (isNetwork || err.status === 503 || err.status === 504)) {
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return executeFetchWithRetry(url, options, retries - 1, backoff * 2);
    }

    throw {
      name: isAbort ? 'TimeoutError' : (err.name || 'APIError'),
      message: isAbort ? 'Backend request timed out. Please verify connection.' : err.message,
      status: err.status || 0,
      code: err.code || null,
      details: err.details || null,
    };
  }
}

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES, backoff = 500) {
  const method = (options.method || 'GET').toUpperCase();
  if (method === 'GET' && retries === MAX_RETRIES && !options.skipDedup) {
    if (inflightGetRequests.has(url)) {
      return inflightGetRequests.get(url);
    }
    const reqPromise = executeFetchWithRetry(url, options, retries, backoff)
      .finally(() => {
        inflightGetRequests.delete(url);
      });
    inflightGetRequests.set(url, reqPromise);
    return reqPromise;
  }
  return executeFetchWithRetry(url, options, retries, backoff);
}

export const apiService = {
  /**
   * Health-check endpoint
   */
  async getHealth() {
    return fetchWithRetry(`${API_BASE_URL}/health`, { timeoutMs: 4000 });
  },

  /**
   * Data sources status endpoint
   */
  async getSources() {
    return fetchWithRetry(`${API_BASE_URL}/sources`);
  },

  /**
   * Complete unified telemetry endpoint
   */
  async getTelemetry(forceRefresh = false) {
    const query = forceRefresh ? '?refresh=true' : '';
    return fetchWithRetry(`${API_BASE_URL}/telemetry${query}`, {
      timeoutMs: 12000, // Telemetry might query external public APIs
    });
  },

  /**
   * Trigger controlled provider refresh
   */
  async triggerRefresh() {
    return fetchWithRetry(`${API_BASE_URL}/refresh`, {
      method: 'POST',
      timeoutMs: 15000,
    });
  },

  // ==========================================
  // PHASE 7: PERSISTENT DATABASE APIS
  // ==========================================

  async getIncidents(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/incidents${query ? `?${query}` : ''}`);
  },

  async getIncidentById(id) {
    return fetchWithRetry(`${API_BASE_URL}/incidents/${encodeURIComponent(id)}`);
  },

  async createIncident(incidentData) {
    return fetchWithRetry(
      `${API_BASE_URL}/incidents`,
      {
        method: 'POST',
        body: JSON.stringify(incidentData),
      },
      0
    );
  },

  async updateIncident(id, updates) {
    return fetchWithRetry(
      `${API_BASE_URL}/incidents/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      },
      0
    );
  },

  async deleteIncident(id) {
    return fetchWithRetry(
      `${API_BASE_URL}/incidents/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
      0
    );
  },

  async getAlerts() {
    return fetchWithRetry(`${API_BASE_URL}/alerts`);
  },

  async syncAlerts(alerts) {
    return fetchWithRetry(`${API_BASE_URL}/alerts/sync`, {
      method: 'POST',
      body: JSON.stringify({ alerts }),
    });
  },

  async updateAlertStatus(id, status) {
    return fetchWithRetry(
      `${API_BASE_URL}/alerts/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
      0
    );
  },

  async getActivities(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/activities${query ? `?${query}` : ''}`);
  },

  async getStats() {
    return fetchWithRetry(`${API_BASE_URL}/stats`);
  },

  // ==========================================
  // PHASE 8: AUTHENTICATION, RBAC & AUDIT APIS
  // ==========================================

  async login(identifier, password) {
    const res = await fetchWithRetry(
      `${API_BASE_URL}/auth/login`,
      {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      },
      0
    );
    if (res?.token) {
      setAuthToken(res.token);
    }
    return res;
  },

  async logout() {
    try {
      await fetchWithRetry(`${API_BASE_URL}/auth/logout`, { method: 'POST' }, 0);
    } finally {
      clearAuthToken();
    }
  },

  async getCurrentUser() {
    return fetchWithRetry(`${API_BASE_URL}/auth/me`, {}, 0);
  },

  async getUsers(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/users${query ? `?${query}` : ''}`);
  },

  async createUser(userData) {
    return fetchWithRetry(
      `${API_BASE_URL}/users`,
      {
        method: 'POST',
        body: JSON.stringify(userData),
      },
      0
    );
  },

  async updateUser(id, updates) {
    return fetchWithRetry(
      `${API_BASE_URL}/users/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      },
      0
    );
  },

  async updateUserStatus(id, isActive) {
    return fetchWithRetry(
      `${API_BASE_URL}/users/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      },
      0
    );
  },

  async getAuditLogs(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/audit-logs${query ? `?${query}` : ''}`);
  },

  // ==========================================
  // PHASE 9: REAL-TIME SSE, NOTIFICATIONS & WATCHLISTS
  // ==========================================

  getEventStreamUrl() {
    return `${API_BASE_URL}/events/stream`;
  },

  async getNotifications(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/notifications${query ? `?${query}` : ''}`);
  },

  async markNotificationRead(id) {
    return fetchWithRetry(
      `${API_BASE_URL}/notifications/${encodeURIComponent(id)}/read`,
      { method: 'PATCH' },
      0
    );
  },

  async markAllNotificationsRead() {
    return fetchWithRetry(`${API_BASE_URL}/notifications/read-all`, { method: 'POST' }, 0);
  },

  async getNotificationPreferences() {
    return fetchWithRetry(`${API_BASE_URL}/notifications/preferences`);
  },

  async updateNotificationPreferences(preferences) {
    return fetchWithRetry(
      `${API_BASE_URL}/notifications/preferences`,
      {
        method: 'PUT',
        body: JSON.stringify(preferences),
      },
      0
    );
  },

  async getWatchlists() {
    return fetchWithRetry(`${API_BASE_URL}/watchlists`);
  },

  async addWatchlistCountry(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/watchlists`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  async removeWatchlistCountry(id) {
    return fetchWithRetry(
      `${API_BASE_URL}/watchlists/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      0
    );
  },

  async getEscalationRules() {
    return fetchWithRetry(`${API_BASE_URL}/escalation-rules`);
  },

  async updateEscalationRule(id, payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/escalation-rules/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  async evaluateEscalationRules() {
    return fetchWithRetry(`${API_BASE_URL}/escalation-rules/evaluate`, { method: 'POST' }, 0);
  },

  // ==========================================
  // PHASE 10: COUNTRY RISK PROFILES & REPORTING
  // ==========================================

  async getCountries(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/countries${query ? `?${query}` : ''}`);
  },

  async getCountryProfile(country) {
    return fetchWithRetry(`${API_BASE_URL}/countries/${encodeURIComponent(country)}`);
  },

  async getCountryTrends(country) {
    return fetchWithRetry(`${API_BASE_URL}/countries/${encodeURIComponent(country)}/trends`);
  },

  async recalculateCountryRisk(country) {
    return fetchWithRetry(
      `${API_BASE_URL}/countries/${encodeURIComponent(country)}/recalculate`,
      { method: 'POST' },
      0
    );
  },

  async getReports() {
    return fetchWithRetry(`${API_BASE_URL}/reports`);
  },

  async getReportById(id) {
    return fetchWithRetry(`${API_BASE_URL}/reports/${encodeURIComponent(id)}`);
  },

  async generateReport(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/reports/generate`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  async updateReportPublish(id, isPublished) {
    return fetchWithRetry(
      `${API_BASE_URL}/reports/${encodeURIComponent(id)}/publish`,
      {
        method: 'PATCH',
        body: JSON.stringify({ isPublished }),
      },
      0
    );
  },

  async downloadReport(id, format = 'pdf') {
    const token = getAuthToken();
    const res = await fetch(
      `${API_BASE_URL}/reports/${encodeURIComponent(id)}/download?format=${encodeURIComponent(format)}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `Export failed (HTTP ${res.status})`);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // ==========================================
  // PHASE 11: PREDICTIVE INTELLIGENCE & EARLY WARNING
  // ==========================================

  async getPredictiveOverview() {
    return fetchWithRetry(`${API_BASE_URL}/predictive/overview`);
  },

  async getCountryPrediction(country) {
    return fetchWithRetry(`${API_BASE_URL}/predictive/countries/${encodeURIComponent(country)}`);
  },

  async getEarlyWarnings(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/predictive/warnings${query ? `?${query}` : ''}`);
  },

  async evaluateEarlyWarnings() {
    return fetchWithRetry(`${API_BASE_URL}/predictive/evaluate`, { method: 'POST' }, 0);
  },

  async updateEarlyWarningStatus(id, status) {
    return fetchWithRetry(
      `${API_BASE_URL}/predictive/warnings/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
      0
    );
  },

  async getEarlyWarningThresholds() {
    return fetchWithRetry(`${API_BASE_URL}/predictive/thresholds`);
  },

  async updateEarlyWarningThreshold(id, payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/predictive/thresholds/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  // ==========================================
  // PHASE 12: STRATEGIC DECISION SUPPORT & RESPONSE
  // ==========================================

  async getDecisionOverview() {
    return fetchWithRetry(`${API_BASE_URL}/decisions/overview`);
  },

  async generateRecommendations() {
    return fetchWithRetry(`${API_BASE_URL}/decisions/recommendations/generate`, { method: 'POST' }, 0);
  },

  async updateRecommendationDecision(id, payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/decisions/recommendations/${encodeURIComponent(id)}/decision`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  async simulateScenarios(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/decisions/simulate`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  async getPlaybooks(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/decisions/playbooks${query ? `?${query}` : ''}`);
  },

  async createPlaybook(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/decisions/playbooks`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  async updatePlaybook(id, payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/decisions/playbooks/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  async getResponseActions(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/decisions/actions${query ? `?${query}` : ''}`);
  },

  async createResponseAction(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/decisions/actions`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  async updateResponseAction(id, payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/decisions/actions/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  // ==========================================
  // PHASE 13: ADVANCED INTELLIGENCE ANALYTICS
  // ==========================================

  async getAdvancedAnalyticsOverview() {
    return fetchWithRetry(`${API_BASE_URL}/analytics/advanced/overview`);
  },

  async getAdvancedCorrelations(country = null) {
    const path = country
      ? `${API_BASE_URL}/analytics/advanced/correlations/${encodeURIComponent(country)}`
      : `${API_BASE_URL}/analytics/advanced/correlations`;
    return fetchWithRetry(path);
  },

  async getAdvancedAnomalies(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/analytics/advanced/anomalies${query ? `?${query}` : ''}`);
  },

  async getGeopoliticalRelationships(country = null, type = null) {
    const base = country
      ? `${API_BASE_URL}/analytics/advanced/relationships/${encodeURIComponent(country)}`
      : `${API_BASE_URL}/analytics/advanced/relationships`;
    const query = type && type !== 'ALL' ? `?type=${encodeURIComponent(type)}` : '';
    return fetchWithRetry(`${base}${query}`);
  },

  async getCountryComparison(countries = []) {
    const query = countries.length > 0 ? `?countries=${encodeURIComponent(countries.join(','))}` : '';
    return fetchWithRetry(`${API_BASE_URL}/analytics/advanced/comparison${query}`);
  },

  async getIntelligenceTrends(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/analytics/advanced/trends${query ? `?${query}` : ''}`);
  },

  async getAnalyticalInsights(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/analytics/advanced/insights${query ? `?${query}` : ''}`);
  },

  async runAdvancedAnalysis() {
    return fetchWithRetry(`${API_BASE_URL}/analytics/advanced/analyze`, { method: 'POST' }, 0);
  },

  // ==========================================
  // PHASE 14: ADVANCED GEOSPATIAL INTELLIGENCE
  // ==========================================

  async getGeospatialOverview() {
    return fetchWithRetry(`${API_BASE_URL}/geospatial/overview`);
  },

  async getGeospatialMap(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/geospatial/map${query ? `?${query}` : ''}`);
  },

  async getGeospatialHeatmap(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/geospatial/heatmap${query ? `?${query}` : ''}`);
  },

  async getGeospatialRegions() {
    return fetchWithRetry(`${API_BASE_URL}/geospatial/regions`);
  },

  async getGeospatialClusters(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/geospatial/clusters${query ? `?${query}` : ''}`);
  },

  async getGeospatialRiskZones(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/geospatial/risk-zones${query ? `?${query}` : ''}`);
  },

  async getGeospatialHistory(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    return fetchWithRetry(`${API_BASE_URL}/geospatial/history${query ? `?${query}` : ''}`);
  },

  async getGeospatialCountryDrillDown(country) {
    return fetchWithRetry(`${API_BASE_URL}/geospatial/country/${encodeURIComponent(country)}`);
  },

  async runGeospatialAnalysis(payload = {}) {
    return fetchWithRetry(
      `${API_BASE_URL}/geospatial/analyze`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      0
    );
  },

  // ==========================================
  // PHASE 15: AI-POWERED INTELLIGENCE ASSISTANT
  // ==========================================

  async getAiStatus() {
    return fetchWithRetry(`${API_BASE_URL}/ai/status`);
  },

  async updateAiConfig(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/ai/config`,
      { method: 'PUT', body: JSON.stringify(payload) },
      0
    );
  },

  async sendAiChat(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/ai/chat`,
      { method: 'POST', body: JSON.stringify(payload) },
      0
    );
  },

  async getAiConversations() {
    return fetchWithRetry(`${API_BASE_URL}/ai/conversations`);
  },

  async createAiConversation(payload = {}) {
    return fetchWithRetry(
      `${API_BASE_URL}/ai/conversations`,
      { method: 'POST', body: JSON.stringify(payload) },
      0
    );
  },

  async getAiConversation(id) {
    return fetchWithRetry(`${API_BASE_URL}/ai/conversations/${encodeURIComponent(id)}`);
  },

  async deleteAiConversation(id) {
    return fetchWithRetry(
      `${API_BASE_URL}/ai/conversations/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      0
    );
  },

  async searchAiIntelligence(query) {
    return fetchWithRetry(
      `${API_BASE_URL}/ai/search`,
      { method: 'POST', body: JSON.stringify({ query }) },
      0
    );
  },

  async explainAiRisk(country) {
    return fetchWithRetry(
      `${API_BASE_URL}/ai/explain-risk`,
      { method: 'POST', body: JSON.stringify({ country }) },
      0
    );
  },

  async summarizeAiIntelligence(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/ai/summarize`,
      { method: 'POST', body: JSON.stringify(payload) },
      0
    );
  },

  async compareAiCountries(countries) {
    return fetchWithRetry(
      `${API_BASE_URL}/ai/compare`,
      { method: 'POST', body: JSON.stringify({ countries }) },
      0
    );
  },

  async generateAiReport(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/ai/generate-report`,
      { method: 'POST', body: JSON.stringify(payload) },
      0
    );
  },

  async getAiReports() {
    return fetchWithRetry(`${API_BASE_URL}/ai/reports`);
  },

  async approveAiReport(id, payload = {}) {
    return fetchWithRetry(
      `${API_BASE_URL}/ai/reports/${encodeURIComponent(id)}/approve`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      0
    );
  },

  // ============================================================
  // PHASE 16: REAL-TIME INTELLIGENCE MONITORING & ALERT SYSTEM
  // ============================================================

  getMonitoringStreamUrl(token = getAuthToken()) {
    const t = token || '';
    return `${API_BASE_URL}/monitoring/stream?token=${encodeURIComponent(t)}`;
  },

  async getMonitoringOverview() {
    return fetchWithRetry(`${API_BASE_URL}/monitoring/overview`);
  },

  async getMonitoringAlerts(params = {}) {
    const query = new URLSearchParams();
    if (params.severity) query.set('severity', params.severity);
    if (params.alertType) query.set('alertType', params.alertType);
    if (params.status) query.set('status', params.status);
    if (params.countryId) query.set('countryId', params.countryId);
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return fetchWithRetry(`${API_BASE_URL}/monitoring/alerts${qs ? `?${qs}` : ''}`);
  },

  async getMonitoringAlert(id) {
    return fetchWithRetry(`${API_BASE_URL}/monitoring/alerts/${encodeURIComponent(id)}`);
  },

  async updateMonitoringAlertStatus(id, status) {
    return fetchWithRetry(
      `${API_BASE_URL}/monitoring/alerts/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      0
    );
  },

  async getMonitoringCategories() {
    return fetchWithRetry(`${API_BASE_URL}/monitoring/categories`);
  },

  async updateMonitoringCategory(id, payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/monitoring/categories/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      0
    );
  },

  async getMonitoringSettings() {
    return fetchWithRetry(`${API_BASE_URL}/monitoring/settings`);
  },

  async updateMonitoringSettings(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/monitoring/settings`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      0
    );
  },

  async evaluateMonitoring() {
    return fetchWithRetry(
      `${API_BASE_URL}/monitoring/evaluate`,
      { method: 'POST', body: JSON.stringify({}) },
      0
    );
  },

  async getMonitoringHealth() {
    return fetchWithRetry(`${API_BASE_URL}/monitoring/health`);
  },

  // ============================================================
  // PHASE 17: INTELLIGENCE COLLABORATION & TEAM WORKSPACE
  // ============================================================

  async getCollaborationOverview() {
    return fetchWithRetry(`${API_BASE_URL}/collaboration/overview`);
  },

  async getDiscussions(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.priority) query.set('priority', params.priority);
    if (params.discussionType) query.set('discussionType', params.discussionType);
    if (params.search) query.set('search', params.search);
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return fetchWithRetry(`${API_BASE_URL}/collaboration/discussions${qs ? `?${qs}` : ''}`);
  },

  async createDiscussion(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/discussions`,
      { method: 'POST', body: JSON.stringify(payload) },
      0
    );
  },

  async getDiscussion(id) {
    return fetchWithRetry(`${API_BASE_URL}/collaboration/discussions/${encodeURIComponent(id)}`);
  },

  async updateDiscussion(id, payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/discussions/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      0
    );
  },

  async assignDiscussion(id, assignedTo) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/discussions/${encodeURIComponent(id)}/assign`,
      { method: 'PATCH', body: JSON.stringify({ assignedTo }) },
      0
    );
  },

  async updateDiscussionStatus(id, status) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/discussions/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      0
    );
  },

  async getDiscussionComments(discussionId) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/discussions/${encodeURIComponent(discussionId)}/comments`
    );
  },

  async addDiscussionComment(discussionId, payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/discussions/${encodeURIComponent(discussionId)}/comments`,
      { method: 'POST', body: JSON.stringify(payload) },
      0
    );
  },

  async editDiscussionComment(commentId, content) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/comments/${encodeURIComponent(commentId)}`,
      { method: 'PATCH', body: JSON.stringify({ content }) },
      0
    );
  },

  async deleteDiscussionComment(commentId) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/comments/${encodeURIComponent(commentId)}`,
      { method: 'DELETE' },
      0
    );
  },

  async getSharedRecords(discussionId) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/discussions/${encodeURIComponent(discussionId)}/shared-records`
    );
  },

  async shareIntelligenceRecord(discussionId, payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/discussions/${encodeURIComponent(discussionId)}/shared-records`,
      { method: 'POST', body: JSON.stringify(payload) },
      0
    );
  },

  async unshareIntelligenceRecord(sharedRecordId) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/shared-records/${encodeURIComponent(sharedRecordId)}`,
      { method: 'DELETE' },
      0
    );
  },

  async getInvestigationTasks(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.priority) query.set('priority', params.priority);
    if (params.assignedTo) query.set('assignedTo', params.assignedTo);
    if (params.createdBy) query.set('createdBy', params.createdBy);
    if (params.overdueOnly) query.set('overdueOnly', 'true');
    const qs = query.toString();
    return fetchWithRetry(`${API_BASE_URL}/collaboration/tasks${qs ? `?${qs}` : ''}`);
  },

  async createInvestigationTask(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/tasks`,
      { method: 'POST', body: JSON.stringify(payload) },
      0
    );
  },

  async updateInvestigationTask(id, payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/tasks/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      0
    );
  },

  async assignInvestigationTask(id, assignedTo) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/tasks/${encodeURIComponent(id)}/assign`,
      { method: 'PATCH', body: JSON.stringify({ assignedTo }) },
      0
    );
  },

  async updateInvestigationTaskStatus(id, status) {
    return fetchWithRetry(
      `${API_BASE_URL}/collaboration/tasks/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      0
    );
  },

  async getTeamDirectory() {
    return fetchWithRetry(`${API_BASE_URL}/collaboration/team`);
  },

  async getCollaborationActivity(params = {}) {
    const query = new URLSearchParams();
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return fetchWithRetry(`${API_BASE_URL}/collaboration/activity${qs ? `?${qs}` : ''}`);
  },

  // ============================================================
  // PHASE 18: ADVANCED SECURITY & COMPLIANCE FRAMEWORK (ADMIN)
  // ============================================================

  async getSecurityOverview() {
    return fetchWithRetry(`${API_BASE_URL}/security/overview`);
  },

  async getSecurityEvents(params = {}) {
    const query = new URLSearchParams();
    if (params.eventType) query.set('eventType', params.eventType);
    if (params.severity) query.set('severity', params.severity);
    if (params.userId) query.set('userId', params.userId);
    if (params.status) query.set('status', params.status);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return fetchWithRetry(`${API_BASE_URL}/security/events${qs ? `?${qs}` : ''}`);
  },

  async updateSecurityEventStatus(id, status) {
    return fetchWithRetry(
      `${API_BASE_URL}/security/events/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      0
    );
  },

  async getSecuritySettings() {
    return fetchWithRetry(`${API_BASE_URL}/security/settings`);
  },

  async updateSecuritySettings(payload) {
    return fetchWithRetry(
      `${API_BASE_URL}/security/settings`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      0
    );
  },

  async verifyAuditIntegrity() {
    return fetchWithRetry(`${API_BASE_URL}/security/audit-integrity`);
  },

  async unlockUserAccount(userId) {
    return fetchWithRetry(
      `${API_BASE_URL}/security/users/${encodeURIComponent(userId)}/unlock`,
      { method: 'POST', body: JSON.stringify({}) },
      0
    );
  },

  // ============================================================
  // PHASE 19: PERFORMANCE & SCALABILITY MONITORING (ADMIN)
  // ============================================================

  async getPerformanceOverview() {
    return fetchWithRetry(`${API_BASE_URL}/performance/overview`);
  },

  async getPerformanceMetrics() {
    return fetchWithRetry(`${API_BASE_URL}/performance/metrics`);
  },

  async getPerformanceHealth() {
    return fetchWithRetry(`${API_BASE_URL}/performance/health`);
  },
};

export default apiService;
