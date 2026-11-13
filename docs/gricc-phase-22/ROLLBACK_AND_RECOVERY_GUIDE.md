# GRICC 2.0 — Phase 22: Rollback & Recovery Guide

**Document:** `ROLLBACK_AND_RECOVERY_GUIDE.md`  
**Phase:** 22 — Core System Stabilization, Security Hardening & Mobile Responsive Engineering  
**Date:** November 13, 2026  

---

## 1. Executive Summary

This guide outlines step-by-step procedures to revert Phase 22 code modifications, restore databases from automated backups, and recover operations without data loss or service disruption.

---

## 2. Emergency Database Recovery

All database changes in Phase 22 are safeguarded by point-in-time backups located in `server/backups/`.

### To Restore from a Point-in-Time Backup:
```bash
# 1. Stop the backend server
# If running with PM2:
pm2 stop gricc-api

# 2. Identify the desired backup file
ls -la server/backups/

# 3. Restore using the built-in restore tool
node server/scripts/backup-database.js --restore server/backups/gricc-backup-2026-11-13T05-21-17-810Z.db --force

# 4. Verify database integrity
node -e "const db = require('better-sqlite3')('server/data/gricc.db'); console.log('Integrity:', db.pragma('integrity_check'));"

# 5. Restart the backend server
pm2 start gricc-api
```

---

## 3. Code Rollback Procedure

If any Phase 22 feature needs to be rolled back:

1. **Cookie-Based Authentication Rollback:**
   - In `server/index.js`, comment out `app.use(cookieParser())`.
   - In `server/middleware/authMiddleware.js`, token resolution will fall back exclusively to `Authorization: Bearer <token>`.
   - Web clients will continue using standard Bearer tokens via localStorage.

2. **Zod Validation Rollback:**
   - In `server/routes/api.js`, remove `validateBody(...)` from the route middleware pipeline. Route controllers will revert to procedural checks.

3. **Frontend Error Boundaries Rollback:**
   - In `src/App.jsx`, remove `<ErrorBoundary>` wrapper tags around component views.

---

## 4. Verification Check After Recovery

Following any rollback or recovery action, execute the complete test suite to confirm operational readiness:

```bash
# 1. Run unit test suite
npm test

# 2. Run production readiness integration checks
npm run test:readiness

# 3. Verify frontend bundle
npm run build
```

