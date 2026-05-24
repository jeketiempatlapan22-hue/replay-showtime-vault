
CREATE OR REPLACE FUNCTION public.get_my_memberships()
RETURNS TABLE(
  order_id uuid,
  package_id uuid,
  package_name text,
  status text,
  kind text,
  amount integer,
  coin_amount integer,
  created_at timestamptz,
  reserved_until timestamptz,
  paid_at timestamptz,
  email text,
  phone text,
  token text,
  password text,
  expires_at timestamptz,
  starts_at timestamptz,
  duration_days integer,
  max_devices integer,
  includes_replays boolean,
  days_remaining integer,
  revoked boolean,
  package_paused boolean,
  pause_message text,
  pakasir_qr_url text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id AS order_id,
    o.package_id,
    p.name AS package_name,
    o.status,
    o.kind,
    o.amount,
    o.coin_amount,
    o.created_at,
    o.reserved_until,
    o.paid_at,
    o.email,
    o.phone,
    t.token,
    t.password,
    t.expires_at,
    t.starts_at,
    COALESCE(t.duration_days, p.duration_days) AS duration_days,
    COALESCE(t.max_devices, p.max_devices) AS max_devices,
    COALESCE(t.includes_replays, p.includes_replays) AS includes_replays,
    CASE
      WHEN t.expires_at IS NULL THEN NULL
      ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (t.expires_at - now())) / 86400.0))::int
    END AS days_remaining,
    COALESCE(t.revoked, false) AS revoked,
    COALESCE(p.paused, false) AS package_paused,
    COALESCE(p.pause_message, '') AS pause_message,
    COALESCE(o.pakasir_qr_url, '') AS pakasir_qr_url
  FROM public.membership_orders o
  LEFT JOIN public.membership_packages p ON p.id = o.package_id
  LEFT JOIN public.membership_tokens t ON t.id = o.membership_token_id
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_memberships() TO authenticated;
