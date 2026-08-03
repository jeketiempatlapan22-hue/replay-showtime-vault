DROP FUNCTION IF EXISTS public.admin_export_auth_users();

CREATE OR REPLACE FUNCTION public.admin_export_auth_users(_admin_id uuid)
RETURNS TABLE(
  id uuid, email text, phone text, encrypted_password text,
  email_confirmed_at timestamptz, phone_confirmed_at timestamptz,
  created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz,
  raw_user_meta_data jsonb, raw_app_meta_data jsonb, is_sso_user boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email::text, u.phone::text, u.encrypted_password::text,
         u.email_confirmed_at, u.phone_confirmed_at,
         u.created_at, u.updated_at, u.last_sign_in_at,
         u.raw_user_meta_data, u.raw_app_meta_data, u.is_sso_user
  FROM auth.users u
  WHERE public.has_role(_admin_id, 'admin'::app_role)
  ORDER BY u.created_at;
$$;

REVOKE ALL ON FUNCTION public.admin_export_auth_users(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export_auth_users(uuid) TO service_role;