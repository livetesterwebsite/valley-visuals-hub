CREATE TYPE public.app_role AS ENUM ('member', 'staff', 'admin');
CREATE TYPE public.loyalty_entry_type AS ENUM ('earn', 'redeem', 'bonus', 'birthday', 'referral', 'expire', 'adjustment');
CREATE TYPE public.redemption_status AS ENUM ('pending', 'used', 'expired');

CREATE TABLE public.user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  points_cost INTEGER NOT NULL CHECK (points_cost > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rewards TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rewards TO authenticated;
GRANT ALL ON public.rewards TO service_role;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  multiplier NUMERIC(4, 2) NOT NULL CHECK (multiplier >= 1),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
GRANT SELECT ON public.promotions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  type public.loyalty_entry_type NOT NULL,
  description TEXT NOT NULL,
  order_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.points_ledger TO authenticated;
GRANT ALL ON public.points_ledger TO service_role;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  status public.redemption_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
GRANT SELECT ON public.redemptions TO authenticated;
GRANT ALL ON public.redemptions TO service_role;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX points_ledger_user_created_idx ON public.points_ledger (user_id, created_at DESC);
CREATE INDEX redemptions_user_created_idx ON public.redemptions (user_id, created_at DESC);
CREATE INDEX promotions_dates_idx ON public.promotions (start_date, end_date);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

CREATE POLICY "Members read their own roles or staff read roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Members can add only their own member role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'member');

CREATE POLICY "Visitors read active rewards" ON public.rewards
  FOR SELECT TO anon, authenticated
  USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Administrators manage rewards" ON public.rewards
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Visitors read current promotions" ON public.promotions
  FOR SELECT TO anon, authenticated
  USING ((now() >= start_date AND now() < end_date) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Administrators manage promotions" ON public.promotions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members read their points and admins read all" ON public.points_ledger
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (type = 'adjustment' AND created_by = auth.uid() AND public.has_role(auth.uid(), 'staff'))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Members and staff read permitted redemptions" ON public.redemptions
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'staff')
    OR public.has_role(auth.uid(), 'admin')
  );

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
  v_code TEXT;
  v_redemption_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to redeem a reward.' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

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

  v_code := upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10));
  v_expires_at := now() + interval '30 days';
  INSERT INTO public.redemptions (user_id, reward_id, code, expires_at)
  VALUES (v_user_id, v_reward.id, v_code, v_expires_at)
  RETURNING id INTO v_redemption_id;

  INSERT INTO public.points_ledger (user_id, delta, type, description)
  VALUES (v_user_id, -v_reward.points_cost, 'redeem', 'Redeemed ' || v_reward.name);

  RETURN QUERY SELECT v_redemption_id, v_code, v_expires_at;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_reward(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_reward(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_redemption_used(_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff access is required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.redemptions
  SET status = 'used'
  WHERE code = upper(trim(_code))
    AND status = 'pending'
    AND expires_at > now();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_redemption_used(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_redemption_used(TEXT) TO authenticated;
