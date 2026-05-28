ALTER TABLE public.master_passwords DROP CONSTRAINT IF EXISTS master_passwords_month_key;

CREATE POLICY "Admin select master_passwords"
ON public.master_passwords
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.master_passwords TO authenticated;