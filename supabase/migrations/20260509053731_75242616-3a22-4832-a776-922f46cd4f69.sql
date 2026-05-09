
-- 1) Restrict sensitive live columns from anonymous reads
REVOKE SELECT (live_url, live_sources, live_password) ON public.active_shows FROM anon;

-- 2) Ratings: enforce one row per (replay_id, browser_id) and stop unrestricted updates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ratings_replay_browser_unique'
  ) THEN
    -- Deduplicate any existing collisions, keeping latest
    DELETE FROM public.ratings r
    USING public.ratings r2
    WHERE r.replay_id = r2.replay_id
      AND r.browser_id = r2.browser_id
      AND r.created_at < r2.created_at;
    ALTER TABLE public.ratings
      ADD CONSTRAINT ratings_replay_browser_unique UNIQUE (replay_id, browser_id);
  END IF;
END $$;

DROP POLICY IF EXISTS "Anyone can update ratings" ON public.ratings;

-- Secure RPC for rating upsert
CREATE OR REPLACE FUNCTION public.rate_replay(_replay_id uuid, _browser_id text, _rating smallint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _replay_id IS NULL OR _browser_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF length(_browser_id) < 6 OR length(_browser_id) > 200 THEN
    RAISE EXCEPTION 'invalid_browser_id';
  END IF;
  IF _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;
  INSERT INTO public.ratings (replay_id, browser_id, rating)
  VALUES (_replay_id, _browser_id, _rating)
  ON CONFLICT (replay_id, browser_id) DO UPDATE SET rating = EXCLUDED.rating;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_replay(uuid, text, smallint) TO anon, authenticated;
