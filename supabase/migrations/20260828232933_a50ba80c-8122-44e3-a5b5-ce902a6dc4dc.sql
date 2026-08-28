CREATE OR REPLACE FUNCTION public.get_active_live()
 RETURNS TABLE(id uuid, title text, show_date date, show_time time without time zone, lineup text[], category text, image_url text, live_type text, live_sources jsonb, live_require_password boolean, is_live boolean, live_auto_schedule boolean, replay_mode boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        now() >= ((s.show_date::timestamp + s.show_time) AT TIME ZONE 'Asia/Jakarta' - interval '20 minutes')
        AND now() <= ((s.show_date::timestamp + s.show_time) AT TIME ZONE 'Asia/Jakarta' + interval '8 hours')
      )
    )
  ORDER BY s.is_live DESC, s.show_date DESC, s.show_time DESC
  LIMIT 1;
$function$;