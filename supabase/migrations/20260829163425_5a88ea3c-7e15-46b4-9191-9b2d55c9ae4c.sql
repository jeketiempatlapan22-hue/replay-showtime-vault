ALTER TABLE public.active_shows ADD COLUMN IF NOT EXISTS live_hold_until timestamptz;

CREATE OR REPLACE FUNCTION public.auto_live_sync()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Paksa mati selama masa tahan (override admin)
  UPDATE public.active_shows s
     SET is_live = false, updated_at = now()
   WHERE s.is_live = true
     AND s.live_hold_until IS NOT NULL
     AND s.live_hold_until > now();

  -- Nyalakan live 20 menit sebelum jadwal (kecuali sedang ditahan admin)
  UPDATE public.active_shows s
     SET is_live = true, updated_at = now()
   WHERE s.is_active = true
     AND s.is_live = false
     AND (s.live_hold_until IS NULL OR s.live_hold_until <= now())
     AND now() >= ((s.show_date::timestamp + s.show_time) AT TIME ZONE 'Asia/Jakarta' - interval '20 minutes')
     AND now() <= ((s.show_date::timestamp + s.show_time) AT TIME ZONE 'Asia/Jakarta' + interval '8 hours');

  -- Matikan live setelah jendela tayang berakhir
  UPDATE public.active_shows s
     SET is_live = false, updated_at = now()
   WHERE s.is_active = true
     AND s.is_live = true
     AND now() > ((s.show_date::timestamp + s.show_time) AT TIME ZONE 'Asia/Jakarta' + interval '8 hours');
END;
$function$;

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
    AND (s.live_hold_until IS NULL OR s.live_hold_until <= now())
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

-- Hemat: cek live hanya sore-malam WIB (05:55-14:00 UTC = 12:55-21:00 WIB), tiap 5 menit
SELECT cron.alter_job(40, schedule => '*/5 5-14 * * *');
