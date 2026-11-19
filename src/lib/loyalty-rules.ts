export type LoyaltyTierId = 'sprout' | 'grounded' | 'valley-vip';

export type LoyaltyEntry = {
  delta: number;
  type: 'earn' | 'redeem' | 'bonus' | 'birthday' | 'referral' | 'expire' | 'adjustment';
  created_at: string;
};

export const loyaltyTiers: ReadonlyArray<{
  id: LoyaltyTierId;
  name: string;
  minEarned: number;
  maxEarned: number | null;
  pointsPerDollar: number;
  perks: readonly string[];
}> = [
  {
    id: 'sprout',
    name: 'Sprout',
    minEarned: 0,
    maxEarned: 1_999,
    pointsPerDollar: 10,
    perks: ['10 points for every $1 spent', 'Birthday reward'],
  },
  {
    id: 'grounded',
    name: 'Grounded',
    minEarned: 2_000,
    maxEarned: 4_999,
    pointsPerDollar: 12,
    perks: ['12 points for every $1 spent', 'One free drink customization each month'],
  },
  {
    id: 'valley-vip',
    name: 'Valley VIP',
    minEarned: 5_000,
    maxEarned: null,
    pointsPerDollar: 15,
    perks: [
      '15 points for every $1 spent',
      'One free size upgrade each month',
      'Early access to new drinks',
      'Birthday reward valid for 60 days',
      'Points never expire',
    ],
  },
];

export const loyaltyRewards: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  pointsCost: number;
}> = [
  { id: 'size-upgrade', name: 'Free size upgrade', description: 'Make your favorite sip a little bigger.', pointsCost: 150 },
  { id: 'drink-customization', name: 'Free drink customization', description: 'Add a shot, syrup, or cold foam.', pointsCost: 250 },
  { id: 'three-off', name: '$3 off any order', description: 'A little something off your next café run.', pointsCost: 400 },
  { id: 'handcrafted-drink', name: 'Free handcrafted drink', description: 'One Valley favorite, on us.', pointsCost: 600 },
  { id: 'drink-and-pastry', name: 'Free drink + pastry', description: 'The perfect coffee date, covered.', pointsCost: 900 },
  { id: 'merch', name: 'Valley Grounds merch', description: 'Take a little Valley energy with you.', pointsCost: 1_500 },
];

const tierById = new Map(loyaltyTiers.map((tier) => [tier.id, tier]));

export function tierForEarnedPoints(earnedPoints: number): (typeof loyaltyTiers)[number] {
  const safePoints = Math.max(0, Math.floor(earnedPoints));
  return [...loyaltyTiers].reverse().find((tier) => safePoints >= tier.minEarned) ?? loyaltyTiers[0];
}

export function progressToNextTier(earnedPoints: number) {
  const safePoints = Math.max(0, Math.floor(earnedPoints));
  const current = tierForEarnedPoints(safePoints);
  const currentIndex = loyaltyTiers.findIndex((tier) => tier.id === current.id);
  const next = loyaltyTiers[currentIndex + 1] ?? null;

  if (!next) {
    return { current, next: null, pointsToNext: 0, percent: 100 };
  }

  const tierWidth = next.minEarned - current.minEarned;
  const tierProgress = safePoints - current.minEarned;
  return {
    current,
    next,
    pointsToNext: Math.max(0, next.minEarned - safePoints),
    percent: Math.min(100, Math.max(0, Math.floor((tierProgress / tierWidth) * 100))),
  };
}

export function calculateEarnedPoints(
  subtotal: number,
  tierId: LoyaltyTierId,
  promotionMultiplier = 1,
): number {
  const tier = tierById.get(tierId);
  if (!tier || !Number.isFinite(subtotal) || subtotal < 0) {
    throw new RangeError('Enter a valid order amount and loyalty tier.');
  }
  if (!Number.isFinite(promotionMultiplier) || promotionMultiplier < 1) {
    throw new RangeError('Promotion multipliers must be at least 1.');
  }
  return Math.floor(subtotal * tier.pointsPerDollar * promotionMultiplier);
}

export function earnedInLast12Months(entries: readonly LoyaltyEntry[], now: Date = new Date()): number {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 12);
  const earningTypes = new Set(['earn', 'bonus', 'birthday', 'referral', 'adjustment']);

  return entries.reduce((sum, entry) => {
    const createdAt = new Date(entry.created_at);
    if (entry.delta <= 0 || !earningTypes.has(entry.type) || createdAt < cutoff || createdAt > now) {
      return sum;
    }
    return sum + entry.delta;
  }, 0);
}