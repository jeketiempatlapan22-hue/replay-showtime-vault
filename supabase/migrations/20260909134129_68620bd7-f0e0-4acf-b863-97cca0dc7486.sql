CREATE POLICY "Admins update card images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'card-images' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'card-images' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.admin_set_reseller_copy_count(_phone text, _kind text, _target_id uuid, _count integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current integer;
  v_label text := '';
  v_title text := '';
  i integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _count IS NULL OR _count < 0 OR _count > 100000 THEN RAISE EXCEPTION 'invalid_count'; END IF;

  SELECT count(*) INTO v_current FROM public.reseller_copy_log
   WHERE reseller_phone = _phone AND kind = _kind
     AND (target_id IS NOT DISTINCT FROM _target_id);

  SELECT COALESCE(MAX(reseller_label),''), COALESCE(MAX(target_title),'')
    INTO v_label, v_title
  FROM public.reseller_copy_log
   WHERE reseller_phone = _phone AND kind = _kind
     AND (target_id IS NOT DISTINCT FROM _target_id);

  IF _count < v_current THEN
    DELETE FROM public.reseller_copy_log
     WHERE id IN (
       SELECT id FROM public.reseller_copy_log
        WHERE reseller_phone = _phone AND kind = _kind
          AND (target_id IS NOT DISTINCT FROM _target_id)
        ORDER BY created_at ASC
        LIMIT (v_current - _count)
     );
  ELSIF _count > v_current THEN
    FOR i IN 1..(_count - v_current) LOOP
      INSERT INTO public.reseller_copy_log(reseller_phone, reseller_label, kind, target_id, target_title)
      VALUES (_phone, v_label, _kind, _target_id, v_title);
    END LOOP;
  END IF;

  RETURN _count;
END; $$;