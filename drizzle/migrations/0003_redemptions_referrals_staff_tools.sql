-- Milestones 2-4: secure redemption, member redemption history, referral stats and staff tools.
-- Output column names are prefixed (r_*, m_*, a_*) so they never collide with table columns inside PL/pgSQL.

-- 1. Harden redeem_reward: apply expiry first, cap unused codes, retry on a code collision.
CREATE OR REPLACE FUNCTION public.redeem_reward(_reward_id UUID)
RETURNS TABLE (redemption_id UUID, redemption_code TEXT, redemption_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_reward public.rewards%ROWTYPE;
  v_balance BIGINT;
  v_pending INTEGER;
  v_code TEXT;
  v_redemption_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_attempt INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to redeem a reward.' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  -- Expire stale points and codes before the balance is checked.
  PERFORM public.refresh_member(v_user_id);

  SELECT * INTO v_reward FROM public.rewards
  WHERE id = _reward_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This reward is not available.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(sum(delta), 0) INTO v_balance
  FROM public.points_ledger WHERE user_id = v_user_id;
  IF v_balance < v_reward.points_cost THEN
    RAISE EXCEPTION 'You do not have enough points for this reward.' USING ERRCODE = '22023';
  END IF;

  -- Birthday codes use an inactive reward, so only purchased rewards count toward the cap.
  SELECT count(*) INTO v_pending
  FROM public.redemptions r
  JOIN public.rewards w ON w.id = r.reward_id
  WHERE r.user_id = v_user_id AND r.status = 'pending' AND r.expires_at > now() AND w.active = true;
  IF v_pending >= 5 THEN
    RAISE EXCEPTION 'You already have 5 unused reward codes. Use one at the cafe first.' USING ERRCODE = '53400';
  END IF;

  v_expires_at := now() + interval '30 days';
  LOOP
    v_attempt := v_attempt + 1;
    v_code := upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10));
    BEGIN
      INSERT INTO public.redemptions (user_id, reward_id, code, expires_at)
      VALUES (v_user_id, v_reward.id, v_code, v_expires_at)
      RETURNING id INTO v_redemption_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO public.points_ledger (user_id, delta, type, description)
  VALUES (v_user_id, -v_reward.points_cost, 'redeem', 'Redeemed ' || v_reward.name);

  RETURN QUERY SELECT v_redemption_id, v_code, v_expires_at;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_reward(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_reward(UUID) TO authenticated;

-- 2. A member's own codes (including the birthday reward, whose reward row is inactive and hidden by RLS).
CREATE OR REPLACE FUNCTION public.get_my_redemptions()
RETURNS TABLE (
  r_id UUID, r_code TEXT, r_status public.redemption_status, r_created_at TIMESTAMPTZ,
  r_expires_at TIMESTAMPTZ, r_reward_name TEXT, r_reward_description TEXT, r_is_birthday BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '28000';
  END IF;

  UPDATE public.redemptions x SET status = 'expired'
  WHERE x.user_id = auth.uid() AND x.status = 'pending' AND x.expires_at <= now();

  RETURN QUERY
  SELECT x.id, x.code, x.status, x.created_at, x.expires_at, w.name, w.description, (w.name = 'Birthday drink')
  FROM public.redemptions x
  JOIN public.rewards w ON w.id = x.reward_id
  WHERE x.user_id = auth.uid()
  ORDER BY x.created_at DESC
  LIMIT 50;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_redemptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_redemptions() TO authenticated;

-- 3. Referral summary for the signed-in member (other members' rows stay hidden by RLS).
CREATE OR REPLACE FUNCTION public.get_my_referrals()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_credited BIGINT;
  v_pending BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '28000';
  END IF;
  SELECT referral_code INTO v_code FROM public.profiles WHERE id = auth.uid();
  SELECT count(*) FILTER (WHERE referral_credited), count(*) FILTER (WHERE NOT referral_credited)
    INTO v_credited, v_pending
  FROM public.profiles WHERE referred_by = auth.uid();
  RETURN jsonb_build_object('code', v_code, 'credited', COALESCE(v_credited, 0), 'pending', COALESCE(v_pending, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_referrals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referrals() TO authenticated;

-- 4. Staff lookups. These run only through a server function with the service role, after the
--    server has checked the caller's staff role. They are never executable by browser clients.
CREATE OR REPLACE FUNCTION public.staff_lookup_member(_staff UUID, _query TEXT)
RETURNS TABLE (m_user_id UUID, m_full_name TEXT, m_phone TEXT, m_member_id TEXT, m_balance BIGINT, m_tier TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q TEXT := trim(COALESCE(_query, ''));
  digits TEXT := regexp_replace(COALESCE(_query, ''), '[^0-9]', '', 'g');
BEGIN
  IF _staff IS NULL OR NOT (public.has_role(_staff, 'staff') OR public.has_role(_staff, 'admin')) THEN
    RAISE EXCEPTION 'Staff access is required.' USING ERRCODE = '42501';
  END IF;
  IF length(q) < 4 THEN
    RAISE EXCEPTION 'Enter a member ID or phone number.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, p.member_id,
         (SELECT COALESCE(sum(l.delta), 0) FROM public.points_ledger l WHERE l.user_id = p.id)::BIGINT,
         public.member_tier(p.id)
  FROM public.profiles p
  WHERE p.member_id = q
     OR (length(digits) >= 7 AND regexp_replace(COALESCE(p.phone, ''), '[^0-9]', '', 'g') = digits)
  LIMIT 5;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_lookup_member(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_lookup_member(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.staff_lookup_redemption(_staff UUID, _code TEXT)
RETURNS TABLE (
  r_code TEXT, r_status TEXT, r_expires_at TIMESTAMPTZ, r_reward_name TEXT, r_member_name TEXT, r_member_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _staff IS NULL OR NOT (public.has_role(_staff, 'staff') OR public.has_role(_staff, 'admin')) THEN
    RAISE EXCEPTION 'Staff access is required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT x.code,
         CASE WHEN x.status = 'pending' AND x.expires_at <= now() THEN 'expired' ELSE x.status::TEXT END,
         x.expires_at, w.name, p.full_name, p.member_id
  FROM public.redemptions x
  JOIN public.rewards w ON w.id = x.reward_id
  JOIN public.profiles p ON p.id = x.user_id
  WHERE x.code = upper(trim(_code));
END;
$$;
REVOKE ALL ON FUNCTION public.staff_lookup_redemption(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_lookup_redemption(UUID, TEXT) TO service_role;

-- 5. A staff member's own recent point awards (the ledger policy only exposes 'adjustment' rows).
CREATE OR REPLACE FUNCTION public.staff_recent_awards()
RETURNS TABLE (
  a_id UUID, a_created_at TIMESTAMPTZ, a_delta INTEGER, a_type public.loyalty_entry_type,
  a_description TEXT, a_member_name TEXT, a_member_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_staff();
  RETURN QUERY
  SELECT l.id, l.created_at, l.delta, l.type, l.description, p.full_name, p.member_id
  FROM public.points_ledger l
  LEFT JOIN public.profiles p ON p.id = l.user_id
  WHERE l.created_by = auth.uid()
  ORDER BY l.created_at DESC
  LIMIT 25;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_recent_awards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_recent_awards() TO authenticated;

-- 6. Guard against a mistyped promotion (for example 50x points). Applies to new and edited rows.
ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_multiplier_cap CHECK (multiplier <= 5) NOT VALID;
