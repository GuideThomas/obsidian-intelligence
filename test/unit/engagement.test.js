import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock config before importing engagement
vi.mock('../../lib/config.js', () => ({
  getConfig: () => ({
    engagement: { active: 7, moderate: 30, dormant: 90 }
  })
}));

import { classifyLevel } from '../../lib/engagement.js';

describe('classifyLevel', () => {
  it('should classify recent notes as active', () => {
    const now = Date.now();
    expect(classifyLevel(now)).toBe('active');
    expect(classifyLevel(now - 1 * 24 * 60 * 60 * 1000)).toBe('active');
    expect(classifyLevel(now - 6 * 24 * 60 * 60 * 1000)).toBe('active');
  });

  it('should classify 7-30 day old notes as moderate', () => {
    const now = Date.now();
    expect(classifyLevel(now - 8 * 24 * 60 * 60 * 1000)).toBe('moderate');
    expect(classifyLevel(now - 15 * 24 * 60 * 60 * 1000)).toBe('moderate');
    expect(classifyLevel(now - 29 * 24 * 60 * 60 * 1000)).toBe('moderate');
  });

  it('should classify 30-90 day old notes as dormant', () => {
    const now = Date.now();
    expect(classifyLevel(now - 31 * 24 * 60 * 60 * 1000)).toBe('dormant');
    expect(classifyLevel(now - 60 * 24 * 60 * 60 * 1000)).toBe('dormant');
    expect(classifyLevel(now - 89 * 24 * 60 * 60 * 1000)).toBe('dormant');
  });

  it('should classify >90 day old notes as archived', () => {
    const now = Date.now();
    expect(classifyLevel(now - 91 * 24 * 60 * 60 * 1000)).toBe('archived');
    expect(classifyLevel(now - 365 * 24 * 60 * 60 * 1000)).toBe('archived');
  });

  it('should handle edge case at exactly 7 days', () => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    // At exactly 7 days, should still be active (<=)
    expect(classifyLevel(now - sevenDays)).toBe('active');
  });

  it('should handle future dates as active', () => {
    const future = Date.now() + 86400000;
    expect(classifyLevel(future)).toBe('active');
  });
});
