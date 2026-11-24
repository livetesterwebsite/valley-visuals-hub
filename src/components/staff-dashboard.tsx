import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, RefreshCw, ScanLine, Search, Sparkles, Ticket, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageTop } from '@/components/page-top';
import { useAuth } from '@/lib/auth-context';
import { formatDate, parsePurchaseAmount, parseSummary } from '@/lib/loyalty-format';
import { calculateEarnedPoints, loyaltyTiers, type LoyaltyTierId } from '@/lib/loyalty-rules';
import { lookupMember, lookupRedemption, type StaffMember, type StaffRedemption } from '@/lib/staff.functions';

const BIRTHDAY_REWARD_NAME = 'Birthday drink';

export function StaffPage() {
  const { user, isLoading } = useAuth();
  const roleQuery = useQuery({
    queryKey: ['staff-role', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_loyalty');
      if (error) throw error;
      const summary = parseSummary(data);
      return { isStaff: Boolean(summary?.is_staff), isAdmin: Boolean(summary?.is_admin) };
    },
  });

  if (isLoading || (user && roleQuery.isPending)) {
    return <><PageTop kicker="VALLEY GROUNDS TEAM" title="STAFF TOOLS." description="Checking your access…" /><section className="section" aria-live="polite">Loading…</section></>;
  }
  if (!user) {
    return (
      <>
        <PageTop kicker="VALLEY GROUNDS TEAM" title="STAFF TOOLS." description="Sign in with your staff account to continue." />
        <section className="section"><Button asChild variant="brand" size="lg"><Link to="/auth">SIGN IN</Link></Button></section>
      </>
    );
  }
  if (roleQuery.isError) {
    return <><PageTop kicker="VALLEY GROUNDS TEAM" title="STAFF TOOLS." description="We could not check your access." /><section className="section loyalty-load-error"><p role="alert">Please try again in a moment.</p><Button variant="brand" onClick={() => void roleQuery.refetch()}><RefreshCw /> TRY AGAIN</Button></section></>;
  }
  if (!roleQuery.data?.isStaff && !roleQuery.data?.isAdmin) {
    return <><PageTop kicker="VALLEY GROUNDS TEAM" title="STAFF ONLY." description="This area is for Valley Grounds team members." /><section className="section"><Button asChild variant="outline"><Link to="/loyalty">BACK TO MY REWARDS</Link></Button></section></>;
  }

  return (
    <>
      <PageTop kicker="VALLEY GROUNDS TEAM" title="STAFF TOOLS." description="Look up members, add points for verified purchases and validate reward codes." />
      <section className="section staff-layout">
        <MemberDesk />
        <CodeDesk />
        <RecentAwards />
        {roleQuery.data.isAdmin && <><PromotionsAdmin /><RewardsAdmin /></>}
      </section>
    </>
  );
}

