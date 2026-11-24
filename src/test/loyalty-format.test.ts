import { describe, expect, it } from 'vitest';
import {
  codeState, daysLeft, parsePurchaseAmount, parseReferrals, parseSummary, referralFromSearch, referralLink, rewardAffordability,
} from '@/lib/loyalty-format';

describe('loyalty summary parsing', () => {
  it('accepts null expiry fields, which the database returns for VIP members and empty balances', () => {
    const summary = parseSummary({ balance: 0, earned_12m: 100, tier: 'valley-vip', multiplier: 1, expiring_points: null, expires_on: null, is_staff: false, is_admin: false });
    expect(summary).toMatchObject({ expiring_points: 0, expires_on: null, tier: 'valley-vip' });
  });

  it('rejects an unknown tier or missing balance', () => {
    expect(parseSummary({ balance: 10, earned_12m: 0, tier: 'gold', multiplier: 1 })).toBeNull();
    expect(parseSummary({ earned_12m: 0, tier: 'sprout', multiplier: 1 })).toBeNull();
    expect(parseSummary(null)).toBeNull();
  });

  it('reads staff and admin flags only when they are true', () => {
    const base = { balance: 5, earned_12m: 5, tier: 'sprout', multiplier: 1 };
    expect(parseSummary({ ...base, is_staff: true, is_admin: false })).toMatchObject({ is_staff: true, is_admin: false });
    expect(parseSummary({ ...base })).toMatchObject({ is_staff: false, is_admin: false });
  });
});

describe('referrals', () => {
  it('parses the referral summary', () => {
    expect(parseReferrals({ code: 'VGAB12CD', credited: 2, pending: 1 })).toEqual({ code: 'VGAB12CD', credited: 2, pending: 1 });
    expect(parseReferrals({ code: 'VGAB12CD' })).toBeNull();
  });

  it('accepts only well-formed referral codes from the URL', () => {
    expect(referralFromSearch('?ref=vgab12cd')).toBe('VGAB12CD');
    expect(referralFromSearch('?ref=NOTACODE')).toBe('');
    expect(referralFromSearch('?ref=VGAB12C')).toBe('');
    expect(referralFromSearch('')).toBe('');
  });

  it('builds a shareable link', () => {
    expect(referralLink('https://example.com', 'VGAB12CD')).toBe('https://example.com/auth?ref=VGAB12CD');
  });
});

describe('rewards and codes', () => {
  it('reports how many points are missing for a reward', () => {
    expect(rewardAffordability(600, 600)).toEqual({ canAfford: true, shortBy: 0 });
    expect(rewardAffordability(599, 600)).toEqual({ canAfford: false, shortBy: 1 });
    expect(rewardAffordability(-5, 150)).toEqual({ canAfford: false, shortBy: 150 });
  });

  it('treats a pending code past its expiry as expired', () => {
    const now = new Date('2026-11-24T12:00:00Z');
    expect(codeState('pending', '2026-12-01T00:00:00Z', now)).toBe('ready');
    expect(codeState('pending', '2026-11-24T11:59:59Z', now)).toBe('expired');
    expect(codeState('used', '2026-12-01T00:00:00Z', now)).toBe('used');
    expect(codeState('expired', '2026-12-01T00:00:00Z', now)).toBe('expired');
  });

  it('counts whole days left, never below zero', () => {
    const now = new Date('2026-11-24T12:00:00Z');
    expect(daysLeft('2026-11-27T12:00:00Z', now)).toBe(3);
    expect(daysLeft('2026-11-24T18:00:00Z', now)).toBe(1);
    expect(daysLeft('2026-11-20T00:00:00Z', now)).toBe(0);
  });
});

describe('staff purchase amounts', () => {
  it('accepts normal dollar amounts', () => {
    expect(parsePurchaseAmount('12.50')).toBe(12.5);
    expect(parsePurchaseAmount('$7')).toBe(7);
    expect(parsePurchaseAmount('1000')).toBe(1000);
  });

  it('rejects zero, negatives, too many decimals, over $1,000 and text', () => {
    expect(parsePurchaseAmount('0')).toBeNull();
    expect(parsePurchaseAmount('-5')).toBeNull();
    expect(parsePurchaseAmount('5.999')).toBeNull();
    expect(parsePurchaseAmount('1000.01')).toBeNull();
    expect(parsePurchaseAmount('abc')).toBeNull();
    expect(parsePurchaseAmount('')).toBeNull();
  });
});
