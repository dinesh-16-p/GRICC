import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(process.env.DB_PATH || './server/data/gricc.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable Write-Ahead Logging, busy timeout, and foreign keys for reliability and concurrency
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

/**
 * Initialize persistent SQLite schema
 */
export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      country TEXT NOT NULL,
      location TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('Critical', 'High', 'Medium', 'Low')),
      status TEXT NOT NULL CHECK(status IN ('Open', 'Investigating', 'Contained', 'Resolved')),
      assigned_team TEXT NOT NULL,
      description TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      date_reported TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      country TEXT NOT NULL,
      region TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('Critical', 'High', 'Medium', 'Low')),
      timestamp TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT,
      status TEXT NOT NULL CHECK(status IN ('active', 'acknowledged', 'resolved')) DEFAULT 'active',
      is_live INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('incident', 'alert', 'system')),
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'Info',
      actor TEXT NOT NULL DEFAULT 'Command Analyst',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT 'Intelligence Operations',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'ANALYST', 'VIEWER')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS role_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'ANALYST', 'VIEWER')),
      assigned_by TEXT,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      username TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      record_id TEXT,
      details TEXT NOT NULL,
      ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'SUCCESS',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedup_key TEXT UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('CRITICAL_THREAT', 'INCIDENT_UPDATE', 'COUNTRY_WARNING', 'ALERT_UPDATE', 'ESCALATION')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('Critical', 'High', 'Medium', 'Low', 'Info')),
      country TEXT,
      entity_type TEXT,
      entity_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (notification_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL UNIQUE,
      min_severity TEXT NOT NULL CHECK(min_severity IN ('Critical', 'High', 'Medium', 'Low')) DEFAULT 'Medium',
      notes TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS escalation_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rule_type TEXT NOT NULL CHECK(rule_type IN ('CRITICAL_INCIDENT', 'COUNTRY_CLUSTER', 'UNACK_CRITICAL_ALERT')),
      threshold INTEGER NOT NULL DEFAULT 2,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      browser_notifications INTEGER NOT NULL DEFAULT 0,
      min_severity TEXT NOT NULL CHECK(min_severity IN ('Critical', 'High', 'Medium', 'Low')) DEFAULT 'Medium',
      sound_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS country_risk_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL,
      score INTEGER NOT NULL,
      classification TEXT NOT NULL CHECK(classification IN ('Low', 'Medium', 'High', 'Critical')),
      active_incidents INTEGER NOT NULL DEFAULT 0,
      critical_alerts INTEGER NOT NULL DEFAULT 0,
      breakdown_json TEXT NOT NULL,
      calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      report_type TEXT NOT NULL CHECK(report_type IN (
        'GLOBAL_RISK_SUMMARY',
        'COUNTRY_RISK_REPORT',
        'INCIDENT_SITREP',
        'CRITICAL_ALERT_REPORT',
        'HISTORICAL_INCIDENT_REPORT',
        'AUDIT_ACTIVITY_REPORT'
      )),
      filters_json TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      is_published INTEGER NOT NULL DEFAULT 1,
      generated_by TEXT NOT NULL,
      generated_by_role TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS early_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedup_key TEXT UNIQUE,
      country TEXT NOT NULL,
      warning_type TEXT NOT NULL CHECK(warning_type IN (
        'RISK_APPROACHING_CRITICAL',
        'INCIDENT_SURGE',
        'CATEGORY_RECURRENCE',
        'GEOGRAPHIC_CLUSTER',
        'RAPID_SCORE_RISE'
      )),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('Critical', 'High', 'Medium', 'Low')),
      current_score INTEGER,
      projected_score INTEGER,
      status TEXT NOT NULL CHECK(status IN ('active', 'acknowledged', 'resolved')) DEFAULT 'active',
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS early_warning_thresholds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      metric_key TEXT NOT NULL UNIQUE,
      threshold_value INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Phase 12: Strategic Decision Support & Automated Response System
    CREATE TABLE IF NOT EXISTS strategic_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedup_key TEXT UNIQUE,
      country TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      rationale TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('Critical', 'High', 'Medium', 'Low')),
      priority TEXT NOT NULL CHECK(priority IN ('P1', 'P2', 'P3', 'P4')),
      confidence TEXT NOT NULL CHECK(confidence IN ('HIGH', 'MEDIUM', 'LOW')),
      source_signal TEXT NOT NULL,
      recommended_playbook_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'dismissed', 'executed')) DEFAULT 'pending',
      outcome_notes TEXT,
      decided_by TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS response_playbooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      severity_trigger TEXT NOT NULL CHECK(severity_trigger IN ('Critical', 'High', 'Medium', 'Low')),
      description TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'in_progress', 'completed', 'archived')) DEFAULT 'active',
      country TEXT,
      created_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS response_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      country TEXT NOT NULL,
      playbook_id TEXT,
      recommendation_id INTEGER,
      assigned_to_user_id TEXT,
      assigned_to_username TEXT,
      priority TEXT NOT NULL CHECK(priority IN ('P1', 'P2', 'P3', 'P4')) DEFAULT 'P2',
      status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'blocked', 'completed')) DEFAULT 'pending',
      due_date TEXT,
      outcome_notes TEXT,
      created_by TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decision_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommendation_id INTEGER,
      playbook_id TEXT,
      country TEXT NOT NULL,
      decision_type TEXT NOT NULL CHECK(decision_type IN (
        'RECOMMENDATION_ACCEPTED',
        'RECOMMENDATION_DISMISSED',
        'RECOMMENDATION_EXECUTED',
        'PLAYBOOK_ACTIVATED',
        'SCENARIO_SIMULATED'
      )),
      outcome_status TEXT NOT NULL CHECK(outcome_status IN ('SUCCESS', 'MONITORING', 'DEFERRED', 'ESCALATED')) DEFAULT 'MONITORING',
      summary TEXT NOT NULL,
      decided_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Phase 13: Advanced Intelligence Analytics
    CREATE TABLE IF NOT EXISTS geopolitical_relationships (
      id TEXT PRIMARY KEY,
      source_country TEXT NOT NULL,
      target_country TEXT NOT NULL,
      relationship_type TEXT NOT NULL CHECK(relationship_type IN (
        'DIPLOMATIC',
        'TRADE_ECONOMIC',
        'REGIONAL_COOPERATION',
        'TENSION_CONFLICT'
      )),
      strength_score INTEGER NOT NULL CHECK(strength_score >= -100 AND strength_score <= 100),
      trend_direction TEXT NOT NULL CHECK(trend_direction IN ('STRENGTHENING', 'STABLE', 'DETERIORATING')) DEFAULT 'STABLE',
      verification_status TEXT NOT NULL CHECK(verification_status IN (
        'VERIFIED_FACT',
        'SOURCED_INDICATOR',
        'ANALYTICAL_ASSESSMENT'
      )) DEFAULT 'SOURCED_INDICATOR',
      source_attribution TEXT NOT NULL,
      summary TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_country, target_country, relationship_type)
    );

    CREATE TABLE IF NOT EXISTS detected_anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedup_key TEXT UNIQUE,
      country TEXT NOT NULL,
      anomaly_type TEXT NOT NULL CHECK(anomaly_type IN (
        'FREQUENCY_SPIKE',
        'RISK_SCORE_JUMP',
        'CATEGORY_PATTERN',
        'GEOGRAPHIC_CONCENTRATION'
      )),
      severity TEXT NOT NULL CHECK(severity IN ('Critical', 'High', 'Medium', 'Low')),
      confidence TEXT NOT NULL CHECK(confidence IN ('HIGH', 'MEDIUM', 'LOW')),
      baseline_value REAL,
      observed_value REAL,
      z_score REAL,
      explanation TEXT NOT NULL,
      linked_incident_ids TEXT,
      linked_warning_ids TEXT,
      status TEXT NOT NULL CHECK(status IN ('active', 'acknowledged', 'resolved')) DEFAULT 'active',
      detected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analytical_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedup_key TEXT UNIQUE,
      title TEXT NOT NULL,
      insight_type TEXT NOT NULL CHECK(insight_type IN (
        'RISK_MOVEMENT',
        'CORRELATION_LINK',
        'REGIONAL_PATTERN',
        'INCIDENT_SHIFT',
        'ANOMALY_ALERT'
      )),
      description TEXT NOT NULL,
      supporting_data_json TEXT NOT NULL,
      relevant_countries_json TEXT NOT NULL,
      time_period TEXT NOT NULL,
      confidence TEXT NOT NULL CHECK(confidence IN ('HIGH', 'MEDIUM', 'LOW')),
      data_sources TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Phase 14: Advanced Geospatial Intelligence
    CREATE TABLE IF NOT EXISTS geospatial_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedup_key TEXT UNIQUE,
      region TEXT NOT NULL,
      center_lat REAL NOT NULL CHECK(center_lat >= -90 AND center_lat <= 90),
      center_lng REAL NOT NULL CHECK(center_lng >= -180 AND center_lng <= 180),
      radius_km REAL NOT NULL,
      incident_count INTEGER NOT NULL,
      dominant_category TEXT NOT NULL,
      severity_distribution_json TEXT NOT NULL,
      incident_ids_json TEXT NOT NULL,
      countries_json TEXT NOT NULL,
      proximity_disclaimer TEXT NOT NULL,
      detected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS geographic_risk_zones (
      id TEXT PRIMARY KEY,
      country TEXT NOT NULL UNIQUE,
      region TEXT NOT NULL,
      risk_score INTEGER NOT NULL CHECK(risk_score >= 0 AND risk_score <= 100),
      classification TEXT NOT NULL CHECK(classification IN ('Critical', 'High', 'Medium', 'Low')),
      previous_score INTEGER,
      score_delta INTEGER DEFAULT 0,
      trend_direction TEXT NOT NULL CHECK(trend_direction IN ('RISING', 'IMPROVING', 'STABLE')) DEFAULT 'STABLE',
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL,
      boundary_precision TEXT NOT NULL DEFAULT 'COUNTRY_CENTROID',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS geospatial_analysis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      executed_by TEXT NOT NULL,
      epsilon_km REAL NOT NULL,
      min_points INTEGER NOT NULL,
      clusters_found INTEGER NOT NULL,
      zones_updated INTEGER NOT NULL,
      valid_coord_incidents INTEGER NOT NULL,
      missing_coord_incidents INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Phase 15: AI-Powered Intelligence Assistant
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      active_country TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      evidence_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_generated_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by_username TEXT NOT NULL,
      report_type TEXT NOT NULL CHECK(report_type IN (
        'COUNTRY_INTELLIGENCE',
        'EXECUTIVE_SUMMARY',
        'REGIONAL_INTELLIGENCE',
        'INCIDENT_ANALYSIS',
        'PREDICTIVE_RISK',
        'COMPARATIVE_COUNTRY'
      )),
      title TEXT NOT NULL,
      analysis_period TEXT NOT NULL,
      relevant_countries_json TEXT NOT NULL,
      content_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'approved')) DEFAULT 'draft',
      approved_by TEXT,
      approved_at TEXT,
      linked_report_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      user_role TEXT NOT NULL,
      operation TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Phase 16: Real-Time Intelligence Monitoring & Alert System
    CREATE TABLE IF NOT EXISTS intelligence_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deduplication_key TEXT UNIQUE NOT NULL,
      alert_type TEXT NOT NULL CHECK(alert_type IN (
        'CRITICAL_INCIDENT',
        'HIGH_RISK_CHANGE',
        'NEW_EARLY_WARNING',
        'EMERGING_THREAT',
        'DETECTED_ANOMALY',
        'GEOSPATIAL_CLUSTER',
        'STRATEGIC_RECOMMENDATION',
        'INTELLIGENCE_UPDATE',
        'SYSTEM_SOURCE_FAILURE'
      )),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('Critical', 'High', 'Medium', 'Low')),
      country_id TEXT,
      source_module TEXT NOT NULL,
      source_record_id TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('NEW', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')) DEFAULT 'NEW',
      status_history_json TEXT NOT NULL DEFAULT '[]',
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      resolved_at TEXT,
      resolved_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monitoring_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      alert_type TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      min_severity TEXT NOT NULL CHECK(min_severity IN ('Critical', 'High', 'Medium', 'Low')) DEFAULT 'Medium',
      description TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monitoring_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      interval_seconds INTEGER NOT NULL DEFAULT 60 CHECK(interval_seconds >= 10 AND interval_seconds <= 3600),
      min_severity TEXT NOT NULL CHECK(min_severity IN ('Critical', 'High', 'Medium', 'Low')) DEFAULT 'Medium',
      dedup_window_minutes INTEGER NOT NULL DEFAULT 60 CHECK(dedup_window_minutes >= 1 AND dedup_window_minutes <= 1440),
      risk_score_change_threshold INTEGER NOT NULL DEFAULT 10 CHECK(risk_score_change_threshold >= 1 AND risk_score_change_threshold <= 50),
      incident_surge_threshold INTEGER NOT NULL DEFAULT 2 CHECK(incident_surge_threshold >= 2 AND incident_surge_threshold <= 20),
      predictive_warning_threshold INTEGER NOT NULL DEFAULT 65 CHECK(predictive_warning_threshold >= 25 AND predictive_warning_threshold <= 95),
      geospatial_cluster_threshold INTEGER NOT NULL DEFAULT 2 CHECK(geospatial_cluster_threshold >= 2 AND geospatial_cluster_threshold <= 20),
      monitored_countries_json TEXT NOT NULL DEFAULT '[]',
      last_evaluated_at TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
    CREATE INDEX IF NOT EXISTS idx_incidents_country ON incidents(country);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user ON revoked_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_country ON notifications(country);
    CREATE INDEX IF NOT EXISTS idx_country_snapshots_lookup ON country_risk_snapshots(country, calculated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_early_warnings_status ON early_warnings(status);
    CREATE INDEX IF NOT EXISTS idx_early_warnings_country ON early_warnings(country);
    CREATE INDEX IF NOT EXISTS idx_early_warnings_created ON early_warnings(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_strat_rec_status ON strategic_recommendations(status);
    CREATE INDEX IF NOT EXISTS idx_strat_rec_country ON strategic_recommendations(country);
    CREATE INDEX IF NOT EXISTS idx_playbooks_status ON response_playbooks(status);
    CREATE INDEX IF NOT EXISTS idx_actions_status ON response_actions(status);
    CREATE INDEX IF NOT EXISTS idx_actions_assignee ON response_actions(assigned_to_user_id);
    CREATE INDEX IF NOT EXISTS idx_decision_logs_created ON decision_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_geo_rel_countries ON geopolitical_relationships(source_country, target_country);
    CREATE INDEX IF NOT EXISTS idx_anomalies_status ON detected_anomalies(status);
    CREATE INDEX IF NOT EXISTS idx_anomalies_country ON detected_anomalies(country);
    CREATE INDEX IF NOT EXISTS idx_insights_type ON analytical_insights(insight_type);
    CREATE INDEX IF NOT EXISTS idx_insights_created ON analytical_insights(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_geo_clusters_region ON geospatial_clusters(region);
    CREATE INDEX IF NOT EXISTS idx_geo_clusters_detected ON geospatial_clusters(detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_geo_zones_region ON geographic_risk_zones(region);
    CREATE INDEX IF NOT EXISTS idx_geo_zones_class ON geographic_risk_zones(classification);
    CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_messages(conversation_id, id ASC);
    CREATE INDEX IF NOT EXISTS idx_ai_reports_user ON ai_generated_reports(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_intel_alerts_status ON intelligence_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_intel_alerts_severity ON intelligence_alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_intel_alerts_type ON intelligence_alerts(alert_type);
    CREATE INDEX IF NOT EXISTS idx_intel_alerts_country ON intelligence_alerts(country_id);
    CREATE INDEX IF NOT EXISTS idx_intel_alerts_created ON intelligence_alerts(created_at DESC);

    -- Phase 17: Intelligence Collaboration & Team Workspace
    CREATE TABLE IF NOT EXISTS intelligence_discussions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      discussion_type TEXT NOT NULL CHECK(discussion_type IN (
        'INCIDENT_DISCUSSION', 'COUNTRY_RISK_DISCUSSION', 'THREAT_ANALYSIS',
        'PREDICTIVE_WARNING_DISCUSSION', 'GEOSPATIAL_DISCUSSION',
        'STRATEGIC_RECOMMENDATION', 'GENERAL_INTELLIGENCE'
      )),
      related_module TEXT,
      related_record_id TEXT,
      country_id TEXT,
      priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
      visibility TEXT NOT NULL DEFAULT 'TEAM' CHECK(visibility IN ('TEAM', 'PRIVATE')),
      created_by TEXT NOT NULL REFERENCES users(id),
      assigned_to TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS discussion_members (
      discussion_id TEXT NOT NULL REFERENCES intelligence_discussions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'MEMBER' CHECK(role IN ('OWNER', 'MEMBER')),
      added_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (discussion_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS intelligence_comments (
      id TEXT PRIMARY KEY,
      discussion_id TEXT NOT NULL REFERENCES intelligence_discussions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      parent_comment_id TEXT REFERENCES intelligence_comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      edited_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shared_intelligence_records (
      id TEXT PRIMARY KEY,
      discussion_id TEXT NOT NULL REFERENCES intelligence_discussions(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL CHECK(record_type IN (
        'COUNTRY', 'INCIDENT', 'EARLY_WARNING', 'STRATEGIC_RECOMMENDATION',
        'ANALYTICAL_INSIGHT', 'DETECTED_ANOMALY', 'GEOSPATIAL_CLUSTER',
        'INTELLIGENCE_ALERT', 'AI_REPORT'
      )),
      record_id TEXT NOT NULL,
      source_module TEXT NOT NULL,
      record_title TEXT NOT NULL,
      shared_by TEXT NOT NULL REFERENCES users(id),
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(discussion_id, record_type, record_id)
    );

    CREATE TABLE IF NOT EXISTS investigation_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      discussion_id TEXT REFERENCES intelligence_discussions(id) ON DELETE SET NULL,
      related_module TEXT,
      related_record_id TEXT,
      assigned_to TEXT NOT NULL REFERENCES users(id),
      assigned_by TEXT NOT NULL REFERENCES users(id),
      priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('TODO', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED', 'CANCELLED')),
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES investigation_tasks(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by TEXT NOT NULL REFERENCES users(id),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collaboration_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT NOT NULL REFERENCES users(id),
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      discussion_id TEXT,
      summary TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_collab_disc_status ON intelligence_discussions(status);
    CREATE INDEX IF NOT EXISTS idx_collab_disc_priority ON intelligence_discussions(priority);
    CREATE INDEX IF NOT EXISTS idx_collab_disc_assigned ON intelligence_discussions(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_collab_disc_created ON intelligence_discussions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_collab_comments_disc ON intelligence_comments(discussion_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_collab_comments_user ON intelligence_comments(user_id);
    CREATE INDEX IF NOT EXISTS idx_collab_shared_disc ON shared_intelligence_records(discussion_id);
    CREATE INDEX IF NOT EXISTS idx_collab_tasks_assigned ON investigation_tasks(assigned_to, status);
    CREATE INDEX IF NOT EXISTS idx_collab_tasks_due ON investigation_tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_collab_tasks_disc ON investigation_tasks(discussion_id);
    CREATE INDEX IF NOT EXISTS idx_collab_task_hist ON task_status_history(task_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_collab_activity_created ON collaboration_activity(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_collab_activity_disc ON collaboration_activity(discussion_id);

    -- Phase 18: Advanced Security & Compliance Framework
    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL CHECK(event_type IN (
        'FAILED_LOGIN', 'ACCOUNT_LOCKED', 'UNAUTHORIZED_ACCESS',
        'PRIVILEGE_ESCALATION_ATTEMPT', 'RATE_LIMIT_EXCEEDED', 'INVALID_TOKEN',
        'SUSPICIOUS_API_ACTIVITY', 'SECURITY_CONFIGURATION_CHANGED',
        'SUSPICIOUS_SESSION_ACTIVITY', 'DATA_ACCESS_VIOLATION'
      )),
      severity TEXT NOT NULL CHECK(severity IN ('Critical', 'High', 'Medium', 'Low', 'Info')),
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      ip_address TEXT,
      endpoint TEXT,
      description TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by TEXT
    );

    CREATE TABLE IF NOT EXISTS security_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      max_failed_logins INTEGER NOT NULL DEFAULT 5,
      lockout_duration_minutes INTEGER NOT NULL DEFAULT 15,
      min_password_length INTEGER NOT NULL DEFAULT 8,
      require_uppercase INTEGER NOT NULL DEFAULT 1,
      require_lowercase INTEGER NOT NULL DEFAULT 1,
      require_number INTEGER NOT NULL DEFAULT 1,
      require_special_char INTEGER NOT NULL DEFAULT 1,
      jwt_lifetime_hours INTEGER NOT NULL DEFAULT 8,
      api_rate_limit_max INTEGER NOT NULL DEFAULT 600,
      security_event_retention_days INTEGER NOT NULL DEFAULT 90,
      alert_on_failed_logins INTEGER NOT NULL DEFAULT 3,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sec_events_type ON security_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_sec_events_sev ON security_events(severity);
    CREATE INDEX IF NOT EXISTS idx_sec_events_status ON security_events(status);
    CREATE INDEX IF NOT EXISTS idx_sec_events_user ON security_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_sec_events_created ON security_events(created_at DESC);

    -- Phase 19: Composite Indexes for High-Scale Query Optimization
    CREATE INDEX IF NOT EXISTS idx_incidents_sev_created ON incidents(severity, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_incidents_country_created ON incidents(country, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_incidents_status_created ON incidents(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_action_created ON audit_logs(action, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_intel_alerts_status_sev ON intelligence_alerts(status, severity, id DESC);
    CREATE INDEX IF NOT EXISTS idx_collab_tasks_status_due ON investigation_tasks(status, due_date);
    CREATE INDEX IF NOT EXISTS idx_sec_events_type_created ON security_events(event_type, created_at DESC);

    -- Phase 23: Expression Index for Fast O(1) B-tree Country Risk Snapshots Lookups
    CREATE INDEX IF NOT EXISTS idx_country_snapshots_lower_id ON country_risk_snapshots(LOWER(country), id DESC);
  `);

  // Safe column migrations for Phase 18 (preserves all existing user & audit data)
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('failed_login_attempts')) {
    db.exec('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0');
  }
  if (!userCols.includes('locked_until')) {
    db.exec('ALTER TABLE users ADD COLUMN locked_until TEXT');
  }

  const auditCols = db.prepare('PRAGMA table_info(audit_logs)').all().map((c) => c.name);
  if (!auditCols.includes('prev_hash')) {
    db.exec('ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT');
  }
  if (!auditCols.includes('entry_hash')) {
    db.exec('ALTER TABLE audit_logs ADD COLUMN entry_hash TEXT');
  }

  seedInitialDataIfEmpty();
  seedInitialUsersIfEmpty();
  seedInitialEscalationRulesIfEmpty();
  seedInitialWarningThresholdsIfEmpty();
  seedInitialPlaybooksIfEmpty();
  seedInitialRelationshipsIfEmpty();
  seedInitialMonitoringConfigIfEmpty();
  seedInitialSecuritySettingsIfEmpty();
  return db;
}

/**
 * Seed baseline records ONLY when tables are empty (never overwrites existing data)
 */
function seedInitialDataIfEmpty() {
  const incidentCount = db.prepare('SELECT COUNT(*) AS count FROM incidents').get().count;
  const alertCount = db.prepare('SELECT COUNT(*) AS count FROM alerts').get().count;

  const seedTransaction = db.transaction(() => {
    if (incidentCount === 0) {
      const insertIncident = db.prepare(`
        INSERT INTO incidents (
          id, title, country, location, category, severity, status,
          assigned_team, description, latitude, longitude, date_reported, last_updated
        ) VALUES (
          @id, @title, @country, @location, @category, @severity, @status,
          @assignedTeam, @description, @latitude, @longitude, @dateReported, @lastUpdated
        )
      `);

      const initialIncidents = [
        {
          id: 'INC-2026-0891',
          title: 'Eastern Power Grid Relay Firmware Tampering Attempt',
          country: 'United States',
          location: 'Richmond Substation Facility, VA',
          category: 'Cyber Threat & IT Infrastructure',
          severity: 'Critical',
          status: 'Investigating',
          assignedTeam: 'Cyber Incident Response Team (CIRT)',
          description:
            'Telemetry flagged unauthorized payload push targeting digital relay units. Secondary network airgap initiated; forensics unit analyzing intrusion vector. [DEMO DATA]',
          latitude: 37.5407,
          longitude: -77.436,
          dateReported: '2026-11-02 18:30 UTC',
          lastUpdated: '2026-11-02 20:10 UTC',
        },
        {
          id: 'INC-2026-0844',
          title: 'Santos Intermodal Container Terminal Rail Blockade',
          country: 'Brazil',
          location: 'Port of Santos, Berth 12 Rail Yard',
          category: 'Supply Chain & Freight Transit',
          severity: 'High',
          status: 'Open',
          assignedTeam: 'Logistics Continuity Taskforce',
          description:
            'Locomotive mechanical derailment obstructing main egress corridor for bulk grain trains. Emergency crane crews deployed. [DEMO DATA]',
          latitude: -23.9608,
          longitude: -46.3336,
          dateReported: '2026-11-02 17:15 UTC',
          lastUpdated: '2026-11-02 19:40 UTC',
        },
        {
          id: 'INC-2026-0792',
          title: 'Wagah Border Automated Customs Clearing Gateway Timeout',
          country: 'India',
          location: 'Amritsar Trade Logistics Hub, Punjab',
          category: 'Supply Chain & Freight Transit',
          severity: 'Medium',
          status: 'Contained',
          assignedTeam: 'Regional Operations Command Alpha',
          description:
            'High-latency database deadlocks throttled commercial bill of entry verification. Manual clearance protocol bypass active. [DEMO DATA]',
          latitude: 31.634,
          longitude: 74.8723,
          dateReported: '2026-11-02 14:20 UTC',
          lastUpdated: '2026-11-02 18:05 UTC',
        },
        {
          id: 'INC-2026-0683',
          title: 'Offshore Seismic Sensor Telemetry Packet Degradation',
          country: 'Japan',
          location: 'Nankai Trough Deep-Sea Node 4',
          category: 'Maritime & Port Security',
          severity: 'Low',
          status: 'Resolved',
          assignedTeam: 'Maritime Security Operations',
          description:
            'Fiber-optic transceiver fault caused intermittent dropped telemetry packets. Auxiliary satellite buoy failover verified and primary line spliced. [DEMO DATA]',
          latitude: 33.8,
          longitude: 136.2,
          dateReported: '2026-11-01 22:10 UTC',
          lastUpdated: '2026-11-02 12:30 UTC',
        },
        {
          id: 'INC-2026-0621',
          title: 'South Gulf Commercial Air Route Navigational Ghost Beacon',
          country: 'United Arab Emirates',
          location: 'Jebel Ali Flight Sector Bravo',
          category: 'Geopolitical & Trade Dispute',
          severity: 'Medium',
          status: 'Investigating',
          assignedTeam: 'Global Threat Mitigation Group',
          description:
            'Spurious GPS spoofing vectors detected across regional commercial airline approach corridors. Primary inertial navigation mandated. [DEMO DATA]',
          latitude: 24.9857,
          longitude: 55.0273,
          dateReported: '2026-11-02 11:45 UTC',
          lastUpdated: '2026-11-02 17:50 UTC',
        },
        {
          id: 'INC-2026-0518',
          title: 'Thames Estuary Critical Cooling Pump Sensor Trip',
          country: 'United Kingdom',
          location: 'Isle of Grain Energy Complex, Kent',
          category: 'Energy Grid & Critical Utilities',
          severity: 'High',
          status: 'Contained',
          assignedTeam: 'Critical Infrastructure Unit',
          description:
            'Cavitation sensor triggered precautionary shutdown on turbine water coolant intake. Secondary loop active without capacity curtailment. [DEMO DATA]',
          latitude: 51.445,
          longitude: 0.708,
          dateReported: '2026-11-02 09:15 UTC',
          lastUpdated: '2026-11-02 16:25 UTC',
        },
        {
          id: 'INC-2026-0410',
          title: 'Jurong Island Chemical Pipeline Pressure Micro-Drop',
          country: 'Singapore',
          location: 'Jurong Industrial Cluster, Sector 7',
          category: 'Industrial Operations & Safety',
          severity: 'Low',
          status: 'Resolved',
          assignedTeam: 'Critical Infrastructure Unit',
          description:
            'Acoustic leak detection system flagged 0.4 bar differential. Automated valve shutoff verified zero hazardous vapor discharge. Valve packing replaced. [DEMO DATA]',
          latitude: 1.266,
          longitude: 103.699,
          dateReported: '2026-11-01 16:00 UTC',
          lastUpdated: '2026-11-02 08:30 UTC',
        },
      ];

      for (const inc of initialIncidents) {
        insertIncident.run(inc);
      }

      db.prepare(`
        INSERT INTO activity_logs (entity_type, entity_id, action, description, severity, actor)
        VALUES ('system', 'DB-INIT', 'SEEDED_INCIDENTS', 'Initialized persistent SQLite incident register with 7 baseline records.', 'Info', 'System')
      `).run();
    }

    if (alertCount === 0) {
      const insertAlert = db.prepare(`
        INSERT INTO alerts (
          id, title, country, region, category, severity, timestamp, summary, source, url, status, is_live
        ) VALUES (
          @id, @title, @country, @region, @category, @severity, @timestamp, @summary, @source, @url, @status, @isLive
        )
      `);

      const initialAlerts = [
        {
          id: 'ALT-8091',
          title: 'Industrial Grid Supervisory System Intrusion Detection',
          country: 'United States',
          region: 'North America',
          category: 'Cyber Infrastructure',
          severity: 'Critical',
          timestamp: '2026-11-02 20:15 UTC',
          summary:
            'Uncorrelated lateral traversal telemetry flagged across eastern grid relay controllers. Defense isolation protocols active. [DEMO DATA]',
          source: 'DEMO SOURCE: Cyber Command Threat Sensor Matrix',
          url: null,
          status: 'active',
          isLive: 0,
        },
        {
          id: 'ALT-7742',
          title: 'Severe Coastal Surge Impacting Freight Rail Transit',
          country: 'United States',
          region: 'North America',
          category: 'Natural Hazards & Logistics',
          severity: 'High',
          timestamp: '2026-11-02 19:50 UTC',
          summary:
            'Tidal surge inundation along Mid-Atlantic intermodal rail corridors. Primary bulk container departures deferred 24 hours. [DEMO DATA]',
          source: 'DEMO SOURCE: Hydro-Meteorological Sat-Array',
          url: null,
          status: 'active',
          isLive: 0,
        },
        {
          id: 'ALT-6920',
          title: 'Freight Rail Transit Bottleneck Along Agricultural Corridor',
          country: 'Brazil',
          region: 'South America',
          category: 'Supply Chain & Logistics',
          severity: 'High',
          timestamp: '2026-11-02 19:15 UTC',
          summary:
            'Rolling stock locomotive maintenance delays across Cerrado-Santos rail link causing export grain terminal backlog. [DEMO DATA]',
          source: 'DEMO SOURCE: Agro-Logistics Intermodal Tracker',
          url: null,
          status: 'active',
          isLive: 0,
        },
        {
          id: 'ALT-5412',
          title: 'Cross-Border Supply Corridor Customs Processing Delay',
          country: 'India',
          region: 'South Asia',
          category: 'Trade & Supply Chain',
          severity: 'Medium',
          timestamp: '2026-11-02 18:45 UTC',
          summary:
            'Intermittent clearing gateway latency across northwestern border trade terminal. Rerouting commercial cargo via alternate hubs. [DEMO DATA]',
          source: 'DEMO SOURCE: Regional Customs Automated Registry',
          url: null,
          status: 'acknowledged',
          isLive: 0,
        },
        {
          id: 'ALT-4831',
          title: 'Strait Transit Routing Advisory for Commercial Air Transport',
          country: 'United Arab Emirates',
          region: 'Middle East',
          category: 'Aviation & Geopolitical',
          severity: 'Medium',
          timestamp: '2026-11-02 17:55 UTC',
          summary:
            'Civil aviation authorities issued temporary flight level revisions along southern gulf corridors following naval exercises. [DEMO DATA]',
          source: 'DEMO SOURCE: Middle East Air Navigation Bulletin',
          url: null,
          status: 'active',
          isLive: 0,
        },
        {
          id: 'ALT-3210',
          title: 'Financial Clearing Network Anomaly Detected and Quarantined',
          country: 'United Kingdom',
          region: 'Western Europe',
          category: 'Financial Infrastructure',
          severity: 'Low',
          timestamp: '2026-11-02 17:20 UTC',
          summary:
            'Synthetic probe packet bursts targeting interbank transaction gateways successfully neutralized by automated perimeter firewalls. [DEMO DATA]',
          source: 'DEMO SOURCE: Fin-CERT Early Warning Net',
          url: null,
          status: 'resolved',
          isLive: 0,
        },
        {
          id: 'ALT-2104',
          title: 'Seismic Buoy Pressure Micro-Oscillations Monitored',
          country: 'Japan',
          region: 'East Asia',
          category: 'Maritime & Seismic',
          severity: 'Low',
          timestamp: '2026-11-02 16:40 UTC',
          summary:
            'Offshore deep-sea sensor grid registered standard subduction tremors. All port breakwaters and maritime corridors remain fully operational. [DEMO DATA]',
          source: 'DEMO SOURCE: Pacific Ocean Tsunami Early Net',
          url: null,
          status: 'active',
          isLive: 0,
        },
        {
          id: 'ALT-1088',
          title: 'Maritime Traffic Density Surge in Malacca Strait Lane Alpha',
          country: 'Singapore',
          region: 'Southeast Asia',
          category: 'Maritime Operations',
          severity: 'Low',
          timestamp: '2026-11-02 15:30 UTC',
          summary:
            'Pre-scheduled dredging operations created temporary 12% slow-down in outbound container lanes. Traffic control safely managing spacing. [DEMO DATA]',
          source: 'DEMO SOURCE: Singapore MPA Vessel Telemetry',
          url: null,
          status: 'acknowledged',
          isLive: 0,
        },
      ];

      for (const alt of initialAlerts) {
        insertAlert.run(alt);
      }

      db.prepare(`
        INSERT INTO activity_logs (entity_type, entity_id, action, description, severity, actor)
        VALUES ('system', 'DB-INIT', 'SEEDED_ALERTS', 'Initialized persistent SQLite intelligence alerts store with 8 baseline records.', 'Info', 'System')
      `).run();
    }
  });

  seedTransaction();
}

/**
 * Seed initial RBAC user accounts ONLY when users table is empty.
 * Passwords are always bcrypt-hashed; plaintext is never stored.
 */
function seedInitialUsersIfEmpty() {
  // Never seed demo/default accounts with hardcoded fallback passwords in production
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    const adminPass = process.env.SEED_ADMIN_PASSWORD || 'GriccAdmin!2026';
    const analystPass = process.env.SEED_ANALYST_PASSWORD || 'GriccAnalyst!2026';
    const viewerPass = process.env.SEED_VIEWER_PASSWORD || 'GriccViewer!2026';

    const insertUser = db.prepare(`
      INSERT INTO users (id, username, email, full_name, department, password_hash, role, is_active)
      VALUES (@id, @username, @email, @fullName, @department, @passwordHash, @role, 1)
    `);

    const insertAssignment = db.prepare(`
      INSERT INTO role_assignments (user_id, role, assigned_by)
      VALUES (@userId, @role, 'SYSTEM')
    `);

    const seedUsersTx = db.transaction(() => {
      const initialUsers = [
        {
          id: 'USR-001',
          username: 'admin',
          email: 'admin@gricc.intel',
          fullName: 'Director Marcus Vance',
          department: 'Command & Security Governance',
          passwordHash: bcrypt.hashSync(adminPass, 10),
          role: 'ADMIN',
        },
        {
          id: 'USR-002',
          username: 'analyst',
          email: 'analyst@gricc.intel',
          fullName: 'Elena Rostova',
          department: 'Global Threat Analysis Unit',
          passwordHash: bcrypt.hashSync(analystPass, 10),
          role: 'ANALYST',
        },
        {
          id: 'USR-003',
          username: 'viewer',
          email: 'viewer@gricc.intel',
          fullName: 'Julian Thorne',
          department: 'Executive Oversight Briefings',
          passwordHash: bcrypt.hashSync(viewerPass, 10),
          role: 'VIEWER',
        },
      ];

      for (const u of initialUsers) {
        insertUser.run(u);
        insertAssignment.run({ userId: u.id, role: u.role });
      }

      db.prepare(`
        INSERT INTO audit_logs (user_id, username, user_role, action, resource_type, record_id, details, status)
        VALUES ('SYSTEM', 'system', 'ADMIN', 'SEEDED_RBAC_USERS', 'user', 'USR-001..003', 'Initialized 3 RBAC accounts (ADMIN, ANALYST, VIEWER) with bcrypt hashes.', 'SUCCESS')
      `).run();
    });

    seedUsersTx();
  }

  // Ensure authorized operator account (operator@gricc.intel) exists without modifying existing accounts
  const existingOperator = db
    .prepare("SELECT id FROM users WHERE LOWER(username) = 'operator' OR LOWER(email) = 'operator@gricc.intel'")
    .get();
  if (!existingOperator) {
    const operatorPass = process.env.SEED_OPERATOR_PASSWORD || process.env.SEED_ADMIN_PASSWORD || 'GriccAdmin!2026';
    const opTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO users (id, username, email, full_name, department, password_hash, role, is_active)
        VALUES ('USR-004', 'operator', 'operator@gricc.intel', 'Command Operator', 'Command & Security Governance', ?, 'ADMIN', 1)
      `).run(bcrypt.hashSync(operatorPass, 10));
      db.prepare(`
        INSERT INTO role_assignments (user_id, role, assigned_by)
        VALUES ('USR-004', 'ADMIN', 'SYSTEM')
      `).run();
    });
    opTx();
  }

  // Ensure authorized user account (dpillay851@gmail.com) exists as ADMIN
  const existingDinesh = db
    .prepare("SELECT id FROM users WHERE LOWER(username) = 'dpillay851' OR LOWER(email) = 'dpillay851@gmail.com'")
    .get();
  if (!existingDinesh) {
    const dineshPass = process.env.SEED_ADMIN_PASSWORD || 'admin123';
    const dTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO users (id, username, email, full_name, department, password_hash, role, is_active)
        VALUES ('USR-005', 'dpillay851', 'dpillay851@gmail.com', 'Dinesh Pillay', 'Command & Security Governance', ?, 'ADMIN', 1)
      `).run(bcrypt.hashSync(dineshPass, 10));
      db.prepare(`
        INSERT INTO role_assignments (user_id, role, assigned_by)
        VALUES ('USR-005', 'ADMIN', 'SYSTEM')
      `).run();
    });
    dTx();
  }
}

/**
 * Seed default escalation rules ONLY when escalation_rules table is empty.
 */
function seedInitialEscalationRulesIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM escalation_rules').get().count;
  if (count > 0) return;

  const insertRule = db.prepare(`
    INSERT INTO escalation_rules (id, name, rule_type, threshold, enabled, updated_by)
    VALUES (@id, @name, @ruleType, @threshold, @enabled, 'SYSTEM')
  `);

  const rules = [
    {
      id: 'RULE-CRITICAL-INC',
      name: 'Immediate Critical Incident Escalation',
      ruleType: 'CRITICAL_INCIDENT',
      threshold: 1,
      enabled: 1,
    },
    {
      id: 'RULE-COUNTRY-CLUSTER',
      name: 'Multi-Incident Country Attention Threshold',
      ruleType: 'COUNTRY_CLUSTER',
      threshold: 2,
      enabled: 1,
    },
    {
      id: 'RULE-UNACK-ALERT',
      name: 'Unacknowledged Critical Alert Timeout (Minutes)',
      ruleType: 'UNACK_CRITICAL_ALERT',
      threshold: 15,
      enabled: 1,
    },
  ];

  const tx = db.transaction(() => {
    for (const r of rules) {
      insertRule.run(r);
    }
  });
  tx();
}

/**
 * Seed default early-warning thresholds ONLY when early_warning_thresholds is empty.
 */
function seedInitialWarningThresholdsIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM early_warning_thresholds').get().count;
  if (count > 0) return;

  const insertThreshold = db.prepare(`
    INSERT INTO early_warning_thresholds (id, name, metric_key, threshold_value, enabled, updated_by)
    VALUES (@id, @name, @metricKey, @thresholdValue, @enabled, 'SYSTEM')
  `);

  const defaults = [
    {
      id: 'THR-APPROACH-CRIT',
      name: 'Approaching Critical Risk Score Threshold (0-100)',
      metricKey: 'APPROACHING_CRITICAL_SCORE',
      thresholdValue: 65,
      enabled: 1,
    },
    {
      id: 'THR-INC-SURGE',
      name: 'Active Incident Volume Surge Threshold',
      metricKey: 'INCIDENT_SURGE_COUNT',
      thresholdValue: 2,
      enabled: 1,
    },
    {
      id: 'THR-CAT-RECUR',
      name: 'Recurring Threat Category Threshold',
      metricKey: 'CATEGORY_RECURRENCE_COUNT',
      thresholdValue: 2,
      enabled: 1,
    },
    {
      id: 'THR-GEO-CLUSTER',
      name: 'Geographic Incident Cluster Threshold',
      metricKey: 'CLUSTER_ACTIVE_COUNT',
      thresholdValue: 2,
      enabled: 1,
    },
  ];

  const tx = db.transaction(() => {
    for (const t of defaults) {
      insertThreshold.run(t);
    }
  });
  tx();
}

/**
 * Seed default Phase 12 response playbooks ONLY when response_playbooks is empty.
 */
function seedInitialPlaybooksIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM response_playbooks').get().count;
  if (count > 0) return;

  const insertPlaybook = db.prepare(`
    INSERT INTO response_playbooks (
      id, name, category, severity_trigger, description, steps_json, status, country, created_by
    ) VALUES (
      @id, @name, @category, @severityTrigger, @description, @stepsJson, @status, @country, 'SYSTEM'
    )
  `);

  const defaults = [
    {
      id: 'PB-CYBER-ISOLATION',
      name: 'Cyber Containment & Grid Isolation',
      category: 'Cyber',
      severityTrigger: 'Critical',
      description: 'Standard operating workflow for containing SCADA/OT or enterprise cyber intrusions.',
      stepsJson: JSON.stringify([
        { stepOrder: 1, title: 'Isolate affected network segment and revoke lateral credentials', ownerRole: 'ANALYST', completed: false },
        { stepOrder: 2, title: 'Capture forensic memory & telemetry snapshots', ownerRole: 'ANALYST', completed: false },
        { stepOrder: 3, title: 'Verify backup control-plane failover readiness', ownerRole: 'ADMIN', completed: false },
        { stepOrder: 4, title: 'Issue executive containment briefing & regulatory notice', ownerRole: 'ADMIN', completed: false },
      ]),
      status: 'active',
      country: null,
    },
    {
      id: 'PB-SUPPLY-REROUTE',
      name: 'Supply Chain Corridor Rerouting',
      category: 'Supply Chain & Freight Transit',
      severityTrigger: 'High',
      description: 'Contingency logistics workflow when primary rail, customs, or port hubs experience disruption.',
      stepsJson: JSON.stringify([
        { stepOrder: 1, title: 'Assess cargo backlog and alternate multimodal corridors', ownerRole: 'ANALYST', completed: false },
        { stepOrder: 2, title: 'Activate secondary customs & carrier clearance agreements', ownerRole: 'ANALYST', completed: false },
        { stepOrder: 3, title: 'Notify downstream distribution hubs of revised ETAs', ownerRole: 'ADMIN', completed: false },
      ]),
      status: 'active',
      country: null,
    },
    {
      id: 'PB-MARITIME-LOCKDOWN',
      name: 'Maritime & Port Security Escalation',
      category: 'Maritime & Port Security',
      severityTrigger: 'High',
      description: 'Coordinated maritime posture elevation for vessel routing, port perimeter, and telemetry anomalies.',
      stepsJson: JSON.stringify([
        { stepOrder: 1, title: 'Establish vessel advisory perimeter and AIS verification', ownerRole: 'ANALYST', completed: false },
        { stepOrder: 2, title: 'Coordinate with regional port authority & coast guard liaison', ownerRole: 'ADMIN', completed: false },
        { stepOrder: 3, title: 'Confirm alternate anchorage and berth allocation', ownerRole: 'ANALYST', completed: false },
      ]),
      status: 'active',
      country: null,
    },
    {
      id: 'PB-GEOPOLITICAL-CRISIS',
      name: 'Geopolitical Crisis & Operations Continuity',
      category: 'Geopolitical & Trade Dispute',
      severityTrigger: 'Medium',
      description: 'Structured response for airspace, trade sanction, or regional instability escalations.',
      stepsJson: JSON.stringify([
        { stepOrder: 1, title: 'Verify personnel & asset exposure in affected jurisdiction', ownerRole: 'ANALYST', completed: false },
        { stepOrder: 2, title: 'Engage legal/trade compliance review for route restrictions', ownerRole: 'ADMIN', completed: false },
        { stepOrder: 3, title: 'Establish 6-hour executive sitrep cadence', ownerRole: 'ADMIN', completed: false },
      ]),
      status: 'active',
      country: null,
    },
  ];

  const tx = db.transaction(() => {
    for (const pb of defaults) {
      insertPlaybook.run(pb);
    }
  });
  tx();
}

/**
 * Seed baseline geopolitical relationship indicators ONLY when geopolitical_relationships is empty.
 */
function seedInitialRelationshipsIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM geopolitical_relationships').get().count;
  if (count > 0) return;

  const insertRel = db.prepare(`
    INSERT INTO geopolitical_relationships (
      id, source_country, target_country, relationship_type, strength_score,
      trend_direction, verification_status, source_attribution, summary
    ) VALUES (
      @id, @sourceCountry, @targetCountry, @relationshipType, @strengthScore,
      @trendDirection, @verificationStatus, @sourceAttribution, @summary
    )
  `);

  const defaults = [
    {
      id: 'REL-US-UK-DIPL',
      sourceCountry: 'United States',
      targetCountry: 'United Kingdom',
      relationshipType: 'DIPLOMATIC',
      strengthScore: 85,
      trendDirection: 'STABLE',
      verificationStatus: 'VERIFIED_FACT',
      sourceAttribution: 'Bilateral Security & Cyber Defense Frameworks',
      summary: 'High-trust intelligence sharing and coordinated critical infrastructure defense posture.',
    },
    {
      id: 'REL-US-JP-COOP',
      sourceCountry: 'United States',
      targetCountry: 'Japan',
      relationshipType: 'REGIONAL_COOPERATION',
      strengthScore: 82,
      trendDirection: 'STRENGTHENING',
      verificationStatus: 'VERIFIED_FACT',
      sourceAttribution: 'Indo-Pacific Maritime & Supply Chain Partnership',
      summary: 'Joint maritime telemetry monitoring and semiconductor supply chain resilience coordination.',
    },
    {
      id: 'REL-IN-AE-TRADE',
      sourceCountry: 'India',
      targetCountry: 'United Arab Emirates',
      relationshipType: 'TRADE_ECONOMIC',
      strengthScore: 76,
      trendDirection: 'STRENGTHENING',
      verificationStatus: 'SOURCED_INDICATOR',
      sourceAttribution: 'CEPA Bilateral Trade Corridor Telemetry',
      summary: 'High-volume energy, customs, and freight transit interdependence across Arabian Sea corridors.',
    },
    {
      id: 'REL-SG-JP-TRADE',
      sourceCountry: 'Singapore',
      targetCountry: 'Japan',
      relationshipType: 'TRADE_ECONOMIC',
      strengthScore: 74,
      trendDirection: 'STABLE',
      verificationStatus: 'SOURCED_INDICATOR',
      sourceAttribution: 'ASEAN-East Asia Maritime Freight Index',
      summary: 'Critical LNG, chemical, and container transshipment linkage via Malacca and East China Sea.',
    },
    {
      id: 'REL-BR-US-TRADE',
      sourceCountry: 'Brazil',
      targetCountry: 'United States',
      relationshipType: 'TRADE_ECONOMIC',
      strengthScore: 58,
      trendDirection: 'STABLE',
      verificationStatus: 'SOURCED_INDICATOR',
      sourceAttribution: 'Agricultural & Bulk Commodity Export Ledger',
      summary: 'Port of Santos bulk grain and industrial supply chain exposure to Atlantic shipping lanes.',
    },
    {
      id: 'REL-IN-SG-COOP',
      sourceCountry: 'India',
      targetCountry: 'Singapore',
      relationshipType: 'REGIONAL_COOPERATION',
      strengthScore: 71,
      trendDirection: 'STRENGTHENING',
      verificationStatus: 'SOURCED_INDICATOR',
      sourceAttribution: 'Regional FinTech & Maritime Security Dialogue',
      summary: 'Coordinated customs digitization and Strait of Malacca maritime domain awareness.',
    },
    {
      id: 'REL-UK-AE-DIPL',
      sourceCountry: 'United Kingdom',
      targetCountry: 'United Arab Emirates',
      relationshipType: 'DIPLOMATIC',
      strengthScore: 64,
      trendDirection: 'STABLE',
      verificationStatus: 'ANALYTICAL_ASSESSMENT',
      sourceAttribution: 'GRICC Regional Energy & Aviation Corridor Assessment',
      summary: 'Shared commercial aviation and LNG transit dependencies sensitive to Gulf GPS spoofing events.',
    },
    {
      id: 'REL-US-BR-TENS',
      sourceCountry: 'United States',
      targetCountry: 'Brazil',
      relationshipType: 'TENSION_CONFLICT',
      strengthScore: -18,
      trendDirection: 'DETERIORATING',
      verificationStatus: 'ANALYTICAL_ASSESSMENT',
      sourceAttribution: 'GRICC Trade & Supply Chain Friction Indicator',
      summary: 'Periodic tariff and port logistics bottlenecks creating moderate bilateral trade friction.',
    },
  ];

  const tx = db.transaction(() => {
    for (const r of defaults) {
      insertRel.run(r);
    }
  });
  tx();
}

/**
 * Seed default Phase 16 monitoring settings & categories ONLY when empty.
 */
function seedInitialMonitoringConfigIfEmpty() {
  const settingsCount = db.prepare('SELECT COUNT(*) AS count FROM monitoring_settings').get().count;
  if (settingsCount === 0) {
    db.prepare(`
      INSERT INTO monitoring_settings (
        id, interval_seconds, min_severity, dedup_window_minutes,
        risk_score_change_threshold, incident_surge_threshold,
        predictive_warning_threshold, geospatial_cluster_threshold,
        monitored_countries_json, updated_by
      ) VALUES (1, 60, 'Medium', 60, 10, 2, 65, 2, '[]', 'SYSTEM')
    `).run();
  }

  const catCount = db.prepare('SELECT COUNT(*) AS count FROM monitoring_categories').get().count;
  if (catCount === 0) {
    const insertCat = db.prepare(`
      INSERT INTO monitoring_categories (id, name, alert_type, enabled, min_severity, description, updated_by)
      VALUES (@id, @name, @alertType, 1, @minSeverity, @description, 'SYSTEM')
    `);
    const categories = [
      { id: 'CAT-CRIT-INC', name: 'Critical Incidents', alertType: 'CRITICAL_INCIDENT', minSeverity: 'High', description: 'Monitors newly reported High/Critical incidents in SQLite.' },
      { id: 'CAT-RISK-CHG', name: 'Country Risk Changes', alertType: 'HIGH_RISK_CHANGE', minSeverity: 'High', description: 'Monitors significant country risk score deltas and Critical risk postures.' },
      { id: 'CAT-EARLY-WARN', name: 'Predictive Early Warnings', alertType: 'NEW_EARLY_WARNING', minSeverity: 'Medium', description: 'Monitors Phase 11 early-warning signals.' },
      { id: 'CAT-EMERGING', name: 'Emerging Threats', alertType: 'EMERGING_THREAT', minSeverity: 'Medium', description: 'Monitors emerging threat surges and recurring categories.' },
      { id: 'CAT-ANOMALY', name: 'Detected Anomalies', alertType: 'DETECTED_ANOMALY', minSeverity: 'Medium', description: 'Monitors Phase 13 statistical anomalies.' },
      { id: 'CAT-GEO-CLUST', name: 'Geospatial Clusters', alertType: 'GEOSPATIAL_CLUSTER', minSeverity: 'Medium', description: 'Monitors Phase 14 DBSCAN spatial clusters.' },
      { id: 'CAT-STRAT-REC', name: 'Strategic Recommendations', alertType: 'STRATEGIC_RECOMMENDATION', minSeverity: 'High', description: 'Monitors Phase 12 P1/High strategic recommendations.' },
      { id: 'CAT-INTEL-UPD', name: 'Approved Intelligence Reports', alertType: 'INTELLIGENCE_UPDATE', minSeverity: 'Low', description: 'Monitors newly approved AI intelligence reports.' },
      { id: 'CAT-SYS-FAIL', name: 'Source & System Health', alertType: 'SYSTEM_SOURCE_FAILURE', minSeverity: 'High', description: 'Monitors intelligence provider and system health.' },
    ];
    const tx = db.transaction(() => {
      for (const c of categories) insertCat.run(c);
    });
    tx();
  }
}

/**
 * Seed default Phase 18 security settings ONLY when empty.
 */
function seedInitialSecuritySettingsIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM security_settings').get().count;
  if (count === 0) {
    db.prepare(`
      INSERT INTO security_settings (
        id, max_failed_logins, lockout_duration_minutes, min_password_length,
        require_uppercase, require_lowercase, require_number, require_special_char,
        jwt_lifetime_hours, api_rate_limit_max, security_event_retention_days,
        alert_on_failed_logins, updated_by
      ) VALUES (1, 5, 15, 8, 1, 1, 1, 1, 8, 600, 90, 3, 'SYSTEM')
    `).run();
  }
}

export function getDb() {
  return db;
}

export function closeDatabase() {
  if (db.open) {
    db.close();
  }
}

export default db;

