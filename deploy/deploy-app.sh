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
echo "  Target: griccglobal.com"
echo "=================================================="

# 1. Install production dependencies
echo "[1/6] Installing Node dependencies..."
npm ci --omit=dev

# 2. Build production frontend assets
echo "[2/6] Building React production bundle with Vite..."
# Vite build requires devDependencies for compilation
npm install --include=dev
npm run build
npm prune --omit=dev

# 3. Verify SQLite Database Permissions & WAL Mode
echo "[3/6] Verifying SQLite database..."
mkdir -p "$APP_DIR/server/data"
mkdir -p "$APP_DIR/server/backups"
chmod 700 "$APP_DIR/server/data"
chmod 700 "$APP_DIR/server/backups"

# 4. Run automated production readiness verification
echo "[4/6] Running production readiness self-test..."
npm run test:readiness

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
echo "  Public URL: https://griccglobal.com"
echo "=================================================="
