ALTER TABLE public.replays
  ADD COLUMN IF NOT EXISTS is_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offline_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS offline_at timestamptz;

GRANT SELECT (is_offline) ON public.replays TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_replays_is_offline ON public.replays(is_offline);

CREATE OR REPLACE FUNCTION public.admin_set_replay_offline(_replay_id uuid, _offline boolean, _reason text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.replays
    SET is_offline = _offline,
        offline_reason = CASE WHEN _offline THEN COALESCE(_reason,'') ELSE '' END,
        offline_at = CASE WHEN _offline THEN now() ELSE NULL END,
        updated_at = now()
  WHERE id = _replay_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_restore_replay_source(_replay_id uuid, _source_type text, _youtube_id text DEFAULT '', _m3u8_url text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _source_type NOT IN ('youtube','m3u8','cloudflare') THEN RAISE EXCEPTION 'invalid_source_type'; END IF;
  IF _source_type = 'youtube' AND COALESCE(_youtube_id,'') = '' THEN RAISE EXCEPTION 'missing_youtube_id'; END IF;
  IF _source_type <> 'youtube' AND COALESCE(_m3u8_url,'') = '' THEN RAISE EXCEPTION 'missing_url'; END IF;

  UPDATE public.replays
    SET source_type = _source_type,
        youtube_id = CASE WHEN _source_type = 'youtube' THEN _youtube_id ELSE youtube_id END,
        m3u8_url = CASE WHEN _source_type <> 'youtube' THEN _m3u8_url ELSE m3u8_url END,
        is_offline = false,
        offline_reason = '',
        offline_at = NULL,
        updated_at = now()
  WHERE id = _replay_id;
END; $$;