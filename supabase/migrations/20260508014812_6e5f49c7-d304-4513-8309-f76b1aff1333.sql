
CREATE TABLE public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_attempts_identifier_time
  ON public.login_attempts (identifier, attempted_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- No policies: only SECURITY DEFINER functions can access.

CREATE OR REPLACE FUNCTION public.check_login_lock(_identifier text)
RETURNS TABLE(locked boolean, seconds_remaining integer, fail_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window interval := interval '10 minutes';
  v_max_fails integer := 5;
  v_fail_count integer;
  v_last_fail timestamptz;
  v_lock_until timestamptz;
BEGIN
  SELECT COUNT(*), MAX(attempted_at)
    INTO v_fail_count, v_last_fail
  FROM public.login_attempts
  WHERE identifier = lower(_identifier)
    AND success = false
    AND attempted_at > now() - v_window;

  IF v_fail_count >= v_max_fails THEN
    v_lock_until := v_last_fail + v_window;
    RETURN QUERY SELECT true,
      GREATEST(0, EXTRACT(EPOCH FROM (v_lock_until - now()))::integer),
      v_fail_count;
  ELSE
    RETURN QUERY SELECT false, 0, COALESCE(v_fail_count, 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_login_attempt(_identifier text, _success boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_attempts (identifier, success)
  VALUES (lower(_identifier), _success);

  IF _success THEN
    DELETE FROM public.login_attempts
    WHERE identifier = lower(_identifier) AND success = false;
  END IF;

  -- Janitor: prune old rows >24h
  DELETE FROM public.login_attempts WHERE attempted_at < now() - interval '24 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_login_lock(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, boolean) TO anon, authenticated;
