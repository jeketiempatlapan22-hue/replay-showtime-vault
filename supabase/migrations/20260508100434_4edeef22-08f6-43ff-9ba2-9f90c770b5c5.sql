
-- 1) Enforce 1 device per membership token
ALTER TABLE public.membership_token_devices
  ADD CONSTRAINT membership_token_devices_token_unique UNIQUE (token_id);

CREATE INDEX IF NOT EXISTS idx_membership_token_devices_browser ON public.membership_token_devices(browser_id);

-- 2) Replace overly permissive policies (USING/WITH CHECK = true) with stricter checks
DROP POLICY IF EXISTS "Anyone can insert block records" ON public.blocked_browsers;
CREATE POLICY "Anyone can insert block records" ON public.blocked_browsers
  FOR INSERT TO public
  WITH CHECK (browser_id IS NOT NULL AND length(browser_id) BETWEEN 6 AND 200);

DROP POLICY IF EXISTS "Anyone can insert comments" ON public.comments;
CREATE POLICY "Anyone can insert comments" ON public.comments
  FOR INSERT TO public
  WITH CHECK (
    replay_id IS NOT NULL
    AND length(coalesce(message,'')) BETWEEN 1 AND 1000
    AND length(coalesce(name,'')) BETWEEN 1 AND 60
  );

DROP POLICY IF EXISTS "Anyone can insert ratings" ON public.ratings;
CREATE POLICY "Anyone can insert ratings" ON public.ratings
  FOR INSERT TO public
  WITH CHECK (
    replay_id IS NOT NULL
    AND browser_id IS NOT NULL AND length(browser_id) BETWEEN 6 AND 200
    AND rating BETWEEN 1 AND 5
  );

DROP POLICY IF EXISTS "Anyone can update ratings" ON public.ratings;
CREATE POLICY "Anyone can update ratings" ON public.ratings
  FOR UPDATE TO public
  USING (browser_id IS NOT NULL AND length(browser_id) BETWEEN 6 AND 200)
  WITH CHECK (rating BETWEEN 1 AND 5);

-- 3) login_attempts has RLS enabled but no policy. Add admin-only read policy; writes only via SECURITY DEFINER fn.
CREATE POLICY "Admins read login_attempts" ON public.login_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Stop public listing of public buckets (direct URL downloads still work for public buckets)
DROP POLICY IF EXISTS "Anyone can view card images" ON storage.objects;
DROP POLICY IF EXISTS "Public read member-photos" ON storage.objects;

-- 5) Revoke EXECUTE on internal/trigger/security-definer helpers from PUBLIC & anon
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_blocked_browsers_timestamp() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_old_comments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_old_live_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_login_attempt(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_login_lock(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_for_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.phone_exists(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_view_count(uuid) FROM PUBLIC;
