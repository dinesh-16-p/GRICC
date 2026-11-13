import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  encryptBackupBuffer,
  decryptBackupBuffer,
  isEncryptedBackupFile,
} from '../server/scripts/backup-database.js';

describe('Backup Authenticated Encryption (AES-256-GCM) Tests', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gricc-enc-test-'));
  const testDbPath = path.join(tempDir, 'source.db');
  const backupDir = path.join(tempDir, 'backups');
  const restoredDbPath = path.join(tempDir, 'restored.db');
  const TEST_KEY = 'GriccProdBackupEncryptionSecretKey2026!';

  beforeAll(() => {
    // Create a realistic sample SQLite database
    const db = new Database(testDbPath);
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
      INSERT INTO users (username) VALUES ('admin'), ('analyst');
      CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, action TEXT);
      INSERT INTO audit_logs (action) VALUES ('SYS_INIT');
    `);
    db.close();
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Non-fatal cleanup
    }
  });

  it('encrypts and decrypts raw buffers using AES-256-GCM authenticated cipher', () => {
    const original = Buffer.from('Confidential GRICC Database Telemetry Payload 2026', 'utf8');
    const encrypted = encryptBackupBuffer(original, TEST_KEY);

    expect(encrypted).toBeInstanceOf(Buffer);
    expect(encrypted.length).toBeGreaterThan(original.length);

    // Verify magic bytes
    expect(encrypted.subarray(0, 8).toString('utf8')).toBe('GRICCBKP');

    // Decrypt with correct key
    const decrypted = decryptBackupBuffer(encrypted, TEST_KEY);
    expect(decrypted.toString('utf8')).toBe(original.toString('utf8'));
  });

  it('strictly rejects decryption when supplied with an incorrect key', () => {
    const original = Buffer.from('Sensitive Intel', 'utf8');
    const encrypted = encryptBackupBuffer(original, TEST_KEY);

    expect(() => decryptBackupBuffer(encrypted, 'WrongPassword123!')).toThrow(
      /authentication tag verification failed/
    );
  });

  it('creates an encrypted backup file on disk (.db.enc)', async () => {
    const backupResult = await createDatabaseBackup({
      sourceDbPath: testDbPath,
      backupDir,
      encryptionKey: TEST_KEY,
      retentionCount: 5,
    });

    expect(backupResult.isEncrypted).toBe(true);
    expect(backupResult.encryptionAlgorithm).toBe('aes-256-gcm');
    expect(backupResult.backupFilePath.endsWith('.enc')).toBe(true);
    expect(fs.existsSync(backupResult.backupFilePath)).toBe(true);
    expect(isEncryptedBackupFile(backupResult.backupFilePath)).toBe(true);
  });

  it('restores an encrypted backup into SQLite with verified database integrity', async () => {
    // Create encrypted backup
    const backupResult = await createDatabaseBackup({
      sourceDbPath: testDbPath,
      backupDir,
      encryptionKey: TEST_KEY,
      retentionCount: 5,
    });

    // Restore with correct key
    const restoreResult = await restoreDatabaseBackup({
      backupFilePath: backupResult.backupFilePath,
      targetDbPath: restoredDbPath,
      overwrite: true,
      encryptionKey: TEST_KEY,
    });

    expect(restoreResult.integrity).toBe('ok');
    expect(restoreResult.wasEncrypted).toBe(true);
    expect(restoreResult.counts.users).toBe(2);
    expect(restoreResult.counts.auditLogs).toBe(1);
  });

  it('fails restoration of an encrypted backup when incorrect key is provided', async () => {
    const backupResult = await createDatabaseBackup({
      sourceDbPath: testDbPath,
      backupDir,
      encryptionKey: TEST_KEY,
      retentionCount: 5,
    });

    const failedRestorePath = path.join(tempDir, 'failed.db');

    await expect(
      restoreDatabaseBackup({
        backupFilePath: backupResult.backupFilePath,
        targetDbPath: failedRestorePath,
        overwrite: true,
        encryptionKey: 'IncorrectPassphrase123!',
      })
    ).rejects.toThrow(/authentication tag verification failed/);
  });
});

