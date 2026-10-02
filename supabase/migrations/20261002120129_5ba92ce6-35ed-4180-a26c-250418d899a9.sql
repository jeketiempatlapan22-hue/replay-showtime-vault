-- 1) Jangan hapus link membership seketika saat kedaluwarsa: beri masa tenggang 45 hari
CREATE OR REPLACE FUNCTION public.purge_expired_membership_tokens()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM membership_token_devices WHERE token_id IN (SELECT id FROM membership_tokens WHERE expires_at < now() - interval '45 days');
  DELETE FROM membership_tokens WHERE expires_at < now() - interval '45 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.purge_expired_membership_tokens() FROM PUBLIC, anon, authenticated;

-- 2) Pulihkan link member lama (paket Membership September) yang terhapus, diperpanjang 31 hari sesuai durasi baru admin
INSERT INTO public.membership_tokens(token, password, label, duration_days, starts_at, expires_at, includes_replays, max_devices, created_by, package_id)
SELECT r.token, r.password, 'pkg:Membership September (dipulihkan)', 31, r.starts_at,
       r.membership_expires_at + interval '31 days', true, 1, 'restore', 'efa64d4e-0c61-46f9-a657-0749fa60d7ea'
FROM public.membership_replay_passwords r
WHERE r.token IS NOT NULL AND r.token <> ''
  AND NOT EXISTS (SELECT 1 FROM public.membership_tokens t WHERE t.token = r.token)
  AND r.membership_expires_at < now();

UPDATE public.membership_replay_passwords r
SET membership_expires_at = t.expires_at,
    valid_until = GREATEST(r.valid_until, t.expires_at + interval '365 days')
FROM public.membership_tokens t
WHERE t.token = r.token AND t.created_by = 'restore';

-- 3) Saat admin ubah durasi paket, sandi replay member ikut diperbarui
CREATE OR REPLACE FUNCTION public.admin_sync_package_duration(_package_id uuid, _include_expired boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _pkg RECORD; _count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO _pkg FROM public.membership_packages WHERE id = _package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found'; END IF;

  WITH calc AS (
    SELECT t.id,
      CASE WHEN _pkg.fixed_starts_at IS NOT NULL THEN LEAST(_pkg.fixed_starts_at, now()) ELSE LEAST(t.starts_at, now()) END AS ns
    FROM public.membership_tokens t
    WHERE t.package_id = _package_id AND t.revoked = false
  ), calc2 AS (
    SELECT id, ns, COALESCE(_pkg.fixed_expires_at, ns + (_pkg.duration_days || ' days')::interval) AS ne FROM calc
  )
  UPDATE public.membership_tokens t
  SET duration_days = _pkg.duration_days, max_devices = _pkg.max_devices, includes_replays = _pkg.includes_replays,
      starts_at = c.ns, expires_at = c.ne, updated_at = now()
  FROM calc2 c
  WHERE t.id = c.id AND (_include_expired OR c.ne > now());
  GET DIAGNOSTICS _count = ROW_COUNT;

  UPDATE public.membership_replay_passwords r
  SET membership_expires_at = t.expires_at, starts_at = LEAST(r.starts_at, t.starts_at),
      valid_until = GREATEST(r.valid_until, t.expires_at + interval '365 days')
  FROM public.membership_tokens t
  WHERE t.token = r.token AND t.package_id = _package_id AND t.revoked = false;

  RETURN _count;
END;
$function$;