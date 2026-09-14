CREATE TABLE public.show_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Bundel Semua Show',
  description text NOT NULL DEFAULT 'Satu link + satu sandi untuk semua show yang tersedia.',
  is_active boolean NOT NULL DEFAULT true,
  discount_idr integer NOT NULL DEFAULT 2000,
  discount_coins integer NOT NULL DEFAULT 1,
  price_idr integer NOT NULL DEFAULT 0,
  price_coins integer NOT NULL DEFAULT 0,
  show_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.show_bundles TO anon, authenticated;
GRANT ALL ON public.show_bundles TO service_role;
ALTER TABLE public.show_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bundle public read" ON public.show_bundles FOR SELECT USING (true);
CREATE POLICY "Admins manage bundle" ON public.show_bundles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.show_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.show_bundles(id) ON DELETE CASCADE,
  show_id uuid NOT NULL REFERENCES public.active_shows(id) ON DELETE CASCADE,
  excluded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, show_id)
);
GRANT SELECT ON public.show_bundle_items TO anon, authenticated;
GRANT ALL ON public.show_bundle_items TO service_role;
ALTER TABLE public.show_bundle_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bundle items public read" ON public.show_bundle_items FOR SELECT USING (true);
CREATE POLICY "Admins manage bundle items" ON public.show_bundle_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.show_bundle_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.show_bundles(id) ON DELETE CASCADE,
  password text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.show_bundle_passwords TO service_role;
ALTER TABLE public.show_bundle_passwords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bundle passwords" ON public.show_bundle_passwords FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.show_bundle_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.show_bundles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  password text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  user_id uuid,
  phone text NOT NULL DEFAULT '',
  order_id uuid,
  show_ids uuid[] NOT NULL DEFAULT '{}',
  max_devices integer NOT NULL DEFAULT 1,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX show_bundle_tokens_user_idx ON public.show_bundle_tokens (user_id);
CREATE INDEX show_bundle_tokens_phone_idx ON public.show_bundle_tokens (phone);
GRANT ALL ON public.show_bundle_tokens TO service_role;
ALTER TABLE public.show_bundle_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bundle tokens" ON public.show_bundle_tokens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER show_bundles_updated_at BEFORE UPDATE ON public.show_bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER show_bundle_items_updated_at BEFORE UPDATE ON public.show_bundle_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER show_bundle_tokens_updated_at BEFORE UPDATE ON public.show_bundle_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.gen_bundle_password()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'BUNDLE' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
$$;

CREATE OR REPLACE FUNCTION public.sync_show_bundle()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.show_bundles;
  before_count integer;
  after_count integer;
  sum_idr integer;
  sum_coins integer;
BEGIN
  SELECT * INTO b FROM public.show_bundles ORDER BY created_at LIMIT 1;
  IF b.id IS NULL THEN
    INSERT INTO public.show_bundles DEFAULT VALUES RETURNING * INTO b;
    INSERT INTO public.show_bundle_passwords (bundle_id, password)
      VALUES (b.id, public.gen_bundle_password());
  END IF;

  INSERT INTO public.show_bundle_items (bundle_id, show_id)
  SELECT b.id, s.id FROM public.active_shows s
  WHERE s.is_active = true AND s.replay_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.show_bundle_items i WHERE i.bundle_id = b.id AND i.show_id = s.id
    );

  before_count := b.show_count;

  SELECT coalesce(sum(coalesce(s.price_show, 0)), 0),
         coalesce(sum(coalesce(s.price_show_coins, 0)), 0),
         count(*)
    INTO sum_idr, sum_coins, after_count
  FROM public.show_bundle_items i
  JOIN public.active_shows s ON s.id = i.show_id
  WHERE i.bundle_id = b.id AND i.excluded = false
    AND s.is_active = true AND s.replay_id IS NULL;

  UPDATE public.show_bundles SET
    price_idr = CASE WHEN after_count > 0 THEN greatest(0, sum_idr - b.discount_idr) ELSE 0 END,
    price_coins = CASE WHEN after_count > 0 THEN greatest(0, sum_coins - b.discount_coins) ELSE 0 END,
    show_count = after_count,
    updated_at = now()
  WHERE id = b.id;

  IF after_count < before_count THEN
    UPDATE public.show_bundle_passwords SET is_current = false
      WHERE bundle_id = b.id AND is_current = true;
    INSERT INTO public.show_bundle_passwords (bundle_id, password)
      VALUES (b.id, public.gen_bundle_password());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.show_bundle_passwords WHERE bundle_id = b.id AND is_current = true) THEN
    INSERT INTO public.show_bundle_passwords (bundle_id, password)
      VALUES (b.id, public.gen_bundle_password());
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_show_bundle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_show_bundle();
  RETURN NULL;
