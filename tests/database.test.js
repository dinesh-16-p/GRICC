import { describe, it, expect } from 'vitest';
import { getDb } from '../server/db/database.js';

describe('Database Architecture & Schema Integrity Tests', () => {
  const db = getDb();

  it('verifies SQLite connection and WAL journal mode', () => {
    expect(db).toBeDefined();
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode.toLowerCase()).toBe('wal');
  });

  it('verifies that all critical tables exist in the database', () => {
    const criticalTables = [
      'users',
      'audit_logs',
      'incidents',
      'alerts',
      'revoked_tokens',
      'security_settings',
      'security_events',
      'reports',
      'ai_conversations',
      'ai_messages',
      'early_warnings',
      'strategic_recommendations',
      'geospatial_clusters',
      'geographic_risk_zones',
      'intelligence_discussions',
      'investigation_tasks',
    ];

    const existingTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((t) => t.name);

    for (const table of criticalTables) {
      expect(existingTables).toContain(table);
    }
  });

  it('verifies that indexes are created for performance optimization', () => {
    const indexRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all();
    const indexNames = indexRows.map((i) => i.name);

    expect(indexNames).toContain('idx_users_username');
    expect(indexNames).toContain('idx_incidents_status');
    expect(indexNames).toContain('idx_audit_logs_created');
  });

  it('enforces foreign key constraints', () => {
    const fkSetting = db.pragma('foreign_keys', { simple: true });
    expect(fkSetting).toBe(1);
  });
});
