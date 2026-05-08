
ALTER TABLE public.active_shows
  ADD COLUMN IF NOT EXISTS is_live boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_auto_schedule boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS live_type text NOT NULL DEFAULT 'm3u8',
  ADD COLUMN IF NOT EXISTS live_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS live_password text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS live_require_password boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS replay_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replay_m3u8_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS replay_youtube_url text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS active_shows_only_one_live
  ON public.active_shows ((1)) WHERE is_live = true;

CREATE OR REPLACE FUNCTION public.get_active_live()
RETURNS TABLE(
  id uuid,
  title text,
  show_date date,
  show_time time,
  lineup text[],
  category text,
  image_url text,
  live_type text,
  live_sources jsonb,
  live_require_password boolean,
  is_live boolean,
  live_auto_schedule boolean,
  replay_mode boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.title, s.show_date, s.show_time, s.lineup, s.category, s.image_url,
    s.live_type,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('label', x->>'label', 'type', x->>'type'))
       FROM jsonb_array_elements(s.live_sources) x),
      '[]'::jsonb
    ) AS live_sources,
    s.live_require_password, s.is_live, s.live_auto_schedule, s.replay_mode
  FROM public.active_shows s
  WHERE s.is_active = true
    AND (
      s.is_live = true
      OR (
        s.live_auto_schedule = true
        AND now() >= ((s.show_date::timestamp + s.show_time)::timestamptz)
        AND now() <= ((s.show_date::timestamp + s.show_time)::timestamptz + interval '8 hours')
      )
    )
  ORDER BY s.is_live DESC, s.show_date DESC, s.show_time DESC
  LIMIT 1;
$$;
