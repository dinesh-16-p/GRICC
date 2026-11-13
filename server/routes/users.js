import express from 'express';
import authService from '../services/authService.js';
import { authenticateToken, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// All user management endpoints require ADMIN role
router.use(authenticateToken, requireRole('ADMIN'));

// GET /api/users
router.get('/', (req, res, next) => {
  try {
    const { search, role, status } = req.query;
    const users = authService.listUsers({ search, role, status });
    res.status(200).json({
      timestamp: new Date().toISOString(),
      count: users.length,
      users,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', (req, res, next) => {
  try {
    const user = authService.createUser(req.body, req.user, req.ip);
    res.status(201).json({
      message: 'User created successfully.',
      user,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', (req, res, next) => {
  try {
    const user = authService.updateUser(req.params.id, req.body, req.user, req.ip);
    res.status(200).json({
      message: 'User updated successfully.',
      user,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id/status
router.patch('/:id/status', (req, res, next) => {
  try {
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'isActive boolean is required.',
      });
    }
    const user = authService.updateUser(req.params.id, { isActive }, req.user, req.ip);
    res.status(200).json({
      message: `User ${user.username} ${user.isActive ? 'activated' : 'deactivated'}.`,
      user,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

