# GRICC — Phase 6 Setup & Operations Guide

## 1. Architecture Overview

The **Global Risk Intelligence Command Centre (GRICC)** uses a decoupled full-stack architecture:

- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts + Leaflet (served on port `3000` in development).
- **Backend API Gateway**: Node.js + Express (served on port `5000`), handling CORS, request caching, provider timeouts, normalization, and graceful error handling.
- **Development Proxy**: Vite proxies all `/api/*` requests from `http://localhost:3000` to `http://localhost:5000`.

```text
GRICC/
├── server/
│   ├── index.js                 # Express server, CORS, 404 & error middleware, graceful shutdown
│   ├── routes/
│   │   └── api.js               # /api/health, /api/sources, /api/telemetry, /api/refresh
│   └── services/
│       ├── newsService.js       # International News (GDELT 2.0 / NewsAPI)
│       ├── geopoliticalService.js # Geopolitical Risk (UN OCHA ReliefWeb)
│       ├── disasterService.js   # Natural Disasters (NASA EONET v3)
│       ├── weatherService.js    # Weather Emergencies (US NWS / NOAA)
│       └── cyberService.js      # Cybersecurity Advisories (CISA KEV Catalog)
├── src/
│   ├── services/
│   │   └── apiService.js        # Centralized fetch client with timeout & exponential backoff
│   └── components/
│       └── DataSourceHealth.jsx # Provider health monitor & refresh controls
├── .env.example                 # Environment variable template
└── PHASE_6_SETUP.md             # This setup guide
```

---

## 2. Installation

Install all frontend and backend dependencies from the project root:

```bash
npm install
```

---

## 3. Environment Variable Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Ensure `.env` is listed in `.gitignore` (already configured) so secrets are never committed.
3. Configure core server variables in `.env`:
   - `PORT=5000` — Backend Express listening port.
   - `NODE_ENV=development` — Runtime environment (`development` or `production`).
   - `FRONTEND_URL=http://localhost:3000` — Allowed CORS origin for the React frontend.
   - `DATA_CACHE_TTL_SECONDS=60` — Server-side response cache duration to respect provider rate limits.

---

## 4. API Provider Registration

GRICC works out-of-the-box with **zero API keys** by connecting to authoritative public intelligence feeds:

| Service | Default Zero-Key Provider | Optional Commercial / Custom Env Vars |
| :--- | :--- | :--- |
| **International News** | GDELT 2.0 Global Intelligence API | `NEWS_API_PROVIDER`, `NEWS_API_KEY`, `NEWS_API_ENDPOINT` |
| **Geopolitical Risk** | UN OCHA ReliefWeb API | `GEOPOLITICAL_API_PROVIDER`, `GEOPOLITICAL_API_KEY`, `GEOPOLITICAL_API_ENDPOINT` |
| **Natural Disasters** | NASA EONET v3 Planetary API | `DISASTER_API_PROVIDER`, `DISASTER_API_KEY`, `DISASTER_API_ENDPOINT` |
| **Weather Emergencies** | US National Weather Service (NWS) | `WEATHER_API_PROVIDER`, `WEATHER_API_KEY`, `WEATHER_API_ENDPOINT` |
| **Cybersecurity** | US CISA KEV Catalog | `CYBER_THREAT_API_PROVIDER`, `CYBER_THREAT_API_KEY`, `CYBER_THREAT_API_ENDPOINT` |

If an external provider is unreachable (e.g., offline environment or timeout), the service automatically falls back to curated **DEMO DATA** and reports its status accurately without crashing the dashboard.

---

## 5. Running Frontend and Backend

Open two terminal windows in the project root:

**Terminal 1 — Start the Express Backend:**
```bash
npm run dev:server
```
*(For production mode, use `npm run start:server`)*

**Terminal 2 — Start the Vite React Frontend:**
```bash
npm run dev
```

Access the dashboard at: **http://localhost:3000**

---

## 6. API Endpoint Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Returns backend status (`HEALTHY`), uptime in seconds, timestamp, environment, and operational mode (`LIVE MODE` or `DEMO MODE`). |
| `GET` | `/api/sources` | Returns detailed health status (`HEALTHY`, `DEGRADED`, `FAILED`, `NOT_CONFIGURED`), latency, record count, and sync timestamps for all 5 providers. |
| `GET` | `/api/telemetry` | Fetches aggregated, normalized data from all 5 services. Supports `?refresh=true` to bypass the server cache. |
| `POST` | `/api/refresh` | Triggers a controlled, mutex-protected refresh of all 5 providers (returns `429` if a refresh is already in progress). |

---

## 7. Refresh Configuration

- Configurable in the **Data Source Health** view (`Sidebar -> Data Source Health`).
- Supported intervals: **1 Minute**, **5 Minutes** (default), **10 Minutes**, **15 Minutes**, or **Manual Only**.
- User preference is persisted in `localStorage` (`gricc_refresh_interval`).
- Automatic polling pauses when the browser tab is hidden (`document.visibilityState === 'hidden'`) and cleans up timers on unmount.
- Failed requests use exponential backoff (up to 2 retries) via `src/services/apiService.js`.

---

## 8. Testing Instructions

1. **Production Build Verification:**
   ```bash
   npm run build
   ```
2. **Backend Endpoint Verification** (with `npm run dev:server` running):
   ```bash
   curl http://localhost:5000/api/health
   curl http://localhost:5000/api/sources
   curl http://localhost:5000/api/telemetry
   curl -X POST http://localhost:5000/api/refresh
   ```

---

## 9. Common Troubleshooting

- **Frontend shows `OFFLINE (DEMO STANDBY)`**: Ensure the backend is running on port `5000` (`npm run dev:server`) and `PORT=5000` matches the target in `vite.config.js`.
- **CORS Errors**: Verify `FRONTEND_URL` in `.env` matches the exact URL in your browser (default `http://localhost:3000`).
- **Providers showing `DEGRADED` or `DEMO MODE`**: Check your internet connection or corporate firewall/proxy; if public feeds time out after 6 seconds, GRICC safely falls back to Demo Data.

