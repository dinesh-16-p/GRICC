# GRICC 2.0 — Phase 24: Nginx & PM2 Production Configuration

**Document:** `NGINX_AND_PM2_CONFIGURATION.md`  
**Phase:** 24 of 50 — Public VPS Hosting, Domain Connection, DNS, Nginx, HTTPS & Production Deployment  
**Domain:** `griccglobal.com`  
**Status:** CONFIGURATION READY  

---

## 1. PM2 Process Supervision (Single-Instance Fork Mode)

In accordance with strict architectural requirements, PM2 runs in **Single-Instance Fork Mode**:

```javascript
// /var/www/gricc/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'gricc-backend',
      script: 'server/index.js',
      instances: 1,           // MANDATORY: Process-local cache & SSE
      exec_mode: 'fork',      // MANDATORY: Do not use cluster mode
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 5000,
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      out_file: '/var/log/gricc/backend-out.log',
      error_file: '/var/log/gricc/backend-err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
```

---

## 2. Nginx Reverse Proxy Architecture

Installed from `deploy/nginx.griccglobal.com.conf` into `/etc/nginx/sites-available/griccglobal.com`:

```bash
sudo cp deploy/nginx.griccglobal.com.conf /etc/nginx/sites-available/griccglobal.com
sudo ln -sf /etc/nginx/sites-available/griccglobal.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### Key Routing Directives:
- **`location /`:** Serves static React production bundle from `/var/www/gricc/dist` with `try_files $uri $uri/ /index.html` (SPA fallback).
- **`location /assets/`:** Static JS/CSS assets cached with `expires 1y; add_header Cache-Control "public, immutable";`.
- **`location /api/`:** Proxies requests to internal Express listener at `http://127.0.0.1:5000` with `X-Forwarded-For` and `X-Forwarded-Proto`.
- **`location ~ ^/api/(events|monitoring)/stream$`:** Server-Sent Events (SSE) streaming with `proxy_buffering off; chunked_transfer_encoding on; proxy_read_timeout 3600s;`.
