import { describe, expect, it } from 'vitest';
import {
  calculateEarnedPoints,
  earnedInLast12Months,
  progressToNextTier,
  tierForEarnedPoints,
} from '@/lib/loyalty-rules';

describe('Valley Grounds loyalty rules', () => {
  it('keeps Sprout at 10 points per dollar', () => {
    expect(calculateEarnedPoints(10, 'sprout')).toBe(100);
  });

  it('awards 12 points per dollar at Grounded', () => {
    expect(calculateEarnedPoints(50, 'grounded')).toBe(600);
  });

  it('awards 15 points per dollar at Valley VIP', () => {
    expect(calculateEarnedPoints(50, 'valley-vip')).toBe(750);
  });

  it('applies a two-times promotion to the order points', () => {
    expect(calculateEarnedPoints(6.5, 'sprout', 2)).toBe(130);
  });

  it('uses the stated 2,000 and 5,000 earned-point tier thresholds', () => {
    expect(tierForEarnedPoints(1_999).id).toBe('sprout');
    expect(tierForEarnedPoints(2_000).id).toBe('grounded');
    expect(tierForEarnedPoints(4_999).id).toBe('grounded');
    expect(tierForEarnedPoints(5_000).id).toBe('valley-vip');
  });

  it('shows the points needed to reach the next tier', () => {
    expect(progressToNextTier(1_250).pointsToNext).toBe(750);
    expect(progressToNextTier(5_000).percent).toBe(100);
  });

  it('counts only positive points earned in the last 12 months', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    expect(
      earnedInLast12Months(
        [
          { delta: 100, type: 'bonus', created_at: '2026-01-01T00:00:00Z' },
          { delta: -150, type: 'redeem', created_at: '2026-02-01T00:00:00Z' },
          { delta: 500, type: 'earn', created_at: '2025-11-18T00:00:00Z' },
        ],
        now,
      ),
    ).toBe(100);
  });

  it('rejects negative purchase totals and invalid promotion multipliers', () => {
    expect(() => calculateEarnedPoints(-1, 'sprout')).toThrow(RangeError);
    expect(() => calculateEarnedPoints(5, 'sprout', 0.5)).toThrow(RangeError);
  });
});