import { describe, it, expect } from 'vitest';
import { classifyRiskScore } from '../server/services/countryRiskService.js';

describe('Country Risk Score & Classification Tests', () => {
  it('correctly maps numeric risk scores to standard classification tiers', () => {
    // Critical: >= 75
    expect(classifyRiskScore(100)).toBe('Critical');
    expect(classifyRiskScore(85)).toBe('Critical');
    expect(classifyRiskScore(75)).toBe('Critical');

    // High: >= 50 and < 75
    expect(classifyRiskScore(74)).toBe('High');
    expect(classifyRiskScore(60)).toBe('High');
    expect(classifyRiskScore(50)).toBe('High');

    // Medium: >= 25 and < 50
    expect(classifyRiskScore(49)).toBe('Medium');
    expect(classifyRiskScore(35)).toBe('Medium');
    expect(classifyRiskScore(25)).toBe('Medium');

    // Low: < 25
    expect(classifyRiskScore(24)).toBe('Low');
    expect(classifyRiskScore(10)).toBe('Low');
    expect(classifyRiskScore(0)).toBe('Low');
  });
});

