import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import apiRouter from './routes/api.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import { initializeDatabase, closeDatabase } from './db/database.js';
import alertingService from './services/alertingService.js';
import { closeAllSseClients } from './services/realtimeService.js';
import { realTimeMonitoringService } from './services/realTimeMonitoringService.js';
import { securityService } from './services/securityService.js';
import { performanceService } from './services/performanceService.js';
import { collaborationService } from './services/collaborationService.js';

// 1. Load environment variables
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Validate required production configuration before starting the HTTP server.
 * Fails fast on missing/placeholder secrets, unsafe DB paths, or missing CORS origins.
 */
export function validateProductionConfig() {
  if (!isProduction) return;

  const jwtSecret = (process.env.JWT_SECRET || '').trim();
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret === 'replace-with-a-strong-64-char-random-secret') {
    throw new Error('FATAL [CONFIG]: JWT_SECRET must be configured with >= 32 random characters in production.');
  }

  const rawOrigins = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '';
  const origins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error('FATAL [CONFIG]: CORS_ORIGIN or FRONTEND_URL must be explicitly set in production.');
  }
  if (
    process.env.ALLOW_LOCALHOST_CORS !== 'true' &&
    origins.some((o) => /localhost|127\.0\.0\.1/i.test(o))
  ) {
    throw new Error('FATAL [CONFIG]: Production CORS_ORIGIN/FRONTEND_URL must not reference localhost/127.0.0.1.');
  }

  const resolvedDbPath = path.resolve(process.env.DB_PATH || './server/data/gricc.db');
  const distDir = path.resolve('./dist');
  const srcDir = path.resolve('./src');
  if (resolvedDbPath.startsWith(distDir) || resolvedDbPath.startsWith(srcDir)) {
    throw new Error('FATAL [CONFIG]: DB_PATH must not be placed inside dist/ or src/ web-accessible directories.');
  }
}

validateProductionConfig();

// Initialize persistent SQLite database
initializeDatabase();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

if (isProduction || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
}

// 2. Secure HTTP headers & CORS
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://api.maptiler.com',
          'https://*.maptiler.com',
          'https://gibs.earthdata.nasa.gov',
          'https://*.basemaps.cartocdn.com',
          'https://*.tile.openstreetmap.org',
          'https://*.openstreetmap.org',
          'https://unpkg.com',
        ],
        connectSrc: [
          "'self'",
          'https://*.onrender.com',
          'https://api.maptiler.com',
          'https://*.maptiler.com',
          'https://gibs.earthdata.nasa.gov',
          'https://eonet.gsfc.nasa.gov',
          'https://raw.githubusercontent.com',
        ],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);

const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([
    ...configuredOrigins,
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    ...(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL.trim()] : []),
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : []),
    ...(!isProduction ? [FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'] : []),
  ])
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Allow same-host origin on any port in development or demo mode, and public preview tunnels/Render
      if (!isProduction || process.env.SERVE_FRONTEND === 'true' || fs.existsSync(path.resolve('./dist/index.html'))) {
        if (
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
          /^https?:\/\/[a-z0-9-]+\.(app\.lhr\.life|lhr\.life|trycloudflare\.com|loca\.lt|onrender\.com)$/i.test(origin)
        ) {
          return callback(null, true);
        }
      }
      return callback(new Error(`CORS policy: Origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  })
);

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TooManyRequests',
    message: 'API rate limit exceeded. Please try again shortly.',
  },
});
app.use('/api', apiLimiter);

// 3. Configure JSON & Cookie request parsing
app.use(cookieParser());
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));

// Request logging, no-store cache headers on /api, & performance telemetry
app.use((req, res, next) => {
  const cleanPath = req.path || req.originalUrl.split('?')[0];
  if (cleanPath.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  const start = performance.now();
  res.on('finish', () => {
    const duration = performance.now() - start;
    if (cleanPath.startsWith('/api/')) {
      performanceService.recordApiRequest({
        method: req.method,
        path: cleanPath,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    }
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${cleanPath} ${res.statusCode} - ${duration.toFixed(1)}ms`);
    }
  });
  next();
});

// 4. Register API Routes (auth & users before protected /api router)
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api', apiRouter);

