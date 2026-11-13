# GRICC – Production Security Checklist (`PRODUCTION_SECURITY_CHECKLIST.md`)

| Control | Status | Verification / Notes |
| --- | --- | --- |
| **No hardcoded production secrets** | PASS | `validateProductionConfig()` & `getJwtSecret()` fail fast in `NODE_ENV=production` if `JWT_SECRET` is missing, `<32` chars, or placeholder |
| **No demo user seeding in production** | PASS | `seedInitialUsersIfEmpty()` returns immediately when `NODE_ENV=production`; use `npm run bootstrap:admin` |
| **Public registration disabled** | PASS | No `/api/auth/register` endpoint exists; only `ADMIN` can create users via `POST /api/users` |
| **RBAC enforced server-side** | PASS | `authenticateToken` + `requireRole(...)` enforced on all protected routes; `ADMIN`/`ANALYST`/`VIEWER` verified |
| **Password policy & bcrypt hashing** | PASS | Bcrypt hashing (cost 10–12), strong password validation on user creation & admin bootstrap |
| **Account lockout & Admin unlock** | PASS | Brute-force lockout (`423 AccountLocked`) + `POST /api/security/users/:id/unlock` |
| **JWT expiration & revocation** | PASS | `revoked_tokens` table checked on every request; `POST /api/auth/logout` revokes token |
| **CORS allowlist** | PASS | `NODE_ENV=production` rejects `localhost`/`127.0.0.1` origins unless `ALLOW_LOCALHOST_CORS=true` |
| **Helmet security headers & no-store API** | PASS | `helmet()` enabled; `Cache-Control: no-store` set on `/api/*` responses |
| **Rate limiting & Trust Proxy** | PASS | `express-rate-limit` on `/api`, `/api/auth/login`, `/api/ai/*`, `/api/monitoring/evaluate`; `trust proxy` enabled in prod |
| **No stack traces or DB paths in errors** | PASS | `NODE_ENV=production` masks 5xx error messages; `/api/health` returns `CONNECTED` without file paths |
| **SQLite outside web root** | PASS | `validateProductionConfig()` blocks `DB_PATH` inside `dist/` or `src/` |
| **Audit hash-chain integrity** | PASS | SHA-256 chain normalized for `recordId`/`userId` types; `GET /api/security/audit-integrity` verifies chain |
| **AI prompt injection & key isolation** | PASS | `aiIntelligenceService` blocks instruction-override probes (`400`); `AI_API_KEY` never sent to frontend |
| **JWT storage (`localStorage` vs HttpOnly cookie)** | DOCUMENTED | Currently uses `localStorage` (`gricc_auth_token`) + `Authorization: Bearer` header (and `?token=`/`Authorization` for SSE). Mitigated by strict CSP/XSS sanitization and short JWT TTL (`8h`). Future migration to `HttpOnly; Secure; SameSite=Strict` cookies is recommended if third-party scripts are ever added, with an SSE cookie-auth compatibility plan. |
| **Development DB isolation** | PASS | `server/data/gricc.db` contains dev/test records and must **not** be copied to production; initialize a fresh DB on the production server |

