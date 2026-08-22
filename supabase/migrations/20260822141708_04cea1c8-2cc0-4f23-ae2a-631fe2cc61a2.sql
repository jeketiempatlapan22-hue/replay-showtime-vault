CREATE OR REPLACE FUNCTION public.cleanup_expired_membership_proofs()
RETURNS TABLE(deleted_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH d AS (
    DELETE FROM public.membership_payment_proofs
    WHERE expires_at < now() OR created_at < now() - interval '3 days'
    RETURNING image_path
  )
  SELECT image_path FROM d WHERE image_path IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_membership_proofs()
RETURNS SETOF public.membership_payment_proofs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.membership_payment_proofs
  WHERE expires_at < now() OR created_at < now() - interval '3 days';
  RETURN QUERY SELECT * FROM public.membership_payment_proofs ORDER BY created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.prune_proofs_and_storage()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_paths text[]; v_count integer := 0;
BEGIN
  SELECT coalesce(array_agg(deleted_path), '{}') INTO v_paths FROM public.cleanup_expired_membership_proofs();
  v_count := coalesce(array_length(v_paths, 1), 0);
  IF v_count > 0 THEN
    DELETE FROM storage.objects WHERE bucket_id = 'membership-proofs' AND name = ANY(v_paths);
  END IF;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.prune_proofs_and_storage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_proofs_and_storage() TO service_role;

SELECT public.prune_proofs_and_storage();

DO $$ BEGIN
  PERFORM cron.unschedule('prune-proofs-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('prune-proofs-daily', '15 3 * * *', $$select public.prune_proofs_and_storage();$$);