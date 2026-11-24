import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Award, CalendarDays, Cake, Coffee, Copy, Gift, History, Megaphone, RefreshCw, Share2, Sparkles, Ticket, Users } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageTop } from '@/components/page-top';
import { QrImage } from '@/components/qr-image';
import { useAuth } from '@/lib/auth-context';
import { hasCompleteMemberProfile } from '@/lib/member-profile';
import { loyaltyTiers, progressToNextTier } from '@/lib/loyalty-rules';
import {
  codeState, daysLeft, formatDate, parseReferrals, parseSummary, referralLink, rewardAffordability,
  type MemberSummary, type ReferralSummary,
} from '@/lib/loyalty-format';

type MemberProfile = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name' | 'phone' | 'birthday' | 'member_id'>;
type ActivityEntry = Pick<Database['public']['Tables']['points_ledger']['Row'], 'id' | 'delta' | 'type' | 'description' | 'created_at'>;
type MemberReward = Pick<Database['public']['Tables']['rewards']['Row'], 'id' | 'name' | 'description' | 'points_cost'>;
type Promotion = Pick<Database['public']['Tables']['promotions']['Row'], 'id' | 'title' | 'multiplier' | 'end_date'>;
type MemberCode = {
  id: string; code: string; status: 'pending' | 'used' | 'expired'; created_at: string; expires_at: string;
  reward_name: string; reward_description: string; is_birthday: boolean;
};

type LoyaltyDashboard = {
  summary: MemberSummary;
  profile: MemberProfile;
  activity: ActivityEntry[];
  rewards: MemberReward[];
  codes: MemberCode[];
  referrals: ReferralSummary;
  promotions: Promotion[];
};

