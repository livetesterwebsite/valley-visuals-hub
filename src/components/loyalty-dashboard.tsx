import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Award, CalendarDays, Coffee, Gift, History, RefreshCw, Sparkles } from 'lucide-react';
import type { Database, Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageTop } from '@/components/page-top';
import { useAuth } from '@/lib/auth-context';
import { hasCompleteMemberProfile } from '@/lib/member-profile';
import { loyaltyTiers, progressToNextTier, type LoyaltyTierId } from '@/lib/loyalty-rules';

type MemberSummary = {
  balance: number;
  earned_12m: number;
  tier: LoyaltyTierId;
  multiplier: number;
  expiring_points: number;
  expires_on: string | null;
};

type MemberProfile = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name' | 'phone' | 'birthday' | 'member_id'>;
type ActivityEntry = Pick<Database['public']['Tables']['points_ledger']['Row'], 'id' | 'delta' | 'type' | 'description' | 'created_at'>;
type MemberReward = Pick<Database['public']['Tables']['rewards']['Row'], 'id' | 'name' | 'description' | 'points_cost'>;

type LoyaltyDashboard = {
  summary: MemberSummary;
  profile: MemberProfile;
  activity: ActivityEntry[];
  rewards: MemberReward[];
};

function parseSummary(value: Json): MemberSummary | null {
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
    typeof multiplier !== 'number' || typeof expiringPoints !== 'number' ||
    (expiresOn !== null && typeof expiresOn !== 'string')
  ) return null;
  return { balance, earned_12m: earned, tier, multiplier, expiring_points: expiringPoints, expires_on: expiresOn };
}

async function getDashboard(userId: string): Promise<LoyaltyDashboard> {
  const [summaryResult, profileResult, activityResult, rewardsResult] = await Promise.all([
    supabase.rpc('get_my_loyalty'),
    supabase.from('profiles').select('id,full_name,phone,birthday,member_id').eq('id', userId).maybeSingle(),
    supabase.from('points_ledger').select('id,delta,type,description,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(8),
    supabase.from('rewards').select('id,name,description,points_cost').eq('active', true).order('sort_order', { ascending: true }),
  ]);

  if (summaryResult.error || profileResult.error || activityResult.error || rewardsResult.error) {
    throw new Error('Your member information could not be loaded. Please refresh and try again.');
  }
  const summary = parseSummary(summaryResult.data);
  if (!summary || !profileResult.data) {
    throw new Error('Your member profile is not ready yet. Please refresh and try again.');
  }
  return {
    summary,
    profile: profileResult.data,
    activity: activityResult.data ?? [],
    rewards: rewardsResult.data ?? [],
  };
}

function formatDate(value: string | null) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

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

  if (!user) {
    return (
      <>
        <PageTop kicker="GOOD COFFEE COMES WITH GOOD PERKS." title="JOIN THE VALLEY." description="Your daily ritual, rewarded. Create an account or sign in to see your real points." />
        <section className="section loyalty-join">
          <div><Award size={34} className="text-primary" /><h2>YOUR NEXT CUP COUNTS.</h2><p>Member accounts keep your points, tier and birthday details together.</p></div>
          <Button asChild variant="brand" size="lg"><Link to="/auth">SIGN IN OR JOIN <Sparkles /></Link></Button>
        </section>
      </>
    );
  }

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

  const { summary, profile, activity, rewards } = dashboardQuery.data;
  const progress = progressToNextTier(summary.earned_12m);
  const tier = loyaltyTiers.find((item) => item.id === summary.tier) ?? progress.current;
  const profileComplete = hasCompleteMemberProfile(profile);

  return (
    <>
      <PageTop kicker="GOOD COFFEE COMES WITH GOOD PERKS." title="YOUR VALLEY." description={`Welcome back${profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}. Your member account is grounded and ready.`} />
      <section className="section loyalty-dashboard">
        {!profileComplete && <ProfileCompletionForm profile={profile} onSaved={async () => { await dashboardQuery.refetch(); }} />}

        <div className="loyalty-account-line">
          <div><span className="section-kicker">MEMBER ID</span><strong>{profile.member_id}</strong></div>
          <div><span className="section-kicker">ACTIVE BOOST</span><strong>{summary.multiplier > 1 ? `${summary.multiplier}× points` : 'Standard points'}</strong></div>
          <Button variant="ghost" size="sm" onClick={() => void dashboardQuery.refetch()} aria-label="Refresh loyalty account"><RefreshCw /> REFRESH</Button>
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

        <div className="loyalty-metrics">
          <article className="loyalty-metric"><CalendarDays aria-hidden="true" /><span>POINTS EXPIRING</span><strong>{summary.expiring_points.toLocaleString()}</strong><small>{summary.tier === 'valley-vip' ? 'VIP points never expire' : `Next expiration: ${formatDate(summary.expires_on)}`}</small></article>
          <article className="loyalty-metric"><History aria-hidden="true" /><span>RECENT ACTIVITY</span><strong>{activity.length}</strong><small>Latest point entries</small></article>
          <article className="loyalty-metric"><Gift aria-hidden="true" /><span>REWARDS</span><strong>{rewards.length}</strong><small>Available in the rewards catalog</small></article>
        </div>

        <section className="loyalty-content-section" aria-labelledby="activity-title">
          <div className="loyalty-section-heading"><div><span className="section-kicker">YOUR POINTS, ACCOUNTED FOR</span><h2 id="activity-title">RECENT ACTIVITY</h2></div></div>
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

        <section className="loyalty-content-section" aria-labelledby="rewards-title">
          <div className="loyalty-section-heading"><div><span className="section-kicker">A LITTLE SOMETHING FOR YOUR NEXT VISIT</span><h2 id="rewards-title">REWARDS CATALOG</h2></div></div>
          {rewards.length ? (
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
          ) : <p className="loyalty-empty">No rewards are available right now.</p>}
        </section>
      </section>
    </>
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