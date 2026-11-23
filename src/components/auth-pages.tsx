import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowUpRight, Fingerprint, KeyRound, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageTop } from '@/components/page-top';
import { useAuth } from '@/lib/auth-context';
import { lovable } from '@/integrations/lovable';
import { supabase } from '@/integrations/supabase/client';

type AuthMode = 'signin' | 'signup' | 'forgot';

export function AuthPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isLoading && user) void navigate({ to: '/loyalty', replace: true });
  }, [isLoading, navigate, user]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setNotice('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();

    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setNotice('If an account exists for that email, a password reset link is on its way.');
      } else if (mode === 'signup') {
        const fullName = String(form.get('full_name') ?? '').trim();
        const phone = String(form.get('phone') ?? '').trim();
        const birthday = String(form.get('birthday') ?? '');
        const password = String(form.get('password') ?? '');
        const birthdayDate = new Date(`${birthday}T00:00:00`);
        if (!birthday || Number.isNaN(birthdayDate.getTime()) || birthdayDate > new Date() || birthday < '1900-01-01') {
          throw new Error('Enter a valid birthday.');
        }

        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { full_name: fullName, phone, birthday },
          },
        });
        if (signupError) throw signupError;
        if (data.session) {
          await navigate({ to: '/loyalty', replace: true });
        } else {
          setNotice('Check your email to confirm your account, then sign in to see your points.');
        }
      } else {
        const password = String(form.get('password') ?? '');
        const { error: signinError } = await supabase.auth.signInWithPassword({ email, password });
        if (signinError) throw signinError;
        await navigate({ to: '/loyalty', replace: true });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not complete that request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'lovable') => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}/auth`,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      await navigate({ to: '/loyalty', replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in could not start. Please try again.');
      setBusy(false);
    }
  };

  if (isLoading || user) {
    return (
      <>
        <PageTop kicker="VALLEY GROUNDS REWARDS" title="MEMBER ACCESS." description="Opening your member account…" />
        <section className="section" aria-live="polite">Loading your account…</section>
      </>
    );
  }

  const heading = mode === 'signup' ? 'JOIN THE VALLEY.' : mode === 'forgot' ? 'RESET YOUR PASSWORD.' : 'WELCOME BACK.';

  return (
    <>
      <PageTop kicker="VALLEY GROUNDS REWARDS" title="MEMBER ACCESS." description="Your points and member perks, all in one place." />
      <section className="section auth-layout">
        <div className="auth-form-column">
          <div className="section-kicker">{mode === 'signup' ? 'START EARNING' : mode === 'forgot' ? 'ACCOUNT RECOVERY' : 'YOUR VALLEY ACCOUNT'}</div>
          <h2>{heading}</h2>
          <p className="section-sub">
            {mode === 'signup' ? 'Create an account with your name, phone number and birthday.' : mode === 'forgot' ? 'We’ll send a secure reset link to your email.' : 'Sign in to check your balance and member tier.'}
          </p>

          {mode !== 'forgot' && (
            <div className="auth-social-buttons">
              <Button type="button" variant="outline" className="google-sign-in-button" disabled={busy} onClick={() => void handleOAuth('google')}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
                  <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
                </svg>
                <span>Continue with Google</span>
              </Button>
              <Button type="button" variant="outline" className="auth-provider-button" disabled={busy} onClick={() => void handleOAuth('lovable')}>
                <Fingerprint aria-hidden="true" />
                <span>Continue with Lovable</span>
              </Button>
            </div>
          )}

          {mode !== 'forgot' && <div className="auth-divider"><span>OR USE EMAIL</span></div>}

          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            {mode === 'signup' && (
              <>
                <div className="auth-field">
                  <Label htmlFor="member-full-name">Full name</Label>
                  <Input id="member-full-name" name="full_name" autoComplete="name" maxLength={100} required disabled={busy} />
                </div>
                <div className="auth-field">
                  <Label htmlFor="member-phone">Phone number</Label>
                  <Input id="member-phone" name="phone" type="tel" autoComplete="tel" minLength={7} maxLength={20} pattern="[0-9+() .-]{7,20}" title="Enter a phone number with 7 to 20 digits or phone punctuation." required disabled={busy} />
                </div>
                <div className="auth-field">
                  <Label htmlFor="member-birthday">Birthday</Label>
                  <Input id="member-birthday" name="birthday" type="date" min="1900-01-01" required disabled={busy} />
                </div>
              </>
            )}
            <div className="auth-field">
              <Label htmlFor="member-email">Email</Label>
              <Input id="member-email" name="email" type="email" autoComplete="email" required disabled={busy} />
            </div>
            {mode !== 'forgot' && (
              <div className="auth-field">
                <Label htmlFor="member-password">Password</Label>
                <Input id="member-password" name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required disabled={busy} />
              </div>
            )}
            {error && <p className="auth-message auth-error" role="alert">{error}</p>}
            {notice && <p className="auth-message auth-notice" role="status">{notice}</p>}
            <Button type="submit" variant="brand" size="lg" className="w-full" disabled={busy}>
              {busy ? 'PLEASE WAIT…' : mode === 'signup' ? 'CREATE MEMBER ACCOUNT' : mode === 'forgot' ? 'SEND RESET LINK' : 'SIGN IN'}
              {mode === 'forgot' ? <KeyRound /> : <ArrowUpRight />}
            </Button>
          </form>

          <div className="auth-mode-links">
            {mode === 'signin' && (
              <>
                <Button type="button" variant="link" onClick={() => changeMode('forgot')}>Forgot password?</Button>
                <span>New here?</span>
                <Button type="button" variant="link" onClick={() => changeMode('signup')}>Create an account</Button>
              </>
            )}
            {mode === 'signup' && <><span>Already a member?</span><Button type="button" variant="link" onClick={() => changeMode('signin')}>Sign in</Button></>}
            {mode === 'forgot' && <Button type="button" variant="link" onClick={() => changeMode('signin')}><ArrowLeft /> Back to sign in</Button>}
          </div>
        </div>

        <aside className="auth-aside">
          <UserRound aria-hidden="true" size={30} className="text-primary" />
          <h3>GOOD COFFEE. GOOD PERKS.</h3>
          <p>Earn points with verified purchases, track your member tier and keep your birthday details together in your account.</p>
          <Link to="/loyalty" className="inline-flex items-center gap-2 text-sm font-bold text-primary">See the rewards program <ArrowUpRight size={16} /></Link>
        </aside>
      </section>
    </>
  );
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [isRecovery, setIsRecovery] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    setIsRecovery(new URLSearchParams(hash).get('type') === 'recovery');
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('confirm_password') ?? '');
    if (password !== confirmation) {
      setError('Those passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setNotice('Your password has been updated.');
      await navigate({ to: '/loyalty', replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not update your password. Request a new reset link and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTop kicker="VALLEY GROUNDS REWARDS" title="RESET YOUR PASSWORD." description="Choose a new password for your member account." />
      <section className="section auth-reset-section">
        {isRecovery === null ? (
          <p role="status">Checking your reset link…</p>
        ) : isRecovery ? (
          <form className="auth-form auth-reset-form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="auth-field">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} />
            </div>
            <div className="auth-field">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" name="confirm_password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} />
            </div>
            {error && <p className="auth-message auth-error" role="alert">{error}</p>}
            {notice && <p className="auth-message auth-notice" role="status">{notice}</p>}
            <Button type="submit" variant="brand" size="lg" className="w-full" disabled={busy}>{busy ? 'SAVING…' : 'SAVE NEW PASSWORD'} <KeyRound /></Button>
          </form>
        ) : (
          <div className="auth-reset-empty">
            <p>This reset link is missing or has expired. Request a new one to continue.</p>
            <Button asChild variant="brand"><Link to="/auth">RETURN TO SIGN IN <ArrowLeft /></Link></Button>
          </div>
        )}
      </section>
    </>
  );
}