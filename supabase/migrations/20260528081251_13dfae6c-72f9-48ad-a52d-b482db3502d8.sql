-- Hide replay_info (contains plaintext replay passwords) from public reads.
-- Public can still read other package fields; replay_info is only delivered
-- after purchase via SECURITY DEFINER functions / edge functions using service_role.
REVOKE SELECT (replay_info) ON public.membership_packages FROM anon;
REVOKE SELECT (replay_info) ON public.membership_packages FROM authenticated;

-- Restrict Realtime broadcast/presence subscriptions to admins only.
-- The app uses postgres_changes (governed by table RLS), not broadcast/presence,
-- so removing open access here prevents arbitrary topic subscription abuse.
DROP POLICY IF EXISTS "Authenticated can use realtime" ON realtime.messages;
CREATE POLICY "Admins can use realtime"
ON realtime.messages FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));