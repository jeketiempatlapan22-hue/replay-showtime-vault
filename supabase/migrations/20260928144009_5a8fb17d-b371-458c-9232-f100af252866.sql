CREATE TABLE public.membership_replay_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  password text NOT NULL,
  token text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  membership_expires_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.membership_replay_passwords TO service_role;
ALTER TABLE public.membership_replay_passwords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read replay passwords" ON public.membership_replay_passwords FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.membership_replay_passwords TO authenticated;
CREATE INDEX ON public.membership_replay_passwords (upper(password));

CREATE OR REPLACE FUNCTION public.trg_membership_replay_pw() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.includes_replays AND coalesce(NEW.password,'') <> '' THEN
    INSERT INTO membership_replay_passwords(password, token, starts_at, membership_expires_at, valid_until)
    VALUES (NEW.password, NEW.token, NEW.starts_at, NEW.expires_at, greatest(NEW.expires_at, NEW.created_at + interval '365 days'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER membership_replay_pw_ins AFTER INSERT ON public.membership_tokens FOR EACH ROW EXECUTE FUNCTION public.trg_membership_replay_pw();

CREATE OR REPLACE FUNCTION public.trg_membership_rot_pw() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM membership_tokens WHERE id = NEW.token_id;
  IF FOUND AND t.includes_replays AND NEW.password <> t.password THEN
    INSERT INTO membership_replay_passwords(password, token, starts_at, membership_expires_at, valid_until)
    VALUES (NEW.password, t.token, t.starts_at, t.expires_at, greatest(t.expires_at, t.created_at + interval '365 days'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER membership_rot_pw_ins AFTER INSERT ON public.membership_token_passwords FOR EACH ROW EXECUTE FUNCTION public.trg_membership_rot_pw();

INSERT INTO membership_replay_passwords(password, token, starts_at, membership_expires_at, valid_until)
SELECT t.password, t.token, t.starts_at, t.expires_at, greatest(t.expires_at, t.created_at + interval '365 days')
FROM membership_tokens t WHERE t.includes_replays AND coalesce(t.password,'') <> '';
INSERT INTO membership_replay_passwords(password, token, starts_at, membership_expires_at, valid_until)
SELECT p.password, t.token, t.starts_at, t.expires_at, greatest(t.expires_at, t.created_at + interval '365 days')
FROM membership_token_passwords p JOIN membership_tokens t ON t.id = p.token_id
WHERE t.includes_replays AND p.password <> t.password;