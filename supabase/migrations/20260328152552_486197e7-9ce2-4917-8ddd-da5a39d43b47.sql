CREATE OR REPLACE FUNCTION public.increment_view_count(_replay_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE replays SET view_count = view_count + 1 WHERE id = _replay_id RETURNING view_count INTO new_count;
  RETURN new_count;
END;
$$;