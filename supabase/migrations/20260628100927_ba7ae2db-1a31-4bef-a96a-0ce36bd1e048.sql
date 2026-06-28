ALTER TABLE public.active_show_tokens REPLICA IDENTITY FULL;
ALTER TABLE public.membership_tokens REPLICA IDENTITY FULL;
ALTER TABLE public.active_show_token_devices REPLICA IDENTITY FULL;
ALTER TABLE public.membership_token_devices REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_show_tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.membership_tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_show_token_devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.membership_token_devices;