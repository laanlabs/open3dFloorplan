import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { timeElapsed } from '$lib/utils/timeElapsed';

describe('timeElapsed', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns hours label and low urgency under 24h', () => {
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
    const ts = new Date('2026-07-01T10:00:00Z'); // 2h ago
    const result = timeElapsed(ts);
    expect(result.label).toBe('2h');
    expect(result.urgency).toBe('low');
  });

  it('returns days label and low urgency under 5 days', () => {
    vi.setSystemTime(new Date('2026-07-04T12:00:00Z'));
    const ts = new Date('2026-07-01T12:00:00Z'); // 3 days ago
    const result = timeElapsed(ts);
    expect(result.label).toBe('3d');
    expect(result.urgency).toBe('low');
  });

  it('returns medium urgency at 5 days', () => {
    vi.setSystemTime(new Date('2026-07-06T12:00:00Z'));
    const ts = new Date('2026-07-01T12:00:00Z'); // exactly 5 days
    expect(timeElapsed(ts).urgency).toBe('medium');
  });

  it('returns high urgency over 10 days', () => {
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    const ts = new Date('2026-07-01T12:00:00Z'); // 11 days
    const result = timeElapsed(ts);
    expect(result.label).toBe('11d');
    expect(result.urgency).toBe('high');
  });
});
