import { describe, it, expect } from 'vitest';
import { computeAuditEntryHash } from '../server/services/securityService.js';

describe('Audit Chain Cryptographic Integrity Tests', () => {
  it('computes deterministic SHA-256 hashes for identical canonical entries', () => {
    const entry = {
      userId: 'USR-001',
      username: 'admin',
      userRole: 'ADMIN',
      action: 'LOGIN_SUCCESS',
      resourceType: 'auth',
      recordId: 'USR-001',
      details: 'User authenticated successfully.',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
      createdAt: '2026-11-13T10:00:00.000Z',
    };

    const hash1 = computeAuditEntryHash('GENESIS', entry);
    const hash2 = computeAuditEntryHash('GENESIS', entry);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 64 hex characters
  });

  it('produces completely different hashes if any field is tampered', () => {
    const baseEntry = {
      userId: 'USR-001',
      username: 'admin',
      userRole: 'ADMIN',
      action: 'LOGIN_SUCCESS',
      resourceType: 'auth',
      recordId: 'USR-001',
      details: 'User authenticated successfully.',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
      createdAt: '2026-11-13T10:00:00.000Z',
    };

    const originalHash = computeAuditEntryHash('GENESIS', baseEntry);

    const tamperedEntry = { ...baseEntry, action: 'UNAUTHORIZED_ACCESS' };
    const tamperedHash = computeAuditEntryHash('GENESIS', tamperedEntry);

    expect(originalHash).not.toBe(tamperedHash);
  });

  it('chains cryptographic hashes correctly across sequential entries', () => {
    const entries = [
      { action: 'LOGIN_SUCCESS', details: 'Operator logged in', createdAt: '2026-11-13T10:01:00.000Z' },
      { action: 'INCIDENT_CREATED', details: 'Created INC-001', createdAt: '2026-11-13T10:02:00.000Z' },
      { action: 'LOGOUT', details: 'Operator terminated session', createdAt: '2026-11-13T10:05:00.000Z' },
    ];

    let prev = 'GENESIS';
    const chain = [];

    for (const e of entries) {
      const hash = computeAuditEntryHash(prev, e);
      chain.push({ prev, hash });
      prev = hash;
    }

    expect(chain).toHaveLength(3);
    expect(chain[0].prev).toBe('GENESIS');
    expect(chain[1].prev).toBe(chain[0].hash);
    expect(chain[2].prev).toBe(chain[1].hash);
  });
});

