-- Staging tables for one-time import
CREATE TABLE IF NOT EXISTS public._imp_auth_users (
  instance_id uuid, id uuid PRIMARY KEY, aud text, role text,
  email text, encrypted_password text, email_confirmed_at timestamptz,
  invited_at timestamptz, confirmation_token text, confirmation_sent_at timestamptz,
  recovery_token text, recovery_sent_at timestamptz,
  email_change_token_new text, email_change text, email_change_sent_at timestamptz,
  last_sign_in_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  is_super_admin boolean, created_at timestamptz, updated_at timestamptz,
  phone text, phone_confirmed_at timestamptz, phone_change text,
  phone_change_token text, phone_change_sent_at timestamptz, confirmed_at timestamptz,
  email_change_token_current text, email_change_confirm_status smallint,
  banned_until timestamptz, reauthentication_token text, reauthentication_sent_at timestamptz,
  is_sso_user boolean, deleted_at timestamptz, is_anonymous boolean
);

CREATE TABLE IF NOT EXISTS public._imp_auth_identities (
  provider_id text, user_id uuid, identity_data jsonb, provider text,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
  email text, id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public._imp_profiles (
  id uuid PRIMARY KEY, username text, avatar_url text,
  created_at timestamptz, updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public._imp_coin_balances (
  id uuid PRIMARY KEY, user_id uuid, balance integer, updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public._imp_coin_transactions (
  id uuid PRIMARY KEY, user_id uuid, amount integer, type text,
  description text, reference_id uuid, created_at timestamptz
);

CREATE TABLE IF NOT EXISTS public._imp_coin_orders (
  id uuid PRIMARY KEY, user_id uuid, package_id uuid, coin_amount integer,
  status text, payment_proof_url text, created_at timestamptz, short_id text,
  phone text, price text, payment_gateway_order_id text,
  expires_at timestamptz, payment_method text
);

ALTER TABLE public._imp_auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._imp_auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._imp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._imp_coin_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._imp_coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._imp_coin_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins only" ON public._imp_auth_users FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admins only" ON public._imp_auth_identities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admins only" ON public._imp_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admins only" ON public._imp_coin_balances FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admins only" ON public._imp_coin_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admins only" ON public._imp_coin_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));