async function getDashboard(userId: string): Promise<LoyaltyDashboard> {
  // Read the summary first: it applies point expiry and issues the birthday reward before the lists below load.
  const summaryResult = await supabase.rpc('get_my_loyalty');
  if (summaryResult.error) throw new Error('Your member information could not be loaded. Please refresh and try again.');
  const summary = parseSummary(summaryResult.data);

  const nowIso = new Date().toISOString();
  const [profileResult, activityResult, rewardsResult, codesResult, referralsResult, promotionsResult] = await Promise.all([
    supabase.from('profiles').select('id,full_name,phone,birthday,member_id').eq('id', userId).maybeSingle(),
    supabase.from('points_ledger').select('id,delta,type,description,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(25),
    supabase.from('rewards').select('id,name,description,points_cost').eq('active', true).order('sort_order', { ascending: true }),
    supabase.rpc('get_my_redemptions'),
    supabase.rpc('get_my_referrals'),
    supabase.from('promotions').select('id,title,multiplier,end_date').lte('start_date', nowIso).gt('end_date', nowIso).order('end_date', { ascending: true }),
  ]);

  if (activityResult.error || rewardsResult.error || codesResult.error || referralsResult.error || promotionsResult.error || profileResult.error) {
    throw new Error('Your member information could not be loaded. Please refresh and try again.');
  }
  const referrals = parseReferrals(referralsResult.data);
  if (!summary || !profileResult.data || !referrals) {
    throw new Error('Your member profile is not ready yet. Please refresh and try again.');
  }

  return {
    summary,
    profile: profileResult.data,
    activity: activityResult.data ?? [],
    rewards: rewardsResult.data ?? [],
    codes: (codesResult.data ?? []).map((row) => ({
      id: row.r_id, code: row.r_code, status: row.r_status, created_at: row.r_created_at, expires_at: row.r_expires_at,
      reward_name: row.r_reward_name, reward_description: row.r_reward_description, is_birthday: row.r_is_birthday,
    })),
    referrals,
    promotions: promotionsResult.data ?? [],
  };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const earnWays = [
  'Earn 10 points per $1 at Sprout, 12 at Grounded and 15 at Valley VIP on purchases a barista verifies.',
  '100 points when you join and 100 more on your first verified purchase.',
  '200 points for you and 200 for a friend when they join with your code and make a first purchase.',
  'Look out for double-points days: boosts apply automatically.',
] as const;

export function LoyaltyPage() {
  const { user, isLoading: authLoading } = useAuth();
  const dashboardQuery = useQuery({
    queryKey: ['loyalty-dashboard', user?.id],
    enabled: Boolean(user),
    queryFn: () => user ? getDashboard(user.id) : Promise.reject(new Error('Sign in to view your account.')),
  });

  if (authLoading) {
    return <><PageTop kicker="VALLEY GROUNDS REWARDS" title="YOUR VALLEY." description="Loading your member account…" /><section className="section" aria-live="polite">Loading your points…</section></>;
  }

  if (!user) return <LoyaltyPublicView />;

  if (dashboardQuery.isPending) {
    return <><PageTop kicker="VALLEY GROUNDS REWARDS" title="YOUR VALLEY." description="Loading your member account…" /><section className="section" aria-live="polite">Loading your points…</section></>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <>
        <PageTop kicker="VALLEY GROUNDS REWARDS" title="YOUR VALLEY." description="Your member account is temporarily unavailable." />
        <section className="section loyalty-load-error">
          <p role="alert">{dashboardQuery.error instanceof Error ? dashboardQuery.error.message : 'Please try again in a moment.'}</p>
          <Button variant="brand" onClick={() => void dashboardQuery.refetch()}><RefreshCw /> TRY AGAIN</Button>
        </section>
      </>
    );
  }

  return <MemberDashboard data={dashboardQuery.data} refetch={async () => { await dashboardQuery.refetch(); }} />;
}

function LoyaltyPublicView() {
  const rewardsQuery = useQuery({
    queryKey: ['public-rewards'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rewards').select('id,name,description,points_cost').eq('active', true).order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  const rewards = rewardsQuery.data ?? [];

  return (
    <>
      <PageTop kicker="GOOD COFFEE COMES WITH GOOD PERKS." title="JOIN THE VALLEY." description="Your daily ritual, rewarded. Earn points, climb tiers and enjoy a free drink on your birthday." />
      <section className="section loyalty-join">
        <div><Award size={34} className="text-primary" /><h2>YOUR NEXT CUP COUNTS.</h2><p>Member accounts keep your points, tier, reward codes and birthday details together.</p></div>
        <Button asChild variant="brand" size="lg"><Link to="/auth">SIGN IN OR JOIN <Sparkles /></Link></Button>
      </section>

      <section className="section loyalty-public">
        <div className="loyalty-section-heading"><div><span className="section-kicker">HOW YOU EARN</span><h2>EVERY VISIT ADDS UP.</h2></div></div>
        <ul className="loyalty-earn-list">{earnWays.map((way) => <li key={way}><Sparkles aria-hidden="true" size={15} />{way}</li>)}</ul>
      </section>

      <section className="section loyalty-public">
        <div className="loyalty-section-heading"><div><span className="section-kicker">THREE TIERS, BASED ON POINTS EARNED IN 12 MONTHS</span><h2>FIND YOUR TIER.</h2></div></div>
        <div className="loyalty-table-wrap">
          <table className="loyalty-tier-table">
            <caption className="sr-only">Compare Valley Grounds loyalty tiers</caption>
            <thead><tr><th scope="col">Tier</th><th scope="col">Points earned</th><th scope="col">Points per $1</th><th scope="col">Perks</th></tr></thead>
            <tbody>
              {loyaltyTiers.map((tier) => (
                <tr key={tier.id}>
                  <th scope="row">{tier.name}</th>
                  <td>{tier.maxEarned === null ? `${tier.minEarned.toLocaleString()}+` : `${tier.minEarned.toLocaleString()} to ${tier.maxEarned.toLocaleString()}`}</td>
                  <td>{tier.pointsPerDollar}</td>
                  <td>{tier.perks.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section loyalty-public">
        <div className="loyalty-section-heading"><div><span className="section-kicker">SPEND YOUR POINTS</span><h2>REWARDS LADDER.</h2></div></div>
        {rewardsQuery.isPending ? <p className="loyalty-empty" aria-live="polite">Loading rewards…</p> : rewards.length ? (
          <div className="reward-grid loyalty-reward-grid">
            {rewards.map((reward, index) => (
              <article key={reward.id} className="reward-item loyalty-reward-item">
                {index % 2 === 0 ? <Coffee aria-hidden="true" size={27} className="text-primary" /> : <Gift aria-hidden="true" size={27} className="text-primary" />}
                <h3>{reward.name}</h3>
                <p className="text-sm text-muted-foreground">{reward.description}</p>
                <div className="loyalty-reward-cost">{reward.points_cost.toLocaleString()} <span>POINTS</span></div>
              </article>
            ))}
          </div>
        ) : <p className="loyalty-empty">Rewards are being updated. Please check back soon.</p>}
        <Button asChild variant="brand" size="lg"><Link to="/auth">JOIN THE VALLEY <Sparkles /></Link></Button>
      </section>
    </>
  );
}

function MemberDashboard({ data, refetch }: { data: LoyaltyDashboard; refetch: () => Promise<void> }) {
  const { summary, profile, activity, rewards, codes, referrals, promotions } = data;
  const [confirming, setConfirming] = useState<MemberReward | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState('');
  const [redeemNotice, setRedeemNotice] = useState('');

  const progress = progressToNextTier(summary.earned_12m);
  const tier = loyaltyTiers.find((item) => item.id === summary.tier) ?? progress.current;
  const profileComplete = hasCompleteMemberProfile(profile);
  const now = new Date();
  const readyCodes = codes.filter((code) => codeState(code.status, code.expires_at, now) === 'ready');
  const pastCodes = codes.filter((code) => codeState(code.status, code.expires_at, now) !== 'ready');
  const birthdayCode = readyCodes.find((code) => code.is_birthday);

  const redeem = async (reward: MemberReward) => {
    setConfirming(null);
    setRedeeming(true);
    setRedeemError('');
    setRedeemNotice('');
    const { data: result, error } = await supabase.rpc('redeem_reward', { _reward_id: reward.id });
    if (error) {
      setRedeemError(error.message || 'We could not redeem that reward. Please try again.');
    } else {
      const row = result?.[0];
      setRedeemNotice(row ? `${reward.name} redeemed. Your code is ${row.redemption_code}. Show it at the counter within 30 days.` : `${reward.name} redeemed.`);
    }
    try {
      await refetch();
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <>
      <PageTop kicker="GOOD COFFEE COMES WITH GOOD PERKS." title="YOUR VALLEY." description={`Welcome back${profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}. Your member account is grounded and ready.`} />
      <section className="section loyalty-dashboard">
        {!profileComplete && <ProfileCompletionForm profile={profile} onSaved={refetch} />}

        {promotions.map((promotion) => (
          <div key={promotion.id} className="loyalty-banner" role="status">
            <Megaphone aria-hidden="true" size={22} />
            <div><strong>{promotion.title}</strong><span>{promotion.multiplier}× points on verified purchases until {formatDate(promotion.end_date)}.</span></div>
          </div>
        ))}

        {birthdayCode && (
          <div className="loyalty-banner loyalty-banner-birthday">
            <Cake aria-hidden="true" size={22} />
            <div><strong>Happy birthday month: a free drink is waiting.</strong><span>Show code {birthdayCode.code} at the counter. {daysLeft(birthdayCode.expires_at)} days left.</span></div>
          </div>
        )}

        <div className="loyalty-account-line">
          <div><span className="section-kicker">MEMBER ID</span><strong>{profile.member_id}</strong></div>
          <div><span className="section-kicker">ACTIVE BOOST</span><strong>{summary.multiplier > 1 ? `${summary.multiplier}× points` : 'Standard points'}</strong></div>
          {summary.is_staff && <Button asChild variant="outline" size="sm"><Link to="/staff">STAFF TOOLS</Link></Button>}
          <Button variant="ghost" size="sm" onClick={() => void refetch()} aria-label="Refresh loyalty account"><RefreshCw /> REFRESH</Button>
        </div>

        <div className="loyalty-overview">
          <div className="loyalty-balance">
            <span className="section-kicker">YOUR VALLEY POINTS</span>
            <strong>{summary.balance.toLocaleString()}</strong>
            <span>available points</span>
          </div>
          <div className="loyalty-tier-panel">
            <div className="loyalty-tier-heading"><div><span className="section-kicker">CURRENT TIER</span><h2>{tier.name}</h2></div><Award aria-hidden="true" size={34} className="text-primary" /></div>
            <p>{tier.pointsPerDollar} points per $1 on verified purchases</p>
            <progress className="loyalty-progress" max={100} value={progress.percent} aria-label={`Tier progress ${progress.percent}%`} />
            <div className="loyalty-progress-copy">
              <span>{summary.earned_12m.toLocaleString()} earned in the last 12 months</span>
              <span>{progress.next ? `${progress.pointsToNext.toLocaleString()} to ${progress.next.name}` : 'Top tier reached'}</span>
            </div>
            <ul className="loyalty-perks">{tier.perks.map((perk) => <li key={perk}><Sparkles aria-hidden="true" size={14} />{perk}</li>)}</ul>
          </div>
        </div>

        <div className="loyalty-pass">
          <QrImage value={profile.member_id} label={`Member QR code for member ID ${profile.member_id}`} size={150} />
          <div>
            <span className="section-kicker">YOUR MEMBER PASS</span>
            <h2>SHOW THIS AT THE COUNTER.</h2>
            <p>A barista scans this code or looks up member ID <strong>{profile.member_id}</strong> to add points to a purchase. Online demo orders do not earn points.</p>
          </div>
        </div>

        <div className="loyalty-metrics">
          <article className="loyalty-metric"><CalendarDays aria-hidden="true" /><span>POINTS EXPIRING</span><strong>{summary.expiring_points.toLocaleString()}</strong><small>{summary.tier === 'valley-vip' ? 'VIP points never expire' : summary.expiring_points > 0 ? `Next expiration: ${formatDate(summary.expires_on)}` : 'Nothing expiring soon'}</small></article>
          <article className="loyalty-metric"><Ticket aria-hidden="true" /><span>UNUSED CODES</span><strong>{readyCodes.length}</strong><small>Ready to show at the counter</small></article>
          <article className="loyalty-metric"><Users aria-hidden="true" /><span>FRIENDS JOINED</span><strong>{referrals.credited}</strong><small>{referrals.pending > 0 ? `${referrals.pending} waiting on a first purchase` : 'Referral bonuses earned'}</small></article>
        </div>

        <section className="loyalty-content-section" aria-labelledby="codes-title">
          <div className="loyalty-section-heading"><div><span className="section-kicker">READY WHEN YOU ARE</span><h2 id="codes-title">YOUR REWARD CODES</h2></div></div>
          {redeemNotice && <p className="auth-message auth-notice" role="status">{redeemNotice}</p>}
          {redeemError && <p className="auth-message auth-error" role="alert">{redeemError}</p>}
          {readyCodes.length ? (
            <div className="loyalty-code-grid">
              {readyCodes.map((code) => (
                <article key={code.id} className="loyalty-code-card">
                  <QrImage value={code.code} label={`QR code for reward code ${code.code}`} size={112} />
                  <div>
                    <h3>{code.reward_name}</h3>
                    <strong className="loyalty-code-text">{code.code}</strong>
                    <small>Expires {formatDate(code.expires_at)} · {daysLeft(code.expires_at)} days left</small>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="loyalty-empty">No unused codes. Redeem a reward below and it will show up here.</p>}
          {pastCodes.length > 0 && (
            <details className="loyalty-past-codes">
              <summary><History aria-hidden="true" size={14} /> Redemption history ({pastCodes.length})</summary>
              <ul className="loyalty-activity-list">
                {pastCodes.map((code) => (
                  <li key={code.id} className="loyalty-activity-row">
                    <div><strong>{code.reward_name}</strong><span>{formatDate(code.created_at)} · code {code.code}</span></div>
                    <strong className="loyalty-negative">{codeState(code.status, code.expires_at, now) === 'used' ? 'Used' : 'Expired'}</strong>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="loyalty-content-section" aria-labelledby="rewards-title">
          <div className="loyalty-section-heading"><div><span className="section-kicker">A LITTLE SOMETHING FOR YOUR NEXT VISIT</span><h2 id="rewards-title">REWARDS CATALOG</h2></div></div>
          {rewards.length ? (
            <div className="reward-grid loyalty-reward-grid">
              {rewards.map((reward, index) => {
                const { canAfford, shortBy } = rewardAffordability(summary.balance, reward.points_cost);
                return (
                  <article key={reward.id} className="reward-item loyalty-reward-item">
                    {index % 2 === 0 ? <Coffee aria-hidden="true" size={27} className="text-primary" /> : <Gift aria-hidden="true" size={27} className="text-primary" />}
                    <h3>{reward.name}</h3>
                    <p className="text-sm text-muted-foreground">{reward.description}</p>
                    <div className="loyalty-reward-cost">{reward.points_cost.toLocaleString()} <span>POINTS</span></div>
                    {canAfford
                      ? <Button variant="brand" className="loyalty-redeem" disabled={redeeming} onClick={() => setConfirming(reward)}>REDEEM</Button>
                      : <p className="loyalty-short">{shortBy.toLocaleString()} more points to go</p>}
                  </article>
                );
              })}
            </div>
          ) : <p className="loyalty-empty">No rewards are available right now.</p>}
        </section>

        <ReferralCard referrals={referrals} />

        <section className="loyalty-content-section" aria-labelledby="activity-title">
          <div className="loyalty-section-heading"><div><span className="section-kicker">YOUR POINTS, ACCOUNTED FOR</span><h2 id="activity-title">POINTS HISTORY</h2></div></div>
          {activity.length ? (
            <ul className="loyalty-activity-list">
              {activity.map((entry) => (
                <li key={entry.id} className="loyalty-activity-row">
                  <div><strong>{entry.description}</strong><span>{formatDate(entry.created_at)} · {entry.type.replace('_', ' ')}</span></div>
                  <strong className={entry.delta > 0 ? 'loyalty-positive' : 'loyalty-negative'}>{entry.delta > 0 ? '+' : '−'}{Math.abs(entry.delta).toLocaleString()}</strong>
                </li>
              ))}
            </ul>
          ) : <p className="loyalty-empty">Your point activity will appear here.</p>}
        </section>
      </section>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redeem {confirming?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This uses {confirming?.points_cost.toLocaleString()} points. You will get a code that is valid for 30 days. Points are not refunded if the code expires.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirming) void redeem(confirming); }}>Redeem</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReferralCard({ referrals }: { referrals: ReferralSummary }) {
  const [status, setStatus] = useState('');
  const link = referralLink(typeof window === 'undefined' ? '' : window.location.origin, referrals.code);

  const copy = async (text: string, label: string) => {
    setStatus((await copyText(text)) ? `${label} copied.` : 'Copy is not available here. Select the text and copy it manually.');
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Join me at Valley Grounds Coffee', text: `Join the Valley with my code ${referrals.code} and we both earn 200 points.`, url: link });
    } catch {
      /* The person closed the share sheet. */
    }
  };

  return (
    <section className="loyalty-content-section" aria-labelledby="referral-title">
      <div className="loyalty-section-heading"><div><span className="section-kicker">COFFEE IS BETTER SHARED</span><h2 id="referral-title">REFER A FRIEND</h2></div></div>
      <div className="loyalty-referral">
        <div>
          <p>When a friend joins with your code and makes their first verified purchase, you both get 200 points.</p>
          <div className="loyalty-referral-code"><span className="section-kicker">YOUR CODE</span><strong>{referrals.code}</strong></div>
        </div>
        <div className="loyalty-referral-actions">
          <Button variant="outline" onClick={() => void copy(referrals.code, 'Code')}><Copy /> COPY CODE</Button>
          <Button variant="outline" onClick={() => void copy(link, 'Link')}><Copy /> COPY LINK</Button>
          {typeof navigator !== 'undefined' && 'share' in navigator && <Button variant="brand" onClick={() => void share()}><Share2 /> SHARE</Button>}
        </div>
        <p className="loyalty-referral-status" role="status">{status}</p>
      </div>
    </section>
  );
}

function ProfileCompletionForm({ profile, onSaved }: { profile: MemberProfile; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [birthday, setBirthday] = useState(profile.birthday ?? '');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!fullName.trim() || !phone.trim()) {
      setError('Add your full name and phone number to continue.');
      return;
    }
    if (!profile.birthday) {
      const day = new Date(`${birthday}T00:00:00`);
      if (!birthday || Number.isNaN(day.getTime()) || day > new Date() || birthday < '1900-01-01') {
        setError('Enter a valid birthday.');
        return;
      }
    }

    setBusy(true);
    try {
      const { error: profileError } = await supabase.from('profiles').update({ full_name: fullName.trim(), phone: phone.trim() }).eq('id', profile.id);
      if (profileError) throw profileError;
      if (!profile.birthday) {
        const { error: birthdayError } = await supabase.rpc('set_my_birthday', { _birthday: birthday });
        if (birthdayError) throw birthdayError;
      }
      await onSaved();
    } catch {
      setError('We could not save those details. Please check the information and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="profile-completion" onSubmit={(event) => void handleSubmit(event)}>
      <div><span className="section-kicker">ONE LAST STEP</span><h2>COMPLETE YOUR MEMBER PROFILE.</h2><p>Add your name, phone number and birthday to finish setting up your rewards account.</p></div>
      <div className="profile-completion-fields">
        <div className="auth-field"><Label htmlFor="profile-full-name">Full name</Label><Input id="profile-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={100} autoComplete="name" required disabled={busy} /></div>
        <div className="auth-field"><Label htmlFor="profile-phone">Phone number</Label><Input id="profile-phone" value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" minLength={7} maxLength={20} pattern="[0-9+() .-]{7,20}" title="Enter a phone number with 7 to 20 digits or phone punctuation." autoComplete="tel" required disabled={busy} /></div>
        {!profile.birthday && <div className="auth-field"><Label htmlFor="profile-birthday">Birthday</Label><Input id="profile-birthday" value={birthday} onChange={(event) => setBirthday(event.target.value)} type="date" min="1900-01-01" required disabled={busy} /></div>}
      </div>
      {error && <p className="auth-message auth-error" role="alert">{error}</p>}
      <Button type="submit" variant="brand" disabled={busy}>{busy ? 'SAVING…' : 'SAVE MEMBER DETAILS'} <Sparkles /></Button>
    </form>
  );
}
