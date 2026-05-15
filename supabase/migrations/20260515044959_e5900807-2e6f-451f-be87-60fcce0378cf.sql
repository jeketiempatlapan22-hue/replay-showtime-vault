
-- Coin balances
CREATE TABLE public.coin_balances (
  user_id uuid PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coin_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own balance" ON public.coin_balances FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all balances" ON public.coin_balances FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins manage balances" ON public.coin_balances FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- Coin transactions
CREATE TABLE public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  related_order_id uuid,
  related_show_id uuid,
  related_replay_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coin_tx_user ON public.coin_transactions(user_id, created_at DESC);
CREATE INDEX idx_coin_tx_order ON public.coin_transactions(related_order_id);
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own coin tx" ON public.coin_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage coin tx" ON public.coin_transactions FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- Coin packages
CREATE TABLE public.coin_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT '',
  price_idr integer NOT NULL DEFAULT 0,
  coins integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coin_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view coin packages" ON public.coin_packages FOR SELECT TO public USING (true);
CREATE POLICY "Admins manage coin packages" ON public.coin_packages FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_coin_packages_updated BEFORE UPDATE ON public.coin_packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Coin price columns on shows & replays
ALTER TABLE public.active_shows ADD COLUMN IF NOT EXISTS price_show_coins integer NOT NULL DEFAULT 0;
ALTER TABLE public.active_shows ADD COLUMN IF NOT EXISTS price_replay_coins integer NOT NULL DEFAULT 0;
ALTER TABLE public.replays ADD COLUMN IF NOT EXISTS price_coins integer NOT NULL DEFAULT 0;

-- Orders extensions
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'show';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coin_package_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coin_amount integer NOT NULL DEFAULT 0;

-- grant_coins atomic function
CREATE OR REPLACE FUNCTION public.grant_coins(_user_id uuid, _delta integer, _reason text, _meta jsonb DEFAULT '{}'::jsonb, _order_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  IF _user_id IS NULL OR _delta IS NULL OR _delta = 0 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  INSERT INTO public.coin_balances(user_id, balance, updated_at)
  VALUES (_user_id, GREATEST(0,_delta), now())
  ON CONFLICT (user_id) DO UPDATE SET balance = public.coin_balances.balance + _delta, updated_at = now()
  RETURNING balance INTO v_new;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;
  INSERT INTO public.coin_transactions(user_id, delta, reason, meta, related_order_id)
  VALUES (_user_id, _delta, _reason, COALESCE(_meta,'{}'::jsonb), _order_id);
  RETURN v_new;
END;
$$;

-- Atomic debit (returns new balance or NULL when insufficient)
CREATE OR REPLACE FUNCTION public.debit_coins_for_purchase(_user_id uuid, _price integer, _reason text, _show_id uuid, _replay_id uuid, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  IF _price <= 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  UPDATE public.coin_balances
    SET balance = balance - _price, updated_at = now()
    WHERE user_id = _user_id AND balance >= _price
    RETURNING balance INTO v_new;
  IF v_new IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.coin_transactions(user_id, delta, reason, meta, related_show_id, related_replay_id)
  VALUES (_user_id, -_price, _reason, COALESCE(_meta,'{}'::jsonb), _show_id, _replay_id);
  RETURN v_new;
END;
$$;
