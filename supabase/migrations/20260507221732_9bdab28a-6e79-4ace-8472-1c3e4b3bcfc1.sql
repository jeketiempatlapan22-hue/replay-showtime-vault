CREATE OR REPLACE FUNCTION public.get_live_status()
RETURNS TABLE(enabled boolean, title text, type text, require_password boolean, sources jsonb, lineup text[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    enabled,
    title,
    type,
    require_password,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('label', s->>'label', 'type', s->>'type'))
       FROM jsonb_array_elements(sources) s),
      '[]'::jsonb
    ) AS sources,
    COALESCE(lineup, '{}'::text[]) AS lineup
  FROM public.live_config_private
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_live_status() TO anon, authenticated;