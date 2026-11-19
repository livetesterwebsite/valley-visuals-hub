CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '' CHECK (char_length(full_name) <= 100),
  phone TEXT CHECK (phone IS NULL OR phone ~ '^[0-9+() .-]{7,20}$'),
  birthday DATE,
  member_id TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by UUID,
  referral_credited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Members update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

INSERT INTO public.rewards (name, description, points_cost, sort_order) VALUES
 ('Free size upgrade','Make your favorite sip a little bigger.',150,1),
 ('Free drink customization','Extra shot, syrup, or cold foam.',250,2),
 ('$3 off any order','A little something off your next café run.',400,3),
 ('Free handcrafted drink','One Valley favorite, on us.',600,4),
 ('Free drink + pastry','The perfect coffee date, covered.',900,5),
 ('Valley Grounds merch item','Take a little Valley energy with you.',1500,6);
INSERT INTO public.rewards (name, description, points_cost, sort_order, active) VALUES
 ('Birthday drink','A free drink for your special day.',1,99,false);

CREATE OR REPLACE FUNCTION public.handle_new_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mid TEXT; v_ref TEXT; v_referrer UUID; v_bday DATE;
BEGIN
  LOOP v_mid := lpad((floor(random()*1000000))::int::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE member_id = v_mid); END LOOP;
  LOOP v_ref := 'VG' || upper(substr(md5(random()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = v_ref); END LOOP;
  SELECT id INTO v_referrer FROM profiles WHERE referral_code = upper(NULLIF(trim(NEW.raw_user_meta_data->>'referral_code'), ''));
  BEGIN v_bday := NULLIF(NEW.raw_user_meta_data->>'birthday','')::date; EXCEPTION WHEN others THEN v_bday := NULL; END;
  IF v_bday IS NOT NULL AND (v_bday > current_date OR v_bday < date '1900-01-01') THEN v_bday := NULL; END IF;
  INSERT INTO profiles (id, full_name, phone, birthday, member_id, referral_code, referred_by)
  VALUES (NEW.id,
    left(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), 100),
    CASE WHEN (NEW.raw_user_meta_data->>'phone') ~ '^[0-9+() .-]{7,20}$' THEN NEW.raw_user_meta_data->>'phone' END,
    v_bday, v_mid, v_ref, v_referrer);
  INSERT INTO user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;
  INSERT INTO points_ledger (user_id, delta, type, description) VALUES (NEW.id, 100, 'bonus', 'Welcome to the Valley bonus');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created_member AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_member();

-- Members whose birthday was missing (e.g. Google sign-in) may set it once.
CREATE OR REPLACE FUNCTION public.set_my_birthday(_birthday DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF _birthday IS NULL OR _birthday > current_date OR _birthday < date '1900-01-01' THEN RAISE EXCEPTION 'Enter a valid birthday.'; END IF;
  UPDATE profiles SET birthday = _birthday WHERE id = auth.uid() AND birthday IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Your birthday is already saved.'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_my_birthday(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_birthday(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.member_earned_12m(_uid UUID) RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sum(delta),0) FROM points_ledger WHERE user_id = _uid AND delta > 0
   AND type IN ('earn','bonus','birthday','referral','adjustment') AND created_at > now() - interval '12 months';
$$;
REVOKE ALL ON FUNCTION public.member_earned_12m(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.member_tier(_uid UUID) RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN e >= 5000 THEN 'valley-vip' WHEN e >= 2000 THEN 'grounded' ELSE 'sprout' END FROM (SELECT public.member_earned_12m(_uid) e) s;
$$;
REVOKE ALL ON FUNCTION public.member_tier(UUID) FROM PUBLIC, anon, authenticated;

-- Applies expiry and birthday issuance for one member; idempotent.
CREATE OR REPLACE FUNCTION public.refresh_member(_uid UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tier TEXT; v_last TIMESTAMPTZ; v_balance BIGINT; v_old BIGINT; v_consumed BIGINT; v_exp BIGINT;
  v_bday DATE; v_next DATE; v_reward UUID; v_code TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text, 0));
  v_tier := member_tier(_uid);
  UPDATE redemptions SET status = 'expired' WHERE user_id = _uid AND status = 'pending' AND expires_at <= now();
  IF v_tier <> 'valley-vip' THEN
    SELECT max(created_at) INTO v_last FROM points_ledger WHERE user_id = _uid AND type IN ('earn','redeem');
    v_last := COALESCE(v_last, (SELECT created_at FROM profiles WHERE id = _uid));
    IF v_last < now() - interval '30 days' THEN
      SELECT COALESCE(sum(delta),0) INTO v_balance FROM points_ledger WHERE user_id = _uid;
      SELECT COALESCE(sum(delta),0) INTO v_old FROM points_ledger WHERE user_id = _uid AND delta > 0 AND created_at < now() - interval '6 months';
      SELECT COALESCE(-sum(delta),0) INTO v_consumed FROM points_ledger WHERE user_id = _uid AND delta < 0;
      v_exp := LEAST(v_balance, v_old - v_consumed);
      IF v_exp > 0 THEN
        INSERT INTO points_ledger (user_id, delta, type, description) VALUES (_uid, -v_exp, 'expire', 'Points expired after 6 months without activity');
      END IF;
    END IF;
  END IF;
  SELECT birthday INTO v_bday FROM profiles WHERE id = _uid;
  IF v_bday IS NOT NULL THEN
    v_next := make_date(extract(year FROM current_date)::int, extract(month FROM v_bday)::int, LEAST(extract(day FROM v_bday)::int, 28 + CASE WHEN extract(month FROM v_bday)=2 THEN 0 ELSE 3 END));
    IF v_next < current_date - 60 THEN v_next := (v_next + interval '1 year')::date; END IF;
    SELECT id INTO v_reward FROM rewards WHERE name = 'Birthday drink' LIMIT 1;
    IF current_date >= v_next - 7 AND current_date <= v_next + 30 AND v_reward IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM redemptions WHERE user_id = _uid AND reward_id = v_reward AND created_at > (v_next - 60)::timestamptz) THEN
      v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
      INSERT INTO redemptions (user_id, reward_id, code, expires_at)
      VALUES (_uid, v_reward, v_code, now() + CASE WHEN v_tier = 'valley-vip' THEN interval '60 days' ELSE interval '30 days' END);
    END IF;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_member(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_loyalty() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_tier TEXT; v_balance BIGINT; v_last TIMESTAMPTZ; v_old_date TIMESTAMPTZ; v_exp_amt BIGINT; v_exp_date TIMESTAMPTZ; v_mult NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  PERFORM refresh_member(v_uid);
  v_tier := member_tier(v_uid);
  SELECT COALESCE(sum(delta),0) INTO v_balance FROM points_ledger WHERE user_id = v_uid;
  SELECT COALESCE(max(multiplier),1) INTO v_mult FROM promotions WHERE now() >= start_date AND now() < end_date;
  IF v_tier <> 'valley-vip' AND v_balance > 0 THEN
    SELECT max(created_at) INTO v_last FROM points_ledger WHERE user_id = v_uid AND type IN ('earn','redeem');
    SELECT min(created_at) INTO v_old_date FROM points_ledger WHERE user_id = v_uid AND delta > 0;
    v_exp_date := GREATEST(v_old_date + interval '6 months', COALESCE(v_last, v_old_date) + interval '30 days');
    v_exp_amt := v_balance;
  END IF;
  RETURN jsonb_build_object(
    'balance', v_balance, 'earned_12m', member_earned_12m(v_uid), 'tier', v_tier, 'multiplier', v_mult,
    'expiring_points', v_exp_amt, 'expires_on', v_exp_date,
    'is_staff', has_role(v_uid,'staff') OR has_role(v_uid,'admin'), 'is_admin', has_role(v_uid,'admin'));
END; $$;
REVOKE ALL ON FUNCTION public.get_my_loyalty() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_loyalty() TO authenticated;

CREATE OR REPLACE FUNCTION public.require_staff() RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (has_role(auth.uid(),'staff') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Staff access is required.' USING ERRCODE = '42501'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.require_staff() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_find_member(_query TEXT)
RETURNS TABLE (user_id UUID, full_name TEXT, phone TEXT, member_id TEXT, balance BIGINT, tier TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q TEXT := trim(COALESCE(_query,'')); digits TEXT := regexp_replace(COALESCE(_query,''), '[^0-9]', '', 'g');
BEGIN
  PERFORM require_staff();
  IF length(q) < 4 THEN RAISE EXCEPTION 'Enter a member ID or phone number.'; END IF;
  RETURN QUERY SELECT p.id, p.full_name, p.phone, p.member_id,
    (SELECT COALESCE(sum(l.delta),0) FROM points_ledger l WHERE l.user_id = p.id)::bigint, member_tier(p.id)
  FROM profiles p
  WHERE p.member_id = q OR (length(digits) >= 7 AND regexp_replace(COALESCE(p.phone,''),'[^0-9]','','g') = digits)
  LIMIT 5;
END; $$;
REVOKE ALL ON FUNCTION public.staff_find_member(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_find_member(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_award_purchase(_member UUID, _amount NUMERIC, _note TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate INT; v_mult NUMERIC; v_points INT; v_first BOOLEAN; v_ref UUID; v_credited BOOLEAN; v_order UUID := gen_random_uuid();
BEGIN
  PERFORM require_staff();
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000 THEN RAISE EXCEPTION 'Enter an amount between $0.01 and $1,000.'; END IF;
  IF length(trim(COALESCE(_note,''))) < 3 OR length(_note) > 200 THEN RAISE EXCEPTION 'Add a short audit note (3–200 characters).'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _member) THEN RAISE EXCEPTION 'Member not found.'; END IF;
  PERFORM refresh_member(_member);
  v_rate := CASE member_tier(_member) WHEN 'valley-vip' THEN 15 WHEN 'grounded' THEN 12 ELSE 10 END;
  SELECT COALESCE(max(multiplier),1) INTO v_mult FROM promotions WHERE now() >= start_date AND now() < end_date;
  v_points := floor(_amount * v_rate * v_mult);
  v_first := NOT EXISTS (SELECT 1 FROM points_ledger WHERE user_id = _member AND type = 'earn');
  IF v_points > 0 THEN
    INSERT INTO points_ledger (user_id, delta, type, description, order_id, created_by)
    VALUES (_member, v_points, 'earn', 'Purchase $' || to_char(_amount,'FM999990.00') || ' — ' || trim(_note), v_order, auth.uid());
  END IF;
  IF v_first THEN
    INSERT INTO points_ledger (user_id, delta, type, description, order_id, created_by) VALUES (_member, 100, 'bonus', 'First order bonus', v_order, auth.uid());
    SELECT referred_by, referral_credited INTO v_ref, v_credited FROM profiles WHERE id = _member;
    IF v_ref IS NOT NULL AND NOT v_credited THEN
      INSERT INTO points_ledger (user_id, delta, type, description, created_by) VALUES
        (_member, 200, 'referral', 'Referral bonus — welcome gift', auth.uid()),
        (v_ref, 200, 'referral', 'Referral bonus — your friend made their first order', auth.uid());
      UPDATE profiles SET referral_credited = true WHERE id = _member;
    END IF;
  END IF;
  RETURN v_points;
END; $$;
REVOKE ALL ON FUNCTION public.staff_award_purchase(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_award_purchase(UUID, NUMERIC, TEXT) TO authenticated;
