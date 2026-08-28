GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

UPDATE public.site_settings SET value = '6283899087711', updated_at = now() WHERE key IN ('owner_wa_number','admin_wa_phone');
INSERT INTO public.site_settings (key, value)
SELECT 'owner_wa_number', '6283899087711'
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE key='owner_wa_number');
INSERT INTO public.site_settings (key, value)
SELECT 'admin_wa_phone', '6283899087711'
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE key='admin_wa_phone');