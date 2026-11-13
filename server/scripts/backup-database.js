import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

export const ENCRYPTION_MAGIC = Buffer.from('GRICCBKP', 'utf8'); // 8 bytes
export const ENCRYPTION_VERSION = 1;
export const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt a buffer using authenticated AES-256-GCM with scrypt key derivation.
 * Header layout (53 bytes):
 * - Magic (8 bytes): GRICCBKP
 * - Version (1 byte): 0x01
 * - Salt (16 bytes): Random scrypt salt
 * - IV (12 bytes): Random GCM initialization vector
 * - Auth Tag (16 bytes): GCM authentication tag
 * - Ciphertext (variable)
 */
export function encryptBackupBuffer(buffer, passphrase) {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('Encryption passphrase must be at least 8 characters long.');
  }

  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(passphrase, salt, 32);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    ENCRYPTION_MAGIC,
    Buffer.from([ENCRYPTION_VERSION]),
    salt,
    iv,
    authTag,
    ciphertext,
  ]);
}

/**
 * Decrypt an AES-256-GCM encrypted backup buffer.
 * Rejects invalid headers, mismatched versions, and incorrect authentication tags.
 */
export function decryptBackupBuffer(encryptedBuffer, passphrase) {
  if (!passphrase || typeof passphrase !== 'string') {
    throw new Error('Encryption passphrase is required to decrypt backup.');
  }

  if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.length < 53) {
    throw new Error('Invalid encrypted backup: buffer is too small or malformed.');
  }

  const magic = encryptedBuffer.subarray(0, 8);
  if (!magic.equals(ENCRYPTION_MAGIC)) {
    throw new Error('Invalid encrypted backup: missing GRICCBKP header magic bytes.');
  }

  const version = encryptedBuffer[8];
  if (version !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encrypted backup version: ${version}`);
  }

  const salt = encryptedBuffer.subarray(9, 25);
  const iv = encryptedBuffer.subarray(25, 37);
  const authTag = encryptedBuffer.subarray(37, 53);
  const ciphertext = encryptedBuffer.subarray(53);

  const derivedKey = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new Error(
      `Backup decryption failed: authentication tag verification failed (incorrect key or corrupted data).`
    );
  }
}

/**
 * Check if a file is an encrypted GRICCBKP backup.
 */
export function isEncryptedBackupFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  if (filePath.endsWith('.enc')) return true;
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(8);
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);
    return header.equals(ENCRYPTION_MAGIC);
  } catch {
    return false;
  }
}

/**
 * Create a transactionally consistent SQLite backup using better-sqlite3's online backup API.
 * Encrypts with AES-256-GCM if BACKUP_ENCRYPTION_KEY or encryptionKey option is provided.
 */
export async function createDatabaseBackup({
  sourceDbPath = process.env.DB_PATH || './server/data/gricc.db',
  backupDir = process.env.BACKUP_DIR || './server/backups',
  retentionCount = Number(process.env.BACKUP_RETENTION_COUNT || 14),
  encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || null,
} = {}) {
  const resolvedSource = path.resolve(sourceDbPath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Source database not found at: ${resolvedSource}`);
  }

  const resolvedBackupDir = path.resolve(backupDir);
  fs.mkdirSync(resolvedBackupDir, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const tempFileName = `gricc-backup-${stamp}.tmp.db`;
  const tempFilePath = path.join(resolvedBackupDir, tempFileName);

  const sourceDb = new Database(resolvedSource, { readonly: true });
  try {
    await sourceDb.backup(tempFilePath);
  } finally {
    sourceDb.close();
  }

  // Verify backup integrity before encryption
  const verifyDb = new Database(tempFilePath, { readonly: true });
  let integrityCheck;
  let userCount = 0;
  let auditCount = 0;
  try {
    integrityCheck = verifyDb.pragma('integrity_check', { simple: true });
    if (integrityCheck !== 'ok') {
      throw new Error(`Backup integrity check failed: ${integrityCheck}`);
    }
    userCount = verifyDb.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    auditCount = verifyDb.prepare('SELECT COUNT(*) AS c FROM audit_logs').get().c;
  } finally {
    verifyDb.close();
  }

  let finalFileName;
  let finalFilePath;
  let isEncrypted = false;

  if (encryptionKey) {
    finalFileName = `gricc-backup-${stamp}.db.enc`;
    finalFilePath = path.join(resolvedBackupDir, finalFileName);
    const rawBuffer = fs.readFileSync(tempFilePath);
    const encryptedBuffer = encryptBackupBuffer(rawBuffer, encryptionKey);
    fs.writeFileSync(finalFilePath, encryptedBuffer);
    fs.unlinkSync(tempFilePath); // safely remove unencrypted temporary snapshot
    isEncrypted = true;
  } else {
    finalFileName = `gricc-backup-${stamp}.db`;
    finalFilePath = path.join(resolvedBackupDir, finalFileName);
    fs.renameSync(tempFilePath, finalFilePath);
  }

  // Enforce retention policy (keep newest N backups, supporting both .db and .db.enc)
  let pruned = [];
  if (Number.isFinite(retentionCount) && retentionCount > 0) {
    const files = fs
      .readdirSync(resolvedBackupDir)
      .filter((f) => f.startsWith('gricc-backup-') && (f.endsWith('.db') || f.endsWith('.db.enc')))
      .sort()
      .reverse();
    const toDelete = files.slice(retentionCount);
    for (const oldFile of toDelete) {
      try {
        fs.unlinkSync(path.join(resolvedBackupDir, oldFile));
        pruned.push(oldFile);
      } catch {
        // Non-fatal
      }
    }
  }

  const stats = fs.statSync(finalFilePath);

  // Optional off-site cloud replication (S3 / Cloudflare R2 / MinIO)
  let cloudReplication = { enabled: false, status: 'SKIPPED' };
  if (process.env.S3_BACKUP_BUCKET) {
    try {
      cloudReplication = await replicateBackupToCloud({
        filePath: finalFilePath,
        fileName: finalFileName,
        bucket: process.env.S3_BACKUP_BUCKET,
        endpoint: process.env.S3_ENDPOINT,
      });
    } catch (err) {
      cloudReplication = { enabled: true, status: 'FAILED', error: err.message };
      console.warn(`[BACKUP] Cloud replication failed: ${err.message}`);
    }
  }

  return {
    backupFilePath: finalFilePath,
    backupFileName: finalFileName,
    sizeBytes: stats.size,
    integrityCheck,
    userCount,
    auditCount,
    prunedCount: pruned.length,
    isEncrypted,
    encryptionAlgorithm: isEncrypted ? ENCRYPTION_ALGORITHM : 'none',
    cloudReplication,
    createdAt: now.toISOString(),
  };
}

