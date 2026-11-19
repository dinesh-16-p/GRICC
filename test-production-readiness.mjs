import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gricc-prod-ready-'));
const tempDbPath = path.join(tempDir, 'gricc-prod-test.db');
const tempBackupDir = path.join(tempDir, 'backups');
const tempRestorePath = path.join(tempDir, 'gricc-restored.db');

const TEST_JWT_SECRET = 'prod-readiness-test-secret-64-chars-0123456789abcdef0123456789abcdef';
const TEST_ADMIN_PASS = 'ProdReadiness!2026';

// Set production env BEFORE importing server modules
process.env.NODE_ENV = 'production';
process.env.DB_PATH = tempDbPath;
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.CORS_ORIGIN = 'https://gricc.example.com';
process.env.FRONTEND_URL = 'https://gricc.example.com';
process.env.AI_PROVIDER = 'gricc-deterministic';
process.env.AI_API_KEY = '';

const { initializeDatabase, getDb, closeDatabase } = await import('./server/db/database.js');
const { default: app, validateProductionConfig } = await import('./server/index.js');
const { default: authService } = await import('./server/services/authService.js');
const { createDatabaseBackup, restoreDatabaseBackup } = await import('./server/scripts/backup-database.js');

let server;
let baseUrl;

async function req(method, urlPath, { token, body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const ct = res.headers.get('content-type') || '';
  let data;
  if (ct.includes('application/json')) data = await res.json();
  else if (ct.includes('application/pdf')) data = Buffer.from(await res.arrayBuffer());
  else data = await res.text();
  return { status: res.status, data, headers: res.headers };
}

try {
  // 1. Production config validation (negative & positive checks)
  const savedJwt = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'replace-with-a-strong-64-char-random-secret';
  assert.throws(() => validateProductionConfig(), /JWT_SECRET/);
  process.env.JWT_SECRET = savedJwt;

  const savedCors = process.env.CORS_ORIGIN;
  process.env.CORS_ORIGIN = 'http://localhost:3000';
  assert.throws(() => validateProductionConfig(), /localhost/);
  process.env.CORS_ORIGIN = savedCors;
  validateProductionConfig();

  // 2. Frontend production build verification
  const distIndex = path.resolve('./dist/index.html');
  const distAssetsDir = path.resolve('./dist/assets');
  assert.ok(fs.existsSync(distIndex), 'dist/index.html must exist (run npm run build)');
  const assetFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
  assert.ok(assetFiles.length > 0, 'dist/assets must contain built JS chunks');

  // 3. Backend startup & DB initialization (production must NOT auto-seed demo users)
  initializeDatabase();
  const db = getDb();
  const seededUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  assert.equal(seededUsers, 0, 'NODE_ENV=production must NOT auto-seed default demo users');

  // Create initial ADMIN & VIEWER for tests
  const sysActor = { id: 'BOOTSTRAP', username: 'bootstrap', role: 'ADMIN' };
  authService.createUser({
    username: 'prod_admin',
    fullName: 'Prod Admin',
    email: 'prod.admin@example.com',
    password: TEST_ADMIN_PASS,
    role: 'ADMIN',
  }, sysActor);
  authService.createUser({
    username: 'prod_viewer',
    fullName: 'Prod Viewer',
    email: 'prod.viewer@example.com',
    password: TEST_ADMIN_PASS,
    role: 'VIEWER',
  }, sysActor);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // 4. Database connectivity & public health check (no internal DB path)
  const health = await req('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.database, 'CONNECTED');
  assert.equal(JSON.stringify(health.data).includes(tempDbPath), false);

  // 5. Authentication
  const adminLogin = await req('POST', '/api/auth/login', { body: { identifier: 'prod_admin', password: TEST_ADMIN_PASS } });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.data.token;

  const viewerLogin = await req('POST', '/api/auth/login', { body: { identifier: 'prod_viewer', password: TEST_ADMIN_PASS } });
  assert.equal(viewerLogin.status, 200);
  const viewerToken = viewerLogin.data.token;

  // 6. RBAC & Production Authentication Enforcement
  const unauthReq = await req('GET', '/api/users');
  assert.equal(unauthReq.status, 401, 'Unauthenticated request must receive 401 in production');
  assert.equal(unauthReq.data.code, 'TOKEN_MISSING');

  const invalidTokenReq = await req('GET', '/api/users', { token: 'invalid.jwt.token' });
  assert.equal(invalidTokenReq.status, 401, 'Invalid token must receive 401 in production');
  assert.equal(invalidTokenReq.data.code, 'TOKEN_INVALID');

  assert.equal((await req('GET', '/api/users', { token: viewerToken })).status, 403);
  assert.equal((await req('GET', '/api/performance/overview', { token: viewerToken })).status, 403);
  assert.equal((await req('GET', '/api/users', { token: adminToken })).status, 200);
  assert.equal((await req('GET', '/api/performance/overview', { token: adminToken })).status, 200);

  // 7. API connectivity
  assert.equal((await req('GET', '/api/countries', { token: viewerToken })).status, 200);
  assert.equal((await req('GET', '/api/incidents', { token: viewerToken })).status, 200);
  assert.equal((await req('GET', '/api/ai/status', { token: viewerToken })).status, 200);

  // 8. CORS
  const allowedCors = await req('GET', '/api/health', { headers: { Origin: 'https://gricc.example.com' } });
  assert.equal(allowedCors.headers.get('access-control-allow-origin'), 'https://gricc.example.com');
  const blockedCors = await req('GET', '/api/health', { headers: { Origin: 'https://evil.example.com' } });
  assert.equal(blockedCors.status, 500);

  // 9. Security headers
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(health.headers.get('x-frame-options'));
  assert.equal(health.headers.get('cache-control'), 'no-store');

  // 10. Rate limiting headers
  assert.ok(health.headers.get('ratelimit-limit') || health.headers.get('x-ratelimit-limit'));

  // 11. Error handling (no stack trace in production)
  const notFound = await req('GET', '/api/incidents/NONEXISTENT-999', { token: viewerToken });
  assert.equal(notFound.status, 404);
  assert.equal(Boolean(notFound.data.stack), false);

  // 12. SSE compatibility & production authentication enforcement
  const unauthSseRes = await fetch(`${baseUrl}/api/events/stream`);
  assert.equal(unauthSseRes.status, 401, 'Unauthenticated SSE request must receive 401 in production');
  const unauthSseData = await unauthSseRes.json();
  assert.equal(unauthSseData.code, 'TOKEN_MISSING');

  const invalidSseRes = await fetch(`${baseUrl}/api/events/stream?token=invalid.jwt.token`);
  assert.equal(invalidSseRes.status, 401, 'Invalid SSE token must receive 401 in production');
  const invalidSseData = await invalidSseRes.json();
  assert.equal(invalidSseData.code, 'TOKEN_INVALID');

  const sseController = new AbortController();
  const sseRes = await fetch(`${baseUrl}/api/events/stream?token=${encodeURIComponent(adminToken)}`, { signal: sseController.signal });
  assert.equal(sseRes.status, 200);
  assert.ok((sseRes.headers.get('content-type') || '').includes('text/event-stream'));
  sseController.abort();

  // 13. PDF report download
  const aiRepGen = await req('POST', '/api/ai/generate-report', {
    token: adminToken,
    body: { title: 'Prod Readiness Brief', country: 'Ukraine', reportType: 'COUNTRY_INTELLIGENCE' },
  });
  assert.ok([200, 201].includes(aiRepGen.status));
  const aiRepId = aiRepGen.data.report?.id || aiRepGen.data.id;
  const approveRes = await req('PATCH', `/api/ai/reports/${aiRepId}/approve`, { token: adminToken, body: { status: 'APPROVED' } });
  assert.equal(approveRes.status, 200);
  const linkedId = approveRes.data.report?.linkedReportId;
  const pdfRes = await req('GET', `/api/reports/${linkedId}/download?format=pdf`, { token: adminToken });
  assert.equal(pdfRes.status, 200);
  assert.ok(Buffer.isBuffer(pdfRes.data) && pdfRes.data.subarray(0, 4).toString() === '%PDF');

  // 14 & 15. Database backup & restore into separate temp DB
  const backupResult = await createDatabaseBackup({ sourceDbPath: tempDbPath, backupDir: tempBackupDir, retentionCount: 5 });
  assert.equal(backupResult.integrityCheck, 'ok');
  const restoreResult = await restoreDatabaseBackup({ backupFilePath: backupResult.backupFilePath, targetDbPath: tempRestorePath });
  assert.equal(restoreResult.integrity, 'ok');
  assert.equal(restoreResult.counts.users, 2);

  // 16. Audit integrity
  const auditRes = await req('GET', '/api/security/audit-integrity', { token: adminToken });
  assert.equal(auditRes.status, 200);
  assert.equal(auditRes.data.integrity.valid, true);

  // 17. Environment secret exposure check
  const perfRes = await req('GET', '/api/performance/overview', { token: adminToken });
  const combinedResponses = JSON.stringify({ health: health.data, perf: perfRes.data });
  assert.equal(combinedResponses.includes(TEST_JWT_SECRET), false);
  assert.equal(combinedResponses.includes(TEST_ADMIN_PASS), false);

  // 18. Frontend bundle inspection (no localhost:5000, no secrets)
  for (const f of assetFiles) {
    const content = fs.readFileSync(path.join(distAssetsDir, f), 'utf8');
    assert.equal(content.includes('localhost:5000'), false, `Bundle ${f} must not contain localhost:5000`);
    assert.equal(content.includes('GriccAdmin!2026'), false, `Bundle ${f} must not contain dev seed password`);
    assert.equal(content.includes('AI_API_KEY'), false, `Bundle ${f} must not reference AI_API_KEY`);
  }

  console.log(JSON.stringify({
    status: 'ALL_18_PRODUCTION_READINESS_CHECKS_PASSED',
    distAssetsChecked: assetFiles.length,
    backupSizeBytes: backupResult.sizeBytes,
    restoredUsers: restoreResult.counts.users,
    auditIntegrityValid: auditRes.data.integrity.valid,
    auditCheckedCount: auditRes.data.integrity.totalChecked,
  }, null, 2));
} finally {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
process.exit(0);
