# GRICC – Production Deployment Guide (`DEPLOYMENT.md`)

## 1. Server Prerequisites
- Ubuntu 22.04/24.04 LTS (or equivalent Linux VPS)
- Node.js `>= 20 LTS` and `npm`
- Nginx + Certbot (`certbot python3-certbot-nginx`)
- PM2 (`npm install -g pm2`)
- Persistent storage directories outside the web root:
  - Database: `/var/lib/gricc` (`chmod 750`)
  - Backups: `/var/backups/gricc` (`chmod 750`)

## 2. Installation & Configuration
```bash
git clone <YOUR_REPO_URL> /var/www/gricc
cd /var/www/gricc
npm ci
cp .env.example .env
chmod 600 .env
```
Edit `.env` with production values (see `ENVIRONMENT.md`):
- `NODE_ENV=production`
- `PORT=5000`
- `FRONTEND_URL=https://<YOUR_DOMAIN>`
- `CORS_ORIGIN=https://<YOUR_DOMAIN>`
- `TRUST_PROXY=true`
- `DB_PATH=/var/lib/gricc/gricc.db`
- `BACKUP_DIR=/var/backups/gricc`
- `JWT_SECRET=<64-char-random-hex>`

## 3. Initial Production Admin Bootstrap
In `NODE_ENV=production`, GRICC does **not** seed default demo accounts (`admin`, `analyst`, `viewer`, `operator`). Create the initial `ADMIN` account securely via CLI:
```bash
BOOTSTRAP_ADMIN_EMAIL=admin@<YOUR_DOMAIN> \
BOOTSTRAP_ADMIN_USERNAME=admin \
BOOTSTRAP_ADMIN_PASSWORD='<STRONG_12+_CHAR_PASSWORD>' \
npm run bootstrap:admin
```
Unset `BOOTSTRAP_ADMIN_PASSWORD` from shell history after creation.

## 4. Build Frontend & Start Backend (Single Instance)
```bash
npm run build
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```
> **Important:** Keep `instances: 1` (`fork` mode) in `ecosystem.config.cjs`. `cacheService` and SSE clients are in-memory single-process registries.

## 5. Reverse Proxy & HTTPS (Nginx + Certbot)
```bash
sudo cp deploy/nginx.gricc.conf /etc/nginx/sites-available/gricc
# Replace <YOUR_DOMAIN> in /etc/nginx/sites-available/gricc
sudo ln -s /etc/nginx/sites-available/gricc /etc/nginx/sites-enabled/gricc
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <YOUR_DOMAIN>
```

## 6. Automated Backups & Log Rotation
```bash
pm2 install pm2-logrotate
# Add daily cron for SQLite online backup (see BACKUP_RECOVERY.md)
```

## 7. Health Checks
- Public health probe: `curl -fsS https://<YOUR_DOMAIN>/api/health`
- Admin performance telemetry: `GET /api/performance/overview` (ADMIN JWT required)

## 8. Update & Rollback Procedures
**Update:**
```bash
cd /var/www/gricc
npm run backup:db
git pull origin main
npm ci
npm run build
pm2 reload ecosystem.config.cjs --env production
```
**Rollback:**
```bash
cd /var/www/gricc
git checkout <PREVIOUS_TAG_OR_COMMIT>
npm ci
npm run build
pm2 reload ecosystem.config.cjs --env production
# If DB rollback is needed, restore from pre-update backup (see BACKUP_RECOVERY.md)
```

