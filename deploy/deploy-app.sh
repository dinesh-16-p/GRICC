#!/usr/bin/env bash
# ==============================================================================
# GRICC 2.0 — Production Application Deployment Script
# Executes as 'gricc' user in /var/www/gricc
# ==============================================================================

set -euo pipefail

APP_DIR="/var/www/gricc"
cd "$APP_DIR"

echo "=================================================="
echo "  Deploying GRICC 2.0 Production Release"
echo "  Target: griccnexus.com"
echo "=================================================="

# 1. Install dependencies & build frontend bundle
echo "[1/6] Installing dependencies and building production bundle..."
npm ci
npm run build

# 2. Run automated production readiness self-test (verify build before pruning)
echo "[2/6] Running production readiness self-test..."
npm run test:readiness

# 3. Prune development dependencies for minimal production attack surface
echo "[3/6] Pruning development dependencies..."
npm prune --omit=dev

# 4. Verify SQLite Database Permissions, Backups & Log Directories
echo "[4/6] Verifying SQLite database, backup, and log directories..."
mkdir -p "$APP_DIR/server/data"
mkdir -p "$APP_DIR/server/backups"
mkdir -p "$APP_DIR/logs"
chmod 700 "$APP_DIR/server/data"
chmod 700 "$APP_DIR/server/backups"
chmod 700 "$APP_DIR/logs"

# 5. Start / Reload PM2 in Single-Instance Fork Mode
echo "[5/6] Supervising Express backend with PM2..."
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

# 6. Test and Reload Nginx
echo "[6/6] Reloading Nginx..."
sudo nginx -t
sudo systemctl reload nginx

echo "=================================================="
echo "  GRICC 2.0 Deployment Successfully Completed!"
echo "  Public URL: https://griccnexus.com"
echo "=================================================="

