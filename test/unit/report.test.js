import { describe, it, expect } from 'vitest';
import { calculateHealthScore, buildHTML } from '../../lib/report.js';

describe('calculateHealthScore', () => {
  const baseSnapshot = {
    totals: { notes: 100, tags: 50, links: 200, broken_links: 5, orphans: 10 },
    engagement: {
      distribution: [
        { level: 'active', count: 20 },
        { level: 'moderate', count: 30 },
        { level: 'dormant', count: 30 },
        { level: 'archived', count: 20 }
      ]
    }
  };

  it('should return a score between 0 and 100', () => {
    const result = calculateHealthScore(baseSnapshot);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should return a color string', () => {
    const result = calculateHealthScore(baseSnapshot);
    expect(result.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('should return factors array', () => {
    const result = calculateHealthScore(baseSnapshot);
    expect(result.factors).toHaveLength(4);
    expect(result.factors[0]).toHaveProperty('label');
    expect(result.factors[0]).toHaveProperty('detail');
    expect(result.factors[0]).toHaveProperty('status');
  });

  it('should penalize high orphan ratio', () => {
    const manyOrphans = {
      ...baseSnapshot,
      totals: { ...baseSnapshot.totals, orphans: 80 }
    };
    const normal = calculateHealthScore(baseSnapshot);
    const bad = calculateHealthScore(manyOrphans);
    expect(bad.score).toBeLessThan(normal.score);
  });

  it('should penalize high broken link ratio', () => {
    const manyBroken = {
      ...baseSnapshot,
      totals: { ...baseSnapshot.totals, broken_links: 100 }
    };
    const normal = calculateHealthScore(baseSnapshot);
    const bad = calculateHealthScore(manyBroken);
    expect(bad.score).toBeLessThan(normal.score);
  });

  it('should handle empty vault', () => {
    const empty = {
      totals: { notes: 0, tags: 0, links: 0, broken_links: 0, orphans: 0 },
      engagement: { distribution: [] }
    };
    const result = calculateHealthScore(empty);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('should label healthy vaults correctly', () => {
    const healthy = {
      totals: { notes: 100, tags: 80, links: 300, broken_links: 2, orphans: 3 },
      engagement: {
        distribution: [
          { level: 'active', count: 40 },
          { level: 'moderate', count: 40 },
          { level: 'dormant', count: 15 },
          { level: 'archived', count: 5 }
        ]
      }
    };
    const result = calculateHealthScore(healthy);
    expect(result.label).toBe('Healthy');
    expect(result.score).toBeGreaterThanOrEqual(75);
  });
});

describe('buildHTML', () => {
  const mockSnapshot = {
    generated_at: new Date().toISOString(),
    source: 'filesystem',
    totals: { notes: 10, tags: 5, links: 20, broken_links: 2, orphans: 1 },
    engagement: {
      distribution: [
        { level: 'active', count: 3 },
        { level: 'moderate', count: 4 },
        { level: 'dormant', count: 2 },
        { level: 'archived', count: 1 }
      ],
      top_active: [],
      most_modified: []
    },
    active_notes: [],
    recently_modified_24h: [],
    recently_created_7d: [],
    revival_candidates: [],
    graph: {
      top_tags: [{ name: 'test', count: 5 }, { name: 'project', count: 3 }],
      hubs: [{ title: 'Hub Note', connections: 15 }],
      tag_pairs: [],
      folders: []
    },
    open_catalysts: [],
    folder_activity: [{ folder: '/', total: 10, active_7d: 3, active_30d: 7 }]
  };

  it('should generate valid HTML', () => {
    const html = buildHTML(mockSnapshot);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('should include vault stats', () => {
    const html = buildHTML(mockSnapshot);
    expect(html).toContain('10'); // notes count
    expect(html).toContain('20'); // links count
  });

  it('should include tag cloud', () => {
    const html = buildHTML(mockSnapshot);
    expect(html).toContain('#test');
    expect(html).toContain('#project');
  });

  it('should include hub notes', () => {
    const html = buildHTML(mockSnapshot);
    expect(html).toContain('Hub Note');
  });

  it('should include Chart.js CDN', () => {
    const html = buildHTML(mockSnapshot);
    expect(html).toContain('chart.js');
  });

  it('should include embedded report data as JSON', () => {
    const html = buildHTML(mockSnapshot);
    expect(html).toContain('REPORT_DATA');
  });

  it('should escape HTML in note titles', () => {
    const xssSnapshot = {
      ...mockSnapshot,
      graph: {
        ...mockSnapshot.graph,
        hubs: [{ title: '<script>alert("xss")</script>', connections: 1 }]
      }
    };
    const html = buildHTML(xssSnapshot);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
