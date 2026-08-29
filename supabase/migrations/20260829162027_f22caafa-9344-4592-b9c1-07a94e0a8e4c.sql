CREATE OR REPLACE FUNCTION public.auto_live_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Nyalakan live 20 menit sebelum jadwal
  UPDATE public.active_shows s
     SET is_live = true, updated_at = now()
   WHERE s.is_active = true
     AND s.is_live = false
     AND now() >= ((s.show_date::timestamp + s.show_time) AT TIME ZONE 'Asia/Jakarta' - interval '20 minutes')
     AND now() <= ((s.show_date::timestamp + s.show_time) AT TIME ZONE 'Asia/Jakarta' + interval '8 hours');

  -- Matikan live setelah jendela tayang berakhir
  UPDATE public.active_shows s
     SET is_live = false, updated_at = now()
   WHERE s.is_active = true
     AND s.is_live = true
     AND now() > ((s.show_date::timestamp + s.show_time) AT TIME ZONE 'Asia/Jakarta' + interval '8 hours');
END;
$$;

REVOKE ALL ON FUNCTION public.auto_live_sync() FROM public;
GRANT EXECUTE ON FUNCTION public.auto_live_sync() TO service_role;