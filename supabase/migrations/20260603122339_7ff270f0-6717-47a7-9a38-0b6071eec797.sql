
-- 1. Add is_special flag for active shows (top-pinned by admin)
ALTER TABLE public.active_shows
  ADD COLUMN IF NOT EXISTS is_special boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_active_shows_is_special ON public.active_shows(is_special) WHERE is_special = true;

-- 2. Improve email_for_identifier to also resolve users that don't have a profile row yet.
--    Previously, accounts created before the profiles trigger (or admin-managed accounts)
--    could not log in by email/username because the lookup queried only public.profiles.
CREATE OR REPLACE FUNCTION public.email_for_identifier(_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
BEGIN
  -- Look in profiles first (supports username & phone lookups)
  SELECT email INTO v_email FROM public.profiles
  WHERE lower(email) = lower(_identifier)
     OR phone = _identifier
     OR lower(username) = lower(_identifier)
  LIMIT 1;
  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  -- Fall back to auth.users so users without a profile row can still sign in by email
  IF position('@' in _identifier) > 0 THEN
    SELECT email INTO v_email FROM auth.users
    WHERE lower(email) = lower(_identifier)
    LIMIT 1;
  END IF;

  RETURN v_email;
END;
$function$;
