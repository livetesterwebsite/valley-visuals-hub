import type { Json } from '@/integrations/supabase/types';
import type { LoyaltyTierId } from '@/lib/loyalty-rules';

export type MemberSummary = {
  balance: number;
  earned_12m: number;
  tier: LoyaltyTierId;
  multiplier: number;
  expiring_points: number;
  expires_on: string | null;
  is_staff: boolean;
  is_admin: boolean;
};

export type ReferralSummary = { code: string; credited: number; pending: number };

export function parseSummary(value: Json): MemberSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const balance = value['balance'];
  const earned = value['earned_12m'];
  const tier = value['tier'];
  const multiplier = value['multiplier'];
  const expiringPoints = value['expiring_points'];
  const expiresOn = value['expires_on'];
  if (
    typeof balance !== 'number' || typeof earned !== 'number' ||
    (tier !== 'sprout' && tier !== 'grounded' && tier !== 'valley-vip') ||
    typeof multiplier !== 'number'
  ) return null;
  return {
    balance,
    earned_12m: earned,
    tier,
    multiplier,
    // The database returns null for these when a member has nothing that can expire.
    expiring_points: typeof expiringPoints === 'number' ? expiringPoints : 0,
    expires_on: typeof expiresOn === 'string' ? expiresOn : null,
    is_staff: value['is_staff'] === true,
    is_admin: value['is_admin'] === true,
  };
}

export function parseReferrals(value: Json): ReferralSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const code = value['code'];
  const credited = value['credited'];
  const pending = value['pending'];
  if (typeof code !== 'string' || typeof credited !== 'number' || typeof pending !== 'number') return null;
  return { code, credited, pending };
}

export function formatDate(value: string | null) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function rewardAffordability(balance: number, cost: number) {
  const shortBy = Math.max(0, cost - Math.max(0, balance));
  return { canAfford: shortBy === 0, shortBy };
}

export type CodeState = 'ready' | 'used' | 'expired';

export function codeState(status: 'pending' | 'used' | 'expired', expiresAt: string, now: Date = new Date()): CodeState {
  if (status === 'used') return 'used';
  if (status === 'expired') return 'expired';
  return new Date(expiresAt).getTime() <= now.getTime() ? 'expired' : 'ready';
}

export function daysLeft(expiresAt: string, now: Date = new Date()) {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

const REFERRAL_PATTERN = /^VG[0-9A-F]{6}$/;

/** Returns a normalized referral code from a URL search string, or '' when it is missing or malformed. */
export function referralFromSearch(search: string): string {
  const raw = new URLSearchParams(search).get('ref') ?? '';
  const code = raw.trim().toUpperCase();
  return REFERRAL_PATTERN.test(code) ? code : '';
}

export function referralLink(origin: string, code: string) {
  return `${origin}/auth?ref=${encodeURIComponent(code)}`;
}

/** Dollar amount typed by staff -> a number, or null if it is not a valid purchase amount. */
export function parsePurchaseAmount(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, '');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return amount > 0 && amount <= 1000 ? amount : null;
}
