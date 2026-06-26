
CREATE OR REPLACE FUNCTION public.admin_delete_reseller_copy_entry(
  _phone text,
  _kind text,
  _target_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_log_deleted int := 0;
  v_tokens_deleted int := 0;
  v_tokens text[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF _phone IS NULL OR _kind IS NULL THEN
    RAISE EXCEPTION 'missing_args';
  END IF;

  -- collect tokens from audit log matching this reseller+kind+target
  SELECT COALESCE(array_agg(token), ARRAY[]::text[]) INTO v_tokens
  FROM public.reseller_audit_log
  WHERE reseller_phone = _phone
    AND kind = _kind
    AND (_target_id IS NULL OR target_id = _target_id)
    AND token IS NOT NULL;

  -- delete actual tokens from website to free space
  IF _kind = 'show' THEN
    DELETE FROM public.active_show_token_devices
      WHERE token_id IN (SELECT id FROM public.active_show_tokens WHERE token = ANY(v_tokens));
    DELETE FROM public.active_show_tokens WHERE token = ANY(v_tokens);
    GET DIAGNOSTICS v_tokens_deleted = ROW_COUNT;
  ELSIF _kind = 'replay' THEN
    DELETE FROM public.replay_token_devices
      WHERE token_id IN (SELECT id FROM public.replay_personal_tokens WHERE token = ANY(v_tokens));
    DELETE FROM public.replay_personal_tokens WHERE token = ANY(v_tokens);
    GET DIAGNOSTICS v_tokens_deleted = ROW_COUNT;
  ELSIF _kind = 'membership' THEN
    DELETE FROM public.membership_token_devices
      WHERE token_id IN (SELECT id FROM public.membership_tokens WHERE token = ANY(v_tokens));
    DELETE FROM public.membership_tokens WHERE token = ANY(v_tokens);
    GET DIAGNOSTICS v_tokens_deleted = ROW_COUNT;
  END IF;

  -- delete copy log entries
  DELETE FROM public.reseller_copy_log
  WHERE reseller_phone = _phone
    AND kind = _kind
    AND (_target_id IS NULL OR target_id = _target_id);
  GET DIAGNOSTICS v_log_deleted = ROW_COUNT;

  -- delete audit log entries too (so re-aggregation is clean)
  DELETE FROM public.reseller_audit_log
  WHERE reseller_phone = _phone
    AND kind = _kind
    AND (_target_id IS NULL OR target_id = _target_id);

  RETURN jsonb_build_object(
    'log_deleted', v_log_deleted,
    'tokens_deleted', v_tokens_deleted
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_delete_reseller_copy_entry(text, text, uuid) TO authenticated;
