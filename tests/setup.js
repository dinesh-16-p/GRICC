import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// Create an isolated temporary test directory for Vitest runs
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gricc-vitest-isolated-'));
const tempDbPath = path.join(tempDir, 'gricc-isolated-test.db');
const sourceDbPath = path.resolve('./server/data/gricc.db');

// Copy authoritative database snapshot to temporary file to preserve baseline schema/data
if (fs.existsSync(sourceDbPath)) {
  fs.copyFileSync(sourceDbPath, tempDbPath);
  // Also copy -shm / -wal if they exist
  if (fs.existsSync(`${sourceDbPath}-shm`)) {
    fs.copyFileSync(`${sourceDbPath}-shm`, `${tempDbPath}-shm`);
  }
  if (fs.existsSync(`${sourceDbPath}-wal`)) {
    fs.copyFileSync(`${sourceDbPath}-wal`, `${tempDbPath}-wal`);
  }
}

// Point DB_PATH to isolated temporary test database BEFORE any modules import database.js
process.env.DB_PATH = tempDbPath;

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
