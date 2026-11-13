# GRICC – Production Architecture

## Recommended First Public Release Architecture

**Architecture:** Single Ubuntu LTS VPS (or Cloud VM) with Nginx reverse proxy + TLS termination, static React SPA (`dist/`), single-instance Node.js/Express backend (`ecosystem.config.cjs` / PM2), and persistent SQLite WAL database.

### Why Single-Instance VPS + Nginx (No Docker/Multi-Instance Yet)
1. **In-Memory Cache & SSE Registry**: `cacheService` and `realtimeService` (SSE client connections) store state in-memory within the Node.js process. Running multiple backend instances behind a load balancer without Redis would cause cache divergence and missed SSE broadcasts.
2. **SQLite WAL Concurrency**: SQLite (`journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`) handles concurrent reads and single-process writes cleanly on persistent local block storage (`<1ms` paginated queries, `<180ms` for 10,000-row batch inserts).
3. **Operational Simplicity**: No container orchestration overhead or ephemeral container filesystem risk for SQLite.

## Component Layout

| Layer | Technology | Hosting / Path | Notes |
| --- | --- | --- | --- |
| **Reverse Proxy & TLS** | Nginx + Certbot | Ports `80` -> `443` | HTTPS termination, HTTP redirect, security headers, SSE buffering disabled |
| **Frontend SPA** | React 18 + Vite (`dist/`) | `/var/www/gricc/dist` | Served directly by Nginx with `/assets/` immutable caching and `index.html` `no-store` |
| **Backend API** | Node.js + Express 5 | `127.0.0.1:5000` (PM2 fork, `instances: 1`) | Proxied via `/api/`, `Cache-Control: no-store`, Helmet, CORS allowlist, rate limiters |
| **Database** | SQLite (`better-sqlite3`, WAL) | Persistent volume (e.g., `/var/lib/gricc/gricc.db`) | Outside `dist/` and `src/`; never served over HTTP |
| **Backups** | `server/scripts/backup-database.js` | Persistent backup dir (`/var/backups/gricc`) | Uses SQLite online backup API (`db.backup()`), integrity check, retention pruning |
| **Monitoring** | `/api/health` + `/api/performance/*` | Public minimal health + ADMIN telemetry | External uptime check on `/api/health`; ADMIN dashboard for latency, cache, memory, SSE, jobs |

## Hosting Options Comparison

| Option | Setup Complexity | Persistent SQLite | SSE Support | HTTPS | Backups | Approx. Cost | Scaling Limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **1. VPS + Nginx + PM2 (Recommended)** | Low–Medium | Native local SSD | Native (`proxy_buffering off`) | Certbot / Let's Encrypt | Local cron + off-server sync | ~\$6–\$24/mo | Vertical scaling (single Node process) |
| **2. Cloud VM (EC2 / Azure VM / GCE)** | Medium | Persistent block volume (EBS/PD) | Native via Nginx | Certbot or Cloud LB | Volume snapshots + `backup:db` | ~\$15–\$40/mo | Vertical scaling; LB requires Redis/PG |
| **3. Managed Container Platform** | Medium–High | Requires attached persistent volume (single replica only) | Platform-dependent idle timeouts | Managed TLS | Volume snapshots + script | ~\$15–\$50/mo | Ephemeral FS risk if volume misconfigured |

## Future Horizontal Scaling Trigger
Migrate from SQLite + in-memory `cacheService`/SSE to **PostgreSQL + Redis Pub/Sub** before scaling beyond one backend instance.

