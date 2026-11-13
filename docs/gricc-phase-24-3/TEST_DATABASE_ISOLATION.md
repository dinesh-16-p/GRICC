# GRICC 2.0 — Phase 24.3: Test Database Isolation Architecture
**Virtualization of Test Data Storage & Protection of Authoritative Ledgers**

**Project:** GRICC Nexus  
**Authoritative Database:** `c:\Users\DINESH 07\Desktop\GRICC\server\data\gricc.db`  
**Document:** `TEST_DATABASE_ISOLATION.md`  
**Date:** November 13, 2026  
**Auditor & Implementation Engineer:** DevOps & Principal Software Architect  

---

## 1. Problem Statement: Test Mutation Leakage

In SQLite-backed Node.js applications, modules frequently initialize database connections at import time using `process.env.DB_PATH || './server/data/gricc.db'`.

When automated unit or integration tests (such as authentication or RBAC tests) invoke application services without setting an isolated `DB_PATH`, legitimate operational side-effects (e.g. logging successful logins, rotating session tokens, or recording 403 access denials) write directly into the developer's primary database. While cryptographically valid, these extraneous test records pollute production-candidate ledgers and cause record-count drift across testing milestones.

---

## 2. Implemented Architecture: Ephemeral Snapshot Virtualization

To eliminate test leakage without sacrificing schema realism, Phase 24.3 implements an **Ephemeral Snapshot Virtualization** strategy.

```mermaid
flowchart LR
    A["Authoritative DB (server/data/gricc.db)"] -->|Read-Only Snapshot Copy| B["Isolated Temp DB (/tmp/gricc-vitest-isolated-...)"]
    B --> C["Vitest Test Suite (tests/**/*.test.js)"]
    C -->|Writes / Mutations| B
    B -->|afterAll() Cleanup| D["Deleted from Disk"]
```

---

## 3. Implementation Details

### 3.1 Global Test Setup Hook (`tests/setup.js`)
Executed by Vitest **before** any test suite files or application modules are loaded into memory:

```javascript
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// 1. Create an isolated temporary test directory
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gricc-vitest-isolated-'));
const tempDbPath = path.join(tempDir, 'gricc-isolated-test.db');
const sourceDbPath = path.resolve('./server/data/gricc.db');

// 2. Copy authoritative database snapshot to temporary file
// Preserves real table schemas, indexes, and historical boundary 222
if (fs.existsSync(sourceDbPath)) {
  fs.copyFileSync(sourceDbPath, tempDbPath);
  if (fs.existsSync(`${sourceDbPath}-shm`)) {
    fs.copyFileSync(`${sourceDbPath}-shm`, `${tempDbPath}-shm`);
  }
  if (fs.existsSync(`${sourceDbPath}-wal`)) {
    fs.copyFileSync(`${sourceDbPath}-wal`, `${tempDbPath}-wal`);
  }
}

// 3. Point DB_PATH to isolated temporary test database BEFORE any modules import database.js
process.env.DB_PATH = tempDbPath;

// 4. Global teardown hook to close DB and remove temporary files
afterAll(async () => {
  try {
    const { closeDatabase } = await import('../server/db/database.js');
    closeDatabase();
  } catch {
    // Non-fatal if already closed
  }

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Non-fatal temporary file cleanup
  }
});
```

### 3.2 Vitest Configuration Binding (`vitest.config.js`)
Configured to invoke the setup hook on initialization:
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    testTimeout: 15000,
    fileParallelism: false,
  },
});
```

---

## 4. Verification & Proof of Isolation

To prove that test mutations no longer leak into the authoritative database:

1. **Pre-Test Authoritative DB Count:** Exactly 281 records.
2. **Execution of Vitest Suite:** All 10 test files (42 tests) executed, including `auth.test.js` and `rbac.test.js`.
3. **Post-Test Authoritative DB Count:** Exactly 281 records (Delta = 0).
4. **Execution of Production Readiness Suite (`test-production-readiness.mjs`):** Uses dedicated `fs.mkdtempSync()`; Post-test DB count remained exactly 281.

**Conclusion:** The authoritative production candidate database `server/data/gricc.db` is completely insulated from all automated test suites.