// Serve production frontend bundle from dist/ if enabled or whenever dist/index.html exists
const distDir = path.resolve('./dist');
const indexHtmlPath = path.join(distDir, 'index.html');
const shouldServeFrontend =
  process.env.SERVE_FRONTEND === 'true' ||
  fs.existsSync(indexHtmlPath);

if (shouldServeFrontend && fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, dotfiles: 'ignore' }));

  app.get('/', (req, res) => {
    if (fs.existsSync(indexHtmlPath)) {
      return res.sendFile(indexHtmlPath);
    }
    res.json({
      name: 'GRICC Intelligence API Gateway',
      version: '1.0.0',
      status: 'ONLINE',
      endpoints: {
        health: '/api/health',
        sources: '/api/sources',
        telemetry: '/api/telemetry',
        refresh: '/api/refresh',
      },
      timestamp: new Date().toISOString(),
    });
  });

  // SPA fallback for frontend routes (excluding /api)
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      return next();
    }
    if (fs.existsSync(indexHtmlPath)) {
      return res.sendFile(indexHtmlPath);
    }
    next();
  });
} else {
  // Root informational endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'GRICC Intelligence API Gateway',
      version: '1.0.0',
      status: 'ONLINE',
      endpoints: {
        health: '/api/health',
        sources: '/api/sources',
        telemetry: '/api/telemetry',
        refresh: '/api/refresh',
      },
      timestamp: new Date().toISOString(),
    });
  });
}

// 5. 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

// 6. Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]:', err);
  const statusCode = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  res.status(statusCode).json({
    error: err.name || 'InternalServerError',
    message: isProd && statusCode >= 500 ? 'An unexpected server error occurred.' : (err.message || 'An unexpected server error occurred'),
    timestamp: new Date().toISOString(),
  });
});

// 7. Start Server & Graceful Shutdown
let server;
let escalationTimer;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`  GRICC Backend Gateway Online on Port ${PORT}`);
    console.log(`  Frontend CORS Origin: ${FRONTEND_URL}`);
    console.log(`  Health Check: http://localhost:${PORT}/api/health`);
    console.log(`  Telemetry:    http://localhost:${PORT}/api/telemetry`);
    console.log('====================================================');
  });

  // Periodic escalation check for unacknowledged critical alerts (every 60s)
  escalationTimer = setInterval(() => {
    try {
      alertingService.evaluateUnacknowledgedAlerts();
    } catch (err) {
      console.error('[ESCALATION MONITOR ERROR]:', err.message);
    }
  }, 60000);

  // Start Phase 16 Real-Time Monitoring Engine (single instance)
  realTimeMonitoringService.startMonitoring();

  // Phase 19: Independent scheduled check for due-soon & overdue collaboration tasks (every 5m, overlap-guarded)
  let isCheckingTasks = false;
  const taskReminderTimer = setInterval(() => {
    if (isCheckingTasks) return;
    isCheckingTasks = true;
    const tStart = performance.now();
    try {
      collaborationService.checkDueSoonTaskNotifications();
      performanceService.recordJobRun('task_due_notifications', performance.now() - tStart, true);
    } catch (err) {
      performanceService.recordJobRun('task_due_notifications', performance.now() - tStart, false, err.message);
    } finally {
      isCheckingTasks = false;
    }
  }, 5 * 60 * 1000);

  // Clean up expired revoked_tokens on startup
  try {
    securityService.cleanupExpiredTokens();
  } catch {
    // Non-fatal
  }

  const handleShutdown = (signal) => {
    console.log(`\n[SHUTDOWN] Received ${signal}. Closing GRICC API server gracefully...`);
    if (escalationTimer) clearInterval(escalationTimer);
    if (taskReminderTimer) clearInterval(taskReminderTimer);
    realTimeMonitoringService.stopMonitoring();
    closeAllSseClients();
    if (server) {
      server.close(() => {
        closeDatabase();
        console.log('[SHUTDOWN] HTTP server & SQLite database closed cleanly. Exiting.');
        process.exit(0);
      });
      // Force exit after 5s timeout
      setTimeout(() => {
        console.error('[SHUTDOWN] Forced shutdown after timeout.');
        process.exit(1);
      }, 5000);
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

export default app;