END;
$$;

CREATE TRIGGER active_shows_sync_bundle
AFTER INSERT OR UPDATE OR DELETE ON public.active_shows
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_sync_show_bundle();

CREATE OR REPLACE FUNCTION public.get_show_bundle()
RETURNS TABLE (
  id uuid, name text, description text, is_active boolean,
  price_idr integer, price_coins integer, show_count integer, show_ids uuid[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.name, b.description, b.is_active, b.price_idr, b.price_coins, b.show_count,
    coalesce((
      SELECT array_agg(i.show_id)
      FROM public.show_bundle_items i
      JOIN public.active_shows s ON s.id = i.show_id
      WHERE i.bundle_id = b.id AND i.excluded = false AND s.is_active = true AND s.replay_id IS NULL
    ), '{}'::uuid[])
  FROM public.show_bundles b
  ORDER BY b.created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.admin_get_show_bundle()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.show_bundles; result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT * INTO b FROM public.show_bundles ORDER BY created_at LIMIT 1;
  IF b.id IS NULL THEN RETURN NULL; END IF;
  result := jsonb_build_object(
    'bundle', to_jsonb(b),
    'current_password', (SELECT password FROM public.show_bundle_passwords WHERE bundle_id = b.id AND is_current ORDER BY created_at DESC LIMIT 1),
    'passwords', coalesce((SELECT jsonb_agg(jsonb_build_object('password', p.password, 'is_current', p.is_current, 'created_at', p.created_at) ORDER BY p.created_at DESC) FROM public.show_bundle_passwords p WHERE p.bundle_id = b.id), '[]'::jsonb),
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'show_id', s.id, 'title', s.title, 'show_date', s.show_date,
        'price_show', s.price_show, 'price_show_coins', s.price_show_coins,
        'excluded', i.excluded, 'converted', (s.replay_id IS NOT NULL), 'is_active', s.is_active
      ) ORDER BY s.show_date, s.title)
      FROM public.show_bundle_items i JOIN public.active_shows s ON s.id = i.show_id
      WHERE i.bundle_id = b.id), '[]'::jsonb),
    'tokens', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'token', t.token, 'password', t.password, 'label', t.label, 'phone', t.phone,
        'revoked', t.revoked, 'created_at', t.created_at, 'shows', array_length(t.show_ids, 1)
      ) ORDER BY t.created_at DESC)
      FROM public.show_bundle_tokens t WHERE t.bundle_id = b.id), '[]'::jsonb)
  );
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_bundle_show(_show_id uuid, _excluded boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT id INTO b_id FROM public.show_bundles ORDER BY created_at LIMIT 1;
  IF b_id IS NULL THEN RAISE EXCEPTION 'no_bundle'; END IF;
  INSERT INTO public.show_bundle_items (bundle_id, show_id, excluded)
  VALUES (b_id, _show_id, _excluded)
  ON CONFLICT (bundle_id, show_id) DO UPDATE SET excluded = EXCLUDED.excluded, updated_at = now();
  PERFORM public.sync_show_bundle();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_bundle_active(_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.show_bundles SET is_active = _active, updated_at = now()
  WHERE id = (SELECT id FROM public.show_bundles ORDER BY created_at LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_rotate_bundle_password()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b_id uuid; newpw text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT id INTO b_id FROM public.show_bundles ORDER BY created_at LIMIT 1;
  IF b_id IS NULL THEN RAISE EXCEPTION 'no_bundle'; END IF;
  UPDATE public.show_bundle_passwords SET is_current = false WHERE bundle_id = b_id AND is_current;
  newpw := public.gen_bundle_password();
  INSERT INTO public.show_bundle_passwords (bundle_id, password) VALUES (b_id, newpw);
  RETURN newpw;
END;
$$;

SELECT public.sync_show_bundle();