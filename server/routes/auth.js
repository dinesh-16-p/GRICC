import express from 'express';
import rateLimit from 'express-rate-limit';
import authService from '../services/authService.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Rate limiter for login attempts (brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 25),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TooManyRequests',
    code: 'RATE_LIMITED',
    message: 'Too many login attempts. Please wait before trying again.',
  },
});

const isProduction = process.env.NODE_ENV === 'production';

function setAuthCookies(res, token, csrfToken) {
  const maxAge = 8 * 60 * 60 * 1000; // 8 hours
  res.cookie('gricc_session', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge,
    path: '/',
  });
  if (csrfToken) {
    res.cookie('gricc_csrf', csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge,
      path: '/',
    });
  }
}

function clearAuthCookies(res) {
  res.clearCookie('gricc_session', { path: '/' });
  res.clearCookie('gricc_csrf', { path: '/' });
}

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res, next) => {
  try {
    const { username, identifier, email, password } = req.body || {};
    const result = authService.login(identifier || username || email, password, req.ip);
    setAuthCookies(res, result.token, result.csrfToken);
    res.status(200).json({
      message: 'Authentication successful.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const cookieToken = req.cookies?.gricc_session;
    const token = bearerToken || cookieToken;

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'TOKEN_MISSING',
        message: 'No active session token provided for refresh.',
      });
    }

    const result = authService.refreshSession(token, req.ip);
    setAuthCookies(res, result.token, result.csrfToken);
    res.status(200).json({
      message: 'Session refreshed successfully.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/csrf
router.get('/csrf', (req, res) => {
  const existingCsrf = req.cookies?.gricc_csrf;
  const csrfToken = existingCsrf || authService.generateCsrfToken();
  res.cookie('gricc_csrf', csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
  res.status(200).json({ csrfToken });
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, (req, res, next) => {
  try {
    authService.logout(req.tokenJti, req.user, req.ip);
    clearAuthCookies(res);
    res.status(200).json({
      message: 'Logged out successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.status(200).json({
    user: req.user,
  });
});

export default router;

