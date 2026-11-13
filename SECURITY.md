# GRICC Security & Compliance Architecture

> **Note:** This document describes the security controls implemented in GRICC and recommended production deployment practices. Implementation of these controls does **not** constitute formal regulatory certification (e.g., ISO 27001, SOC 2, FedRAMP) without an independent formal assessment.

## 1. Authentication Architecture
- **Password Hashing**: Passwords are hashed using `bcryptjs` (cost factor `10`) in `server/services/authService.js`. Plaintext passwords are never persisted or logged.
- **Password Policy**: Configurable via `security_settings` (`min_password_length >= 8`, uppercase, lowercase, numeric digit, and special character requirements) enforced server-side during user creation and password updates.
- **Brute-Force & Account Lockout**: `POST /api/auth/login` is protected by `express-rate-limit` (`loginLimiter`) and database-backed failed-attempt tracking (`users.failed_login_attempts`, `users.locked_until`). Repeated failures trigger temporary lockout (`423 Locked`), `ACCOUNT_LOCKED` security events, and administrator notifications. Unknown usernames return generic `401 Invalid credentials.` responses to prevent username enumeration.

## 2. Role-Based Access Control (RBAC) & Record Ownership
- **Roles**: `ADMIN`, `ANALYST`, `VIEWER` enforced server-side via `authenticateToken` and `requireRole(...)` in `server/middleware/authMiddleware.js`.
- **Ownership & Membership**:
  - Private discussions (`visibility = 'PRIVATE'`) restrict read/comment/share access to `ADMIN`, creator, assignee, and explicit `discussion_members`.
  - Comment edit/delete operations are restricted to the comment author or `ADMIN`.
  - Draft AI reports and user-specific conversations enforce creator/ADMIN ownership checks.
  - `/api/users`, `/api/audit-logs`, and `/api/security/*` are strictly `ADMIN`-only; unauthorized attempts generate `PRIVILEGE_ESCALATION_ATTEMPT` security events.

## 3. Session & Token Management
- **JWT + Revocation Denylist**: Sessions use signed JWTs with a unique `jti` tracked in `revoked_tokens`. Logout (`POST /api/auth/logout`) marks `revoked = 1`, immediately invalidating the token on subsequent requests (`TOKEN_REVOKED`). Expired rows are pruned on startup via `securityService.cleanupExpiredTokens()`.
- **Known Limitation (Client Storage)**: The SPA stores the JWT in `localStorage` (`gricc_auth_token`) for compatibility with existing `fetchWithRetry` and `EventSource` query-token SSE connections. Migrating to `HttpOnly; Secure; SameSite=Strict` cookies with CSRF tokens is recommended for hardened production deployments.

## 4. API Security Hardening
- **Headers & CORS**: `helmet` sets security HTTP headers; `cors` restricts origins to configured `FRONTEND_URL` and local development origins.
- **Request & Rate Limits**: JSON/URL-encoded bodies are capped at `512kb`. Global `/api` rate limiting (`apiLimiter`) plus stricter rate limits on login, AI, monitoring evaluation, and collaboration writes mitigate abuse.
- **SQL & XSS Safety**: All SQLite queries use parameterized statements (`better-sqlite3`). User-generated comments, discussion titles, and notes pass through `sanitizeText()` stripping `<script>`, `<style>`, HTML tags, and `javascript:` URIs. Production `500` responses omit internal error details.

## 5. Audit Log Integrity (SHA-256 Hash Chaining)
- Every new entry in `audit_logs` records `prev_hash` and `entry_hash` (`SHA-256` over canonical JSON of actor, action, resource, details, IP, status, and timestamp).
- `securityService.verifyAuditLogIntegrity()` recomputes the chain from `id ASC` to detect modified or deleted entries.
- **Limitation**: Hash chaining in the same SQLite database detects accidental corruption or naive row edits, but is **not** tamper-proof if an attacker gains direct filesystem/root access to rewrite both `audit_logs` rows and their hash chain together. External WORM/SIEM log forwarding is recommended for production.

## 6. Secret Management & Database Protection
- Configure a strong `JWT_SECRET` (at least 16–64 random characters) in `.env`. Without it, `authService.js` falls back to an ephemeral per-process secret (invalidating sessions on restart).
- Never commit `.env` or `server/data/gricc.db` to version control. Restrict OS file permissions on `server/data/` to the service account only and store encrypted off-host backups.

