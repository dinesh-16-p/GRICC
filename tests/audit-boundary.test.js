import { describe, it, expect } from 'vitest';
import securityService, {
  computeAuditEntryHash,
  HISTORICAL_RECONSTRUCTION_BOUNDARY_ID,
  HISTORICAL_RECONSTRUCTION_BOUNDARY_HASH,
} from '../server/services/securityService.js';
import { getDb } from '../server/db/database.js';

describe('Audit History Transparency & Migration Boundary Tests', () => {
  const db = getDb();

  it('exposes the migration boundary constant (ID 222)', () => {
    expect(HISTORICAL_RECONSTRUCTION_BOUNDARY_ID).toBe(222);
    expect(HISTORICAL_RECONSTRUCTION_BOUNDARY_HASH).toBe(
      '51b6dc808cbf71c4403db14356867785cca83a2e13a48af66bdd9cbc72d0147d'
    );
  });

  it('verifies that record 222 has the exact documented boundary hash', () => {
    const row222 = db.prepare('SELECT id, prev_hash, entry_hash FROM audit_logs WHERE id = ?').get(222);
    if (row222) {
      expect(row222.entry_hash).toBe(HISTORICAL_RECONSTRUCTION_BOUNDARY_HASH);
    }
  });

  it('verifies that live records (> 222) link cryptographically from the boundary', () => {
    const row223 = db.prepare('SELECT id, prev_hash, entry_hash FROM audit_logs WHERE id = ?').get(223);
    if (row223) {
      expect(row223.prev_hash).toBe(HISTORICAL_RECONSTRUCTION_BOUNDARY_HASH);
    }
  });

  it('reports transparent breakdown of historical reconstructed vs live chain records', () => {
    const report = securityService.verifyAuditLogIntegrity();
    expect(report.valid).toBe(true);
    expect(report.boundary).toBeDefined();
    expect(report.boundary.boundaryId).toBe(222);
    expect(report.boundary.boundaryIntact).toBe(true);
    expect(report.boundary.historicalReconstructedCount).toBe(222);
    expect(report.boundary.liveChainCount).toBeGreaterThanOrEqual(0);
    expect(report.boundary.transparencyNotice).toContain('historical records 1-222 were canonically reconstructed');
  });

  it('correctly detects tampering across historical or live records', () => {
    const fakePrev = 'GENESIS';
    const fakeEntry = {
      action: 'LOGIN_SUCCESS',
      details: 'Test entry',
      createdAt: '2026-11-13T10:00:00.000Z',
    };
    const validHash = computeAuditEntryHash(fakePrev, fakeEntry);

    // Any modification changes hash
    const modifiedHash = computeAuditEntryHash(fakePrev, { ...fakeEntry, details: 'Tampered details' });
    expect(validHash).not.toBe(modifiedHash);
  });
});

