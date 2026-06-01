
-- =============================================================
-- 1. Tabel harga per-show untuk reseller (override harga default)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.reseller_show_prices (
  show_id uuid PRIMARY KEY,
  price_per_link integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reseller_show_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_show_prices TO authenticated;
GRANT ALL ON public.reseller_show_prices TO service_role;

ALTER TABLE public.reseller_show_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view reseller_show_prices"
  ON public.reseller_show_prices FOR SELECT
  USING (true);

CREATE POLICY "Admins manage reseller_show_prices"
  ON public.reseller_show_prices FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================================
-- 2. Tabel tagihan reseller
-- =============================================================
CREATE TABLE IF NOT EXISTS public.reseller_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_phone text NOT NULL,
  reseller_label text NOT NULL DEFAULT '',
  amount integer NOT NULL DEFAULT 0,
  computed_amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  pakasir_order_id text,
  pakasir_qr_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reseller_bills_phone ON public.reseller_bills(reseller_phone, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_bills TO authenticated;
GRANT ALL ON public.reseller_bills TO service_role;

ALTER TABLE public.reseller_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage reseller_bills"
  ON public.reseller_bills FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_reseller_bills_updated
  BEFORE UPDATE ON public.reseller_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================
-- 3. Hitung tagihan reseller berdasarkan log salin × harga per show
--    (fallback ke harga default site_settings.reseller_price_per_link)
-- =============================================================
CREATE OR REPLACE FUNCTION public.reseller_compute_bill(_phone text, _pin text)
RETURNS TABLE(
  target_id uuid, target_title text, kind text, copies bigint,
  price_per_link integer, subtotal bigint, total bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_default integer := 0;
  v_total bigint := 0;
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT COALESCE(NULLIF(value,'')::integer, 0) INTO v_default
    FROM public.site_settings WHERE key = 'reseller_price_per_link' LIMIT 1;
  v_default := COALESCE(v_default, 0);

  RETURN QUERY
  WITH grouped AS (
    SELECT l.kind, l.target_id, MAX(l.target_title) AS target_title, COUNT(*)::bigint AS copies
    FROM public.reseller_copy_log l
    WHERE l.reseller_phone = _phone AND l.target_id IS NOT NULL
    GROUP BY l.kind, l.target_id
  ),
  priced AS (
    SELECT g.target_id, g.target_title, g.kind, g.copies,
      COALESCE(
        (SELECT p.price_per_link FROM public.reseller_show_prices p WHERE p.show_id = g.target_id),
        v_default
      )::integer AS price_per_link
    FROM grouped g
  )
  SELECT p.target_id, p.target_title, p.kind, p.copies, p.price_per_link,
    (p.copies * p.price_per_link)::bigint AS subtotal,
    (SUM(p.copies * p.price_per_link) OVER ())::bigint AS total
  FROM priced p
  ORDER BY p.target_title;
END; $$;

-- =============================================================
-- 4. Ambil tagihan aktif (pending) milik reseller
-- =============================================================
CREATE OR REPLACE FUNCTION public.reseller_get_active_bill(_phone text, _pin text)
RETURNS TABLE(
  id uuid, amount integer, computed_amount integer, status text,
  breakdown jsonb, pakasir_order_id text, pakasir_qr_url text,
  created_at timestamptz, paid_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
    SELECT b.id, b.amount, b.computed_amount, b.status, b.breakdown,
           b.pakasir_order_id, b.pakasir_qr_url, b.created_at, b.paid_at
    FROM public.reseller_bills b
    WHERE b.reseller_phone = _phone AND b.status IN ('pending','paid')
    ORDER BY b.created_at DESC
    LIMIT 1;
END; $$;

-- =============================================================
-- 5. Buat tagihan baru untuk reseller (intent — sebelum order Pakasir)
-- =============================================================
CREATE OR REPLACE FUNCTION public.reseller_create_bill_intent(_phone text, _pin text)
RETURNS TABLE(bill_id uuid, amount integer, breakdown jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_label text := '';
  v_total bigint := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_id uuid;
  v_existing public.reseller_bills%ROWTYPE;
BEGIN
  IF NOT public.reseller_verify(_phone, _pin) THEN RAISE EXCEPTION 'unauthorized'; END IF;

  -- Re-use pending bill jika ada (cegah duplikat)
  SELECT * INTO v_existing FROM public.reseller_bills
    WHERE reseller_phone = _phone AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.amount, v_existing.breakdown; RETURN;
  END IF;

  SELECT COALESCE(label,'') INTO v_label FROM public.bot_admins WHERE phone = _phone LIMIT 1;

  SELECT
    COALESCE(SUM(s.copies * s.price_per_link), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'target_id', s.target_id, 'title', s.target_title, 'kind', s.kind,
      'copies', s.copies, 'price_per_link', s.price_per_link,
      'subtotal', s.copies * s.price_per_link
    )), '[]'::jsonb)
  INTO v_total, v_breakdown
  FROM public.reseller_compute_bill(_phone, _pin) s;

  IF COALESCE(v_total, 0) <= 0 THEN RAISE EXCEPTION 'no_bill'; END IF;

  INSERT INTO public.reseller_bills(reseller_phone, reseller_label, amount, computed_amount, status, breakdown)
  VALUES (_phone, COALESCE(v_label,''), v_total::integer, v_total::integer, 'pending', v_breakdown)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_total::integer, v_breakdown;
END; $$;

-- =============================================================
-- 6. Admin override jumlah tagihan
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_override_reseller_bill(_bill_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _amount IS NULL OR _amount < 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  UPDATE public.reseller_bills
    SET amount = _amount, updated_at = now()
    WHERE id = _bill_id AND status = 'pending';
END; $$;

-- =============================================================
-- 7. Tandai tagihan lunas → hapus log salin reseller tsb
-- =============================================================
CREATE OR REPLACE FUNCTION public.mark_reseller_bill_paid(_bill_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_phone text;
BEGIN
  SELECT reseller_phone INTO v_phone FROM public.reseller_bills WHERE id = _bill_id FOR UPDATE;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'bill_not_found'; END IF;
  UPDATE public.reseller_bills
    SET status = 'paid', paid_at = COALESCE(paid_at, now()), updated_at = now()
    WHERE id = _bill_id;
  DELETE FROM public.reseller_copy_log WHERE reseller_phone = v_phone;
END; $$;

-- =============================================================
-- 8. Admin stats per reseller dengan harga & subtotal
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_reseller_billing_summary()
RETURNS TABLE(
  reseller_phone text, reseller_label text,
  total_links bigint, total_amount bigint, has_pending boolean, pending_bill_id uuid, pending_amount integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_default integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(NULLIF(value,'')::integer, 0) INTO v_default
    FROM public.site_settings WHERE key = 'reseller_price_per_link' LIMIT 1;
  v_default := COALESCE(v_default, 0);

  RETURN QUERY
  WITH base AS (
    SELECT l.reseller_phone, MAX(l.reseller_label) AS reseller_label,
           l.target_id, COUNT(*)::bigint AS copies,
           COALESCE((SELECT p.price_per_link FROM public.reseller_show_prices p WHERE p.show_id = l.target_id), v_default) AS price
    FROM public.reseller_copy_log l
    WHERE l.target_id IS NOT NULL
    GROUP BY l.reseller_phone, l.target_id
  ),
  sums AS (
    SELECT reseller_phone, MAX(reseller_label) AS reseller_label,
           SUM(copies)::bigint AS total_links,
           SUM(copies * price)::bigint AS total_amount
    FROM base GROUP BY reseller_phone
  )
  SELECT s.reseller_phone, s.reseller_label, s.total_links, s.total_amount,
    EXISTS(SELECT 1 FROM public.reseller_bills b WHERE b.reseller_phone = s.reseller_phone AND b.status='pending') AS has_pending,
    (SELECT b.id FROM public.reseller_bills b WHERE b.reseller_phone = s.reseller_phone AND b.status='pending' ORDER BY b.created_at DESC LIMIT 1),
    (SELECT b.amount FROM public.reseller_bills b WHERE b.reseller_phone = s.reseller_phone AND b.status='pending' ORDER BY b.created_at DESC LIMIT 1)
  FROM sums s
  ORDER BY s.total_amount DESC NULLS LAST;
END; $$;

-- Default harga (jika belum ada baris)
INSERT INTO public.site_settings(key, value)
  VALUES ('reseller_price_per_link', '0')
  ON CONFLICT DO NOTHING;
