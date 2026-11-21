# Valley Grounds Loyalty Program

Complete the uploaded loyalty brief in separate milestones, one milestone per work session. The loyalty database and rule functions already exist; the member page still uses a fake balance and local-only reward actions.

## Milestone 1 — Member access and live dashboard (first)
- Add email/password signup, sign-in, sign-out, Google sign-in and Sign in with Lovable.
- Collect the approved profile details: full name, phone number and birthday; show the email-confirmation state after signup.
- Add password recovery and a public reset-password page.
- Replace the demo 1,250-point balance with the signed-in member’s real balance, tier and progress, expiry details, ledger activity and available rewards.
- Reflect the current session in the header and clear private cached data when the member signs out.

## Milestone 2 — Real rewards
- Secure and connect reward redemption to the existing database procedure.
- Show issued redemption codes, expiry, redemption history and birthday rewards; refresh balance and activity after each action.

## Milestone 3 — Earning rules
- Connect referrals, promotions, birthday timing and points expiry to the existing rules and verify edge cases.
- Keep the storefront checkout demo-only: simulated orders must not earn points or trigger paid-order bonuses. Award purchase points only for verified purchases.

## Milestone 4 — Staff tools
- Add role-protected member search, verified-purchase point awards with audit notes, redemption validation and promotion management.
- Keep member lookup unavailable to ordinary client accounts; do not create hardcoded demo staff or admin credentials.

## Milestone 5 — Verification
- Test public signed-out views and the signed-in member journey, redemption, sign-out privacy, mobile layout and the relevant loyalty rules.

## Technical details
- Reuse the existing `profiles`, `user_roles`, `points_ledger`, `rewards`, `redemptions`, `promotions` and loyalty functions; add migrations only for a confirmed gap.
- Use the current Lovable Cloud auth setup and existing RLS/role checks. Review the remaining reward-redemption security finding before exposing that action in the UI.
- Work on Milestone 1 first; leave later milestones queued until a separate session.