/**
 * Replicate local backup to S3-compatible cloud object storage with timeout and checksum validation.
 */
export async function replicateBackupToCloud({
  filePath,
  fileName,
  bucket,
  endpoint,
  timeoutMs = 30000,
} = {}) {
  const targetUrl = endpoint ? `${endpoint.replace(/\/$/, '')}/${bucket}/${fileName}` : `s3://${bucket}/${fileName}`;
  console.log(`[BACKUP] Cloud target: ${targetUrl}`);

  if (!process.env.S3_UPLOAD_URL) {
    return {
      enabled: true,
      status: 'CONFIGURED_NO_UPLOAD_URL',
      bucket,
      targetUrl,
      notice: 'S3_BACKUP_BUCKET set but S3_UPLOAD_URL not configured. Direct AWS SigV4 upload requires S3 presigned URL or AWS SDK.',
      replicatedAt: new Date().toISOString(),
    };
  }

  const uploadUrl = process.env.S3_UPLOAD_URL.trim();
  try {
    const parsed = new URL(uploadUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Invalid S3_UPLOAD_URL protocol: ${parsed.protocol}`);
    }
  } catch (err) {
    throw new Error(`Invalid S3_UPLOAD_URL format: ${err.message}`);
  }

  const fileData = fs.readFileSync(filePath);
  const sha256Hex = crypto.createHash('sha256').update(fileData).digest('hex');
  const sha256Base64 = crypto.createHash('sha256').update(fileData).digest('base64');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileData.length),
        'x-amz-checksum-sha256': sha256Base64,
        'Content-SHA256': sha256Hex,
      },
      body: fileData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        // ignore
      }
      throw new Error(`S3 upload HTTP failed with status ${res.status} (${res.statusText}): ${bodyText.slice(0, 200)}`);
    }

    return {
      enabled: true,
      status: 'SUCCESS',
      bucket,
      targetUrl,
      sha256: sha256Hex,
      bytesUploaded: fileData.length,
      replicatedAt: new Date().toISOString(),
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    const message = isTimeout ? `Upload timed out after ${timeoutMs}ms` : err.message;
    throw new Error(`Cloud upload failure: ${message}`);
  }
}

/**
 * Restore a SQLite backup file (encrypted or unencrypted) to a target path and verify integrity.
 * Refuses to overwrite an existing target unless overwrite=true.
 */
export async function restoreDatabaseBackup({
  backupFilePath,
  targetDbPath,
  overwrite = false,
  encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || null,
} = {}) {
  if (!backupFilePath || !targetDbPath) {
    throw new Error('Both backupFilePath and targetDbPath are required.');
  }
  const resolvedBackup = path.resolve(backupFilePath);
  const resolvedTarget = path.resolve(targetDbPath);

  if (!fs.existsSync(resolvedBackup)) {
    throw new Error(`Backup file not found: ${resolvedBackup}`);
  }
  if (fs.existsSync(resolvedTarget) && !overwrite) {
    throw new Error(`Target database already exists (${resolvedTarget}). Pass overwrite=true / --force to replace.`);
  }

  fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });

  const encrypted = isEncryptedBackupFile(resolvedBackup);
  let sqliteSourcePath = resolvedBackup;
  let tempDecryptedPath = null;

  try {
    if (encrypted) {
      if (!encryptionKey) {
        throw new Error('Backup is encrypted with AES-256-GCM. An encryption key is required for restoration.');
      }
      const rawEncrypted = fs.readFileSync(resolvedBackup);
      const decryptedBuffer = decryptBackupBuffer(rawEncrypted, encryptionKey);
      tempDecryptedPath = path.join(os.tmpdir(), `gricc-restore-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`);
      fs.writeFileSync(tempDecryptedPath, decryptedBuffer);
      sqliteSourcePath = tempDecryptedPath;
    }

    const backupDb = new Database(sqliteSourcePath, { readonly: true });
    try {
      const integrity = backupDb.pragma('integrity_check', { simple: true });
      if (integrity !== 'ok') {
        throw new Error(`Backup file failed integrity_check: ${integrity}`);
      }
      await backupDb.backup(resolvedTarget);
    } finally {
      backupDb.close();
    }
  } finally {
    if (tempDecryptedPath && fs.existsSync(tempDecryptedPath)) {
      try {
        fs.unlinkSync(tempDecryptedPath);
      } catch {
        // Non-fatal
      }
    }
  }

  const restoredDb = new Database(resolvedTarget);
  try {
    restoredDb.pragma('journal_mode = WAL');
    restoredDb.pragma('foreign_keys = ON');
    const integrity = restoredDb.pragma('integrity_check', { simple: true });
    const hasTable = (t) => Boolean(restoredDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(t));
    const users = hasTable('users') ? restoredDb.prepare('SELECT COUNT(*) AS c FROM users').get().c : 0;
    const incidents = hasTable('incidents') ? restoredDb.prepare('SELECT COUNT(*) AS c FROM incidents').get().c : 0;
    const auditLogs = hasTable('audit_logs') ? restoredDb.prepare('SELECT COUNT(*) AS c FROM audit_logs').get().c : 0;
    return {
      restoredPath: resolvedTarget,
      integrity,
      wasEncrypted: encrypted,
      counts: { users, incidents, auditLogs },
    };
  } finally {
    restoredDb.close();
  }
}

// CLI execution
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const args = process.argv.slice(2);
  const restoreIdx = args.indexOf('--restore');
  if (restoreIdx !== -1) {
    const backupFilePath = args[restoreIdx + 1];
    const targetIdx = args.indexOf('--target');
    const targetDbPath = targetIdx !== -1 ? args[targetIdx + 1] : process.env.DB_PATH || './server/data/gricc.db';
    const keyIdx = args.indexOf('--key');
    const encryptionKey = keyIdx !== -1 ? args[keyIdx + 1] : process.env.BACKUP_ENCRYPTION_KEY || null;
    const overwrite = args.includes('--force');
    restoreDatabaseBackup({ backupFilePath, targetDbPath, overwrite, encryptionKey })
      .then((res) => {
        console.log('[BACKUP RESTORE SUCCESS]', JSON.stringify(res));
        process.exit(0);
      })
      .catch((err) => {
        console.error('[BACKUP RESTORE FAILED]', err.message);
        process.exit(1);
      });
  } else {
    const keyIdx = args.indexOf('--key');
    const encryptionKey = keyIdx !== -1 ? args[keyIdx + 1] : process.env.BACKUP_ENCRYPTION_KEY || null;
    createDatabaseBackup({ encryptionKey })
      .then((res) => {
        console.log('[DATABASE BACKUP SUCCESS]', JSON.stringify(res));
        process.exit(0);
      })
      .catch((err) => {
        console.error('[DATABASE BACKUP FAILED]', err.message);
        process.exit(1);
      });
  }
}
