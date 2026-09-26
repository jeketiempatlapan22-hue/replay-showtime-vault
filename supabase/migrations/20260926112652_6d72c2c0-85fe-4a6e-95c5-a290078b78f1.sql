CREATE TABLE public.membership_token_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.membership_tokens(id) ON DELETE CASCADE,
  password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.membership_token_passwords(token_id, created_at DESC);
GRANT SELECT ON public.membership_token_passwords TO authenticated;
GRANT ALL ON public.membership_token_passwords TO service_role;
ALTER TABLE public.membership_token_passwords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read token passwords" ON public.membership_token_passwords FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.membership_tokens ADD COLUMN IF NOT EXISTS password_rotating boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.gen_short_password()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random()*32)::int, 1), '') FROM generate_series(1,6)
$$;

CREATE OR REPLACE FUNCTION public.rotate_membership_passwords()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; r record; p text;
BEGIN
  FOR r IN SELECT t.id FROM membership_tokens t
    WHERE t.password_rotating AND NOT t.revoked AND t.expires_at > now()
      AND NOT EXISTS (SELECT 1 FROM membership_token_passwords x WHERE x.token_id = t.id AND x.created_at > now() - interval '23 hours 50 minutes')
  LOOP
    p := gen_short_password();
    INSERT INTO membership_token_passwords(token_id, password) VALUES (r.id, p);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.purge_expired_membership_tokens()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM membership_token_devices WHERE token_id IN (SELECT id FROM membership_tokens WHERE expires_at < now());
  DELETE FROM membership_tokens WHERE expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.rotate_membership_passwords() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_expired_membership_tokens() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('membership-token-maintenance', '7 * * * *', $$SELECT public.purge_expired_membership_tokens(); SELECT public.rotate_membership_passwords();$$);