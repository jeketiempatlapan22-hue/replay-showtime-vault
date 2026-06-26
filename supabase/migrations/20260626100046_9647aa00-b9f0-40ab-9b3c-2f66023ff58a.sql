DROP FUNCTION IF EXISTS public.cleanup_expired_membership_proofs();
DROP FUNCTION IF EXISTS public.admin_delete_membership_proof(uuid);

CREATE OR REPLACE FUNCTION public.cleanup_expired_membership_proofs()
RETURNS TABLE(deleted_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH d AS (
    DELETE FROM public.membership_payment_proofs
    WHERE expires_at < now()
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
  DELETE FROM public.membership_payment_proofs WHERE expires_at < now();
  RETURN QUERY SELECT * FROM public.membership_payment_proofs ORDER BY created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_membership_proof(_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_path text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT image_path INTO v_path FROM public.membership_payment_proofs WHERE id = _id;
  DELETE FROM public.membership_payment_proofs WHERE id = _id;
  RETURN v_path;
END $$;

-- Drop the broken SQL cron; cleanup of storage files is handled client-side
-- (admin delete) and by the periodic edge function below.
DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-membership-proofs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;