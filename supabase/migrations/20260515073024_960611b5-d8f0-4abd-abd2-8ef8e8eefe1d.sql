
CREATE OR REPLACE FUNCTION public.email_for_identifier(_identifier text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT email FROM public.profiles
  WHERE lower(email) = lower(_identifier)
     OR phone = _identifier
     OR lower(username) = lower(_identifier)
  LIMIT 1;
$$;
