# GRICC 2.0 — Phase 23: Real-Time & Server-Sent Events (SSE) Optimization

**Document:** `REALTIME_AND_SSE_OPTIMIZATION.md`  
**Phase:** 23 of 50 — Performance Optimization, Scalability Engineering & Production Preparation  
**Date:** November 13, 2026  
**Status:** HARDENED, BOUNDED & VERIFIED  

---

## 1. Overview & Real-Time Protocol

GRICC streams live tactical bulletins, collaboration events, and crisis alerts to frontend dashboards using **Server-Sent Events (SSE)** via `/api/events/stream` and `/api/monitoring/stream`.

SSE was selected over WebSockets for this phase due to its native HTTP/2 multiplexing, automatic browser reconnection, firewall friendliness, and zero external dependency footprint.

---

## 2. Hardened Lifecycle & Memory Protection Mechanisms

Located in `server/services/realtimeService.js`:

### 2.1 Maximum Concurrent Connection Ceiling
To safeguard the Node.js event loop against Denial of Service or connection leaks:
- Maximum client limit enforced at **500 concurrent connections** (`MAX_SSE_CLIENTS`).
- If capacity is saturated, incoming connections receive HTTP 503 Service Unavailable with descriptive retry guidance.

### 2.2 Stale Socket Sweeping & Dead Client Eviction
- A background sweep runs every 60 seconds (`staleSweepInterval.unref()`).
- Checks `client.res.destroyed` and `client.res.writableEnded`. Any disconnected or aborted socket is immediately purged from the `clients` Map.
- Immediate disconnect hooks bound to `req.on('close')` and `req.on('error')`.

### 2.3 Heartbeat Keep-Alive
- Transmits an SSE comment (`: heartbeat <timestamp>\n\n`) every 25 seconds.
- Prevents intermediate proxies (Nginx, Cloudflare, AWS ALB) from terminating idle persistent HTTP connections.

### 2.4 Graceful Process Shutdown
When the server receives `SIGTERM` or `SIGINT`, `closeAllSseClients()` gracefully ends all open response streams before closing the HTTP listener.

---

## 3. Security & Multicast Isolation

- **Authentication Required:** Stream connections validate tokens via `authenticateSse` middleware.
- **RBAC Multicast Filtering:** Events broadcast via `broadcastEvent(name, payload, { roles })` verify the recipient's role prior to transmitting data, preventing cross-tenant information leakage.
- **Zero Secret Transmission:** Initial connection handshakes omit passwords, secrets, or internal server state.

---

## 4. Single-Instance Architecture Notice

SSE state is maintained in-process within a native JavaScript `Map`. Multi-process clustering (e.g. PM2 cluster mode) remains restricted until a Redis Pub/Sub backplane is implemented.