function MemberDesk() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [members, setMembers] = useState<StaffMember[] | null>(null);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');

  const search = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setNotice(''); setSelected(null); setMembers(null);
    setBusy(true);
    try {
      setMembers(await lookupMember({ data: { query } }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Member lookup failed.');
    } finally {
      setBusy(false);
    }
  };

  const parsed = parsePurchaseAmount(amount);
  const preview = selected && parsed ? calculateEarnedPoints(parsed, selected.tier as LoyaltyTierId) : null;

  const award = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !parsed) { setError('Enter a purchase amount between $0.01 and $1,000.'); return; }
    if (note.trim().length < 3) { setError('Add a short note, for example the receipt number.'); return; }
    setError(''); setNotice(''); setBusy(true);
    const { data, error: awardError } = await supabase.rpc('staff_award_purchase', { _member: selected.userId, _amount: parsed, _note: note.trim() });
    if (awardError) {
      setError(awardError.message || 'Points could not be added.');
    } else {
      setNotice(`Added ${Number(data).toLocaleString()} points to ${selected.fullName || selected.memberId}.`);
      setAmount(''); setNote('');
      try { setMembers(await lookupMember({ data: { query: selected.memberId } })); } catch { /* The award already succeeded. */ }
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['staff-recent-awards'] });
    }
    setBusy(false);
  };

  return (
    <article className="staff-card">
      <header><Search aria-hidden="true" /><div><span className="section-kicker">STEP ONE</span><h2>FIND A MEMBER</h2></div></header>
      <form className="staff-inline-form" onSubmit={(event) => void search(event)}>
        <div className="auth-field"><Label htmlFor="staff-query">Member ID or phone number</Label><Input id="staff-query" value={query} onChange={(event) => setQuery(event.target.value)} minLength={4} maxLength={40} inputMode="tel" autoComplete="off" required disabled={busy} /></div>
        <Button type="submit" variant="brand" disabled={busy}>{busy ? 'WORKING…' : 'FIND'}</Button>
      </form>
      {error && <p className="auth-message auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-message auth-notice" role="status">{notice}</p>}
      {members && members.length === 0 && <p className="loyalty-empty">No member matches that ID or phone number.</p>}
      {members && members.length > 0 && (
        <ul className="staff-results">
          {members.map((member) => (
            <li key={member.userId}>
              <div><strong>{member.fullName || 'Member'}</strong><span>ID {member.memberId} · {loyaltyTiers.find((tier) => tier.id === member.tier)?.name ?? member.tier} · {member.balance.toLocaleString()} points</span></div>
              <Button variant={selected?.userId === member.userId ? 'selected' : 'outline'} size="sm" onClick={() => { setSelected(member); setNotice(''); setError(''); }}>ADD POINTS</Button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <form className="staff-award-form" onSubmit={(event) => void award(event)}>
          <h3>Add points for {selected.fullName || selected.memberId}</h3>
          <div className="auth-field"><Label htmlFor="staff-amount">Purchase total (USD)</Label><Input id="staff-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="12.50" required disabled={busy} /></div>
          <div className="auth-field"><Label htmlFor="staff-note">Audit note</Label><Input id="staff-note" value={note} onChange={(event) => setNote(event.target.value)} minLength={3} maxLength={200} placeholder="Receipt number or register note" required disabled={busy} /></div>
          <p className="staff-preview" aria-live="polite">{preview !== null ? `About ${preview.toLocaleString()} points before any active boost and first-purchase bonus.` : 'Enter the amount to preview the points.'}</p>
          <Button type="submit" variant="brand" disabled={busy}>{busy ? 'ADDING…' : 'ADD POINTS'} <Sparkles /></Button>
        </form>
      )}
    </article>
  );
}

function CodeDesk() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<StaffRedemption | null | undefined>(undefined);

  const check = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setNotice(''); setResult(undefined); setBusy(true);
    try {
      setResult(await lookupRedemption({ data: { code } }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Code lookup failed.');
    } finally {
      setBusy(false);
    }
  };

  const markUsed = async () => {
    if (!result) return;
    setError(''); setNotice(''); setBusy(true);
    const { data, error: useError } = await supabase.rpc('mark_redemption_used', { _code: result.code });
    if (useError || data !== true) {
      setError('That code could not be used. It may already be used or expired.');
    } else {
      setNotice(`${result.rewardName} marked as used.`);
      setResult({ ...result, status: 'used' });
    }
    setBusy(false);
  };

  return (
    <article className="staff-card">
      <header><ScanLine aria-hidden="true" /><div><span className="section-kicker">AT THE COUNTER</span><h2>VALIDATE A REWARD CODE</h2></div></header>
      <form className="staff-inline-form" onSubmit={(event) => void check(event)}>
        <div className="auth-field"><Label htmlFor="staff-code">Reward code</Label><Input id="staff-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} minLength={6} maxLength={20} autoComplete="off" required disabled={busy} /></div>
        <Button type="submit" variant="brand" disabled={busy}>CHECK</Button>
      </form>
      {error && <p className="auth-message auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-message auth-notice" role="status">{notice}</p>}
      {result === null && <p className="loyalty-empty">No reward matches that code.</p>}
      {result && (
        <div className="staff-code-result">
          <div><strong>{result.rewardName}</strong><span>{result.memberName || 'Member'} · ID {result.memberId} · expires {formatDate(result.expiresAt)}</span></div>
          {result.status === 'pending'
            ? <Button variant="brand" disabled={busy} onClick={() => void markUsed()}><BadgeCheck /> MARK AS USED</Button>
            : <strong className="staff-status">{result.status === 'used' ? 'ALREADY USED' : 'EXPIRED'}</strong>}
        </div>
      )}
    </article>
  );
}

function RecentAwards() {
  const awardsQuery = useQuery({
    queryKey: ['staff-recent-awards'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('staff_recent_awards');
      if (error) throw error;
      return data;
    },
  });

  return (
    <article className="staff-card staff-wide">
      <header><Ticket aria-hidden="true" /><div><span className="section-kicker">YOUR AUDIT TRAIL</span><h2>YOUR RECENT POINT AWARDS</h2></div></header>
      {awardsQuery.isPending ? <p className="loyalty-empty" aria-live="polite">Loading…</p>
        : awardsQuery.isError ? <p className="auth-message auth-error" role="alert">Your awards could not be loaded.</p>
        : awardsQuery.data.length === 0 ? <p className="loyalty-empty">You have not added any points yet.</p>
        : (
          <ul className="loyalty-activity-list">
            {awardsQuery.data.map((entry) => (
              <li key={entry.a_id} className="loyalty-activity-row">
                <div><strong>{entry.a_description}</strong><span>{formatDate(entry.a_created_at)} · {entry.a_member_name || 'Member'} (ID {entry.a_member_id})</span></div>
                <strong className={entry.a_delta > 0 ? 'loyalty-positive' : 'loyalty-negative'}>{entry.a_delta > 0 ? '+' : '−'}{Math.abs(entry.a_delta).toLocaleString()}</strong>
              </li>
            ))}
          </ul>
        )}
    </article>
  );
}

function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function PromotionsAdmin() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [multiplier, setMultiplier] = useState('2');
  const [start, setStart] = useState(() => toLocalInput(new Date()));
  const [end, setEnd] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const promotionsQuery = useQuery({
    queryKey: ['admin-promotions'],
    queryFn: async () => {
      const { data, error: loadError } = await supabase.from('promotions').select('id,title,multiplier,start_date,end_date').order('start_date', { ascending: false }).limit(20);
      if (loadError) throw loadError;
      return data;
    },
  });

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const factor = Number(multiplier);
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!title.trim()) { setError('Give the promotion a title.'); return; }
    if (!Number.isFinite(factor) || factor < 1 || factor > 5) { setError('Use a multiplier between 1 and 5.'); return; }
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) { setError('The end must be after the start.'); return; }
    setBusy(true);
    const { error: insertError } = await supabase.from('promotions').insert({ title: title.trim(), multiplier: factor, start_date: startDate.toISOString(), end_date: endDate.toISOString() });
    if (insertError) setError('The promotion could not be saved. Check the dates and multiplier.');
    else { setTitle(''); await promotionsQuery.refetch(); void queryClient.invalidateQueries({ queryKey: ['loyalty-dashboard'] }); }
    setBusy(false);
  };

  const remove = async (id: string) => {
    setError('');
    const { error: deleteError } = await supabase.from('promotions').delete().eq('id', id);
    if (deleteError) setError('The promotion could not be removed.');
    else await promotionsQuery.refetch();
  };

  return (
    <article className="staff-card staff-wide">
      <header><Sparkles aria-hidden="true" /><div><span className="section-kicker">ADMIN</span><h2>POINT BOOSTS</h2></div></header>
      <form className="staff-grid-form" onSubmit={(event) => void create(event)}>
        <div className="auth-field"><Label htmlFor="promo-title">Title</Label><Input id="promo-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Double points Tuesday" required disabled={busy} /></div>
        <div className="auth-field"><Label htmlFor="promo-multiplier">Multiplier (1 to 5)</Label><Input id="promo-multiplier" value={multiplier} onChange={(event) => setMultiplier(event.target.value)} type="number" min={1} max={5} step={0.5} required disabled={busy} /></div>
        <div className="auth-field"><Label htmlFor="promo-start">Starts</Label><Input id="promo-start" value={start} onChange={(event) => setStart(event.target.value)} type="datetime-local" required disabled={busy} /></div>
        <div className="auth-field"><Label htmlFor="promo-end">Ends</Label><Input id="promo-end" value={end} onChange={(event) => setEnd(event.target.value)} type="datetime-local" required disabled={busy} /></div>
        <Button type="submit" variant="brand" disabled={busy}>ADD BOOST</Button>
      </form>
      {error && <p className="auth-message auth-error" role="alert">{error}</p>}
      {promotionsQuery.data && promotionsQuery.data.length > 0 && (
        <ul className="loyalty-activity-list">
          {promotionsQuery.data.map((promotion) => (
            <li key={promotion.id} className="loyalty-activity-row">
              <div><strong>{promotion.title} · {promotion.multiplier}×</strong><span>{formatDate(promotion.start_date)} to {formatDate(promotion.end_date)}</span></div>
              <Button variant="ghost" size="icon" aria-label={`Remove ${promotion.title}`} onClick={() => void remove(promotion.id)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function RewardsAdmin() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);

  const rewardsQuery = useQuery({
    queryKey: ['admin-rewards'],
    queryFn: async () => {
      const { data, error: loadError } = await supabase.from('rewards').select('id,name,description,points_cost,active,sort_order').neq('name', BIRTHDAY_REWARD_NAME).order('sort_order', { ascending: true });
      if (loadError) throw loadError;
      return data;
    },
  });
  const refresh = async () => {
    await rewardsQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['loyalty-dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['public-rewards'] });
  };

  const update = async (id: string, changes: { points_cost?: number; active?: boolean }) => {
    setError('');
    const { error: updateError } = await supabase.from('rewards').update(changes).eq('id', id);
    if (updateError) setError('That reward could not be updated.');
    await refresh();
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const points = Number(cost);
    if (!name.trim() || !Number.isInteger(points) || points < 1 || points > 100_000) { setError('Enter a name and a whole-number point cost.'); return; }
    setBusy(true);
    const nextOrder = (rewardsQuery.data?.reduce((max, reward) => Math.max(max, reward.sort_order), 0) ?? 0) + 1;
    const { error: insertError } = await supabase.from('rewards').insert({ name: name.trim(), description: description.trim(), points_cost: points, sort_order: nextOrder });
    if (insertError) setError('The reward could not be added.');
    else { setName(''); setDescription(''); setCost(''); await refresh(); }
    setBusy(false);
  };

  return (
    <article className="staff-card staff-wide">
      <header><Ticket aria-hidden="true" /><div><span className="section-kicker">ADMIN</span><h2>REWARDS CATALOG</h2></div></header>
      {error && <p className="auth-message auth-error" role="alert">{error}</p>}
      {rewardsQuery.data && (
        <ul className="staff-reward-list">
          {rewardsQuery.data.map((reward) => (
            <li key={reward.id}>
              <div><strong>{reward.name}</strong><span>{reward.description}</span></div>
              <Label className="staff-cost-field">Points<Input key={reward.points_cost} defaultValue={reward.points_cost} type="number" min={1} max={100000} aria-label={`Points cost for ${reward.name}`} onBlur={(event) => { const next = Number(event.target.value); if (Number.isInteger(next) && next > 0 && next !== reward.points_cost) void update(reward.id, { points_cost: next }); }} /></Label>
              <Label className="staff-active-field"><input type="checkbox" checked={reward.active} onChange={(event) => void update(reward.id, { active: event.target.checked })} /> Active</Label>
            </li>
          ))}
        </ul>
      )}
      <form className="staff-grid-form" onSubmit={(event) => void add(event)}>
        <div className="auth-field"><Label htmlFor="reward-name">New reward</Label><Input id="reward-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={busy} /></div>
        <div className="auth-field"><Label htmlFor="reward-description">Description</Label><Input id="reward-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={140} disabled={busy} /></div>
        <div className="auth-field"><Label htmlFor="reward-cost">Points</Label><Input id="reward-cost" value={cost} onChange={(event) => setCost(event.target.value)} type="number" min={1} max={100000} required disabled={busy} /></div>
        <Button type="submit" variant="brand" disabled={busy}>ADD REWARD</Button>
      </form>
    </article>
  );
}
