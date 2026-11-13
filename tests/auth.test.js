import { describe, it, expect } from 'vitest';
import securityService from '../server/services/securityService.js';
import authService from '../server/services/authService.js';

describe('Auth & Security Service Unit Tests', () => {
  it('enforces password policy complexity rules', () => {
    // Valid strong password
    expect(() => securityService.validatePasswordPolicy('StrongPass!2026')).not.toThrow();

    // Too short
    expect(() => securityService.validatePasswordPolicy('Sh!1')).toThrow(/at least 8 characters/);

    // Missing uppercase
    expect(() => securityService.validatePasswordPolicy('weakpass!2026')).toThrow(/uppercase/);

    // Missing lowercase
    expect(() => securityService.validatePasswordPolicy('WEAKPASS!2026')).toThrow(/lowercase/);

    // Missing number
    expect(() => securityService.validatePasswordPolicy('WeakPass!NoNum')).toThrow(/numeric digit/);

    // Missing special character
    expect(() => securityService.validatePasswordPolicy('WeakPass123456')).toThrow(/special/);
  });

  it('generates random CSRF tokens with sufficient entropy', () => {
    const token1 = authService.generateCsrfToken();
    const token2 = authService.generateCsrfToken();

    expect(token1).toHaveLength(64); // 32 bytes hex
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
  });

  it('verifies active user login credentials in development mode', () => {
    const result = authService.login('admin', 'admin123');
    expect(result).toBeDefined();
    expect(result.token).toBeDefined();
    expect(result.csrfToken).toHaveLength(64);
    expect(result.user.username).toBe('admin');
    expect(result.user.role).toBe('ADMIN');
  });

  it('verifies session tokens and detects invalid signatures', () => {
    const login = authService.login('analyst', 'admin123');
    const session = authService.verifySession(login.token);

    expect(session.user.username).toBe('analyst');
    expect(session.user.role).toBe('ANALYST');
    expect(session.jti).toBeDefined();

    expect(() => authService.verifySession('invalid.jwt.token')).toThrow();
  });

  it('successfully rotates tokens and invalidates the previous JTI', () => {
    const initialLogin = authService.login('viewer', 'admin123');
    const rotated = authService.refreshSession(initialLogin.token);

    expect(rotated.token).toBeDefined();
    expect(rotated.token).not.toBe(initialLogin.token);
    expect(rotated.csrfToken).toBeDefined();

    // Old token should now be revoked
    expect(() => authService.verifySession(initialLogin.token)).toThrow(/revoked/);

    // New token should be valid
    const newSession = authService.verifySession(rotated.token);
    expect(newSession.user.username).toBe('viewer');
  });
});

