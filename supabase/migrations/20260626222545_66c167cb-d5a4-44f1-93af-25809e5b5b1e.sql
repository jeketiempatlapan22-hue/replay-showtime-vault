GRANT SELECT ON public.membership_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_packages TO authenticated;
GRANT ALL ON public.membership_packages TO service_role;