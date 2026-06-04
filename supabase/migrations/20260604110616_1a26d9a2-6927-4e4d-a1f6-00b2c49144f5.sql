-- Fix update errors caused by REPLICA IDENTITY FULL + column-list publication.
-- Symptom: "Column list used by the publication does not cover the replica identity"
-- when updating sensitive columns (live_url, live_password, etc.) on active_shows/membership_packages.
-- Fix: switch to REPLICA IDENTITY DEFAULT (primary key only). Realtime events still fire;
-- DELETE events will only carry the id, which is what we want anyway.
ALTER TABLE public.active_shows REPLICA IDENTITY DEFAULT;
ALTER TABLE public.membership_packages REPLICA IDENTITY DEFAULT;

-- Re-grant execute on phone_exists so login/register flow works.
GRANT EXECUTE ON FUNCTION public.phone_exists(text) TO anon, authenticated;