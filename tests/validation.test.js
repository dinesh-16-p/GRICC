import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  createIncidentSchema,
  updateIncidentSchema,
  aiChatSchema,
  aiGenerateReportSchema,
  collaborationDiscussionSchema,
} from '../server/validators/schemas.js';

describe('Zod Validation Schemas Unit Tests', () => {
  it('validates valid login payloads and transforms identifier', () => {
    const valid = loginSchema.safeParse({ identifier: 'admin', password: 'SecretPassword123!' });
    expect(valid.success).toBe(true);
    expect(valid.data.identifier).toBe('admin');

    const withUsername = loginSchema.safeParse({ username: 'analyst', password: 'SecretPassword123!' });
    expect(withUsername.success).toBe(true);
    expect(withUsername.data.identifier).toBe('analyst');
  });

  it('rejects empty or missing login credentials', () => {
    const empty = loginSchema.safeParse({ identifier: '', password: '' });
    expect(empty.success).toBe(false);
  });

  it('validates complete incident creation payloads', () => {
    const validIncident = {
      title: 'Geopolitical Tension Escalation in Baltic Sea',
      country: 'Estonia',
      region: 'Europe',
      category: 'Military Movement',
      severity: 'High',
      description: 'Naval assets observed conducting unexpected maneuvers in international waters.',
      lat: 59.437,
      lng: 24.753,
    };
    const result = createIncidentSchema.safeParse(validIncident);
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('Active');
  });

  it('rejects incident creation with invalid severity', () => {
    const invalidSeverity = {
      title: 'Border skirmish',
      country: 'Ukraine',
      category: 'Conflict',
      severity: 'Catastrophic', // invalid enum
      description: 'Test description',
    };
    const result = createIncidentSchema.safeParse(invalidSeverity);
    expect(result.success).toBe(false);
    expect(result.error.issues.length).toBeGreaterThan(0);
  });

  it('validates AI chat and report generation schemas', () => {
    const validChat = aiChatSchema.safeParse({ message: 'What is the risk level in Taiwan?' });
    expect(validChat.success).toBe(true);

    const emptyChat = aiChatSchema.safeParse({ message: '' });
    expect(emptyChat.success).toBe(false);

    const validReport = aiGenerateReportSchema.safeParse({
      title: 'Monthly Geopolitical Briefing',
      reportType: 'EXECUTIVE_SUMMARY',
      country: 'Ukraine',
    });
    expect(validReport.success).toBe(true);
  });

  it('validates collaboration discussions', () => {
    const validDiscussion = {
      title: 'Evaluating Red Sea Shipping Corridor Vulnerabilities',
      description: 'Reviewing recent anti-ship missile attacks and alternate routing impacts.',
      priority: 'HIGH',
      visibility: 'TEAM',
    };
    const result = collaborationDiscussionSchema.safeParse(validDiscussion);
    expect(result.success).toBe(true);
  });
});
