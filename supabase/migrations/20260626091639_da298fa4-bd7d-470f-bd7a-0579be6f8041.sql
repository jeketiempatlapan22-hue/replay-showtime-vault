
-- 1. Table
CREATE TABLE IF NOT EXISTS public.membership_payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.membership_orders(id) ON DELETE SET NULL,
  user_id uuid,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  package_name text NOT NULL DEFAULT '',
  amount integer NOT NULL DEFAULT 0,
  image_path text NOT NULL,
  note text NOT NULL DEFAULT '',
  handled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_payment_proofs TO authenticated;
GRANT INSERT ON public.membership_payment_proofs TO anon;
GRANT ALL ON public.membership_payment_proofs TO service_role;

ALTER TABLE public.membership_payment_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone insert proof" ON public.membership_payment_proofs;
CREATE POLICY "anyone insert proof" ON public.membership_payment_proofs
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS "admin manage proofs" ON public.membership_payment_proofs;
CREATE POLICY "admin manage proofs" ON public.membership_payment_proofs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_mpp_expires_at ON public.membership_payment_proofs(expires_at);
CREATE INDEX IF NOT EXISTS idx_mpp_created_at ON public.membership_payment_proofs(created_at DESC);

-- 2. Storage policies for the membership-proofs bucket
DROP POLICY IF EXISTS "proofs anyone upload" ON storage.objects;
CREATE POLICY "proofs anyone upload" ON storage.objects
  FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id = 'membership-proofs');

DROP POLICY IF EXISTS "proofs admin read" ON storage.objects;
CREATE POLICY "proofs admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'membership-proofs' AND public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "proofs admin delete" ON storage.objects;
CREATE POLICY "proofs admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'membership-proofs' AND public.has_role(auth.uid(),'admin'::app_role));

-- 3. Cleanup function (drops rows + storage files)
CREATE OR REPLACE FUNCTION public.cleanup_expired_membership_proofs()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer := 0;
BEGIN
  -- Delete storage files first
  DELETE FROM storage.objects
    WHERE bucket_id = 'membership-proofs'
      AND name IN (SELECT image_path FROM public.membership_payment_proofs WHERE expires_at < now());
  -- Then DB rows
  WITH d AS (
    DELETE FROM public.membership_payment_proofs WHERE expires_at < now() RETURNING 1
  ) SELECT COUNT(*) INTO v_count FROM d;
  RETURN v_count;
END $$;

-- 4. Admin RPCs
CREATE OR REPLACE FUNCTION public.admin_list_membership_proofs()
RETURNS SETOF public.membership_payment_proofs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.cleanup_expired_membership_proofs();
  RETURN QUERY SELECT * FROM public.membership_payment_proofs ORDER BY created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_proof_handled(_id uuid, _handled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.membership_payment_proofs SET handled = _handled WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_membership_proof(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_path text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT image_path INTO v_path FROM public.membership_payment_proofs WHERE id = _id;
  IF v_path IS NOT NULL THEN
    DELETE FROM storage.objects WHERE bucket_id = 'membership-proofs' AND name = v_path;
  END IF;
  DELETE FROM public.membership_payment_proofs WHERE id = _id;
END $$;

-- 5. Cron daily cleanup
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-membership-proofs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-membership-proofs',
  '17 3 * * *',
  $$ SELECT public.cleanup_expired_membership_proofs(); $$
);
