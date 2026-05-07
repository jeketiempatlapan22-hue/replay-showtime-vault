ALTER TABLE public.live_config_private
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP FUNCTION IF EXISTS public.get_live_status();
CREATE FUNCTION public.get_live_status()
 RETURNS TABLE(enabled boolean, title text, type text, require_password boolean, sources jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT enabled, title, type, require_password,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('label', s->>'label', 'type', s->>'type'))
       FROM jsonb_array_elements(sources) s),
      '[]'::jsonb
    ) AS sources
  FROM public.live_config_private LIMIT 1;
$function$;