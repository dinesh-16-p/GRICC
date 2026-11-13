# GRICC 2.0 — Phase 22.1: Cloud Backup Hardening & Presigned S3 Verification

**Document:** `CLOUD_BACKUP_VERIFICATION.md`  
**Phase:** 22.1 — Data Integrity, Backup Security & Version Control Hardening  
**Date:** November 13, 2026  
**Status:** CODE HARDENED / PENDING PRODUCTION INFRASTRUCTURE CONFIGURATION  

---

## 1. Overview & Verification Scope

Task 3 of Phase 22.1 evaluates and hardens the offsite cloud replication mechanism implemented in `server/scripts/backup-database.js`.

The project provides an S3-compatible presigned PUT upload facility (`replicateBackupToCloud`). In accordance with strict development rules:
> *"Do not claim cloud backup is operational unless an actual configured upload and restore test succeeds. Do not invent credentials or upload URLs."*

This document outlines the security controls implemented, the exact verification procedure, and the transparent operational status of offsite cloud backups.

---

## 2. Hardened Architecture & Security Enhancements

The replication function `replicateBackupToCloud(filePath, uploadUrl, options)` was significantly hardened against network hangs, URL injection, and payload corruption:

### 2.1 URL Validation & Protocol Restriction
Before issuing an HTTP request, the URL is parsed with the WHATWG `URL` constructor to enforce HTTPS/HTTP protocol and prevent protocol-relative or file scheme SSRF risks:
```javascript
let parsedUrl;
try {
  parsedUrl = new URL(uploadUrl);
} catch (urlErr) {
  throw new Error(`Invalid cloud backup URL: ${urlErr.message}`);
}
if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
  throw new Error(`Cloud backup URL must use http or https protocol (got ${parsedUrl.protocol})`);
}
```

### 2.2 Network Timeout Handling via AbortSignal
Network requests to presigned URLs now enforce a configurable timeout (default: 30,000ms) using `AbortController`. If a remote object store or proxy hangs indefinitely, the request cleanly aborts with `Cloud backup upload timed out after ${timeoutMs}ms`.

### 2.3 SHA-256 Checksum Verification Headers
To guarantee end-to-end transport integrity and allow AWS S3, Cloudflare R2, or MinIO to reject corrupted uploads, the backup buffer's SHA-256 digest is calculated and transmitted in standard compliance headers:
- `x-amz-checksum-sha256`: Base64-encoded SHA-256 hash.
- `Content-SHA256`: Hexadecimal SHA-256 hash.

```javascript
const sha256Hex = crypto.createHash('sha256').update(fileBuffer).digest('hex');
const sha256Base64 = crypto.createHash('sha256').update(fileBuffer).digest('base64');
```

### 2.4 Granular HTTP Failure & Error Logging
The uploader inspects HTTP response statuses. Any non-2xx status code (`200 OK`, `201 Created`, `204 No Content`) generates a detailed error log with HTTP status, status text, and response body preview, avoiding silent replication failures.

---

## 3. Operational Status & Configuration Checklist

### 3.1 Current Status: **READY FOR DEPLOYMENT (Awaiting S3 / R2 Bucket)**
- **Code Status:** Verified, hardened, and unit-tested for error handling, timeout handling, and URL parsing.
- **Environment Status:** No production cloud bucket (`BACKUP_S3_PRESIGNED_URL`) is configured in the local workspace.
- **Verification Statement:** In accordance with Phase 22.1 rules, cloud backup is **NOT** marked operational in production until valid S3/R2 presigned credentials and a successful remote roundtrip are executed in the staging/production environment.

### 3.2 Configuration Guide for DevOps / Production Setup

To enable offsite replication in production:

1. **Generate a Presigned S3 PUT URL:**
   Using AWS CLI or SDK:
   ```bash
   aws s3 presign s3://gricc-backups-secure/$(date +%Y-%m-%d)/gricc-backup.db.enc --expires-in 3600
   ```
2. **Export Environment Variable:**
   ```bash
   export BACKUP_S3_PRESIGNED_URL="https://gricc-backups-secure.s3.amazonaws.com/2026-11-13/gricc-backup.db.enc?X-Amz-Algorithm=..."
   export BACKUP_ENCRYPTION_KEY="Production-Grade-AES-Key..."
   ```
3. **Execute Automated Cron / CI Pipeline:**
   ```bash
   node server/scripts/backup-database.js --backup --upload
   ```
4. **Restoration Verification Test:**
   ```bash
   # Download from bucket
   curl -O "https://gricc-backups-secure.s3.amazonaws.com/..."
   # Decrypt and restore to staging
   node server/scripts/backup-database.js --restore="gricc-backup.db.enc" --key="$BACKUP_ENCRYPTION_KEY"
   ```

